# SPEC 19 — Cuadre de caja y control de movimientos por cuenta

> **Status:** Aprobado
> **Depends on:** SPEC 09, SPEC 16, SPEC 17, SPEC 18
> **Date:** 2026-10-06
> **Objective:** Vincular cada recibo de ingreso/egreso a una caja o banco y a una categoría, y cerrar caja por cuenta con arqueo opcional y bloqueo de fechas anteriores al último cierre.

## Why this spec exists

SPEC 09 modeló los recibos de ingreso/egreso, pero el recibo no sabe **por qué caja o banco pasó el dinero**: `payment` no tiene `cash_account_id`. Eso hace imposible construir un flujo de efectivo por cuenta, un arqueo o un cierre. Además, un recibo con fecha de hace un mes puede registrarse hoy sin nada que congele el pasado. SPEC 18 declaró explícitamente fuera de alcance "cualquier puente entre pagos y las cajas/bancos": esta spec es ese puente.

Con la cuenta y la categoría en cada recibo, el cierre por cuenta queda bien definido: el saldo de una cuenta en una fecha es su saldo inicial más los ingresos menos los egresos registrados hasta esa fecha. Cerrar fija ese corte de forma **irreversible** y, a partir de ahí, la base rechaza crear, editar o anular recibos de esa cuenta con fecha anterior o igual al cierre.

## Scope

**In:**

- Migración `create_cash_close_module`:
  - Purga física de los datos de desarrollo de recibos: `truncate` de `payment_allocation`, `payment` y `receipt_sequence`; recálculo manual de `comprobante.status` a `PENDIENTE` (el `truncate` no dispara triggers).
  - Enum `public.closing_periodicity` (`DAILY`, `WEEKLY`, `MONTHLY`).
  - Tablas `public.payment_method`, `public.cash_receipt_category`, `public.cash_close` y `public.app_setting`, todas con `owner_id NOT NULL DEFAULT auth.uid()` y RLS por dueño (SPEC 16).
  - `cash_account.closing_periodicity public.closing_periodicity` nullable (NULL = usa el default global).
  - `payment.method` (enum) reemplazado por `payment.method_id` (FK a `payment_method`); se agregan `payment.cash_account_id` y `payment.category_id`, ambos `NOT NULL`.
  - Triggers de bloqueo por cierre y función de posición de efectivo.
- Tipos regenerados en `lib/supabase/types.ts` (tablas y enum nuevos; `payment` con `method_id`, `cash_account_id`, `category_id`).
- Semillas de métodos y categorías **desde código**, insertadas perezosamente por cuenta la primera vez que se usan (el esquema exige `owner_id`, así que no se pueden sembrar por SQL sin sesión).
- `lib/schemas/cash-close.ts` y `lib/schemas/payment-method.ts` / `cash-receipt-category.ts`.
- `lib/caja/caja.ts` (posición, período sugerido, cierre, historial) y `lib/caja/defaults.ts` (semillas) y `lib/caja/csv.ts` (exportación).
- Recreación de la RPC `create_payment_with_allocations` con `p_cash_account_id`, `p_category_id` y `p_method_id uuid` (ya no el enum).
- Formulario de pago: cuenta (obligatoria, filtrada por método) y categoría (obligatoria, filtrada por dirección).
- Recibo imprimible: muestra cuenta y categoría.
- Submenú en el sidebar bajo MAESTRO: **CAJA Y BANCOS** (colapsable) con **Detalle de Cuentas**, **Cuadres de Caja** y **Configuración**.
- Rutas `/cajas-bancos/cuentas` (saldos por cuenta a hoy, convertidos a PEN), `/cajas-bancos/cuadres` (posición, cierre con arqueo, historial y reporte con exportación CSV) y `/cajas-bancos/configuracion` (CRUD de cuentas con periodicidad, métodos de pago, categorías y ajustes generales: periodo por defecto y tipo de cambio).
- Tests unitarios de esquemas y helpers de caja (sugerencia de período, diferencia de arqueo, moneda consolidada).

**Out of scope (for future specs):**

