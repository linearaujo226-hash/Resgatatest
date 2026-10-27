create or replace function public.assign_financial_expense_account(
  p_expense_id uuid,
  p_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_old_account uuid;
  v_amount numeric(12,2);
begin
  if v_user is null then
    raise exception 'Faça login para alterar a conta da despesa.';
  end if;

  select account_id, amount
    into v_old_account, v_amount
    from public.financial_expenses
   where id = p_expense_id
     and user_id = v_user
   for update;

  if not found then
    raise exception 'Despesa não encontrada ou sem permissão.';
  end if;

  if v_old_account is not distinct from p_account_id then
    return;
  end if;

  -- Valida a conta de destino antes de movimentar o saldo.
  if p_account_id is not null then
    perform 1
      from public.wallet_accounts
     where id = p_account_id
       and user_id = v_user
     for update;

    if not found then
      raise exception 'Conta de destino não encontrada ou sem permissão.';
    end if;
  end if;

  -- Devolve o valor à conta anterior.
  if v_old_account is not null then
    update public.wallet_accounts
       set balance = coalesce(balance, 0) + v_amount,
           updated_at = now()
     where id = v_old_account
       and user_id = v_user;

    if not found then
      raise exception 'Não foi possível ajustar o saldo da conta anterior.';
    end if;
  end if;

  -- Desconta da nova conta, se houver uma selecionada.
  if p_account_id is not null then
    update public.wallet_accounts
       set balance = coalesce(balance, 0) - v_amount,
           updated_at = now()
     where id = p_account_id
       and user_id = v_user
       and coalesce(balance, 0) >= v_amount;

    if not found then
      raise exception 'Saldo insuficiente na conta selecionada.';
    end if;
  end if;

  update public.financial_expenses
     set account_id = p_account_id
   where id = p_expense_id
     and user_id = v_user;
end;
$function$;

revoke all on function public.assign_financial_expense_account(uuid, uuid)
  from public, anon;

grant execute on function public.assign_financial_expense_account(uuid, uuid)
  to authenticated;
