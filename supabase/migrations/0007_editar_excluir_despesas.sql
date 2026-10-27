create or replace function public.update_financial_expense(
  p_expense_id uuid,
  p_name text,
  p_category text,
  p_amount numeric,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_account uuid;
  v_old_amount numeric(12,2);
  v_habit_entry uuid;
  v_new_amount numeric(12,2);
begin
  if v_user is null then
    raise exception 'Faça login para editar a despesa.';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Informe a descrição da despesa.';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 999999999 then
    raise exception 'Informe um valor maior que zero e válido.';
  end if;

  if nullif(trim(p_category), '') is null then
    raise exception 'Selecione uma categoria.';
  end if;

  v_new_amount := round(p_amount, 2);

  select account_id, amount, habit_entry_id
    into v_account, v_old_amount, v_habit_entry
    from public.financial_expenses
   where id = p_expense_id
     and user_id = v_user
   for update;

  if not found then
    raise exception 'Despesa não encontrada ou sem permissão.';
  end if;

  -- Ajusta somente a diferença, sem descontar o valor inteiro novamente.
  if v_account is not null and v_new_amount <> v_old_amount then
    if v_new_amount > v_old_amount then
      update public.wallet_accounts
         set balance = coalesce(balance, 0) - (v_new_amount - v_old_amount),
             updated_at = now()
       where id = v_account
         and user_id = v_user
         and coalesce(balance, 0) >= (v_new_amount - v_old_amount);

      if not found then
        raise exception 'Saldo insuficiente na conta para aumentar esta despesa.';
      end if;
    else
      update public.wallet_accounts
         set balance = coalesce(balance, 0) + (v_old_amount - v_new_amount),
             updated_at = now()
       where id = v_account
         and user_id = v_user;

      if not found then
        raise exception 'Não foi possível ajustar o saldo da conta.';
      end if;
    end if;
  end if;

  update public.financial_expenses
     set name = trim(p_name),
         category = trim(p_category),
         amount = v_new_amount,
         notes = nullif(trim(coalesce(p_notes, '')), '')
   where id = p_expense_id
     and user_id = v_user;

  -- Mantém sincronizado o registro de hábito ligado à despesa.
  if v_habit_entry is not null then
    update public.habit_control_entries
       set amount_spent = v_new_amount,
           notes = nullif(trim(coalesce(p_notes, '')), '')
     where id = v_habit_entry
       and user_id = v_user;

    if not found then
      raise exception 'Registro do hábito vinculado não encontrado.';
    end if;
  end if;
end;
$function$;

create or replace function public.delete_financial_expense(
  p_expense_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_account uuid;
  v_amount numeric(12,2);
  v_habit_entry uuid;
begin
  if v_user is null then
    raise exception 'Faça login para excluir a despesa.';
  end if;

  select account_id, amount, habit_entry_id
    into v_account, v_amount, v_habit_entry
    from public.financial_expenses
   where id = p_expense_id
     and user_id = v_user
   for update;

  if not found then
    raise exception 'Despesa não encontrada ou já excluída.';
  end if;

  -- Devolve o valor à conta de origem, se houve débito nessa conta.
  if v_account is not null then
    update public.wallet_accounts
       set balance = coalesce(balance, 0) + v_amount,
           updated_at = now()
     where id = v_account
       and user_id = v_user;

    if not found then
      raise exception 'Não foi possível devolver o valor à conta de origem.';
    end if;
  end if;

  -- Preserva o histórico do hábito, removendo somente o valor gasto.
  if v_habit_entry is not null then
    update public.habit_control_entries
       set amount_spent = 0
     where id = v_habit_entry
       and user_id = v_user;

    if not found then
      raise exception 'Registro do hábito vinculado não encontrado.';
    end if;
  end if;

  delete from public.financial_expenses
   where id = p_expense_id
     and user_id = v_user;

  if not found then
    raise exception 'Não foi possível excluir a despesa.';
  end if;
end;
$function$;

revoke all on function public.update_financial_expense(uuid,text,text,numeric,text)
  from public, anon;
grant execute on function public.update_financial_expense(uuid,text,text,numeric,text)
  to authenticated;

revoke all on function public.delete_financial_expense(uuid)
  from public, anon;
grant execute on function public.delete_financial_expense(uuid)
  to authenticated;
