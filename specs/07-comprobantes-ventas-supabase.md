# SPEC 07 — Comprobantes de venta en Supabase (crédito y vencimiento)

> **Status:** Aprobado
> **Depends on:** SPEC 05, SPEC 06
> **Date:** 2026-09-28
> **Objective:** Persistir en Supabase los comprobantes de venta de `/ventas/listado` mediante una tabla única `comprobante` (compra o venta), añadiendo los campos de crédito `credit_days` y la fecha de vencimiento `due_date` calculada.

## Why this spec exists

Hasta ahora las ventas viven en memoria y se pierden al recargar (SPEC 05), mientras que los clientes ya usan Postgres (SPEC 06). Esta spec crea el primer modelo de comprobantes y lo generaliza desde el inicio: una `entidad` puede tener varios `comprobante`, cada uno de tipo compra o venta, con su propio `voucher_type`. La UI sigue siendo solo de ventas; las compras quedan modeladas pero sin interfaz, para no migrar la tabla después.

## Scope

**In:**

- Migración `create_comprobante_table` con los enums `voucher_kind`, `voucher_type`, `payment_type`, `comprobante_status` y la tabla `public.comprobante` con FK a `entidad`.
- Campo `credit_days` (entero, requerido solo si `payment_type = CREDITO`) y `due_date` como **columna generada** almacenada (`issue_date + credit_days`).
- RLS activado con políticas permisivas para `anon` y `authenticated` (mismo patrón que `entidad`).
- Baja lógica vía `deleted_at`; los listados filtran `deleted_at is null`.
- Regenerar los tipos TS de Supabase en `lib/supabase/types.ts`.
- Capa de acceso a datos `lib/comprobantes/comprobantes.ts` (listar ventas, crear, actualizar) con mapeo `snake_case ↔ Sale`.
- Reescribir `components/ventas/ventas-provider.tsx` como provider asíncrono y montarlo en `app/layout.tsx`.
- `app/ventas/listado/page.tsx` con handlers asíncronos, skeleton al cargar y `toast.error` en fallos.
- Formulario `sale-form.tsx`: al elegir pago **Crédito** aparece **Días de crédito** (entero, mínimo 1, precargado 30, editable) y **Fecha de vencimiento** (solo lectura, `issue_date + credit_days`); con **Contado** ambos se ocultan/limpian.
- Añadir **Días de crédito** y **Fecha de vencimiento** a la tabla y al modal de detalle (muestran `—` si es Contado).
- Mantener intactos el cálculo de subtotal/IGV (`calculateAmounts`), el estado editable PAGADO/PENDIENTE (lo gestionará después el módulo de pagos) y la búsqueda/orden/paginación en el cliente.

**Out of scope (for future specs):**

- UI de compras (`/compras`, `is_supplier`, selección de proveedor); la tabla soporta `voucher_kind = 'COMPRA'` pero esta spec solo crea `'VENTA'`.
- Productos/líneas de detalle del comprobante (solo cabecera).
- Módulo de pagos: cuotas, abonos, aplicar pagos, cambiar estado automáticamente.
- Anular y eliminar comprobantes.
- Acción real de **Imprimir** (sigue como placeholder).
- Autenticación, RLS por usuario y server-side search/orden/paginación.
- Migración de datos en memoria (no hay datos previos que conservar).

## Data model

Migración `create_comprobante_table` vía MCP `apply_migration`:

```sql
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
```

Notas: reutiliza `public.set_updated_at()` de SPEC 06; no hay política de `delete` porque la baja es lógica. `due_date` es generada y de solo lectura.

Tipo de UI (actualiza `components/ventas/types.ts`; `clientId` pasa a `entityId`):

```ts
export type VoucherType = "FACTURA" | "BOLETA" | "NOTA_VENTA";
export type PaymentType = "CONTADO" | "CREDITO";
export type SaleStatus = "PAGADO" | "PENDIENTE";

export interface Sale {
  id: string;
  issueDate: string;         // "YYYY-MM-DD"
  registrationDate: string;  // "YYYY-MM-DD"
  voucherType: VoucherType;
  voucherNumber: string;
  entityId: string;          // FK a entidad.id (cliente en la UI de ventas)
  subtotal: number;
  igv: number;
  total: number;
  paymentType: PaymentType;
  creditDays: number | null; // requerido si CREDITO; null si CONTADO
  dueDate: string | null;    // calculada: issueDate + creditDays
  status: SaleStatus;
}
```

