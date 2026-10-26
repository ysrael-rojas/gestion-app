-- SPEC 44: evita el advisor auth_rls_initplan en voucher_series.
--
-- Las policies se recrean con `(select auth.uid())` para que Postgres evalúe la
-- función una sola vez por consulta en lugar de una vez por fila.

drop policy voucher_series_select on public.voucher_series;
drop policy voucher_series_insert on public.voucher_series;
drop policy voucher_series_update on public.voucher_series;
drop policy voucher_series_delete on public.voucher_series;

create policy voucher_series_select on public.voucher_series
  for select to authenticated using (owner_id = (select auth.uid()));
create policy voucher_series_insert on public.voucher_series
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy voucher_series_update on public.voucher_series
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy voucher_series_delete on public.voucher_series
  for delete to authenticated using (owner_id = (select auth.uid()));
