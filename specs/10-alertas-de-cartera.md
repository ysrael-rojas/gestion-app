# SPEC 10 — Avisos de cartera y contadores en la navegación

> **Status:** Implementado
> **Depends on:** SPEC 09
> **Date:** 2026-09-29
> **Objective:** Mostrar en el inicio un resumen de cartera con cantidades y montos por cobrar, por pagar y sin asignar, y exponer contadores en **PAGOS** que enlacen a las listas filtradas de pendientes y vencidos.

## Why this spec exists

SPEC 09 deja pagos y saldos consultables pero sin señales visibles: el usuario debe entrar a cada lista para descubrir qué facturas siguen sin cobrar, qué compras siguen sin pagar y qué anticipos quedaron sin asignar. Además, `/` todavía es la pantalla de ejemplo de Next. Esta spec convierte el inicio en el tablero de cartera y añade el aviso permanente en el menú, reutilizando las vistas `voucher_balance` y `payment_balance` creadas en SPEC 09 sin agregar tablas.

## Scope

**In:**

- `components/cartera/types.ts` con `CarteraBucket` y `CarteraResumen`.
- `lib/pagos/cartera.ts`: `getCarteraResumen()`, `listOpenVouchers(direction)` y `listUnassignedPayments(direction)`, leyendo `voucher_balance` y `payment_balance`.
- Extender `components/pagos/pagos-provider.tsx` con `summary`, `isSummaryLoading` y `refreshSummary`, y refrescar el resumen tras `addPayment`, `assignAllocations` y `annulPayment`.
- Reescribir `app/page.tsx` como tablero **Resumen de cartera**: una tarjeta por cada cartera (**Por cobrar**, **Por pagar**, **Recibos sin asignar**, **Pagos sin asignar**) con cantidad, monto total y desglose de vencidos; listas cortas (máximo 5) de comprobantes vencidos con enlace a la lista filtrada.
- Filtros por `searchParams` en `/pagos/ingresos` y `/pagos/egresos`: `?filtro=pendientes` y `?filtro=vencidas` listan **comprobantes** con saldo en la dirección de la vista (vencidos en el segundo caso) vía `listOpenVouchers`; `?filtro=sin-asignar` acota la tabla de **pagos** a los `REGISTRADO` con saldo sin asignar vía `listUnassignedPayments`. La vista muestra un chip removible y, sin `filtro`, conserva la tabla de pagos de SPEC 09.
- Contadores en `components/app-sidebar.tsx`: `SidebarMenuBadge` en **PAGOS** (total) y en cada subítem (**INGRESOS**: por cobrar + recibos sin asignar; **EGRESOS**: por pagar + pagos sin asignar), leyendo el resumen del provider.
- Enlaces de los avisos: cada tarjeta y cada lista del inicio enlaza a `/pagos/ingresos` o `/pagos/egresos` con el `filtro` correspondiente.
- Reglas de vencimiento explícitas: un comprobante con saldo está **vencido** cuando su `effective_due_date` (`due_date` si es CRÉDITO, `issue_date` si es CONTADO) es anterior a hoy.
- Verificar `npm run lint` y `npm run build`.

**Out of scope (for future specs):**

- Correo, notificaciones push, campanas o centro de notificaciones dedicado.
- Avisos en tiempo real (Realtime); el resumen se recarga al abrir, al navegar y tras cada mutación de pagos.
- Endpoint/API dedicado o cron de vencimientos.
- Intereses, mora o recargos por atraso.
- Autenticación, RLS por usuario y agregaciones en el servidor.
- Cambios al formulario o a la lógica de pagos de SPEC 09.

## Data model

Esta spec no crea tablas ni migraciones. Reutiliza las vistas de SPEC 09:

```sql
-- public.voucher_balance: comprobante_id, entity_id, voucher_kind, voucher_type,
--   voucher_number, issue_date, payment_type, effective_due_date, total,
--   paid_amount, balance, status   (definida en SPEC 09)

-- public.payment_balance: payment_id, entity_id, direction, status, amount,
--   assigned_amount, unassigned_amount   (definida en SPEC 09)
```

Tipos en `components/cartera/types.ts`:

```ts
export interface CarteraBucket {
  count: number;
  amount: number;
  overdueCount: number;
  overdueAmount: number;
}

export interface CarteraResumen {
  receivable: CarteraBucket;        // voucher_kind = 'VENTA' and balance > 0
  payable: CarteraBucket;           // voucher_kind = 'COMPRA' and balance > 0
  unassignedReceipts: CarteraBucket; // payment REGISTRADO, direction = 'INGRESO', unassigned_amount > 0
  unassignedPayments: CarteraBucket; // payment REGISTRADO, direction = 'EGRESO', unassigned_amount > 0
  today: string;                    // "YYYY-MM-DD" local (getTodayLocalDate)
}
```