- Conciliación con extracto bancario: los bancos cierran solo con movimientos registrados.
- Apertura física del día o fondo fijo: la apertura es implícita (saldo calculado).
- Permisos/roles de caja: no hay sistema de usuarios y roles todavía; va con la spec de auth.
- PDF o formato imprimible del cuadre: el reporte es en pantalla + CSV.
- Movimientos de caja que no vengan de un recibo de pago (aportes del propietario, gastos hormiga): todo nace de recibos.
- Reasignar un recibo a otra cuenta después de registrado.
- Sincronización automática de tipo de cambio desde una API externa.
- Corregir un cierre: es irreversible por decisión de negocio (los errores se compensan con recibos posteriores).
- Reconstruir `receipt_sequence` con `owner_id`: el correlativo sigue siendo global por dirección, como en SPEC 09.

## Data model

Migración `create_cash_close_module` vía MCP `apply_migration` (y su archivo versionado `supabase/migrations/20261006120000_create_cash_close_module.sql`).

Paso 0 — purga de datos de desarrollo (decisión explícita del usuario):

```sql
truncate table public.payment_allocation, public.payment;
truncate table public.receipt_sequence;
-- el truncate no dispara triggers: se recalcula a mano el estado de los comprobantes
update public.comprobante set status = 'PENDIENTE' where status = 'PAGADO';
```

Bloque 1 — enum, catálogos y ajustes:

```sql
create type public.closing_periodicity as enum ('DAILY', 'WEEKLY', 'MONTHLY');

create table public.app_setting (
  owner_id   uuid not null default auth.uid(),
  key        text not null,
  value      text not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, key)
);

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
```

Bloque 2 — reemplazo del enum `payment_method` por la tabla y columnas nuevas en `payment`:

```sql
-- payment está vacío tras la purga: se puede reconstruir la columna.
alter table public.payment drop column method;
drop type public.payment_method;

alter table public.payment
  add column method_id       uuid not null references public.payment_method (id),
  add column cash_account_id uuid not null references public.cash_account (id),
  add column category_id     uuid not null references public.cash_receipt_category (id);

create index payment_cash_account_date_idx on public.payment (cash_account_id, payment_date desc);
create index payment_category_idx         on public.payment (category_id);
```

Bloque 3 — cierre de caja:

```sql
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

create index cash_close_account_idx on public.cash_close (cash_account_id, period_end desc);
```

Bloque 4 — trigger de bloqueo por cierre:

```sql
-- Helper reutilizable: rechaza una fecha <= último cierre de la cuenta
-- y también fechas anteriores al saldo inicial de la cuenta.
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

-- Bloquea INSERT (nuevos recibos) y UPDATE (edición, anulación o cambio de fecha)
-- de cualquier recibo cuya fecha esté dentro de un período cerrado.
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
```

Bloque 5 — posición de efectivo y cierre transaccional (RPC):

```sql
-- Saldo de una cuenta a una fecha: saldo inicial + ingresos − egresos registrados.
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

-- Cierre atómico: bloquea la cuenta, valida el corte, calcula totales e inserta el cierre.
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
    raise exception 'La fecha de cierre es anterior al saldo inicial de la cuenta (%)', v_opening_date;
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
```

Bloque 6 — RLS por dueño (patrón SPEC 16) para las cuatro tablas nuevas:

```sql
alter table public.app_setting            enable row level security;
alter table public.payment_method         enable row level security;
alter table public.cash_receipt_category  enable row level security;
alter table public.cash_close             enable row level security;

-- Por cada tabla, cuatro políticas: select / insert / update / delete
-- to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())
create policy app_setting_select on public.app_setting
  for select to authenticated using (owner_id = auth.uid());
-- … insert / update / delete equivalentes, y las mismas para las otras tres tablas.
```

Bloque 7 — recreación de la RPC de pagos con las columnas nuevas (migración aparte `20261006130000_recreate_create_payment_rpc_with_cash_account.sql`):

```sql
create or replace function public.create_payment_with_allocations(
  p_entity_id       uuid,
  p_direction       public.payment_direction,
  p_payment_date    date,
  p_amount          numeric(12,2),
  p_method_id       uuid,
  p_cash_account_id uuid,
  p_category_id     uuid,
  p_reference       text,
  p_notes           text,
  p_allocations     jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
-- ...mismo cuerpo de SPEC 17, con el insert cambiado a:
--   insert into public.payment (
--     entity_id, direction, payment_date, amount,
--     method_id, cash_account_id, category_id, reference, notes
--   ) values ( ... );
$$;

revoke execute on function public.create_payment_with_allocations(
  uuid, public.payment_direction, date, numeric, uuid, uuid, uuid, text, text, jsonb
) from public, anon;

grant execute on function public.create_payment_with_allocations(
  uuid, public.payment_direction, date, numeric, uuid, uuid, uuid, text, text, jsonb
) to authenticated, service_role;
```

