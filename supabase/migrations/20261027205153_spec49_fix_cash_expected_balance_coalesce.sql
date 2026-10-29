create or replace function private.cash_expected_balance(
  p_cash_account_id uuid,
  p_as_of           date
) returns numeric(12,2)
language sql stable set search_path = ''
as $$
  select (
    a.opening_balance
    + coalesce(
        (select sum(p.amount) from public.payment p
          where p.cash_account_id = a.id
            and p.status <> 'ANULADO'
            and p.direction = 'INGRESO'
            and p.payment_date <= p_as_of), 0)
    - coalesce(
        (select sum(p.amount) from public.payment p
          where p.cash_account_id = a.id
            and p.status <> 'ANULADO'
            and p.direction = 'EGRESO'
            and p.payment_date <= p_as_of), 0)
    + coalesce(
        (select sum(t.amount) from public.cash_transfer t
          where t.target_account_id = a.id
            and t.transfer_date <= p_as_of), 0)
    - coalesce(
        (select sum(t.amount) from public.cash_transfer t
          where t.source_account_id = a.id
            and t.transfer_date <= p_as_of), 0)
  )::numeric(12,2)
  from public.cash_account a
  where a.id = p_cash_account_id;
$$;
