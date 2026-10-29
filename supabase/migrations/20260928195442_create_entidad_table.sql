create type public.document_type as enum (
  'SIN_DOCUMENTO', 'RUC', 'DNI', 'CARNET_EXTRANJERIA'
);

create table public.entidad (
  id uuid primary key default gen_random_uuid(),
  document_type public.document_type not null default 'SIN_DOCUMENTO',
  document_number text not null default '',
  name text not null,
  address text not null default '',
  phone text not null default '',
  contact_name text not null default '',
  billing_email text not null,
  management_email text not null default '',
  is_client boolean not null default false,
  is_supplier boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint entidad_document_type_required check (
    (document_type = 'SIN_DOCUMENTO' and document_number = '')
    or (document_type <> 'SIN_DOCUMENTO' and length(trim(document_number)) > 0)
  ),
  constraint entidad_some_role check (is_client or is_supplier)
);

create unique index entidad_document_unique
  on public.entidad (document_type, document_number)
  where deleted_at is null and document_number <> '';

create index entidad_clientes_idx
  on public.entidad (created_at desc)
  where is_client and deleted_at is null;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger entidad_set_updated_at
  before update on public.entidad
  for each row execute function public.set_updated_at();

alter table public.entidad enable row level security;

create policy entidad_select on public.entidad
  for select to anon, authenticated using (true);
create policy entidad_insert on public.entidad
  for insert to anon, authenticated with check (true);
create policy entidad_update on public.entidad
  for update to anon, authenticated using (true) with check (true);