Capa de datos (firmas, en `lib/pagos/cartera.ts`):

```ts
// getCarteraResumen(): CarteraResumen
//   → lee voucher_balance (balance > 0) y payment_balance (REGISTRADO y unassigned_amount > 0)
//   → agrega cantidad, monto y vencidos con isOverdue (lib/pagos/saldos.ts, SPEC 09)
// listOpenVouchers(direction): VoucherBalance[]
//   → voucher_balance where balance > 0 y voucher_kind según direction, order effective_due_date asc
// listUnassignedPayments(direction): Payment[]
//   → payment join payment_balance where status = 'REGISTRADO' and unassigned_amount > 0
```

Provider (`components/pagos/pagos-provider.tsx`, extensión del de SPEC 09):

```ts
interface PagosContextValue {
  payments: Payment[];
  isLoading: boolean;
  error: string | null;
  summary: CarteraResumen | null;
  isSummaryLoading: boolean;
  addPayment: (values: PaymentFormValues) => Promise<PaymentDetail>;
  assignAllocations: (paymentId: string, items: AllocationInput[]) => Promise<void>;
  annulPayment: (id: string, reason: string) => Promise<void>;
  refresh: () => Promise<void>;
  refreshSummary: () => Promise<void>;
}
```

Filtros de la vista (`components/pagos/payments-view.tsx`, SPEC 09):

```ts
type PaymentsFilter = "todas" | "pendientes" | "sin-asignar" | "vencidas";
// ?filtro=<valor> en /pagos/ingresos y /pagos/egresos
// "pendientes": lista de comprobantes con saldo (listOpenVouchers)
// "vencidas": igual, solo los que cumplen isOverdue (effective_due_date < hoy)
// "sin-asignar": tabla de pagos REGISTRADO con unassigned_amount > 0 (listUnassignedPayments)
// sin filtro ("todas"): tabla de pagos de SPEC 09 sin acotar
```

Convenciones:

- Etiquetas de UI en español: "Resumen de cartera", "Por cobrar", "Por pagar", "Recibos sin asignar", "Pagos sin asignar", "Vencidas", "Ver pendientes".
- Montos con `formatCurrency` y fechas con `formatDate`/`getTodayLocalDate` de `lib/utils.ts`.
- Los contadores del sidebar y las tarjetas del inicio leen el mismo `summary`; no se consulta la base por separado en cada componente.
- **PAGOS** ya envuelve el sidebar con `PagosProvider` (SPEC 09); el badge no requiere mover providers.

## Implementation plan

1. Crear `components/cartera/types.ts` y `lib/pagos/cartera.ts` con `getCarteraResumen`, `listOpenVouchers` y `listUnassignedPayments`. Verificar `npm run lint`.
2. Extender `components/pagos/pagos-provider.tsx` con `summary`, `isSummaryLoading` y `refreshSummary`; llamar `refreshSummary` tras `addPayment`, `assignAllocations` y `annulPayment`, y al montar. Verificar `npm run build`.
3. Añadir `SidebarMenuBadge` en `components/app-sidebar.tsx`: total en **PAGOS** y desglose en **INGRESOS** y **EGRESOS**, ocultos cuando el conteo es 0 y visibles en modo colapsado. Verificar que el sidebar renderiza sin error.
4. Añadir los filtros `?filtro=` a `components/pagos/payments-view.tsx` y leerlos con `await searchParams` en `app/pagos/ingresos/page.tsx` y `app/pagos/egresos/page.tsx`. `pendientes`/`vencidas` renderizan la lista de comprobantes (`listOpenVouchers`); `sin-asignar` acota la tabla de pagos a los no asignados. Verificar: los tres valores acotan las filas y sin filtro se ven todas.
5. Reescribir `app/page.tsx` (client component) con las cuatro tarjetas del resumen, el desglose de vencidos y las listas cortas con enlaces filtrados.
   - Manual: `/` muestra Por cobrar, Por pagar, Recibos sin asignar y Pagos sin asignar con cantidad y monto.
6. Enlazar cada tarjeta y lista del inicio a `/pagos/ingresos?filtro=…` o `/pagos/egresos?filtro=…`. Verificar la navegación.
7. Verificar `npm run lint` y `npm run build`.

## Acceptance criteria

