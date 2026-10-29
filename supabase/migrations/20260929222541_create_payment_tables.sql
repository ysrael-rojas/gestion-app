create type public.payment_direction as enum ('INGRESO', 'EGRESO');
create type public.payment_method as enum ('EFECTIVO', 'TRANSFERENCIA_BCP', 'TARJETA_CREDITO');
create type public.payment_status as enum ('REGISTRADO', 'ANULADO');

create schema if not exists private;

create table public.receipt_sequence (
  direction public.payment_direction not null,
  year integer not null,
  last_serial integer not null default 0 check (last_serial >= 0),
  primary key (direction, year)
);

create table public.payment (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entidad (id),
  direction public.payment_direction not null,
  payment_date date not null,
  issue_date date not null default current_date,
  receipt_year integer not null,
  receipt_serial integer not null,
  receipt_number text generated always as (
    (case when direction = 'INGRESO' then 'RI' else 'RE' end)
    || '-' || receipt_year::text
    || '-' || lpad(receipt_serial::text, 6, '0')
  ) stored,
  amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null,
  reference text,
  status public.payment_status not null default 'REGISTRADO',
  void_reason text,
  voided_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_receipt_unique unique (direction, receipt_year, receipt_serial),
  constraint payment_void_check check (
    (status = 'ANULADO' and void_reason is not null and voided_at is not null)
    or (status = 'REGISTRADO' and void_reason is null and voided_at is null)
  )
);

create table public.payment_allocation (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payment (id) on delete restrict,
  comprobante_id uuid not null references public.comprobante (id),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  constraint payment_allocation_unique unique (payment_id, comprobante_id)
);

create index payment_entity_idx on public.payment (entity_id);
create index payment_direction_date_idx on public.payment (direction, payment_date desc);
create index payment_allocation_payment_idx on public.payment_allocation (payment_id);
create index payment_allocation_comprobante_idx on public.payment_allocation (comprobante_id);

create trigger payment_set_updated_at
  before update on public.payment
  for each row execute function public.set_updated_at();

create function private.next_receipt_serial(
  p_direction public.payment_direction,
  p_year integer
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_serial integer;
begin
  insert into public.receipt_sequence as s (direction, year, last_serial)
  values (p_direction, p_year, 1)
  on conflict (direction, year) do update
    set last_serial = s.last_serial + 1
  returning s.last_serial into v_serial;

  return v_serial;
end;
$$;

create function private.assign_receipt_number() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.receipt_year := extract(year from new.issue_date)::integer;
  new.receipt_serial := private.next_receipt_serial(new.direction, new.receipt_year);
  return new;
end;
$$;

create trigger payment_assign_receipt
  before insert on public.payment
  for each row execute function private.assign_receipt_number();

create function private.validate_allocation() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_entity uuid;
  v_payment_entity uuid;
  v_kind public.voucher_kind;
  v_direction public.payment_direction;
begin
  select c.total, c.entity_id, c.voucher_kind into v_total, v_entity, v_kind
    from public.comprobante c
   where c.id = new.comprobante_id
     for update;

  select p.entity_id, p.direction into v_payment_entity, v_direction
    from public.payment p
   where p.id = new.payment_id;

  if v_kind is null then
    raise exception 'El comprobante no existe';
  end if;

  if (v_kind = 'VENTA' and v_direction <> 'INGRESO')
     or (v_kind = 'COMPRA' and v_direction <> 'EGRESO') then
    raise exception 'El tipo de comprobante no corresponde a la dirección del pago';
  end if;

  if v_entity <> v_payment_entity then
    raise exception 'El comprobante no pertenece a la entidad del pago';
  end if;

  select coalesce(sum(a.amount), 0) into v_paid
    from public.payment_allocation a
    join public.payment p on p.id = a.payment_id
   where a.comprobante_id = new.comprobante_id
     and p.status = 'REGISTRADO'
     and a.id <> new.id;

  if v_paid + new.amount > v_total then
    raise exception 'El importe asignado supera el saldo del comprobante';
  end if;

  return new;
end;
$$;

create trigger payment_allocation_validate
  before insert or update on public.payment_allocation
  for each row execute function private.validate_allocation();

create function private.refresh_comprobante_status(p_comprobante_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_total numeric(12,2);
  v_paid numeric(12,2);
begin
  select c.total into v_total from public.comprobante c where c.id = p_comprobante_id;

  select coalesce(sum(a.amount), 0) into v_paid
    from public.payment_allocation a
    join public.payment p on p.id = a.payment_id
   where a.comprobante_id = p_comprobante_id
     and p.status = 'REGISTRADO';

  update public.comprobante
     set status = case when v_paid >= v_total
                       then 'PAGADO'::public.comprobante_status
                       else 'PENDIENTE'::public.comprobante_status end
   where id = p_comprobante_id;
end;
$$;

create function private.allocation_refresh_status() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_comprobante_status(old.comprobante_id);
    return old;
  end if;

  perform private.refresh_comprobante_status(new.comprobante_id);

  if tg_op = 'UPDATE' and new.comprobante_id <> old.comprobante_id then
    perform private.refresh_comprobante_status(old.comprobante_id);
  end if;

  return new;
end;
$$;

create trigger payment_allocation_status
  after insert or update or delete on public.payment_allocation
  for each row execute function private.allocation_refresh_status();

create function private.payment_refresh_status() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform private.refresh_comprobante_status(a.comprobante_id)
      from public.payment_allocation a
     where a.payment_id = new.id;
  end if;

  return new;
end;
$$;

create trigger payment_status_refresh
  after update on public.payment
  for each row execute function private.payment_refresh_status();

create view public.voucher_balance with (security_invoker = true) as
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
  coalesce(sum(a.amount) filter (where p.status = 'REGISTRADO'), 0)::numeric(12,2) as paid_amount,
  (c.total - coalesce(sum(a.amount) filter (where p.status = 'REGISTRADO'), 0))::numeric(12,2) as balance,
  c.status
from public.comprobante c
left join public.payment_allocation a on a.comprobante_id = c.id
left join public.payment p on p.id = a.payment_id
where c.deleted_at is null
group by c.id;

create view public.payment_balance with (security_invoker = true) as
select
  p.id as payment_id,
  p.entity_id,
  p.direction,
  p.status,
  p.amount,
  coalesce(sum(a.amount), 0)::numeric(12,2) as assigned_amount,
  (p.amount - coalesce(sum(a.amount), 0))::numeric(12,2) as unassigned_amount
from public.payment p
left join public.payment_allocation a on a.payment_id = p.id
group by p.id;

grant select on public.voucher_balance to anon, authenticated;
grant select on public.payment_balance to anon, authenticated;

alter table public.payment enable row level security;
alter table public.payment_allocation enable row level security;
alter table public.receipt_sequence enable row level security;

create policy payment_select on public.payment
  for select to anon, authenticated using (true);
create policy payment_insert on public.payment
  for insert to anon, authenticated with check (true);
create policy payment_update on public.payment
  for update to anon, authenticated using (true) with check (true);

create policy payment_allocation_select on public.payment_allocation
  for select to anon, authenticated using (true);
create policy payment_allocation_insert on public.payment_allocation
  for insert to anon, authenticated with check (true);
create policy payment_allocation_update on public.payment_allocation
  for update to anon, authenticated using (true) with check (true);
