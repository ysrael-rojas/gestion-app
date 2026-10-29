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
