# SPEC 48 — Asignar saldo de pagos desde el listado

> **Status:** Aprobado
> **Depends on:** SPEC 09, SPEC 18, SPEC 26, SPEC 42
> **Date:** 2026-10-27
> **Objective:** Exponer en el listado de pagos la asignación de saldo pendiente: nueva columna "Saldo por asignar" con estado derivado (Por asignar / Asignado, calculado de `payment_balance.unassigned_amount`), botón por fila que abre un diálogo propio para asignar el saldo a uno o varios comprobantes (incluye anticipos sin entidad), sin cambios de esquema.

## Why this spec exists

Hoy el flujo de registro lleva a una página nueva (`/pagos/*/nuevo`) y la asignación posterior de un pago existente solo es alcanzable abriendo el modal "Ver" del listado y buscando el botón "Asignar saldo" (SPEC 18). El usuario pidió el 2026-10-27 un botón directo en el listado para completar el registro: los pagos pueden quedar sin entidad (anticipos) o con saldo sin asignar a comprobantes, y cada pago debe quedar con todo su saldo asignado a uno o varios comprobantes. Se necesita ver de un vistazo qué pagos tienen saldo pendiente y completarlos sin salir del listado.

## Scope

**In:**

1. **Columna "Saldo por asignar"** en el listado de pagos (`payments-columns.tsx`, ingresos y egresos): monto pendiente (`formatCurrency` con la moneda de la cuenta, `tabular-nums`) + badge del estado derivado:
   - `unassigned_amount > 0` y `status ≠ ANULADO` → badge ámbar "Por asignar".
   - `unassigned_amount = 0` → badge neutro (muted) "Asignado".
   - `status = ANULADO` → "—" (no participa del estado derivado).
   Posición: entre Importe y Estado.
2. **Estado derivado, no persistido**: se calcula siempre desde `payment_balance.unassigned_amount`. No se tocan los enums `EN_REVISION`/`PROCESADO`/`ANULADO` (son el ciclo de vida frente a caja, SPEC 26/33).
3. **Botón "Asignar" por fila** (solo visible si `status ≠ ANULADO` y `unassigned_amount > 0`): abre un **diálogo propio** en el listado, sin navegación.
4. **Diálogo `PaymentAssignDialog`** (nuevo, `components/pagos/payment-assign-dialog.tsx`), reutilizando bloques existentes:
   - Header: "Asignar saldo del pago" + recibo (p. ej. RI-000012).
   - Banda de montos: Importe / Asignado / Por asignar (del pago).
   - Si el pago no tiene entidad: primero `EntityAutocomplete` (Cliente en ingresos / Proveedor en egresos), como hoy hace el modal de detalle.
   - `AllocationPicker` con `amount = unassignedAmount`: multi-comprobante, monto clampeado al saldo del comprobante, Auto-distribuir.
   - Submit → `addAllocations(paymentId, items, entityId)` existente → toast + refresh del listado (mantiene filtros vigentes).
5. **Datos**: `listPayments` (`lib/pagos/pagos.ts`) hace una segunda query a `payment_balance` (filtrando `status in ('EN_REVISION','PROCESADO')`) y la fusiona por `payment_id` con un `Map` (patrón SPEC 13 para ventas/compras). El tipo de fila del listado expone `unassignedAmount`.
6. El filtro "sin-asignar" existente (cartera) se mantiene tal cual; no se añade el estado derivado al select de Estado del toolbar.
7. Tests: unitarios del merge en `listPayments`; de componente del diálogo nuevo (pago sin entidad → pide entidad; con entidad → directo al picker; asignación parcial; límite Σ ≤ saldo por asignar) y de las columnas (badge según derivación, botón condicionado, "—" en anulados).

**Out of scope (for future specs):**

- Refactor de `PaymentDetailModal` para usar el diálogo nuevo (se deja como está; su flujo "Asignar saldo" sigue funcionando).
- RPC transaccional para `addAllocations` (sigue siendo flujo cliente en 2 pasos, riesgo documentado en SPEC 13/18).
- Enum persistido de asignación, cambios de esquema/vistas/RPC, edición de importe/fecha del pago (bloqueado por `payment_guard_history_mutation`).
- Multi-asignación desde el `PaymentDrawer` del detalle de comprobante (SPEC 45 lo dejó 1 pago → 1 comprobante).
- Nueva página dedicada de asignación (justamente lo que se quiere evitar).

## Data model

Sin cambios en la DB. Reutiliza `payment`, `payment_allocation` y la vista `payment_balance` (`amount`, `assigned_amount`, `unassigned_amount`), ya usada por cartera y filtro "sin-asignar". Solo estado de UI:

```ts
// lib/pagos/pagos.ts — la fila del listado extiende su tipo con:
unassignedAmount: number;  // payment_balance.unassigned_amount (0 si no hay fila/anulado)

// Estado derivado en la UI (puro, testeable):
type AssignState = "POR_ASIGNAR" | "ASIGNADO" | "ANULADO";
// POR_ASIGNAR: status ≠ ANULADO && unassignedAmount > 0
// ASIGNADO:    status ≠ ANULADO && unassignedAmount === 0
// ANULADO:     status = ANULADO (columna muestra "—", sin botón)

// components/pagos/payment-assign-dialog.tsx — nuevo componente (Dialog de shadcn)
interface PaymentAssignDialogProps {
  payment: PaymentRow;       // con unassignedAmount y entity info
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;     // refresh del listado
}
```

## Implementation plan