Tipos de UI en `components/pagos/types.ts`:

```ts
export interface PaymentMethodRef {
  id: string;
  code: string;      // EFECTIVO, TRANSFERENCIA_BCP, TARJETA_CREDITO, …
  name: string;      // etiqueta en español
  isActive: boolean;
}

export interface CashReceiptCategory {
  id: string;
  direction: PaymentDirection;
  name: string;
  isActive: boolean;
}

export interface Payment {
  // …campos de SPEC 09/18
  methodId: string;        // era method: PaymentMethod
  cashAccountId: string;
  categoryId: string;
}

export interface CashClose {
  id: string;
  cashAccountId: string;
  periodicity: ClosingPeriodicity;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  incomeTotal: number;
  expenseTotal: number;
  expectedBalance: number;
  countedBalance: number | null;
  difference: number | null;
  penUsdRate: number | null;
  notes: string | null;
  createdAt: string;
}
```

Semillas en `lib/caja/defaults.ts` (se insertan perezosamente, con `insert … on conflict do nothing`, la primera vez que el usuario abre el módulo):

```ts
export const DEFAULT_PAYMENT_METHODS = [
  { code: "EFECTIVO",          name: "Efectivo" },
  { code: "TRANSFERENCIA_BCP", name: "Transferencia BCP" },
  { code: "TARJETA_CREDITO",   name: "Tarjeta de crédito" },
];

export const DEFAULT_CATEGORIES = {
  INGRESO: ["Cobranza de venta", "Anticipo de cliente", "Otro ingreso"],
  EGRESO: [
    "Pago a proveedor",
    "Anticipo a proveedor",
    "Gasto operativo",
    "Retiro del propietario",
    "Otro egreso",
  ],
};
```

Capa de datos (`lib/caja/caja.ts`):

```ts
// listCashPositions(asOf): Promise<CashAccountPosition[]>  → por cuenta, saldo y moneda
// getCashAccountStatement(accountId, from, to): Payment[]  → recibos del período
// getLastClose(accountId): CashClose | null
// proposeClosePeriod(accountId): { periodStart, periodEnd } según periodicidad
// closeCashAccount(values): CashClose                      → rpc close_cash_account
// listCashCloses(accountId?): CashClose[]                  → historial
// getAppSettings() / setAppSetting(key, value)             → app_setting
// ensureCatalogsSeeded()                                   → siembra métodos y categorías
```

Convenciones:

- Columnas y tablas en inglés `snake_case`; tipos TS en `camelCase` (AGENTS.md).
- Etiquetas de UI en español: "Detalle de Cuentas", "Cuadres de Caja", "Cerrar caja", "Arqueo", "Saldo esperado", "Diferencia (sobrante/faltante)", "Moneda", "La cuenta ya fue cerrada hasta…".
- La conversión a PEN en las vistas usa `app_setting.pen_usd_rate`; el saldo real de cada cuenta permanece en su moneda.
- El `receipt-dialog` imprime cuenta, categoría y método.

## Implementation plan

