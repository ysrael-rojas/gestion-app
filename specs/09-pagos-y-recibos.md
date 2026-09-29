# SPEC 09 — Pagos, anticipos y recibos de ingreso/egreso

> **Status:** Aprobado
> **Depends on:** SPEC 07, SPEC 08
> **Date:** 2026-09-29
> **Objective:** Registrar pagos de ventas y compras en un módulo único que emite recibos de ingreso/egreso con numeración anual por tipo, permite abonos parciales y anticipos, los asigna a una o varias facturas y actualiza el estado PAGADO/PENDIENTE de cada comprobante.

## Why this spec exists

SPEC 07 dejó `comprobante.status` (PAGADO/PENDIENTE) editable y reservó explícitamente el módulo de pagos. Hoy toda venta o compra queda PENDIENTE para siempre, no existe forma de cobrar un anticipo ni de cuadrar varias facturas con un solo abono, y el botón **Imprimir** de ventas/compras no hace nada. Esta spec introduce el modelo de pagos sobre la tabla `comprobante` existente, sin alterar sus columnas, y convierte el estado en un valor derivado del saldo aplicado.

## Scope

**In:**

- Migración `create_payment_tables`: enums `payment_direction`, `payment_method`, `payment_status`; tablas `public.receipt_sequence`, `public.payment` y `public.payment_allocation`; esquema `private` con las funciones de correlativo, validación de asignación y refresco de estado; vista `public.voucher_balance` y `public.payment_balance`.
- Correlativo anual por dirección (`RI-AAAA-000001` para ingresos, `RE-AAAA-000001` para egresos), asignado dentro de la transacción del insert; los recibos anulados conservan su número.
- Reutilización de `public.set_updated_at()` (SPEC 06) para `payment.updated_at`.
- RLS activado en las tres tablas: políticas permisivas de `select`/`insert`/`update` para `anon` y `authenticated` (mismo patrón que `entidad` y `comprobante`); `receipt_sequence` queda sin políticas porque solo la tocan funciones `security definer`.
- Tipos TS regenerados en `lib/supabase/types.ts` (enums, tablas y vistas nuevas).
- `components/pagos/types.ts` con `Payment`, `PaymentDetail`, `PaymentAllocation`, `VoucherBalance` y los enums de UI.
- `lib/data/payment-options.ts` con las etiquetas en español de dirección, método y estado.
- `lib/schemas/payment.ts`: esquema zod del pago y de sus asignaciones.
- `lib/pagos/pagos.ts`: `listPayments`, `createPayment`, `addAllocations`, `voidPayment`, `getPaymentDetail`, `listOpenVouchers` y mapeo `snake_case ↔ camelCase`.
- `lib/pagos/saldos.ts`: helpers `computeBalance` y `isOverdue`.
- `components/pagos/pagos-provider.tsx` (asíncrono) montado en `app/layout.tsx` dentro de `SidebarProvider`, envolviendo `AppSidebar` y `SidebarInset`.
- Rutas `/pagos/ingresos` y `/pagos/egresos` con data table, modal de registro, modal de detalle, anulación, skeleton, toasts de éxito/error y paginación/búsqueda/orden en cliente.
- `components/pagos/payment-form.tsx` (con selector de entidad, método, fecha efectiva, importe, referencia opcional y notas) y `components/pagos/allocation-picker.tsx` (elige facturas abiertas y reparte el importe).
- Recepción de pagos adelantados: un pago sin asignaciones queda como saldo sin asignar de la entidad.
- Flujo para asignar después el saldo sin asignar de un pago a una o varias facturas abiertas (`addAllocations`).
- Anulación de un pago con motivo obligatorio; conserva el recibo y libera sus asignaciones del cálculo de saldo.
- Recibo imprimible térmico (`components/pagos/receipt-dialog.tsx`) con ancho configurable 58/80 mm y `window.print()`; reglas `@media print` en `app/globals.css`.
- Ítem **PAGOS** en `components/app-sidebar.tsx` como grupo colapsable con subítems **INGRESOS** y **EGRESOS**.
- Acción **Registrar pago** en `/ventas/listado` y `/compras/listado` (tabla y modal de detalle) para comprobantes con saldo, que enlaza a la vista de pagos con entidad y comprobante precargados.

**Out of scope (for future specs):**

