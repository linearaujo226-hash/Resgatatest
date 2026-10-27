alter table public.habit_controls
  add column if not exists usual_amount numeric(12,2) not null default 0
  check (usual_amount >= 0);

comment on column public.habit_controls.usual_amount is
  'Valor habitual estimado por ocorrência, usado apenas para calcular economia estimada. Nunca representa saldo ou receita.';
