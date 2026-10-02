# SPEC 14 — Historial de pagos en el detalle del comprobante

> **Status:** Aprobado
> **Depends on:** SPEC 09, SPEC 13
> **Date:** 2026-09-30
> **Objective:** Mostrar el historial de pagos aplicados a un comprobante en su modal de detalle, con un botón "Imprimir recibo" por cada pago, reusando el `ReceiptDialog` de SPEC 09.

## Why this spec exists

SPEC 09 modeló `payment_allocation` e introdujo el recibo imprimible dentro de `/pagos/ingresos` y `/pagos/egresos`, pero el usuario que abre el detalle de una factura desde `/ventas/listado` o `/compras/listado` solo ve la cabecera del comprobante: no sabe qué pagos le aplicaron, en qué fechas ni con qué número de recibo, y para reimprimir un recibo tiene que irse al módulo de pagos y buscarlo. SPEC 13 enriqueció el data table con `Pagado`/`Saldo`, pero el modal de detalle sigue mudo sobre la historia transaccional. Esta spec cierra esa brecha trayendo un historial de pagos al modal del comprobante sin tocar el modelo de datos ni reimprimir recibos por cuenta propia.

## Scope

**In:**

- Función `getPaymentHistory(comprobanteId: string): Promise<PaymentHistoryEntry[]>` en `lib/pagos/pagos.ts`, que consulta `payment_allocation` join `payment` filtrando por `comprobante_id` y devuelve una entrada por asignación (un pago puede aparecer varias veces si asigna a varios comprobantes; en este modal solo vemos las suyas).
- Tipo `PaymentHistoryEntry` añadido a `components/pagos/types.ts` con los campos necesarios para pintar la fila y disparar el `ReceiptDialog`.
- Componente compartido `components/comprobantes/payment-history-section.tsx` que recibe `comprobanteId` y la dirección (`INGRESO` para ventas, `EGRESO` para compras) y renderiza:
  - Título "Historial de pagos" con un encabezado de sección (mismo patrón visual que el resto del modal).
  - Skeleton mientras carga.
  - Estado vacío: "Aún no se han registrado pagos para este comprobante." + texto secundario "Puedes registrar uno desde el botón Registrar pago de arriba."
  - Estado de error: mensaje en la sección sin romper el modal; `toast.error` con el detalle.
  - Tabla con columnas: Fecha de pago, Recibo, Método, Importe asignado, Estado, Acciones. Orden por `issue_date desc, receipt_serial desc` (más reciente primero).
  - Badge `REGISTRADO` verde y `ANULADO` en gris (`text-muted-foreground`) para que se distingan los pagos vigentes de los anulados. Los anulados siguen mostrando el botón "Imprimir recibo" para reimprimir el recibo original.
  - Botón "Imprimir recibo" por fila (icono `Printer` de `lucide-react`) que abre `ReceiptDialog` con el `paymentId` correspondiente, reusando el componente de SPEC 09 sin cambios.
  - Etiquetas y formato: fecha `dd/mm/aaaa` con `formatDate`, importe con `formatCurrency`, recibo tal cual desde la DB.
- Integración en `components/ventas/sale-detail-modal.tsx` y `components/compras/purchase-detail-modal.tsx`: nueva sección "Historial de pagos" debajo de los datos de cabecera actuales (encabezado + tabla del comprobante) y encima de los botones de acción (Registrar pago / Cerrar). El modal gestiona el estado `printingPaymentId` y monta `<ReceiptDialog paymentId={printingPaymentId} onOpenChange=… />` con el mismo patrón que `payments-view.tsx`.
- Refresco del historial cada vez que se abre el modal (consulta fresca) y también cuando el modal se vuelve a abrir tras volver de `/pagos/...`. El provider de pagos (SPEC 13) ya refresca ventas/compras tras `addPayment`/`assignAllocations`/`annulPayment`; el modal se vuelve a montar al reabrir y dispara la consulta.
- Si la factura ya estaba PAGADO al abrir el modal, la sección muestra el historial aunque el botón "Registrar pago" siga oculto (porque SPEC 09 lo condiciona a `status = 'PENDIENTE'`). El usuario puede ver cómo/quién liquidó la factura.
- Verificación final con `npm run lint` y `npm run build`.

**Out of scope (for future specs):**

