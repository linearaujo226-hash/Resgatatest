-- Guarda separadamente se o usuário informou o pagamento.
-- Não altera histórico, paid_amount nem saldo de carteiras.
alter table public.debts
  add column if not exists payment_reported boolean not null default false;