1. Crear `supabase/migrations/20261006120000_create_cash_close_module.sql` con los bloques 0–6 y aplicar la migración `create_cash_close_module` vía MCP. Revisar advisors de seguridad y rendimiento; confirmar con `execute_sql` las cuatro tablas, las columnas nuevas de `payment`, el enum y la ausencia del tipo `payment_method`.
2. Crear `supabase/migrations/20261006130000_recreate_create_payment_rpc_with_cash_account.sql` y aplicar la migración homónima. Verificar que `pg_get_functiondef` de `create_payment_with_allocations` usa `method_id`, `cash_account_id` y `category_id`.
3. Regenerar `lib/supabase/types.ts` (`npm run gen:types` con resguardo de `git checkout HEAD -- lib/supabase/types.ts`) y corregir los errores de tipos en `lib/pagos/pagos.ts` (mapeos `method` → `methodId`), `lib/data/payment-options.ts` y `components/pagos/types.ts`.
4. Crear `lib/schemas/payment-method.ts`, `lib/schemas/cash-receipt-category.ts`, `lib/schemas/cash-close.ts` y `lib/caja/defaults.ts`. Verificar `npm run lint`.
5. Crear `lib/caja/caja.ts` y `lib/caja/csv.ts` (posición, período sugerido, cierre, historial, ajustes, siembra y exportación). Verificar `npm run lint`.
6. `components/pagos/payment-form.tsx`: agregar selects de cuenta y categoría; filtrar cuentas por método (EFECTIVO → cajas; TRANSFERENCIA_BCP/TARJETA_CREDITO → bancos) y categorías por dirección; incluir ambos en la RPC. Manual: registrar un pago y verificar la fila en `payment`.
7. `components/pagos/receipt-dialog.tsx`: imprimir cuenta y categoría.
8. `components/cajas-bancos/`: adaptar el provider y crear las vistas de las tres rutas.
   - `/cajas-bancos/cuentas`: tabla con saldo a hoy por cuenta y total consolidado en PEN.
   - `/cajas-bancos/configuracion`: pestañas Cuentas (CRUD actual + periodicidad), Métodos, Categorías y General (periodicidad default y TC PEN/USD).
   - `/cajas-bancos/cuadres`: selector de cuenta, panel de posición y último cierre, modal **Cerrar caja** (arqueo en cajas, sin conteo en bancos) e historial con reporte por categoría y exportación CSV.
9. Eliminar `app/(app)/cajas-bancos/listado/` y crear `app/(app)/cajas-bancos/cuentas/page.tsx`, `.../cuadres/page.tsx` y `.../configuracion/page.tsx`.
10. `components/app-sidebar.tsx`: dentro del grupo MAESTRO, añadir **CAJA Y BANCOS** como colapsable con los tres subítems y estado activo por `usePathname`.
11. Tests unitarios en `tests/unit/` para `proposeClosePeriod`, el cálculo de diferencia de arqueo y los esquemas nuevos.
12. Verificar `npm run lint`, `npm test` y `npm run build`.

## Acceptance criteria

- [ ] Existen `public.app_setting`, `public.payment_method`, `public.cash_receipt_category` y `public.cash_close` con `owner_id NOT NULL DEFAULT auth.uid()`, RLS habilitado y cuatro políticas por tabla (select/insert/update/delete) `to authenticated`.
- [ ] El tipo `public.payment_method` ya no existe; `payment.method_id` es `uuid NOT NULL` con FK a la tabla.
- [ ] `payment.cash_account_id` y `payment.category_id` son `NOT NULL` con FK; `payment` y `receipt_sequence` quedan vacíos tras la purga y ningún comprobante queda `PAGADO` sin pagos.
- [ ] La RPC `create_payment_with_allocations` recibe `p_method_id`, `p_cash_account_id` y `p_category_id`, y solo es ejecutable por `authenticated` y `service_role`.
- [ ] Registrar un pago exige cuenta y categoría; un pago en efectivo solo ofrece cajas y uno por transferencia/tarjeta solo bancos.
- [ ] Un recibo con `payment_date` anterior al `opening_balance_date` de su cuenta es rechazado.
- [ ] `close_cash_account` calcula apertura, ingresos, egresos y saldo esperado; en cajas exige conteo y calcula la diferencia, en bancos deja `counted_balance` y `difference` en null.
- [ ] No se puede cerrar dos veces el mismo período ni un período anterior al último cierre (la RPC lo rechaza).
- [ ] Tras un cierre, insertar, editar (incluida la anulación) o asignar sobre un recibo con fecha ≤ `period_end` de esa cuenta falla con el mensaje del trigger; con fecha posterior funciona.
- [ ] El período sugerido respeta la periodicidad de la cuenta o, si es null, el default global; es editable antes de cerrar.
- [ ] El reporte del cierre muestra movimientos agrupados por categoría, el arqueo y la diferencia, y exporta a CSV.
- [ ] En una cuenta en USD, el cierre guarda `pen_usd_rate` y las vistas consolidadas convierten a PEN con el TC de Configuración.
- [ ] Los métodos y las categorías se pueden crear, editar y desactivar desde Configuración; al abrir el módulo por primera vez aparecen las semillas.
- [ ] El sidebar muestra MAESTRO → CAJA Y BANCOS con Detalle de Cuentas, Cuadres de Caja y Configuración, y marca el subítem activo.
- [ ] `npm run lint`, `npm test` y `npm run build` pasan.

