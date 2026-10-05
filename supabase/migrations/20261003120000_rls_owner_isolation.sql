-- Añade owner_id a las tablas de datos y crea políticas RLS por propietario.
--
-- Contexto: hasta ahora las políticas eran `using (true)` para anon y
-- authenticated, lo que equivale a no proteger nada. Este script ata cada fila
-- a un usuario de auth.users y cierra el acceso anon.
--
-- auth.users está vacío (0 filas) al momento de aplicar, así que no hay
-- backfill: las filas existentes se asignan al primer usuario que se registre.

-- ---------------------------------------------------------------------------
-- 1. Columnas owner_id
-- ---------------------------------------------------------------------------

alter table public.entidad
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.comprobante
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.payment
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.payment_allocation
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.cash_account
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- receipt_sequence es global por dirección (no por usuario): el correlativo de
-- recibos no debe reiniciarse por usuario. Se deja sin owner_id a propósito.

-- ---------------------------------------------------------------------------
-- 2. Índices
-- ---------------------------------------------------------------------------

create index if not exists idx_entidad_owner_id
  on public.entidad(owner_id);

create index if not exists idx_comprobante_owner_id
  on public.comprobante(owner_id);

create index if not exists idx_payment_owner_id
  on public.payment(owner_id);

create index if not exists idx_payment_allocation_owner_id
  on public.payment_allocation(owner_id);

create index if not exists idx_cash_account_owner_id
  on public.cash_account(owner_id);

-- ---------------------------------------------------------------------------
-- 3. Políticas por propietario
-- ---------------------------------------------------------------------------

drop policy if exists entidad_select on public.entidad;
drop policy if exists entidad_insert on public.entidad;
drop policy if exists entidad_update on public.entidad;

create policy entidad_select on public.entidad
  for select to authenticated
  using (owner_id = auth.uid());

create policy entidad_insert on public.entidad
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy entidad_update on public.entidad
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists comprobante_select on public.comprobante;
drop policy if exists comprobante_insert on public.comprobante;
drop policy if exists comprobante_update on public.comprobante;

create policy comprobante_select on public.comprobante
  for select to authenticated
  using (owner_id = auth.uid());

create policy comprobante_insert on public.comprobante
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy comprobante_update on public.comprobante
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists payment_select on public.payment;
drop policy if exists payment_insert on public.payment;
drop policy if exists payment_update on public.payment;

create policy payment_select on public.payment
  for select to authenticated
  using (owner_id = auth.uid());

create policy payment_insert on public.payment
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy payment_update on public.payment
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists payment_allocation_select on public.payment_allocation;
drop policy if exists payment_allocation_insert on public.payment_allocation;
drop policy if exists payment_allocation_update on public.payment_allocation;

create policy payment_allocation_select on public.payment_allocation
  for select to authenticated
  using (owner_id = auth.uid());

create policy payment_allocation_insert on public.payment_allocation
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy payment_allocation_update on public.payment_allocation
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- cash_account no tenía ninguna política: con RLS activo quedaba inaccesible
-- para anon y authenticated. Se define explícitamente.
create policy cash_account_select on public.cash_account
  for select to authenticated
  using (owner_id = auth.uid());

create policy cash_account_insert on public.cash_account
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy cash_account_update on public.cash_account
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- receipt_sequence solo lo usa la función private de serialización a través de
-- la RPC. Se permite lectura a autenticados para que el flujo funcione; la
-- escritura queda en la función SECURITY DEFINER.
create policy receipt_sequence_select on public.receipt_sequence
  for select to authenticated
  using (true);

alter table public.entidad enable row level security;
alter table public.comprobante enable row level security;
alter table public.payment enable row level security;
alter table public.payment_allocation enable row level security;
alter table public.cash_account enable row level security;
alter table public.receipt_sequence enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Cerrar funciones SECURITY DEFINER exposed a anon
-- ---------------------------------------------------------------------------

-- create_payment_with_allocations debe seguir siendo SECURITY DEFINER: necesita
-- leer el esquema private (receipt_sequence) para asignar el número de recibo.
--
-- El revoke va contra PUBLIC, no contra anon: el privilegio estaba concedido a
-- PUBLIC (visible como `=X/postgres` en pg_proc.proacl), y PUBLIC incluye a
-- anon y a cualquier rol futuro. Un `revoke ... from anon` no surte efecto
-- mientras exista el grant a PUBLIC.
revoke execute on function public.create_payment_with_allocations(
  uuid, public.payment_direction, date, numeric, public.payment_method,
  text, text, jsonb
) from public;

revoke execute on function public.rls_auto_enable() from public;

grant execute on function public.create_payment_with_allocations(
  uuid, public.payment_direction, date, numeric, public.payment_method,
  text, text, jsonb
) to authenticated, service_role;

-- rls_auto_enable es un event trigger de la plataforma Supabase que activa RLS en
-- cada CREATE TABLE del esquema public. No crea políticas: por eso cash_account
-- quedó con RLS habilitado y cero políticas. Cualquier tabla nueva requiere sus
-- propias políticas explícitas.

-- search_path mutable en el trigger de updated_at.
alter function public.set_updated_at() set search_path = public, pg_temp;
