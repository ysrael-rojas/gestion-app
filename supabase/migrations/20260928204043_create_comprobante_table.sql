create type public.voucher_kind as enum ('COMPRA', 'VENTA');
create type public.voucher_type as enum ('FACTURA', 'BOLETA', 'NOTA_VENTA');
create type public.payment_type as enum ('CONTADO', 'CREDITO');
create type public.comprobante_status as enum ('PAGADO', 'PENDIENTE');

create table public.comprobante (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entidad (id),
  voucher_kind public.voucher_kind not null,
  voucher_type public.voucher_type not null,
  voucher_number text not null,
  issue_date date not null,
  registration_date date not null default current_date,
  subtotal numeric(12,2) not null,
  igv numeric(12,2) not null,
  total numeric(12,2) not null check (total > 0),
  payment_type public.payment_type not null,
  credit_days integer,
  due_date date generated always as (
    case
      when payment_type = 'CREDITO' then issue_date + credit_days
      else null
    end
  ) stored,
  status public.comprobante_status not null default 'PENDIENTE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint comprobante_credit_days check (
    (payment_type = 'CREDITO' and credit_days is not null and credit_days >= 1)
    or (payment_type = 'CONTADO' and credit_days is null)
  )
);

create index comprobante_ventas_idx
  on public.comprobante (issue_date desc)
  where voucher_kind = 'VENTA' and deleted_at is null;

create index comprobante_entity_idx
  on public.comprobante (entity_id) where deleted_at is null;

create trigger comprobante_set_updated_at
  before update on public.comprobante
  for each row execute function public.set_updated_at();

alter table public.comprobante enable row level security;

create policy comprobante_select on public.comprobante
  for select to anon, authenticated using (true);
create policy comprobante_insert on public.comprobante
  for insert to anon, authenticated with check (true);
create policy comprobante_update on public.comprobante
  for update to anon, authenticated using (true) with check (true);
