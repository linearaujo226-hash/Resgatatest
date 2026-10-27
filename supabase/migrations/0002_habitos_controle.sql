create table if not exists public.habit_controls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  category text not null default 'personalizado',
  goal_amount numeric(12,2) not null default 0 check (goal_amount >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint habit_controls_id_user_id_unique unique (id, user_id)
);

create table if not exists public.habit_control_entries (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null default current_date,
  status text not null check (
    status in ('occurred', 'not_occurred', 'prefer_not_to_say')
  ),
  amount_spent numeric(12,2) not null default 0 check (amount_spent >= 0),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint habit_control_entries_owner_category_fk
    foreign key (habit_id, user_id)
    references public.habit_controls(id, user_id)
    on delete restrict,
  constraint habit_control_entries_daily_unique
    unique (user_id, habit_id, entry_date)
);

create index if not exists habit_controls_user_active_idx
  on public.habit_controls(user_id, active);

create index if not exists habit_entries_user_date_idx
  on public.habit_control_entries(user_id, entry_date desc);

alter table public.habit_controls enable row level security;
alter table public.habit_control_entries enable row level security;

drop policy if exists "Users read own habits" on public.habit_controls;
create policy "Users read own habits"
  on public.habit_controls for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users create own habits" on public.habit_controls;
create policy "Users create own habits"
  on public.habit_controls for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update own habits" on public.habit_controls;
create policy "Users update own habits"
  on public.habit_controls for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users read own habit entries" on public.habit_control_entries;
create policy "Users read own habit entries"
  on public.habit_control_entries for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users create own habit entries" on public.habit_control_entries;
create policy "Users create own habit entries"
  on public.habit_control_entries for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.habit_controls h
      where h.id = habit_id and h.user_id = auth.uid()
    )
  );

drop policy if exists "Users update own habit entries" on public.habit_control_entries;
create policy "Users update own habit entries"
  on public.habit_control_entries for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.habit_controls h
      where h.id = habit_id and h.user_id = auth.uid()
    )
  );
