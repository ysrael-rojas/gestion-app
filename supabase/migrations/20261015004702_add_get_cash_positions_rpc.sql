-- =========================================================================
-- Migración: add_get_cash_positions_rpc (SPEC 34)
-- =========================================================================
-- RPC `get_cash_positions`: devuelve el saldo de TODAS las cuentas activas
-- del dueño en una sola llamada, reemplazando el N+1 de `listCashPositions`
-- (una RPC `get_cash_position` por cuenta).
--
-- Reutiliza la misma lógica de balance de `get_cash_position` (SPEC 31):
-- saldo inicial + ingresos − egresos + transferencias entrantes − salientes.
-- SECURITY INVOKER + RLS: cada fila queda acotada al dueño autenticado.
-- =========================================================================

create or replace function public.get_cash_positions(
  p_as_of date default null
) returns table (
  account_id uuid,
  name       text,
  type       public.cash_account_type,
  currency   text,
  balance    numeric
)
language sql stable security invoker set search_path = ''
as $$
  with params as (
    select coalesce(p_as_of, current_date) as as_of
  )
  select
    a.id as account_id,
    a.name,
    a.type,
    a.currency,
    (
      a.opening_balance
      + coalesce(pay.income, 0)
      - coalesce(pay.expense, 0)
      + coalesce(tr_in.amount, 0)
      - coalesce(tr_out.amount, 0)
    )::numeric as balance
  from public.cash_account a
  cross join params
  left join lateral (
    select
      sum(p.amount) filter (where p.direction = 'INGRESO') as income,
      sum(p.amount) filter (where p.direction = 'EGRESO')  as expense
    from public.payment p
    where p.cash_account_id = a.id
      and p.status <> 'ANULADO'
      and p.payment_date <= params.as_of
  ) pay on true
  left join lateral (
    select sum(t.amount) as amount
    from public.cash_transfer t
    where t.target_account_id = a.id
      and t.transfer_date <= params.as_of
  ) tr_in on true
  left join lateral (
    select sum(t.amount) as amount
    from public.cash_transfer t
    where t.source_account_id = a.id
      and t.transfer_date <= params.as_of
  ) tr_out on true
  where a.deleted_at is null
    and a.is_active
  order by a.name;
$$;
