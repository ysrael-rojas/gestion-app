-- SPEC 44: series de comprobantes configurables.
--
-- Una serie por código y tipo de comprobante. `is_default` marca la serie que el
-- formulario de ventas usa para sugerir la numeración. El índice único parcial
-- garantiza una sola serie por defecto por tipo.

create table public.voucher_series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  voucher_type voucher_type not null,
  code text not null check (code ~ '^[A-Za-z0-9]{1,4}$'),
  last_number integer not null default 0 check (last_number >= 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index voucher_series_owner_type_code_idx
  on public.voucher_series (owner_id, voucher_type, code) where deleted_at is null;
create unique index voucher_series_default_per_type_idx
  on public.voucher_series (owner_id, voucher_type) where is_default and deleted_at is null;
create index voucher_series_owner_idx
  on public.voucher_series (owner_id) where deleted_at is null;

alter table public.voucher_series enable row level security;

create policy voucher_series_select on public.voucher_series
  for select to authenticated using (owner_id = auth.uid());
create policy voucher_series_insert on public.voucher_series
  for insert to authenticated with check (owner_id = auth.uid());
create policy voucher_series_update on public.voucher_series
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy voucher_series_delete on public.voucher_series
  for delete to authenticated using (owner_id = auth.uid());

create trigger voucher_series_set_updated_at
  before update on public.voucher_series
  for each row execute function set_updated_at();
create trigger trg_voucher_series_owner_id
  before insert on public.voucher_series
  for each row execute function set_owner_id_on_insert();
