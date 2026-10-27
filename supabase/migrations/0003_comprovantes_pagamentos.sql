-- Comprovantes privados dos pagamentos de dívidas.
-- Execute esta migração no projeto Supabase correto.

create table if not exists public.debt_payment_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_id uuid not null references public.debt_payments(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  content_type text not null
    check (content_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz not null default now(),
  constraint debt_payment_receipts_payment_unique unique (payment_id)
);

create index if not exists debt_payment_receipts_user_idx
  on public.debt_payment_receipts(user_id, created_at desc);

alter table public.debt_payment_receipts enable row level security;

drop policy if exists "Users read own payment receipts"
  on public.debt_payment_receipts;
create policy "Users read own payment receipts"
  on public.debt_payment_receipts for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users add own payment receipts"
  on public.debt_payment_receipts;
create policy "Users add own payment receipts"
  on public.debt_payment_receipts for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.debt_payments p
      where p.id = payment_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "Users delete own payment receipts"
  on public.debt_payment_receipts;
create policy "Users delete own payment receipts"
  on public.debt_payment_receipts for delete
  to authenticated
  using (auth.uid() = user_id);

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read own private payment receipt files"
  on storage.objects;
create policy "Users read own private payment receipt files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users upload own private payment receipt files"
  on storage.objects;
create policy "Users upload own private payment receipt files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own private payment receipt files"
  on storage.objects;
create policy "Users delete own private payment receipt files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Atualiza a função existente preservando suas validações financeiras.
create or replace function public.register_debt_payment(
  p_debt_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_paid_at date
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_user uuid := auth.uid();
  v_debt public.debts%rowtype;
  v_account public.wallet_accounts%rowtype;
  v_amount numeric(12,2);
  v_paid numeric(12,2);
  v_remaining numeric(12,2);
  v_status text;
  v_payment_id uuid;
begin
  if v_user is null then
    raise exception 'Faça login para registrar o pagamento.';
  end if;

  if p_debt_id is null then
    raise exception 'Selecione uma dívida.';
  end if;
  if p_account_id is null then
    raise exception 'Selecione uma carteira.';
  end if;
  if p_amount is null then
    raise exception 'Informe o valor do pagamento.';
  end if;
  if p_paid_at is null then
    raise exception 'Informe a data do pagamento.';
  end if;

  v_amount := round(p_amount, 2);
  if v_amount <= 0 then
    raise exception 'O valor do pagamento deve ser maior que zero.';
  end if;

  select *
    into v_debt
    from public.debts
   where id = p_debt_id
     and user_id = v_user
   for update;

  if not found then
    raise exception 'Dívida não encontrada ou sem permissão.';
  end if;

  v_paid := round(coalesce(v_debt.paid_amount, 0), 2);
  v_remaining := round(v_debt.amount - v_paid, 2);

  if v_remaining <= 0 then
    raise exception 'Esta dívida já está quitada.';
  end if;
  if v_amount > v_remaining then
    raise exception 'O pagamento excede o valor restante da dívida.';
  end if;

  select *
    into v_account
    from public.wallet_accounts
   where id = p_account_id
     and user_id = v_user
   for update;

  if not found then
    raise exception 'Carteira não encontrada ou sem permissão.';
  end if;
  if v_account.balance < v_amount then
    raise exception 'O saldo disponível é insuficiente.';
  end if;

  update public.wallet_accounts
     set balance = balance - v_amount,
         updated_at = pg_catalog.now()
   where id = v_account.id;

  insert into public.debt_payments (
    user_id, debt_id, account_id, amount, paid_at
  )
  values (
    v_user, p_debt_id, p_account_id, v_amount, p_paid_at
  )
  returning id into v_payment_id;

  v_paid := round(v_paid + v_amount, 2);

  update public.debts
     set paid_amount = v_paid,
         status = case
           when v_paid >= amount then 'pago'
           when due_date < current_date then 'atrasado'
           else 'pendente'
         end
   where id = p_debt_id
     and user_id = v_user
  returning status into v_status;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'paid_amount', v_paid,
    'remaining', pg_catalog.greatest(
      pg_catalog.round(v_debt.amount - v_paid, 2), 0
    ),
    'status', v_status
  );
end;
$function$;


-- Preservar explicitamente as permissões conhecidas da função.
GRANT EXECUTE ON FUNCTION public.register_debt_payment(uuid, uuid, numeric, date)
TO authenticated, postgres, service_role;
