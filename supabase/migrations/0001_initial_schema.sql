
-- Resgata Dívidas MVP
-- Migration 0001: estrutura inicial

create extension if not exists pgcrypto;

-- Perfil do usuário associado ao Supabase Auth
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

-- Dívidas cadastradas pelo usuário
create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  creditor text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  category text not null,
  priority text not null default 'normal'
    check (priority in ('baixa', 'normal', 'alta')),
  status text not null default 'pendente'
    check (status in ('pendente', 'pago', 'atrasado')),
  created_at timestamptz not null default now()
);

-- Registros de valores que o usuário deixou de apostar
create table public.gambling_savings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount_saved numeric(12,2) not null check (amount_saved > 0),
  observation text,
  created_at timestamptz not null default now()
);

-- Plano e estado da assinatura
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'canceled', 'expired')),
  plan text not null default 'mensal_9_90'
    check (plan = 'mensal_9_90'),
  created_at timestamptz not null default now()
);

-- Índices para consultas por usuário e vencimento
create index debts_user_due_date_idx
  on public.debts (user_id, due_date);

create index debts_user_status_idx
  on public.debts (user_id, status);

create index gambling_savings_user_created_idx
  on public.gambling_savings (user_id, created_at desc);

-- Ativar Row Level Security
alter table public.users enable row level security;
alter table public.debts enable row level security;
alter table public.gambling_savings enable row level security;
alter table public.subscriptions enable row level security;

-- Cada usuário acessa apenas seu próprio perfil
create policy "users_select_own"
on public.users for select
to authenticated
using (id = (select auth.uid()));

create policy "users_insert_own"
on public.users for insert
to authenticated
with check (id = (select auth.uid()));

create policy "users_update_own"
on public.users for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Dívidas: acesso restrito ao proprietário
create policy "debts_select_own"
on public.debts for select
to authenticated
using (user_id = (select auth.uid()));

create policy "debts_insert_own"
on public.debts for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "debts_update_own"
on public.debts for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "debts_delete_own"
on public.debts for delete
to authenticated
using (user_id = (select auth.uid()));

-- Registros sem apostas: acesso restrito ao proprietário
create policy "savings_select_own"
on public.gambling_savings for select
to authenticated
using (user_id = (select auth.uid()));

create policy "savings_insert_own"
on public.gambling_savings for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "savings_update_own"
on public.gambling_savings for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "savings_delete_own"
on public.gambling_savings for delete
to authenticated
using (user_id = (select auth.uid()));

-- Assinatura: o usuário pode consultar seu próprio plano.
-- Alterações de status serão feitas pelo backend confiável.
create policy "subscriptions_select_own"
on public.subscriptions for select
to authenticated
using (user_id = (select auth.uid()));