- [x] Existe `lib/pagos/cartera.ts` con `getCarteraResumen`, `listOpenVouchers` y `listUnassignedPayments`, sin nuevas tablas ni migraciones.
- [x] `CarteraResumen` agrega cantidad y monto de ventas por cobrar, compras por pagar, recibos sin asignar y pagos sin asignar.
- [x] Un comprobante con saldo 0 no se cuenta; una venta o compra parcialmente pagada sí se cuenta por su saldo restante.
- [x] Un comprobante CONTADO con saldo y `issue_date` anterior a hoy se cuenta como vencido; uno con fecha de hoy no.
- [x] Un comprobante CRÉDITO se cuenta como vencido cuando `due_date < hoy` y su saldo es mayor a 0.
- [x] Un pago `ANULADO` no se cuenta como sin asignar.
- [x] `/` muestra cuatro tarjetas (**Por cobrar**, **Por pagar**, **Recibos sin asignar**, **Pagos sin asignar**) con cantidad y monto, y el desglose de vencidos.
- [x] Cada tarjeta y cada lista corta enlaza a la lista filtrada correspondiente del módulo de pagos.
- [x] El sidebar muestra un contador en **PAGOS** y contadores separados en **INGRESOS** y **EGRESOS**; se ocultan cuando el conteo es 0.
- [x] Registrar, anular un pago o asignar saldo actualiza los contadores y el resumen sin recargar la página.
- [x] `/pagos/ingresos?filtro=pendientes`, `?filtro=sin-asignar` y `?filtro=vencidas` acotan las filas; sin `filtro` se muestran todas.
- [x] El mismo comportamiento de filtros aplica en `/pagos/egresos`.
- [x] Quitar el filtro devuelve la lista completa y la URL queda sin el parámetro.
- [x] Si la carga del resumen falla, se muestra un `toast.error` en español y la app sigue usable.
- [x] `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** reutilizar las vistas `voucher_balance` y `payment_balance` de SPEC 09; esta spec no toca el esquema.
- **Sí:** el resumen vive en `PagosProvider` para que el sidebar y el inicio lean un único estado, sin consultas duplicadas.
- **Sí:** los avisos son solo dentro de la app; sin correo, push ni Realtime (el resumen se recarga al abrir, al navegar y tras cada mutación).
- **Sí:** contadores en **PAGOS** y en sus subítems **INGRESOS**/**EGRESOS**, ocultos cuando valen 0.
- **Sí:** `CONTADO` con saldo vence desde el día siguiente a su emisión (`effective_due_date = issue_date`).
- **Sí:** las listas filtradas viven en las rutas de pagos mediante `?filtro=`; el inicio y el sidebar solo enlazan.
- **Sí:** `?filtro=pendientes`/`vencidas` listan **comprobantes** (no pagos) dentro de las rutas de pagos, porque el saldo y el vencimiento son atributos del comprobante; `?filtro=sin-asignar` acota la tabla de pagos; sin filtro se conserva la tabla de pagos de SPEC 09.
- **Sí:** `/` deja de ser la pantalla de ejemplo y pasa a ser el tablero de cartera.
- **No:** centro de notificaciones, correo, push, mora/intereses, API/cron de vencimientos y agregaciones en el servidor.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| El badge del sidebar accede a `usePagos()` y el provider debe envolver el sidebar | SPEC 09 monta `PagosProvider` dentro de `SidebarProvider` envolviendo `AppSidebar`; verificar el orden en `app/layout.tsx` antes de usar el hook. |
| `SidebarMenuBadge` puede no estar exportado en `components/ui/sidebar.tsx` | Confirmar el export; si falta, añadirlo dentro del mismo archivo sin instalar un componente nuevo (AGENTS.md: preguntar antes de instalar). |
| El resumen se calcula en cliente y usa `getTodayLocalDate` | Usar siempre la fecha local del helper para no desfasar vencimientos por zona horaria. |
| Un saldo puede quedar negativo en `voucher_balance` por una asignación futura | `computeBalance` acota a 0 y los filtros usan `balance > 0`; revisar si aparecen negativos en la vista. |
| Los filtros operan sobre filas ya cargadas, no sobre el servidor | Aceptado (mismo alcance que ventas/compras); documentado como fuera de alcance la paginación server-side. |
| El badge parpadea mientras carga el resumen | `isSummaryLoading` oculta el badge en vez de mostrar 0. |
| `app/page.tsx` pasa a client component y pierde el ejemplo de Next | Esperado: el home es el tablero; conservar `app/layout.tsx` sin cambios funcionales. |

## What is **not** in this spec

- Correo, notificaciones push, Realtime o centro de notificaciones.
- Mora, intereses o recargos por atraso.
- API, cron o job de vencimientos.
- Autenticación, RLS por usuario y agregaciones en el servidor.
- Cambios al formulario, validaciones o lógica de pagos de SPEC 09.
- Productos/líneas de comprobante.

Cada uno de esos, si aparece, va en su propia spec.
