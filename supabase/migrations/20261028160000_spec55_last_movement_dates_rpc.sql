-- SPEC 55 — Ultimo movimiento por cuenta via RPC
--
-- Reemplaza el agregado PostgREST `select=cash_account_id,last_date:payment_date.max()`
-- que el proyecto rechaza con 400 PGRST123 ("Use of aggregate functions is not
-- allowed"): los agregados de PostgREST estan deshabilitados por defecto.
--
-- `security invoker` (no definer) para que la RLS de `payment` siga aplicando:
-- cada owner solo ve sus propios recibos. Se excluyen los ANULADO porque un
-- recibo anulado no es un movimiento real.
--
-- Indice existente que cubre el agrupamiento:
--   payment_cash_account_date_idx (cash_account_id, payment_date DESC)

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