1. `lib/pagos/pagos.ts`: en `listPayments`, segunda query a `payment_balance` (status in `EN_REVISION`,`PROCESADO`) + merge por `payment_id` (Map); exponer `unassignedAmount` en el tipo de fila. Antes de confiar en la vista, verificar con el MCP de Supabase la definición vigente de `payment_balance` (la original no filtra pagos anulados; por eso la query filtra por status). Unit tests del merge.
2. Helper puro de estado derivado (`getAssignState(row)`) + `PaymentAssignDialog` con EntityAutocomplete (condicional) + AllocationPicker + banda de montos + `addAllocations`. Tests de componente (pago con/sin entidad, parcial, exceso rechazado).
3. `payments-columns.tsx`: columna "Saldo por asignar" (monto + badge) y botón "Asignar" condicionado; `payments-view.tsx` monta el diálogo y refresca tras asignar (`onAssigned`). Tests de columnas.
4. Validación final: `npm run lint` + `npm test` + `npm run build` (+ verificación en navegador del listado y el diálogo con un pago anticipo real si el entorno lo permite).

## Acceptance criteria

- [ ] El listado de ingresos y egresos muestra la columna "Saldo por asignar" con el monto pendiente y badge: ámbar "Por asignar" (saldo > 0), neutro "Asignado" (saldo 0), "—" en anulados.
- [ ] El botón "Asignar" aparece solo en filas no anuladas con saldo por asignar y abre el diálogo sin salir del listado (sin navegación).
- [ ] En un pago sin entidad, el diálogo pide primero Cliente/Proveedor y luego habilita el picker; en uno con entidad va directo al picker.
- [ ] El diálogo permite asignar el saldo a uno o varios comprobantes, con monto clampeado al saldo de cada comprobante y Auto-distribuir disponible.
- [ ] Una asignación parcial es válida: el pago queda "Por asignar" con el saldo restante; al llegar a 0 el badge pasa a "Asignado" tras el refresh, sin recargar la página.
- [ ] No se puede asignar más que el saldo por asignar del pago (validación existente del picker/zod).
- [ ] Los pagos creados desde el `PaymentDrawer` (asignación 1:1 al crear) figuran como "Asignado".
- [ ] El filtro "sin-asignar" existente del toolbar sigue funcionando con la misma fuente (`payment_balance`).
- [ ] Los estados `EN_REVISION`/`PROCESADO`/`ANULADO` y su columna Estado quedan intactos; sin migraciones ni regeneración de tipos.
- [ ] `npm run lint`, `npm test` y `npm run build` pasan con los tests nuevos en verde.

## Decisions

- **Sí:** nombres "Por asignar" / "Asignado". **No:** "Por completar/Completado" (segundo vocabulario para el mismo concepto) ni "Pendiente/Aplicado" (jerga contable). "Asignar" ya es el vocabulario del producto: filtro "sin-asignar", botón "Asignar saldo", `AllocationPicker`.
- **Sí:** estado derivado en runtime desde `unassigned_amount`. **No:** enum persistido nuevo — `payment.status` es el ciclo de vida frente a caja (`EN_REVISION`→`PROCESADO`→`ANULADO`, guard `payment_guard_history_mutation`); mezclar asignación ahí rompería la semántica de conciliación y exigiría migración + guard + `gen:types` sin ganancia.
- **Sí:** diálogo propio en el listado. **No:** navegar a una página (lo que el usuario quiere evitar) ni pasar por el modal "Ver" (flujo escondido).
- **Sí:** columna propia "Saldo por asignar" con monto + badge. **No:** fusionar el estado derivado en la columna Estado (dos ciclos de vida distintos en una columna confunde) ni solo botón sin columna (pierde lectura de un vistazo).
- **Sí:** mantener el filtro "sin-asignar" actual. **No:** añadir "Por asignar/Asignado" al select de Estado del toolbar.
- **Sí:** pago sin entidad → diálogo pide entidad primero (mismo flujo que el modal de detalle, SPEC 18). **No:** bloquear la asignación de anticipos.
- **Sí:** reutilizar `AllocationPicker` + `EntityAutocomplete` + `addAllocations` tal cual. **No:** picker nuevo ni RPC nueva (out of scope desde SPEC 13/18).
- **Sí:** `PaymentDetailModal` se deja intacto. **No:** refactor para unificarlo con el diálogo nuevo en esta spec.
- **Pase previo por `frontend-design`** (2026-10-27): "el saldo por asignar es un dato, no una alarma" — monto primero, badge después; silencio = completo (badge neutro); ámbar solo para pendiente (mismo semáforo del drawer "Nuevo saldo > 0"); cero colores nuevos, cero iconos de aviso.

## Risks

| Risk | Mitigation |
| --- | --- |
| La definición vigente de `payment_balance` suma allocations sin excluir pagos anulados (a diferencia de `voucher_balance`) | La query del listado filtra `status in ('EN_REVISION','PROCESADO')` y los anulados muestran "—"; verificar la definición vigente con Supabase MCP en el paso 1 |
| `addAllocations` es un flujo cliente de 2 pasos sin transacción (update entity + insert allocations) | Riesgo ya documentado y aceptado (SPEC 13/18); el guard `validate_allocation` rechaza combinaciones inválidas; queda out of scope la RPC |
| El listado ya perdió columnas por ancho (SPEC 23) | Columna compacta (monto + badge pequeño, patrón del chip de SPEC 47) |
| Merge del listado y filtro "sin-asignar" podrían divergir | Ambos leen la misma vista `payment_balance` con el mismo filtro de status |
| Cantidad de columnas/acciones por fila crece | El botón "Asignar" solo existe cuando hay saldo pendiente; filas saldadas no suman chrome |

## What is **not** in this spec

RPC transaccional de asignación, enum persistido, refactor del modal de detalle, multi-asignación desde el drawer de comprobante, edición de pagos y cambios de esquema. Cada uno, si llega, va en su propia spec.
