create or replace function public.list_last_movement_dates()
returns table (cash_account_id uuid, last_date date)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.cash_account_id, max(p.payment_date) as last_date
    from public.payment p
   where p.status <> 'ANULADO'
   group by p.cash_account_id;
$$;

revoke all on function public.list_last_movement_dates() from public, anon;
grant execute on function public.list_last_movement_dates() to authenticated;

comment on function public.list_last_movement_dates() is
  'Ultimo movimiento (recibo no anulado) por cuenta. SPEC 55: reemplaza el agregado PostgREST deshabilitado.';
