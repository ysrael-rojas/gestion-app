-- =========================================================================
-- Migración: create_cash_account
-- =========================================================================
-- Tabla `cash_account` para el módulo Cajas y Bancos (fase 1: administrar
-- cajas y cuentas bancarias). Los movimientos sobre estas cuentas (cobros,
-- pagos, transferencias) entran en una migración posterior.
--
-- Convenciones:
--   - snake_case lowercase para identificadores (regla Postgres).
--   - timestamptz para fechas con zona horaria.
--   - numeric(12,2) para montos monetarios (precisión exacta).
--   - text sin límite artificial; char_length(name) >= 1 por CHECK.
--   - soft-delete con deleted_at + índices.
--   - Sin RLS por consistencia con el resto del proyecto; queda como
--     mejora futura.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. Enum para el tipo de cuenta.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'cash_account_type') then
    create type public.cash_account_type as enum ('CASH_BOX', 'BANK_ACCOUNT');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Función trigger reutilizable para mantener `updated_at`.
--    Se crea idempotente; si ya existe una función con el mismo nombre en
--    public la reemplaza.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Tabla `cash_account`.
-- ---------------------------------------------------------------------------
create table if not exists public.cash_account (
  id uuid primary key default gen_random_uuid(),
  type public.cash_account_type not null,
  name text not null,
  currency text not null default 'PEN',
  bank_name text,
  account_number text,
  cci text,
  opening_balance numeric(12, 2) not null default 0,
  opening_balance_date date not null default current_date,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cash_account_name_nonempty check (char_length(name) >= 1),
  constraint cash_account_opening_balance_nonnegative check (opening_balance >= 0),
  constraint cash_account_bank_requires_name check (
    (type = 'BANK_ACCOUNT' and bank_name is not null and char_length(bank_name) >= 1)
    or (type = 'CASH_BOX' and bank_name is null and account_number is null and cci is null)
  )
);

-- ---------------------------------------------------------------------------
-- 4. Índices.
--    - (type): filtros por tipo de cuenta.
--    - (deleted_at): filtros para excluir soft-deleted.
--    - parcial (is_active) where deleted_at is null: listado principal.
-- ---------------------------------------------------------------------------
create index if not exists cash_account_type_idx
  on public.cash_account (type);

create index if not exists cash_account_deleted_at_idx
  on public.cash_account (deleted_at);

create index if not exists cash_account_active_idx
  on public.cash_account (is_active)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 5. Trigger updated_at.
-- ---------------------------------------------------------------------------
drop trigger if exists cash_account_set_updated_at on public.cash_account;

create trigger cash_account_set_updated_at
  before update on public.cash_account
  for each row
  execute function public.set_updated_at();