## Decisions

- **Sí:** cuenta y categoría obligatorias en cada recibo. Sin cuenta no hay flujo de efectivo ni cierre posible.
- **Sí:** un recibo afecta una sola cuenta. Los pagos mixtos (parte efectivo, parte transferencia) se registran como dos recibos.
- **Sí:** cierre por cuenta individual, no global: permite cerrar la caja hoy y seguir operando el banco con fechas anteriores.
- **Sí:** cierre manual con periodicidad sugerida (diaria/semanal/mensual). La periodicidad solo propone el corte; no cierra sola.
- **Sí:** apertura implícita: `opening = saldo inicial + movimientos anteriores al período`. No se registra efectivo de apertura.
- **Sí:** arqueo con conteo físico y diferencia solo en cajas; los bancos cierran con saldo según movimientos (sin extracto).
- **Sí:** cierre irreversible. No hay UI ni función de reapertura; corregir un error se hace con recibos de fecha posterior.
- **Sí:** bloqueo en la base con triggers, no solo en la UI. Cubre inserts, ediciones, anulaciones y asignaciones.
- **Sí:** la moneda la define la cuenta; el multi-moneda se resuelve consolidando a PEN con un TC manual en `app_setting`. No se cambian los recibos para soportar dos monedas en un pago.
- **Sí:** métodos de pago en tabla configurable (reemplaza el enum `payment_method`). Se puede agregar o desactivar sin migración.
- **Sí:** categorías por dirección en tabla configurable, con semillas comunes (cobranza, anticipos, gastos, retiro del propietario, otros).
- **Sí:** semillas desde código insertadas perezosamente. `owner_id` es `NOT NULL` y no se puede sembrar por SQL sin sesión.
- **Sí:** purga física de recibos de prueba (`truncate`) porque el proyecto está en desarrollo y el usuario lo pidió explícitamente.
- **Sí:** reporte en pantalla + CSV; el PDF del cuadre queda para otra spec.
- **No:** extracto bancario, aperturas físicas, permisos/roles, reasignación de un recibo a otra cuenta, tipo de cambio automático.

## Risks

| Risk | Mitigation |
| --- | --- |
| El `truncate` no dispara los triggers de estado de comprobante | La migración recalcula `comprobante.status` a PENDIENTE manualmente en el paso 0. |
| Dos cierres simultáneos sobre la misma cuenta | `close_cash_account` bloquea la fila de `cash_account` con `for update`; además `unique (cash_account_id, period_end)` actúa como red final. |
| Reemplazar el enum `payment_method` rompe la RPC y la UI | Se recrea la RPC en su propia migración y se hace búsqueda global (`grep`) de los usos de `method`/`PaymentMethod`. |
| Un borrado del enum con dependencias ocultas falla | Se verificó que solo `payment` depende del tipo; aun así la migración se aplica y revisa antes de continuar. |
| La siembra perezosa duplica filas si dos pestañas abren a la vez | `insert … on conflict do nothing` sobre `unique (owner_id, code)` y `unique (owner_id, direction, name)`. |
| El TC manual queda desactualizado y distorsiona el consolidado | La UI muestra la fecha de última actualización del ajuste y el cierre guarda `pen_usd_rate` como snapshot. |
| Anular un recibo de una factura histórica ya no es posible tras el cierre | Es intencional; se documenta en la UI del intento de anulación con el mensaje del trigger y la alternativa de un recibo compensatorio. |

## What is **not** in this spec

- Conciliación con extracto bancario.
- Apertura física del día o fondo fijo.
- Permisos y roles de caja (spec de auth).
- PDF o formato imprimible del cuadre.
- Movimientos de caja sin recibo de pago.
- Reasignar un recibo a otra cuenta ya registrado.
- Tipo de cambio automático desde una API externa.

Cada uno de esos, si aparece, va en su propia spec.
