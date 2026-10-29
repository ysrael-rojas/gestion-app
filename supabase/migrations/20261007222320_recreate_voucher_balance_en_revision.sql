create or replace view public.voucher_balance with (security_invoker = true) as
select
  c.id as comprobante_id,
  c.entity_id,
  c.voucher_kind,
  c.voucher_type,
  c.voucher_number,
  c.issue_date,
  c.payment_type,
  case when c.payment_type = 'CREDITO' then c.due_date else c.issue_date end as effective_due_date,
  c.total,
  coalesce(sum(a.amount) filter (where p.status = 'EN_REVISION'), 0)::numeric(12,2) as paid_amount,
  (c.total - coalesce(sum(a.amount) filter (where p.status = 'EN_REVISION'), 0))::numeric(12,2) as balance,
  c.status
from public.comprobante c
left join public.payment_allocation a on a.comprobante_id = c.id
left join public.payment p on p.id = a.payment_id
where c.deleted_at is null
group by c.id;

grant select on public.voucher_balance to anon, authenticated;
