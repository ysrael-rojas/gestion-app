-- =========================================================================
-- Migración: spec49_cash_count_indexes_and_rls_initplan (SPEC 49, advisors)
-- =========================================================================
-- Advisors de Supabase tras crear cash_count:
-- 1) FK owner_id sin índice de cobertura.
-- 2) Las policies nuevas re-evaluaban auth.uid() por fila; se usa
--    (select auth.uid()) como recomienda el lint auth_rls_initplan.
-- =========================================================================

create index cash_count_owner_id_idx on public.cash_count (owner_id);

drop policy if exists cash_count_select on public.cash_count;
create policy cash_count_select on public.cash_count
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists cash_count_denomination_select on public.cash_count_denomination;
create policy cash_count_denomination_select on public.cash_count_denomination
  for select to authenticated
  using (exists (
    select 1
      from public.cash_count c
     where c.id = cash_count_id
       and c.owner_id = (select auth.uid())
  ));