- Anular un pago desde el modal del comprobante (sigue solo en `payment-detail-modal`).
- "Asignar saldo sin asignar" desde el modal del comprobante (sigue solo en `payment-detail-modal`).
- Recibo específico para una asignación: se reusa el recibo completo del pago.
- Edición de pagos.
- Paginación, búsqueda u orden server-side del historial.
- Realtime: el historial se recarga al abrir el modal y tras cualquier mutación detectable al reabrir.
- Mover el botón "Registrar pago" al lado del historial; sigue donde SPEC 09 lo dejó.
- Mostrar historial en el data table como fila expandible.

## Data model

No se crean tablas, vistas, columnas ni migraciones. Se reutiliza lo definido en SPEC 09:

- `public.payment` (id, entity_id, direction, payment_date, issue_date, receipt_serial, receipt_number, amount, method, reference, status, void_reason, voided_at, notes).
- `public.payment_allocation` (id, payment_id, comprobante_id, amount).
- `public.voucher_balance` solo si más adelante se necesita consultar saldos vivos (esta spec no la usa).

Tipo añadido a `components/pagos/types.ts`:

```ts
export interface PaymentHistoryEntry {
  allocationId: string;       // payment_allocation.id
  paymentId: string;          // payment.id (FK para ReceiptDialog)
  receiptNumber: string;      // "RI-000001" | "RE-000001"
  paymentDate: string;        // "YYYY-MM-DD" — fecha efectiva del pago
  issueDate: string;          // "YYYY-MM-DD" — fecha de emisión del recibo
  direction: PaymentDirection;
  method: PaymentMethod;
  reference: string | null;
  paymentAmount: number;      // importe total del pago
  amount: number;             // importe aplicado a este comprobante (allocation.amount)
  status: PaymentStatus;      // "REGISTRADO" | "ANULADO"
  voidedAt: string | null;
  voidReason: string | null;
  notes: string | null;
}
```

Capa de datos (firma en `lib/pagos/pagos.ts`):

```ts
// getPaymentHistory(comprobanteId: string): Promise<PaymentHistoryEntry[]>
//   select a.id as allocation_id,
//          p.id, p.receipt_number, p.payment_date, p.issue_date,
//          p.direction, p.method, p.reference, p.amount as payment_amount,
//          p.status, p.voided_at, p.void_reason, p.notes,
//          a.amount as allocation_amount
//     from public.payment_allocation a
//     join public.payment p on p.id = a.payment_id
//    where a.comprobante_id = comprobanteId
//    order by p.issue_date desc, p.receipt_serial desc
// Si la consulta falla, propaga el error; el caller muestra toast.error y mensaje en la sección.
// Sin paginación: se esperan pocas filas por comprobante (la práctica muestra < 10).
// Si en el futuro un comprobante acumula cientos de pagos, se agrega LIMIT + cursor.

function mapPaymentHistoryRow(row: PaymentHistoryRow): PaymentHistoryEntry {
  return {
    allocationId: row.allocation_id,
    paymentId: row.id,
    receiptNumber: row.receipt_number,
    paymentDate: row.payment_date,
    issueDate: row.issue_date,
    direction: row.direction,
    method: row.method,
    reference: row.reference,
    paymentAmount: row.payment_amount,
    amount: row.allocation_amount,
    status: row.status,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    notes: row.notes,
  };
}
```

Componente compartido `components/comprobantes/payment-history-section.tsx`:

```tsx
interface PaymentHistorySectionProps {
  comprobanteId: string;
  direction: PaymentDirection;
  onPrint: (paymentId: string) => void;
}

// Internamente:
//  useEffect sobre comprobanteId → fetchPaymentHistory → setEntries / setError / setIsLoading
//  Renderiza Skeleton, estado vacío, estado de error o tabla.
//  Botón "Imprimir recibo" llama onPrint(entry.paymentId).
```

Convenciones:

- Tipos y campos en `camelCase`; columnas y SQL en `snake_case`.
- Etiquetas visibles en español: "Historial de pagos", "Fecha de pago", "Recibo", "Método", "Importe asignado", "Estado", "Acciones", "Imprimir recibo", "Aún no se han registrado pagos para este comprobante."
- Reutilizar `formatDate` y `formatCurrency` de `lib/utils.ts`.
- Reutilizar el badge de `PaymentStatus` desde `components/pagos/payments-view.tsx` si está exportado; si no, replicar la forma (variante verde para `REGISTRADO`, gris `text-muted-foreground` para `ANULADO`).
- Icono `Printer` de `lucide-react` para el botón de impresión.
- Componente client (`"use client"`).

