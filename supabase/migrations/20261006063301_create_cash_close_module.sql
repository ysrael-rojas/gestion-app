-- =========================================================================
-- Migración: create_cash_close_module (SPEC 19)
-- =========================================================================
-- Vincula cada recibo de ingreso/egreso a una caja/banco y a una categoría,
-- y agrega el cierre de caja por cuenta con bloqueo de fechas.
--
-- Incluye:
--   0) Purga de datos de desarrollo (truncate de recibos).
--   1) Enum closing_periodicity + tablas app_setting, payment_method y
--      cash_receipt_category.
--   2) Reemplazo del enum payment_method por la tabla configurable y
--      columnas nuevas en payment (method_id, cash_account_id, category_id).
--   3) Tabla cash_close.
--   4) Triggers de bloqueo por cierre.
--   5) RPC get_cash_position y close_cash_account.
--   6) RLS por dueño para las tablas nuevas.
--
-- ORDEN (ajuste respecto a la spec): la spec listaba `create table
-- payment_method` en el bloque 1, pero el tipo enum `public.payment_method`
-- todavía existía (tabla y tipo no comparten nombre en Postgres). Por eso
-- aquí se elimina primero la RPC vieja, se quita la columna `payment.method`
-- y recién entonces se suelta el tipo y se crea la tabla con ese nombre.
--
-- La RPC `create_payment_with_allocations` queda eliminada al final de esta
-- migración y se recrea en `20261006130000_recreate_create_payment_rpc_with_cash_account.sql`.
--
-- Asume aplicadas SPEC 09, SPEC 16 y SPEC 17.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0) Purga de datos de desarrollo
-- -------------------------------------------------------------------------
-- Decisión explícita del usuario: los recibos existentes son data de prueba.
-- El truncate NO dispara los triggers, así que el estado de los comprobantes
-- se recalcula a mano después.
truncate table public.payment_allocation, public.payment;
truncate table public.receipt_sequence;

update public.comprobante
   set status = 'PENDIENTE'::public.comprobante_status
 where status = 'PAGADO'::public.comprobante_status;

-- -------------------------------------------------------------------------
-- 1) Enum, catálogos y ajustes
-- -------------------------------------------------------------------------

create type public.closing_periodicity as enum ('DAILY', 'WEEKLY', 'MONTHLY');

-- Ajustes por usuario (clave/valor). Las semillas se insertan desde la app
-- (owner_id es NOT NULL y sin sesión no se puede sembrar por SQL).
create table public.app_setting (
  owner_id   uuid not null default auth.uid(),
  key        text not null,
  value      text not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, key)
);

-- -------------------------------------------------------------------------
-- 2) Reemplazo del enum payment_method por la tabla y columnas nuevas
-- -------------------------------------------------------------------------

-- La RPC vieja usa el enum en su firma: hay que soltarla para poder borrar
-- el tipo. Se recrea en la migración 20261006130000.
drop function if exists public.create_payment_with_allocations(
  uuid, public.payment_direction, date, numeric, public.payment_method,
  text, text, jsonb
);

-- payment está vacío tras la purga: se puede reconstruir la columna.
alter table public.payment drop column method;
drop type public.payment_method;

create table public.payment_method (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  code       text not null,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, code)
);

create table public.cash_receipt_category (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  direction  public.payment_direction not null,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, direction, name)
);

alter table public.cash_account
  add column closing_periodicity public.closing_periodicity;

alter table public.payment
  add column method_id       uuid not null references public.payment_method (id),
  add column cash_account_id uuid not null references public.cash_account (id),
  add column category_id     uuid not null references public.cash_receipt_category (id);

create index payment_cash_account_date_idx
  on public.payment (cash_account_id, payment_date desc);
create index payment_category_idx
  on public.payment (category_id);

-- -------------------------------------------------------------------------
-- 3) Cierre de caja
-- -------------------------------------------------------------------------

create table public.cash_close (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid(),
  cash_account_id  uuid not null references public.cash_account (id),
  periodicity      public.closing_periodicity not null,
  period_start     date not null,
  period_end       date not null,
  opening_balance  numeric(12,2) not null,
  income_total     numeric(12,2) not null default 0,
  expense_total    numeric(12,2) not null default 0,
  expected_balance numeric(12,2) not null,
  counted_balance  numeric(12,2),
  difference       numeric(12,2),
  pen_usd_rate     numeric(10,4),
  notes            text,
  created_at       timestamptz not null default now(),
  constraint cash_close_period_check check (period_start <= period_end),
  constraint cash_close_counted_check check (
    (counted_balance is null and difference is null)
    or (counted_balance is not null and difference is not null)
  ),
  unique (cash_account_id, period_end)
);