Capa de datos (firma, en `lib/comprobantes/comprobantes.ts`):

```ts
// listSales(): Sale[]                     → select * where voucher_kind='VENTA' and deleted_at is null order issue_date desc
// createSaleRecord(values): Sale          → insert { ...values, voucher_kind: 'VENTA' }
// updateSaleRecord(id, values): Sale      → update ... eq id
// mapSaleRow(row) / mapSaleValues(values) → snake_case ↔ Sale
```

Provider (misma forma que `ClientesProvider`; sin `removeSale` porque eliminar está fuera de alcance):

```ts
// components/ventas/ventas-provider.tsx
interface VentasContextValue {
  sales: Sale[];
  isLoading: boolean;
  error: string | null;
  addSale: (values: SaleFormValues) => Promise<void>;
  updateSale: (id: string, values: SaleFormValues) => Promise<void>;
  refresh: () => Promise<void>;
}
```

Esquema zod (`lib/schemas/sale.ts`): añade `creditDays` con `z.preprocess` (vacío → `undefined`) + `z.coerce.number().int().min(1)` opcional, y un `superRefine` que exige `creditDays >= 1` cuando `paymentType === "CREDITO"`. `entityId` reemplaza a `clientId`; `subtotal`, `igv` y `dueDate` no se capturan.

Helper en `lib/ventas/amounts.ts`:

```ts
export function calculateDueDate(issueDate: string, creditDays: number): string;
// usa componentes locales (y, m, d + días) para evitar desfases de zona horaria
```

Convenciones:

- Columnas, enums y API en inglés `snake_case` (AGENTS.md); tipos/campos de TS en `camelCase`.
- Etiquetas de UI en español: "Días de crédito", "Fecha de vencimiento", "Cliente".
- `DEFAULT_CREDIT_DAYS = 30` en `lib/data/sale-options.ts`.
- El mapeo DB ↔ `Sale` vive en `lib/comprobantes/comprobantes.ts`; los componentes no conocen `snake_case`.
- La entidad se resuelve por `entityId` contra `useClientes()`; si no existe, "Cliente no encontrado".

## Implementation plan

1. Aplicar la migración `create_comprobante_table` vía MCP con el SQL del data model; revisar advisors de seguridad y rendimiento; confirmar con `list_tables`.
2. Regenerar los tipos de Supabase en `lib/supabase/types.ts` (enums y tabla `comprobante`). Verificar `npm run lint`.
3. Crear `lib/comprobantes/comprobantes.ts` con `listSales`, `createSaleRecord`, `updateSaleRecord` y el mapeo `snake_case ↔ Sale`. Verificar `npm run lint`.
4. Actualizar `components/ventas/types.ts` (`entityId`, `creditDays`, `dueDate`) y `lib/schemas/sale.ts` (campo condicional + `superRefine`); añadir `DEFAULT_CREDIT_DAYS` a `lib/data/sale-options.ts`. Verificar `npm run lint`.
5. Añadir `calculateDueDate` a `lib/ventas/amounts.ts`. Verificar `npm run lint`.
6. Crear `components/ventas/ventas-provider.tsx` (provider asíncrono) y montarlo en `app/layout.tsx`. Verificar `npm run build`.
7. Actualizar `app/ventas/listado/page.tsx` para consumir `useVentas()`: `handleSave` asíncrono con `try/catch` + `toast.error`, sin duplicar filas al editar.
8. Actualizar `components/ventas/sale-form.tsx`: selector de pago condicional, **Días de crédito** (default 30) y **Fecha de vencimiento** de solo lectura recalculada con `useWatch` sobre `issueDate`/`creditDays`.
9. Actualizar `components/ventas/sales-columns.tsx` y `components/ventas/sales-data-table.tsx` (columnas Días de crédito y Fecha de vencimiento; `Skeleton` mientras `isLoading`).
10. Actualizar `components/ventas/sale-detail-modal.tsx` con Días de crédito y Fecha de vencimiento.
11. Verificar `npm run lint` y `npm run build`.

## Acceptance criteria