## Implementation plan

1. Añadir `PaymentHistoryEntry` a `components/pagos/types.ts`. Verificar `npm run lint`.
2. Añadir `getPaymentHistory` y `mapPaymentHistoryRow` a `lib/pagos/pagos.ts`, con su tipo de fila interno y el `try/catch` que propaga. Verificar `npm run lint`.
3. Crear `components/comprobantes/payment-history-section.tsx` con la lógica de fetch, estados (loading/empty/error/populated) y la tabla. El botón "Imprimir recibo" llama a la prop `onPrint`. Verificar `npm run lint`.
4. Integrar en `components/ventas/sale-detail-modal.tsx`: importar `PaymentHistorySection`, `ReceiptDialog`, y el estado local `printingPaymentId`. Insertar la sección debajo del bloque actual de cabecera y encima de los botones de acción. Montar `<ReceiptDialog paymentId={printingPaymentId} onOpenChange={(open) => !open && setPrintingPaymentId(null)} />`. Verificar `npm run lint`.
5. Integrar en `components/compras/purchase-detail-modal.tsx` con la misma estructura y `direction="EGRESO"`. Verificar `npm run lint`.
6. Verificación manual con `npm run dev`:
   - Sobre una venta con varios pagos (alguno REGISTRADO, alguno ANULADO): el modal muestra la sección con todas las filas en orden cronológico inverso, el badge distingue los estados, el botón Imprimir abre el `ReceiptDialog` con el recibo del pago seleccionado. Repetir para una compra.
   - Sobre un comprobante sin pagos: muestra el mensaje de estado vacío.
   - Tras anular un pago desde `/pagos/ingresos` o `/pagos/egresos`, volver al listado de ventas/compras y abrir el detalle del comprobante afectado: la fila del pago aparece con badge `ANULADO`.
   - Tras registrar un nuevo pago, volver y abrir el modal: la nueva fila aparece arriba.
   - Si la consulta de historial falla (forzando un error de red en DevTools): el modal sigue mostrando la cabecera, la sección muestra el mensaje de error y se emite `toast.error`.
7. Verificar `npm run lint` y `npm run build`.

## Acceptance criteria