create index cash_close_account_idx
  on public.cash_close (cash_account_id, period_end desc);

-- -------------------------------------------------------------------------
-- 4) Triggers de bloqueo por cierre
-- -------------------------------------------------------------------------

-- Helper reutilizable: rechaza una fecha <= último cierre de la cuenta y
-- también fechas anteriores al saldo inicial de la cuenta.
create function private.assert_account_open_for(
  p_cash_account_id uuid,
  p_payment_date    date
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_opening_date date;
  v_last_end     date;
begin
  select a.opening_balance_date into v_opening_date
    from public.cash_account a
   where a.id = p_cash_account_id;

  if v_opening_date is null then
    raise exception 'La cuenta no existe';
  end if;

  if p_payment_date < v_opening_date then
    raise exception
      'La fecha del recibo (%) es anterior al saldo inicial de la cuenta (%).',
      p_payment_date, v_opening_date;
  end if;

  select c.period_end into v_last_end
    from public.cash_close c
   where c.cash_account_id = p_cash_account_id
   order by c.period_end desc
   limit 1;

  if v_last_end is not null and p_payment_date <= v_last_end then
    raise exception
      'La cuenta ya fue cerrada hasta %. No se pueden registrar ni modificar recibos con fecha anterior o igual.',
      v_last_end;
  end if;
end;
$$;

-- Bloquea INSERT (nuevos recibos) y UPDATE (edición, anulación o cambio de
-- fecha) de cualquier recibo cuya fecha esté dentro de un período cerrado.
create function private.assert_payment_account_open() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.assert_account_open_for(new.cash_account_id, new.payment_date);
  return new;
end;
$$;

create trigger payment_account_open_guard
  before insert or update on public.payment
  for each row execute function private.assert_payment_account_open();

-- Bloquea asignaciones nuevas sobre un pago cuyo período ya está cerrado.
create function private.assert_allocation_payment_open() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid;
  v_date    date;
begin
  select p.cash_account_id, p.payment_date into v_account, v_date
    from public.payment p
   where p.id = new.payment_id;

  perform private.assert_account_open_for(v_account, v_date);
  return new;
end;
$$;

create trigger payment_allocation_account_open_guard
  before insert or update on public.payment_allocation
  for each row execute function private.assert_allocation_payment_open();

-- -------------------------------------------------------------------------
-- 5) Posición de efectivo y cierre transaccional (RPC)
-- -------------------------------------------------------------------------

-- Saldo de una cuenta a una fecha: saldo inicial + ingresos − egresos.
create function public.get_cash_position(
  p_cash_account_id uuid,
  p_as_of           date default current_date
) returns numeric(12,2)
language sql stable security invoker set search_path = ''
as $$
  select a.opening_balance
       + coalesce(sum(p.amount) filter (where p.direction = 'INGRESO'), 0)
       - coalesce(sum(p.amount) filter (where p.direction = 'EGRESO'),  0)
    from public.cash_account a
    left join public.payment p
      on p.cash_account_id = a.id
     and p.status = 'REGISTRADO'
     and p.payment_date <= p_as_of
   where a.id = p_cash_account_id
   group by a.opening_balance;
$$;

