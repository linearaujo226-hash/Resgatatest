-- Despesas gerais do usuário. Pagamentos de dívidas continuam na estrutura existente.
create table if not exists public.financial_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid null references public.wallet_accounts(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  category text not null default 'outros',
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null default current_date,
  notes text null check (notes is null or char_length(notes) <= 1000),
  habit_entry_id uuid null references public.habit_control_entries(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists financial_expenses_user_date_idx
  on public.financial_expenses(user_id, expense_date desc);

create index if not exists financial_expenses_user_category_idx
  on public.financial_expenses(user_id, category);

create unique index if not exists financial_expenses_habit_entry_unique
  on public.financial_expenses(habit_entry_id)
  where habit_entry_id is not null;

alter table public.financial_expenses enable row level security;

drop policy if exists "Users read own financial expenses"
  on public.financial_expenses;
create policy "Users read own financial expenses"
  on public.financial_expenses for select
  to authenticated using (auth.uid() = user_id);

-- Escrita via funções transacionais abaixo, sem permitir inserts diretos que
-- possam deixar o saldo da Carteira divergente.
drop policy if exists "Users insert own financial expenses"
  on public.financial_expenses;
drop policy if exists "Users update own financial expenses"
  on public.financial_expenses;
drop policy if exists "Users delete own financial expenses"
  on public.financial_expenses;

create or replace function public.register_general_expense(
  p_name text,
  p_category text,
  p_amount numeric,
  p_expense_date date,
  p_account_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_expense_id uuid;
  v_amount numeric(12,2);
begin
  if v_user is null then
    raise exception 'Faça login para registrar uma despesa.';
  end if;

  if p_name is null or char_length(trim(p_name)) not between 1 and 120 then
    raise exception 'Informe uma descrição de até 120 caracteres.';
  end if;

  if p_amount is null then
    raise exception 'Informe o valor da despesa.';
  end if;

  v_amount := round(p_amount, 2);
  if v_amount <= 0 then
    raise exception 'O valor deve ser maior que zero.';
  end if;

  if p_expense_date is null then
    raise exception 'Informe a data da despesa.';
  end if;

  if p_notes is not null and char_length(p_notes) > 1000 then
    raise exception 'As observações devem ter até 1000 caracteres.';
  end if;

  if p_account_id is not null then
    perform 1
      from public.wallet_accounts
     where id = p_account_id and user_id = v_user
     for update;

    if not found then
      raise exception 'Conta não encontrada ou sem permissão.';
    end if;

    update public.wallet_accounts
       set balance = coalesce(balance, 0) - v_amount,
           updated_at = now()
     where id = p_account_id
       and user_id = v_user
       and coalesce(balance, 0) >= v_amount;

    if not found then
      raise exception 'Saldo insuficiente para registrar esta despesa.';
    end if;
  end if;

  insert into public.financial_expenses(
    user_id, account_id, name, category, amount, expense_date, notes
  )
  values (
    v_user, p_account_id, trim(p_name),
    coalesce(nullif(trim(p_category), ''), 'outros'),
    v_amount, p_expense_date, nullif(trim(p_notes), '')
  )
  returning id into v_expense_id;

  return v_expense_id;
end;
$function$;

create or replace function public.save_habit_entry(
  p_habit_id uuid,
  p_entry_date date,
  p_status text,
  p_amount_spent numeric default 0,
  p_notes text default null,
  p_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_entry_id uuid;
  v_expense_id uuid;
  v_old_amount numeric(12,2) := 0;
  v_new_amount numeric(12,2);
  v_old_account uuid;
  v_expense_name text;
  v_category text;
begin
  if v_user is null then
    raise exception 'Faça login para registrar o hábito.';
  end if;

  if p_entry_date is null then
    raise exception 'Informe a data.';
  end if;

  if p_status not in ('occurred', 'not_occurred', 'prefer_not_to_say') then
    raise exception 'Selecione uma opção válida.';
  end if;

  v_new_amount := round(coalesce(p_amount_spent, 0), 2);
  if v_new_amount < 0 then
    raise exception 'O gasto não pode ser negativo.';
  end if;

  if p_notes is not null and char_length(p_notes) > 1000 then
    raise exception 'As observações devem ter até 1000 caracteres.';
  end if;

  select name, category into v_expense_name, v_category
    from public.habit_controls
   where id = p_habit_id and user_id = v_user and active = true;

  if not found then
    raise exception 'Hábito não encontrado ou inativo.';
  end if;

  select id into v_entry_id
    from public.habit_control_entries
   where habit_id = p_habit_id
     and user_id = v_user
     and entry_date = p_entry_date
   for update;

  if v_entry_id is null then
    insert into public.habit_control_entries(
      habit_id, user_id, entry_date, status, amount_spent, notes
    )
    values (
      p_habit_id, v_user, p_entry_date, p_status, v_new_amount,
      nullif(trim(p_notes), '')
    )
    returning id into v_entry_id;
  else
    update public.habit_control_entries
       set status = p_status,
           amount_spent = v_new_amount,
           notes = nullif(trim(p_notes), ''),
           updated_at = now()
     where id = v_entry_id and user_id = v_user;
  end if;

  select id, amount, account_id
    into v_expense_id, v_old_amount, v_old_account
    from public.financial_expenses
   where habit_entry_id = v_entry_id
     and user_id = v_user
   for update;

  -- Um registro de hábito pode ter no máximo uma despesa vinculada.
  -- Ajusta apenas a diferença no saldo, sem descontar o valor duas vezes.
  if v_expense_id is not null then
    if v_old_account is distinct from p_account_id then
      if v_old_account is not null then
        update public.wallet_accounts
           set balance = coalesce(balance, 0) + v_old_amount,
               updated_at = now()
         where id = v_old_account and user_id = v_user;

        if not found then
          raise exception 'Não foi possível devolver o valor à conta anterior. A operação foi cancelada.';
        end if;
      end if;

      if p_account_id is not null then
        perform 1 from public.wallet_accounts
         where id = p_account_id and user_id = v_user
         for update;

        if not found then
          raise exception 'Conta não encontrada ou sem permissão.';
        end if;

        update public.wallet_accounts
           set balance = coalesce(balance, 0) - v_new_amount,
               updated_at = now()
         where id = p_account_id
           and user_id = v_user
           and coalesce(balance, 0) >= v_new_amount;

        if not found then
          raise exception 'Saldo insuficiente na nova conta para este gasto.';
        end if;
      end if;
    elsif p_account_id is not null and v_new_amount > v_old_amount then
      update public.wallet_accounts
         set balance = coalesce(balance, 0) - (v_new_amount - v_old_amount),
             updated_at = now()
       where id = p_account_id and user_id = v_user
         and coalesce(balance, 0) >= (v_new_amount - v_old_amount);

      if not found then
        raise exception 'Saldo insuficiente para ajustar este gasto.';
      end if;
    elsif p_account_id is not null and v_new_amount < v_old_amount then
      update public.wallet_accounts
         set balance = coalesce(balance, 0) + (v_old_amount - v_new_amount),
             updated_at = now()
       where id = p_account_id and user_id = v_user;
    end if;

    if v_new_amount = 0 then
      delete from public.financial_expenses
       where id = v_expense_id and user_id = v_user;
    else
      update public.financial_expenses
         set account_id = p_account_id,
             amount = v_new_amount,
             expense_date = p_entry_date,
             name = v_expense_name,
             category = coalesce(nullif(v_category, ''), 'hábitos')
       where id = v_expense_id and user_id = v_user;
    end if;
  elsif v_new_amount > 0 then
    if p_account_id is not null then
      perform 1 from public.wallet_accounts
       where id = p_account_id and user_id = v_user
       for update;

      if not found then
        raise exception 'Conta não encontrada ou sem permissão.';
      end if;

      update public.wallet_accounts
         set balance = coalesce(balance, 0) - v_new_amount,
             updated_at = now()
       where id = p_account_id and user_id = v_user
         and coalesce(balance, 0) >= v_new_amount;

      if not found then
        raise exception 'Saldo insuficiente para registrar este gasto.';
      end if;
    end if;

    insert into public.financial_expenses(
      user_id, account_id, name, category, amount, expense_date,
      habit_entry_id
    )
    values (
      v_user, p_account_id, v_expense_name,
      coalesce(nullif(v_category, ''), 'hábitos'),
      v_new_amount, p_entry_date, v_entry_id
    );
  end if;

  return v_entry_id;
end;
$function$;

revoke all on function public.register_general_expense(text,text,numeric,date,uuid,text)
  from public, anon;
grant execute on function public.register_general_expense(text,text,numeric,date,uuid,text)
  to authenticated;

revoke all on function public.save_habit_entry(uuid,date,text,numeric,text,uuid)
  from public, anon;
grant execute on function public.save_habit_entry(uuid,date,text,numeric,text,uuid)
  to authenticated;
