-- Permite que cada usuário exclua somente seus próprios registros de hábitos.
-- Esta política não altera saldos nem exclui despesas financeiras.
drop policy if exists "Users delete own habit entries"
  on public.habit_control_entries;

create policy "Users delete own habit entries"
  on public.habit_control_entries
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.habit_controls h
      where h.id = habit_control_entries.habit_id
        and h.user_id = auth.uid()
    )
  );