- [ ] Existe la tabla `public.comprobante` con columnas, enums, checks, índices, trigger y RLS (3 políticas) descritos.
- [ ] `credit_days` es obligatorio (`>= 1`) cuando `payment_type = 'CREDITO'` y `null` cuando es `'CONTADO'`.
- [ ] `due_date` se calcula solo (`issue_date + credit_days`) y es de solo lectura.
- [ ] `/ventas/listado` muestra un skeleton mientras carga y luego las filas de la DB.
- [ ] Registrar una venta la inserta con `voucher_kind = 'VENTA'` y `deleted_at = null`; persiste al recargar.
- [ ] Al elegir **Crédito**, aparece **Días de crédito** (precargado 30) y **Fecha de vencimiento** se actualiza sola; con **Contado** ambos se ocultan y no se guarda crédito.
- [ ] Enviar a crédito sin días válidos muestra error y no envía.
- [ ] La tabla y el detalle muestran Días de crédito y Fecha de vencimiento (`—` en Contado).
- [ ] Editar una venta actualiza la misma fila en la DB sin duplicarla y conserva `registration_date`.
- [ ] Si una operación contra Supabase falla, se muestra un `toast.error` en español sin romper la página.
- [ ] El selector de cliente lista los clientes de la DB y el detalle resuelve el nombre por `entityId`.
- [ ] Búsqueda global, orden por columna y paginación siguen funcionando sobre las filas cargadas.
- [ ] `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** una sola tabla `comprobante` con `voucher_kind` (COMPRA/VENTA) y `voucher_type`; una entidad tiene varios comprobantes y evita migrar al llegar compras.
- **Sí:** esta spec implementa solo la UI de ventas; las compras quedan modeladas sin interfaz.
- **Sí:** `voucher_type` como enum nuevo (FACTURA, BOLETA, NOTA_VENTA), distinto del `document_type` de identidad de `entidad`.
- **Sí:** `entity_id` como FK genérica a `entidad(id)`; la etiqueta visible sigue siendo "Cliente".
- **Sí:** `VentasProvider` asíncrono montado en el layout, replicando `ClientesProvider`.
- **Sí:** `due_date` como columna generada almacenada en Postgres (consistente y consultable) y también calculada en vivo en el formulario.
- **Sí:** `credit_days` requerido y `>= 1` solo a crédito; default 30 al elegir Crédito.
- **Sí:** estado PAGADO/PENDIENTE editable y por defecto PENDIENTE; lo automatizará el futuro módulo de pagos.
- **Sí:** nro de comprobante manual y requerido, sin unicidad.
- **Sí:** baja lógica con `deleted_at` e índices parciales, por consistencia con `entidad`.
- **Sí:** RLS permisivo para `anon`/`authenticated` mientras no exista auth.
- **No:** UI de compras, líneas/productos, módulo de pagos, anular/eliminar, imprimir real, auth o paginación server-side.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| La columna generada `due_date` no acepta el `case` sobre enums | Validar la migración antes de seguir; si falla, almacenar `due_date` plana calculada en la capa de datos. |
| Desfase de zona horaria al sumar días | `calculateDueDate` usa componentes locales (no `toISOString()`); en DB `date + integer` es inmune a TZ. |
| Editar de Crédito a Contado deja `credit_days`/`due_date` huérfanos | El check exige `credit_days is null` en Contado; el formulario limpia el campo al cambiar de tipo. |
| El provider asíncrono deja vacío el listado mientras carga | `Skeleton` con `isLoading` y botón **Registrar venta** sin bloquear la página. |
| `credit_days` vacío se coerciona a 0 y dispara `min(1)` | `z.preprocess` convierte `""` en `undefined` y la validación de crédito se aplica solo si `paymentType = CREDITO`. |
| Las políticas permisivas disparan avisos del advisor de seguridad | Aceptado y consciente; se endurecerán al llegar la spec de auth. |
| `voucher_type` podría necesitar valores propios de compras (p. ej. guías) | Los nuevos valores irán en su propia migración; fijar solo los 3 actuales. |

## What is **not** in this spec

- UI ni lógica de compras/proveedores.
- Productos/líneas del comprobante.
- Módulo de pagos y automatización del estado.
- Anular, eliminar y acción real de Imprimir.
- Autenticación, RLS por usuario y búsqueda/orden/paginación en el servidor.

Cada uno de esos, si aparece, va en su propia spec.