- [ ] Existe `getPaymentHistory(comprobanteId: string): Promise<PaymentHistoryEntry[]>` en `lib/pagos/pagos.ts` con el `select` del data model y `order by p.issue_date desc, p.receipt_serial desc`.
- [ ] `PaymentHistoryEntry` está definido en `components/pagos/types.ts` con todos los campos del data model.
- [ ] Existe `components/comprobantes/payment-history-section.tsx` con estados loading/empty/error/populated y recibe `comprobanteId`, `direction` y `onPrint` por props.
- [ ] `sale-detail-modal.tsx` muestra la sección "Historial de pagos" debajo de la cabecera y encima de los botones de acción, con `direction="INGRESO"`.
- [ ] `purchase-detail-modal.tsx` muestra la sección "Historial de pagos" debajo de la cabecera y encima de los botones de acción, con `direction="EGRESO"`.
- [ ] Cada fila muestra fecha de pago, número de recibo, método, importe asignado (formateado con `formatCurrency`), estado (badge) y botón "Imprimir recibo".
- [ ] El botón "Imprimir recibo" abre el `ReceiptDialog` de SPEC 09 con el `paymentId` correspondiente, sin reimprimir un pago nuevo.
- [ ] Cerrar el `ReceiptDialog` deja `printingPaymentId` en `null` y el modal del comprobante sigue montado.
- [ ] Los pagos `REGISTRADO` muestran badge verde; los `ANULADO` muestran badge gris (`text-muted-foreground`) y el botón Imprimir sigue disponible para reimprimir el recibo original.
- [ ] El historial se ordena por fecha de emisión descendente (más reciente arriba).
- [ ] Un comprobante sin pagos muestra "Aún no se han registrado pagos para este comprobante."
- [ ] Un comprobante `PAGADO` también muestra la sección con su historial completo; el botón "Registrar pago" sigue oculto según la regla de SPEC 09.
- [ ] Tras registrar un nuevo pago desde `/pagos/...`, al volver al listado y abrir el detalle del comprobante, la nueva fila aparece arriba del historial.
- [ ] Tras anular un pago desde `/pagos/...`, al volver y abrir el detalle, la fila aparece con badge `ANULADO` en gris.
- [ ] Si la consulta del historial falla, el modal sigue mostrando la cabecera sin romperse, se muestra mensaje de error en la sección y se emite `toast.error`.
- [ ] `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** la sección vive en `components/comprobantes/` (no en `components/pagos/`) porque la consume el modal del comprobante; el módulo de pagos sigue siendo dueño de su `payments-view.tsx`.
- **Sí:** reutilizar `ReceiptDialog` de SPEC 09 sin tocarlo; el contrato ya es `paymentId` → `getPaymentDetail`.
- **Sí:** consulta fresca por `comprobante_id` cada vez que el modal se monta; no se acopla al `PagosProvider` ni se mantiene caché propia. Coherente con SPEC 11/12 (UI sobre datos del provider, sin estado duplicado).
- **Sí:** los pagos anulados se muestran en el historial con badge gris para mantener la trazabilidad; el recibo original sigue siendo reimprimible.
- **Sí:** el componente `PaymentHistorySection` recibe `direction` por prop aunque hoy siempre coincide con el módulo (INGRESO en ventas, EGRESO en compras); así si más adelante se quiere filtrar por dirección en cliente no hay que tocar la firma.
- **Sí:** el orden es `issue_date desc, receipt_serial desc` para que dos pagos del mismo día aparezcan en el orden del correlativo (más reciente arriba).
- **Sí:** no se mueve ni se duplica el botón "Registrar pago"; sigue donde SPEC 09 lo puso.
- **Sí:** sin paginación: el caso real son pocas filas por comprobante; si el volumen crece, se agrega en una spec aparte con `LIMIT + cursor`.
- **No:** anular, asignar saldo, editar o reimprimir pagos desde el modal del comprobante.
- **No:** recibo específico por asignación; se reusa el recibo completo del pago.
- **No:** extender `PagosProvider` con un slice por comprobante.
- **No:** tocar `payment`, `payment_allocation`, `voucher_balance` ni los triggers de SPEC 09.
- **No:** mover la spec a "Implementado" automáticamente; el usuario marca `Aprobado` y luego `Implementado` cuando corresponda.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Un comprobante con muchos pagos degrada el modal | Sin paginación por ahora; documentado y fuera de alcance. Si se observa, se agrega `LIMIT` + cursor en otra spec. |
| El `PaymentStatus` badge se duplica entre `payments-view.tsx` y la nueva sección | Si el componente ya existe como helper en `components/pagos/`, extraerlo a `components/pagos/payment-status-badge.tsx` y reusar; si no, replicar la forma (un componente muy pequeño) sin perder coherencia visual. |
| `getPaymentHistory` lee directamente sin el wrapper `voucher_balance` | Aceptado: este modal no necesita el saldo vivo (ya está en la cabecera del comprobante desde SPEC 13); evita una segunda consulta. |
| El modal no se vuelve a montar al volver de `/pagos/...` porque algún padre lo mantiene vivo | En la práctica los modales de detalle se montan/desmontan por estado del padre (mismo patrón que `payments-view.tsx`); verificar en la verificación manual del paso 6 del plan. Si no se desmonta, añadir `comprobanteId` al `key` del modal para forzar remontaje. |
| Etiquetas en español mezcladas con inglés (ReceiptDialog ya existente) | Aceptado: las nuevas etiquetas de la sección ("Historial de pagos", "Recibo", "Importe asignado") son en español; las heredadas del `ReceiptDialog` quedan como están. |
| `ReceiptDialog` reconsulta `getPaymentDetail` aunque la fila ya tenga los datos | Aceptado: el diálogo ya hace esa consulta y se mantiene autocontenido; duplicar fetch sería peor que aprovechar el contrato existente. |

## What is **not** in this spec

- Anular, asignar saldo, editar o registrar pagos desde el modal del comprobante.
- Recibo específico para una asignación (se reusa el completo).
- Paginación, búsqueda u orden server-side del historial.
- Realtime o recarga automática sin reabrir el modal.
- Mostrar el historial como fila expandible en el data table.
- Mover o duplicar el botón "Registrar pago".
- Cambiar `payment`, `payment_allocation`, `voucher_balance` o los triggers.
- Migración de datos (no aplica: no hay datos nuevos que cargar).

Cada uno de esos, si aparece, va en su propia spec.
