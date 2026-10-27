-- Separa o valor realmente gasto do valor que teria sido gasto.
alter table public.habit_control_entries
  add column if not exists amount_avoided numeric(12,2)
  not null default 0
  check (amount_avoided >= 0);

comment on column public.habit_control_entries.amount_avoided is
  'Valor hipotético evitado no dia. Não é despesa, receita nem saldo financeiro.';

-- Nova versão compatível com a função existente.
-- A função anterior continua responsável por registrar o gasto real
-- e ajustar a Carteira uma única vez.
create or replace function public.save_habit_entry(
  p_habit_id uuid,
  p_entry_date date,
  p_status text,
  p_amount_spent numeric,
  p_notes text,
  p_account_id uuid,
  p_amount_avoided numeric
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_entry_id uuid;
  v_spent numeric(12,2);
  v_avoided numeric(12,2);
begin
  if v_user is null then
    raise exception 'Faça login para registrar o hábito.';
  end if;

  v_spent := round(coalesce(p_amount_spent, 0), 2);
  v_avoided := round(coalesce(p_amount_avoided, 0), 2);

  if v_spent < 0 or v_avoided < 0 then
    raise exception 'Os valores não podem ser negativos.';
  end if;

  if p_status <> 'occurred' and v_spent <> 0 then
    raise exception 'Só informe gasto real quando o comportamento aconteceu.';
  end if;

  if p_status <> 'not_occurred' and v_avoided <> 0 then
    raise exception 'O valor evitado só pode ser informado quando o comportamento não aconteceu.';
  end if;

  -- O RPC antigo faz a gravação e o ajuste financeiro real.
  v_entry_id := public.save_habit_entry(
    p_habit_id,
    p_entry_date,
    p_status,
    v_spent,
    p_notes,
    case when p_status = 'occurred' then p_account_id else null end
  );

  update public.habit_control_entries
     set amount_avoided = v_avoided
   where id = v_entry_id
     and user_id = v_user;

  if not found then
    raise exception 'Não foi possível salvar o valor evitado.';
  end if;

  return v_entry_id;
end;
$function$;

revoke all on function public.save_habit_entry(
  uuid, date, text, numeric, text, uuid, numeric
) from public, anon;

grant execute on function public.save_habit_entry(
  uuid, date, text, numeric, text, uuid, numeric
) to authenticated;