-- Cierre atómico: bloquea la cuenta, valida el corte, calcula totales e
-- inserta el cierre. Irreversible por decisión de negocio.
create function public.close_cash_account(
  p_cash_account_id uuid,
  p_period_end      date,
  p_counted_balance numeric,   -- NULL en bancos
  p_notes           text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner        uuid;
  v_currency     text;
  v_opening_bal  numeric(12,2);
  v_opening_date date;
  v_periodicity  public.closing_periodicity;
  v_default      public.closing_periodicity;
  v_last_end     date;
  v_period_start date;
  v_opening      numeric(12,2);
  v_income       numeric(12,2);
  v_expense      numeric(12,2);
  v_expected     numeric(12,2);
  v_rate         numeric(10,4);
  v_id           uuid;
begin
  select a.owner_id, a.currency, a.opening_balance, a.opening_balance_date,
         a.closing_periodicity
    into v_owner, v_currency, v_opening_bal, v_opening_date, v_periodicity
    from public.cash_account a
   where a.id = p_cash_account_id
     for update;

  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'La cuenta no existe';
  end if;

  if p_period_end < v_opening_date then
    raise exception
      'La fecha de cierre es anterior al saldo inicial de la cuenta (%)',
      v_opening_date;
  end if;

  select c.period_end into v_last_end
    from public.cash_close c
   where c.cash_account_id = p_cash_account_id
   order by c.period_end desc
   limit 1;

  if v_last_end is not null and p_period_end <= v_last_end then
    raise exception 'El período ya está cerrado hasta %', v_last_end;
  end if;

  v_period_start := coalesce(v_last_end + 1, v_opening_date);

  select value::public.closing_periodicity into v_default
    from public.app_setting
   where owner_id = v_owner and key = 'default_closing_periodicity';

  v_periodicity := coalesce(v_periodicity, v_default, 'DAILY');

  select v_opening_bal
       + coalesce(sum(amount) filter (where direction = 'INGRESO'), 0)
       - coalesce(sum(amount) filter (where direction = 'EGRESO'), 0)
    into v_opening
    from public.payment
   where cash_account_id = p_cash_account_id
     and status = 'REGISTRADO'
     and payment_date < v_period_start;

  select coalesce(sum(amount) filter (where direction = 'INGRESO'), 0),
         coalesce(sum(amount) filter (where direction = 'EGRESO'), 0)
    into v_income, v_expense
    from public.payment
   where cash_account_id = p_cash_account_id
     and status = 'REGISTRADO'
     and payment_date between v_period_start and p_period_end;

  v_expected := v_opening + v_income - v_expense;

  if v_currency <> 'PEN' then
    select value::numeric(10,4) into v_rate
      from public.app_setting
     where owner_id = v_owner and key = 'pen_usd_rate';
  end if;

  insert into public.cash_close (
    cash_account_id, periodicity, period_start, period_end,
    opening_balance, income_total, expense_total, expected_balance,
    counted_balance, difference, pen_usd_rate, notes
  ) values (
    p_cash_account_id, v_periodicity, v_period_start, p_period_end,
    v_opening, v_income, v_expense, v_expected,
    p_counted_balance,
    case when p_counted_balance is null then null
         else p_counted_balance - v_expected end,
    v_rate, nullif(p_notes, '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.get_cash_position(uuid, date) from public, anon;
revoke execute on function public.close_cash_account(uuid, date, numeric, text) from public, anon;
grant execute on function public.get_cash_position(uuid, date) to authenticated, service_role;
grant execute on function public.close_cash_account(uuid, date, numeric, text) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- 6) RLS por dueño (patrón SPEC 16)
-- -------------------------------------------------------------------------

alter table public.app_setting           enable row level security;
alter table public.payment_method        enable row level security;
alter table public.cash_receipt_category enable row level security;
alter table public.cash_close            enable row level security;

create policy app_setting_select on public.app_setting
  for select to authenticated using (owner_id = auth.uid());
create policy app_setting_insert on public.app_setting
  for insert to authenticated with check (owner_id = auth.uid());
create policy app_setting_update on public.app_setting
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy app_setting_delete on public.app_setting
  for delete to authenticated using (owner_id = auth.uid());

create policy payment_method_select on public.payment_method
  for select to authenticated using (owner_id = auth.uid());
create policy payment_method_insert on public.payment_method
  for insert to authenticated with check (owner_id = auth.uid());
create policy payment_method_update on public.payment_method
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy payment_method_delete on public.payment_method
  for delete to authenticated using (owner_id = auth.uid());

create policy cash_receipt_category_select on public.cash_receipt_category
  for select to authenticated using (owner_id = auth.uid());
create policy cash_receipt_category_insert on public.cash_receipt_category
  for insert to authenticated with check (owner_id = auth.uid());
create policy cash_receipt_category_update on public.cash_receipt_category
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy cash_receipt_category_delete on public.cash_receipt_category
  for delete to authenticated using (owner_id = auth.uid());

create policy cash_close_select on public.cash_close
  for select to authenticated using (owner_id = auth.uid());
create policy cash_close_insert on public.cash_close
  for insert to authenticated with check (owner_id = auth.uid());
create policy cash_close_update on public.cash_close
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy cash_close_delete on public.cash_close
  for delete to authenticated using (owner_id = auth.uid());