- Avisos, resumen de cartera, contadores y badges (SPEC 10).
- Productos/líneas de detalle del comprobante.
- Cuotas o cronogramas de pago: un pago aplica importes, no agenda vencimientos.
- Recibos como comprobantes fiscales o emisión electrónica SUNAT.
- Edición de un pago ya registrado (solo anulación y reasignación de saldo).
- Correo o notificaciones push.
- Autenticación, RLS por usuario y paginación/búsqueda/orden en el servidor.
- Cambiar el cálculo de subtotal/IGV ni las columnas de `comprobante`.

## Data model

Migración `create_payment_tables` vía MCP `apply_migration`:

```sql
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
```

Correlativo y refresco de estado (funciones en `private`, `security definer` con `search_path` vacío; al vivir en un esquema no expuesto no son invocables por la API):

```sql
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
```

Vistas de saldo (necesarias para el selector de asignación y para SPEC 10):

```sql
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
```

RLS:

```sql
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
```

Notas: no hay políticas de `delete` (la anulación es lógica con `status = 'ANULADO'`), y `receipt_sequence` no expone políticas porque solo la escriben funciones `security definer`. `receipt_number` es columna generada de solo lectura.

Tipos de UI en `components/pagos/types.ts`:

```ts
export type PaymentDirection = "INGRESO" | "EGRESO";
export type PaymentMethod = "EFECTIVO" | "TRANSFERENCIA_BCP" | "TARJETA_CREDITO";
export type PaymentStatus = "REGISTRADO" | "ANULADO";

export interface Payment {
  id: string;
  entityId: string;
  direction: PaymentDirection;
  issueDate: string;             // "YYYY-MM-DD" — define el año del correlativo
  paymentDate: string;           // "YYYY-MM-DD" — fecha efectiva del pago
  receiptNumber: string;         // "RI-2026-000001" | "RE-2026-000001"
  amount: number;
  method: PaymentMethod;
  reference: string | null;      // nro de operación BCP / autorización de tarjeta
  status: PaymentStatus;
  voidReason: string | null;
  voidedAt: string | null;
  notes: string | null;
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  comprobanteId: string;
  amount: number;
}

export interface PaymentDetail extends Payment {
  allocations: PaymentAllocation[];
  assignedAmount: number;
  unassignedAmount: number;
}

export interface VoucherBalance {
  comprobanteId: string;
  entityId: string;
  voucherKind: "COMPRA" | "VENTA";
  voucherType: VoucherType;
  voucherNumber: string;
  issueDate: string;
  effectiveDueDate: string | null;
  paymentType: PaymentType;
  total: number;
  paidAmount: number;
  balance: number;
}
```

Esquema zod en `lib/schemas/payment.ts`:

```ts
const allocationSchema = z.object({
  comprobanteId: z.string().uuid(),
  amount: z.coerce.number().positive(),
});

export const paymentSchema = z
  .object({
    entityId: z.string().uuid("Selecciona una entidad."),
    direction: z.enum(["INGRESO", "EGRESO"]),
    paymentDate: z.string().min(1, "La fecha de pago es obligatoria."),
    amount: z.coerce.number().positive("El importe debe ser mayor a 0."),
    method: z.enum(["EFECTIVO", "TRANSFERENCIA_BCP", "TARJETA_CREDITO"]),
    reference: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(200).optional(),
    allocations: z.array(allocationSchema).default([]),
  })
  .superRefine((values, ctx) => {
    const assigned = values.allocations.reduce((sum, item) => sum + item.amount, 0);

    if (assigned > values.amount) {
      ctx.addIssue({
        code: "custom",
        message: "Las asignaciones no pueden superar el importe del pago.",
        path: ["allocations"],
      });
    }
  });
```

Capa de datos (firmas, en `lib/pagos/pagos.ts`):

```ts
// listPayments(direction): Payment[]                 → payment where direction = X order issue_date desc
// createPayment(values): PaymentDetail              → insert payment; luego insert allocations
// addAllocations(paymentId, items): void            → insert allocations sueltas sobre un pago existente
// voidPayment(id, reason): void                     → update status='ANULADO', void_reason, voided_at
// listOpenVouchers(direction, entityId): VoucherBalance[] → voucher_balance where balance > 0
// getPaymentDetail(id): PaymentDetail               → payment + payment_balance + allocations
// mapPaymentRow / mapAllocationRow / mapVoucherBalanceRow → snake_case ↔ camelCase
```

Helpers en `lib/pagos/saldos.ts`:

```ts
export function computeBalance(total: number, paidAmount: number): number;
// saldo = total - paidAmount, redondeado a 2 decimales, nunca negativo

export function isOverdue(
  effectiveDueDate: string | null,
  balance: number,
  today: string
): boolean;
// true si balance > 0 y effectiveDueDate < today (un CONTADO usa su issue_date)
```

Provider (misma forma que `VentasProvider`; montado en `app/layout.tsx`, dentro de `SidebarProvider` y envolviendo `AppSidebar` + `SidebarInset`):

```ts
interface PagosContextValue {
  payments: Payment[];
  isLoading: boolean;
  error: string | null;
  addPayment: (values: PaymentFormValues) => Promise<PaymentDetail>;
  assignAllocations: (paymentId: string, items: AllocationInput[]) => Promise<void>;
  annulPayment: (id: string, reason: string) => Promise<void>;
  refresh: () => Promise<void>;
}
```

Convenciones:

- Columnas, enums, funciones y vistas en inglés `snake_case`; tipos y campos TS en `camelCase` (AGENTS.md).
- Etiquetas de UI en español: "Registrar pago", "Importe", "Método", "Referencia", "Fecha de pago", "Saldo sin asignar", "Anular pago", "Imprimir recibo".
- Dirección ↔ tipo de comprobante: `INGRESO` ↔ ventas (cobros a clientes) y `EGRESO` ↔ compras (pagos a proveedores).
- Moneda con `formatCurrency` y fecha con `formatDate` de `lib/utils.ts`; el selector de entidades reutiliza `useClientes()` y `listSuppliers()`.
- El nombre de la entidad se resuelve por `entityId` contra `useClientes()`; si no existe, "Entidad no encontrada".
- La vista `voucher_balance` sólo se consulta; los cálculos de UI deben coincidir con `computeBalance`.

## Implementation plan

1. Aplicar la migración `create_payment_tables` vía MCP con el SQL del data model; revisar advisors de seguridad y rendimiento; confirmar con `list_tables` que existen las tablas, el esquema `private` y las vistas.
2. Regenerar los tipos de Supabase en `lib/supabase/types.ts` (enums, `payment`, `payment_allocation`, `receipt_sequence`, `voucher_balance`, `payment_balance`). Verificar `npm run lint`.
3. Crear `components/pagos/types.ts`, `lib/data/payment-options.ts` y `lib/schemas/payment.ts`. Verificar `npm run lint`.
4. Crear `lib/pagos/saldos.ts` y `lib/pagos/pagos.ts` (listar, crear pago con asignaciones, asignar a un pago existente, anular, listar comprobantes abiertos, detalle y mapeos). Verificar `npm run lint`.
5. Crear `components/pagos/pagos-provider.tsx` y montarlo en `app/layout.tsx` dentro de `SidebarProvider`, envolviendo `AppSidebar` y `SidebarInset`. Verificar `npm run build`.
6. Crear `components/pagos/payments-view.tsx` (tabla + toolbar + skeleton, parametrizado por `direction`) y las rutas `app/pagos/ingresos/page.tsx` y `app/pagos/egresos/page.tsx` que lo consumen. Verificar: la ruta carga sin errores y muestra filas o vacío.
7. Crear `components/pagos/payment-form.tsx` y `components/pagos/allocation-picker.tsx`; conectar el alta desde `payment-modal.tsx` (validación zod, `toast.success`/`toast.error`).
   - Manual: registrar un pago con importe mayor al total de la factura y comprobar que el saldo sobrante queda como "Sin asignar".
8. Crear `components/pagos/payment-detail-modal.tsx` con las asignaciones, el botón **Asignar saldo** (usa `addAllocations`), **Anular** (pide motivo) y **Imprimir recibo**.
9. Crear `components/pagos/receipt-dialog.tsx` con selector de ancho 58/80 mm (persistido en `localStorage` bajo `gestion-app:receipt-width`, default 80) y el bloque `@media print` en `app/globals.css` que oculta la app y deja solo el recibo.
   - Manual: `window.print()` muestra solo el recibo y respeta el ancho elegido.
10. Añadir **PAGOS** a `components/app-sidebar.tsx` como grupo colapsable con subítems **INGRESOS** (`/pagos/ingresos`) y **EGRESOS** (`/pagos/egresos`), con estado activo por `usePathname`.
11. Añadir la acción **Registrar pago** en `components/ventas/sales-columns.tsx` y `components/compras/purchases-columns.tsx` (solo cuando `status = 'PENDIENTE'`) y en los modales de detalle; enlaza a `/pagos/ingresos?entityId=…&comprobanteId=…` o `/pagos/egresos?…`.
12. Hacer que `/pagos/ingresos` y `/pagos/egresos` lean `searchParams` (Promise en Next 16) y abran el modal de registro precargado con entidad y comprobante.
13. Verificar `npm run lint` y `npm run build`.

## Acceptance criteria

- [ ] Existen `public.payment`, `public.payment_allocation` y `public.receipt_sequence` con columnas, checks, índices, triggers y RLS descritos; `receipt_sequence` no tiene políticas.
- [ ] Existen las vistas `voucher_balance` y `payment_balance` con `security_invoker = true` y `grant select` a `anon` y `authenticated`.
- [ ] Insertar un pago asigna `receipt_number` con el patrón `RI-AAAA-000001` o `RE-AAAA-000001`; dos pagos consecutivos del mismo año y dirección reciben correlativos consecutivos.
- [ ] Un pago con `issue_date` de otro año usa el correlativo de ese año (`receipt_year` = año de emisión).
- [ ] Un pago que falla no consume correlativo: al reintentar, el número asignado es el inmediato siguiente al último emitido existente.
- [ ] Un pago insertado sin asignaciones queda con `unassigned_amount = amount` en `payment_balance`.
- [ ] Asignar importes a una o varias facturas crea filas en `payment_allocation`; una factura puede recibir varios pagos y un pago puede cubrir varias facturas.
- [ ] Intentar asignar a una factura un importe mayor a su saldo lanza error y no inserta la asignación.
- [ ] No se puede asignar una factura de venta a un pago de dirección `EGRESO`, ni una factura de otra entidad.
- [ ] Al cubrir el total de una factura, `comprobante.status` pasa a `PAGADO`; con saldo parcial o cero asignado permanece `PENDIENTE`.
- [ ] Anular un pago actualiza `status = 'ANULADO'` con motivo y `voided_at`, conserva `receipt_number` y devuelve el saldo a las facturas afectadas (vuelven a `PENDIENTE` si tenían importe aplicado).
- [ ] `receipt_number` y `void_reason` no se pueden dejar en estados inconsistentes (el check `payment_void_check` lo impide).
- [ ] `/pagos/ingresos` y `/pagos/egresos` renderizan sin errores en consola, con skeleton al cargar y `toast.error` en fallos.
- [ ] Registrar un pago desde la UI muestra el recibo y persiste al recargar.
- [ ] El formulario exige entidad, fecha de pago, importe mayor a 0 y método; rechaza asignaciones que sumen más que el importe.
- [ ] El campo **Referencia** es opcional en todos los métodos y se imprime cuando fue ingresado.
- [ ] Un pago con saldo sin asignar muestra el botón **Asignar saldo** y permite aplicarlo a facturas abiertas después.
- [ ] **Anular pago** pide un motivo y no borra el recibo.
- [ ] **Imprimir recibo** abre el diálogo, permite elegir 58/80 mm (default 80), conserva el ancho entre sesiones y en la impresión solo se ve el recibo.
- [ ] El recibo muestra número, fecha de emisión, fecha de pago, entidad, método, referencia, importe, detalle de asignaciones y saldo sin asignar.
- [ ] Reimprimir un recibo usa el mismo número y no crea un pago nuevo.
- [ ] El sidebar muestra **PAGOS** con **INGRESOS** y **EGRESOS**, navega a las rutas y marca el subítem activo.
- [ ] `/ventas/listado` y `/compras/listado` muestran **Registrar pago** solo en comprobantes `PENDIENTE` y abren el formulario precargado en la ruta de pagos correspondiente.
- [ ] `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** una tabla `payment` con `direction` (INGRESO/EGRESO) en lugar de dos tablas; un solo correlativo por dirección y año.
- **Sí:** correlativo asignado por trigger `before insert` dentro de la misma transacción: no hay huecos por fallos y los anulados conservan su número.
- **Sí:** formato `RI-AAAA-000001` / `RE-AAAA-000001` con el año de `issue_date` (fecha de emisión del recibo), no el de `payment_date`.
- **Sí:** `issue_date` la fija la base (`current_date`) y no se edita; la fecha variable que captura el usuario es `payment_date`.
- **Sí:** tabla contador `receipt_sequence` por `(direction, year)` con `insert … on conflict do update` atómico; reinicia cada año.
- **Sí:** funciones auxiliares en el esquema `private` con `security definer` y `search_path = ''`, para que la API no exponga el contador ni permita escribir el estado a mano.
- **Sí:** asignaciones en tabla puente `payment_allocation` (N:M entre pago y comprobante) para soportar abonos parciales y varias facturas por pago.
- **Sí:** `status` del comprobante derivado del saldo aplicado por triggers (`refresh_comprobante_status`), sin edición manual.
- **Sí:** anulación lógica con `status = 'ANULADO'`, motivo y fecha; libera las asignaciones del cálculo sin borrarlas (trazabilidad).
- **Sí:** excedente del pago queda como saldo sin asignar y se aplica después con `addAllocations`.
- **Sí:** recibos internos de pago; no reemplazan factura/boleta ni emiten documentos electrónicos.
- **Sí:** impresión térmica con ancho configurable 58/80 mm (default 80) y `window.print()` + `@media print`; reimprimir reutiliza el recibo.
- **Sí:** anticipos permitidos para clientes y proveedores por igual.
- **Sí:** acción **Registrar pago** desde ventas/compras mediante enlace con `searchParams`, sin acoplar los providers de comprobantes y pagos.
- **Sí:** `PagosProvider` montado dentro de `SidebarProvider` envolviendo `AppSidebar` y `SidebarInset`, para que SPEC 10 pueda mostrar contadores en el menú.
- **No:** editar un pago registrado, cuotas/cronogramas, correo/push, auth, líneas de producto y emisión fiscal.
- **No:** `deleted_at` en `payment`; la baja es la anulación con motivo.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| La columna generada `receipt_number` depende de `receipt_year`/`receipt_serial` que escribe un trigger `before insert` | Verificar el orden trigger → columna generada en la migración; si falla, calcular `receipt_number` en la capa de datos. |
| `insert … on conflict do update … returning` con alias de tabla puede variar entre versiones | Probar el correlativo con dos inserts consecutivos y uno que falle; si falla, usar `select … for update` sobre `receipt_sequence`. |
| Trigger `before insert` que a su vez llama a otra función `security definer` con `search_path = ''` | Cualificar esquema en todas las referencias (`public.…`, `private.…`) y probar la migración completa antes de continuar. |
| `createPayment` hace dos inserts (pago y asignaciones) sin transacción única desde el cliente | Si falla el segundo, el pago queda como saldo sin asignar (estado válido y reutilizable con **Asignar saldo**). |
| Asignaciones concurrentes sobre la misma factura | `validate_allocation` bloquea la fila del comprobante con `for update`, serializando las asignaciones por comprobante. |
| `voucher_balance` usa `security_invoker` y necesita `grant select` | Otorgar el grant en la migración y comprobar que `anon`/`authenticated` pueden leerla vía PostgREST. |
| Los triggers de estado recalculan por cada fila de asignación | Volumen bajo y filtro por `comprobante_id` con índice `payment_allocation_comprobante_idx`; revisar advisors de rendimiento. |
| El selector de facturas queda vacío si la entidad no tiene saldos | Mostrar "Sin facturas con saldo" y permitir registrar el pago como anticipo sin asignaciones. |
| Las políticas permisivas de `payment` disparan avisos del advisor de seguridad | Aceptado y consciente, igual que en `entidad` y `comprobante`; se endurecerán al llegar la spec de auth. |

## What is **not** in this spec

- Avisos, resumen de cartera, contadores y badges en el inicio o el menú (SPEC 10).
- Productos/líneas del comprobante.
- Cuotas o agenda de vencimientos.
- Edición de un pago registrado (solo anulación y reasignación de saldo).
- Emisión fiscal, SUNAT o documentos electrónicos.
- Correo o notificaciones push.
- Autenticación, RLS por usuario y búsqueda/orden/paginación en el servidor.

Cada uno de esos, si aparece, va en su propia spec.
