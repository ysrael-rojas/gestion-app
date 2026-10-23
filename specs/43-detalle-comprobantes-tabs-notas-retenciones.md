# SPEC 43 — Tabs completos en el detalle de comprobantes (notas y retenciones)

> **Status:** Implementado
> **Depends on:** SPEC 24, SPEC 39, SPEC 41
> **Date:** 2026-10-23
> **Objective:** Reorganizar la vista de detalle de comprobantes de ventas y compras en 4 tabs con icono (Datos, Historial de pagos, Notas de crédito/débito, Retenciones), con indicador de contenido por tab y el tab de pagos coloreado según su estado de pago, sin cambios de esquema.

## Why this spec exists

El detalle (`/ventas/[id]` y `/compras/[id]`, SPEC 41) solo tiene 2 tabs: "Datos del comprobante" e "Historial de pagos". Las notas y retenciones aplicadas (SPEC 39) solo son visibles en los listados globales de `/notas/*` y `/retenciones`; desde el comprobante afectado no hay forma de ver qué ajustes le caen encima sin salir del detalle. El usuario pidió el 2026-10-23 organizar el detalle en 4 tabs con iconos, indicador de "hay información" y el tab de pagos en rojo hasta quedar saldado.

## Scope

**In:**

1. `VoucherDetalleView` pasa de 2 a 4 tabs: **Datos** (`FileText`), **Historial de pagos** (`HandCoins`), **Notas de crédito/débito** (`NotebookPen`), **Retenciones** (`Percent`). "Datos" sigue activa por defecto.
2. Indicador **`Hand`** (ámbar) junto al label en Historial de pagos, Notas y Retenciones, solo cuando el tab tiene registros. "Datos" no lo lleva (siempre tiene información).
3. Tab **Historial de pagos** en rose mientras `voucher.balance > 0`; pasa a emerald al quedar saldado (saldo ≤ 0, tolera el saldo negativo de una ND).
4. Nueva query `listVoucherAdjustments(comprobanteId)` en `lib/comprobantes/notas.ts`: filas de `comprobante` con `referenced_comprobante_id`, `deleted_at IS NULL`, separadas por `voucher_type` (NC / ND / retención).
5. Nueva sección `components/comprobantes/voucher-adjustments-section.tsx` parametrizada (`"notas"` | `"retenciones"`): tabla de aplicadas + mini banda de totales (Σ NC y Σ ND en notas; Σ retenido en retenciones).
6. En **compras**, el tab Retenciones existe y muestra su estado vacío explicativo (hoy las retenciones solo existen recibidas y referenciando ventas).
7. `onRegistered` del wizard recarga además los ajustes (junto al `reload()` del voucher), para que mano y conteos no queden desincronizados.
8. Tests: unitarios de la query nueva, de componente de la sección nueva, y verificación de que los e2e existentes siguen pasando.

**Out of scope (for future specs):**

- Registrar notas o retenciones desde el detalle (botones "+ Nota" en el tab): se sigue haciendo desde `/notas/*` y `/retenciones`.
- Retenciones **emitidas** en compras (modelo actual: solo recibidas referenciando ventas).
- Cambios de esquema, vistas, triggers o del wizard `NestedPaymentDrawers`.
- Anulación de notas/retenciones desde el detalle; paginación de ajustes.

## Data model

Sin cambios en la DB. Reutiliza la tabla `comprobante` con `referenced_comprobante_id` (SPEC 39) y la vista `voucher_balance`. Solo hay estado de UI, no persistido:

```ts
// lib/comprobantes/notas.ts — nueva función
interface VoucherAdjustment {
  id: string;
  voucherType: "NOTA_CREDITO" | "NOTA_DEBITO" | "COMPROBANTE_RETENCION";
  voucherNumber: string;      // "F001-000001"
  issueDate: string;
  motiveCode: string | null;  // null en retenciones
  total: number;              // monto del ajuste
}

// Estado derivado en la vista (sin queries extra para pagos)
hasPayments: boolean;   // voucher.paidAmount > 0 → mano en el tab de pagos
notasCount / retencionesCount;  // de listVoucherAdjustments → mano por tab
isUnsettled: boolean;   // voucher.balance > 0 → tab de pagos en rose
```

## Implementation plan

1. Query `listVoucherAdjustments` en `lib/comprobantes/notas.ts` (patrón de `assertCreditTop` ya probado) + casos en `tests/unit/lib/comprobantes/notas.test.ts`.
2. `voucher-adjustments-section.tsx` (tabla + totales + skeleton + vacío) + test de componente nuevo.
3. `voucher-detalle-view.tsx`: 4 tabs con iconos, mano, trigger de pagos rose/emerald, carga de ajustes y recarga en `onRegistered`.
4. Espejo compras vía `voucherKind="COMPRA"` (mismo árbol; retenciones con vacío explicativo).
5. e2e: confirmar que `registrar-pago-y-ver-saldo` y `registrar-nota-credito-y-ver-saldo` siguen en verde con los selectores de tabs con iconos.
6. Validación final: `npm run lint` + `npm test` + `npm run build` (+ e2e con dev server y seed).

## Acceptance criteria

- [x] `/ventas/[id]` y `/compras/[id]` muestran los 4 tabs con su icono; "Datos" activa por defecto y sin mano. Verificado en FF01-00004/00012 y en una compra con datos sintéticos; `voucher-detalle-view.test.tsx` cubre ambos tipos.
- [x] El tab Historial de pagos se mantiene en rose mientras `balance > 0` y pasa a emerald al saldarse (saldo negativo cuenta como saldado). Verificado en vivo: FF01-00004 (rose, saldo 526), FF01-00012 (emerald, saldo 0) y FF01-00014 (emerald con saldo −50).
- [x] La mano `Hand` ámbar aparece en Historial de pagos / Notas / Retenciones solo cuando hay registros; desaparece si no los hay. Verificado en navegador y con tests de la vista.
- [x] El tab Notas lista las NC/ND aplicadas (tipo, número, emisión, motivo, total) con Σ NC y Σ ND. Verificado en FF01-00012: 3 notas de crédito, Σ S/ 30.00.
- [x] El tab Retenciones lista las aplicadas (número, emisión, total retenido) con Σ retenido. Cubierto por `voucher-adjustments-section.test.tsx` (la BD de desarrollo no tiene retenciones registradas).
- [x] En compras el tab Retenciones existe con su vacío explicativo (no se oculta). Verificado en navegador con una compra sintética (stub de red) y en el test de la vista con `voucherKind="COMPRA"`.
- [x] Registrar un pago desde el detalle actualiza en vivo color del tab, mano de pagos, banda y badge sin recargar la página. E2E `registrar-pago-y-ver-saldo` en verde (RI-000021 sobre FF01-00010) y comprobación posterior: banda, badge "Pagado", tab en emerald y manos visibles.
- [x] Datos e Historial conservan su contenido actual: misma grid de campos y misma tabla con impresión de recibos. La grid no cambió y el E2E de pago sigue usando el tab "Historial de pagos".
- [x] La query filtra solo ajustes no borrados del comprobante y separa NC/ND de retenciones por `voucher_type`. Cubierto por `notas.test.ts` (`listVoucherAdjustments`).
- [x] `npm run lint`, `npm test`, `npm run build` pasan y los e2e existentes siguen en verde. 443 tests, build con `/ventas/[id]` y `/compras/[id]`; e2e de pago y de nota de crédito 2/2.

## Decisions

- **Sí:** retenciones tab visible en compras con vacío explicativo. **No:** ocultarlo — el usuario quiere simetría y deja el espacio listo para retenciones emitidas futuras.
- **Sí:** mano solo en tabs con vacío posible. **No:** en "Datos" (siempre tiene información; sería ruido permanente).
- **Sí:** icono mano = `Hand` ámbar. **No:** `HandCoins` (choca con el icono del tab pagos), `Info`/`Bell` (leen como aviso).
- **Sí:** pagos rose → emerald al saldarse. **No:** neutro al pagarlo.
- **Sí:** tabla + mini banda de totales en notas/retenciones. **No:** solo tabla.
- **Sí:** una sola query por `referenced_comprobante_id` (NC + ND + retenciones juntas). **No:** una query por tab.
- **Sí:** mano de pagos desde `voucher.paidAmount` (ya disponible, sin query extra). **No:** contar filas del historial.
- **Sí:** labels "Datos", "Historial de pagos", "Notas de crédito/débito", "Retenciones". **No:** mantener "Datos del comprobante" (SPEC 24) — el usuario pidió el nombre corto.
- **Sí:** reutilizar `Tabs`/`TabsTrigger` de shadcn (soporta iconos vía `data-icon` y color por `className`). **No:** componente nuevo de tabs.
- **Post-implementación (2026-10-23):** a pedido del usuario, los tabs pasan a **pills de botones** (`default` activo / `ghost` inactivo) con **una card por sección** (card `bg-muted/30` + título), replicando el modelo de Configuración → Métodos de pago. El tab de pagos activo usa `default` con fondo rose sólido (misma forma: borde 3px y sombra ink) cuando queda saldo; la señal rose/emerald vive en el texto del pill inactivo. Se elimina la card externa que envolvía banda + tabs (ya no hay card dentro de card).
- **Corrección posterior (2026-10-23):** la mano de pagos ya no se deriva de `paidAmount` sino de **las filas del historial** (`getPaymentHistory`), porque un comprobante con todos sus pagos anulados tiene historial visible y saldo 0. El historial se carga en la vista y `PaymentHistorySection` quedó presentacional (`entries`, `error`, `onPrint`), así el refresco tras registrar un pago también es inmediato.

## Risks

| Risk | Mitigation |
| --- | --- |
| Los e2e existentes seleccionan tabs por nombre accesible; el icono/mano puede alterarlo | Paso 5 dedica a re-ejecutarlos y ajustar selectores si hace falta |
| Mano/conteos de notas y retenciones quedan desincronizados tras registrar (voucher se recarga, ajustes no) | `onRegistered` recarga también los ajustes |
| Saldo negativo por ND podría leerse como "pendiente" | Criterio único: `balance > 0` → rose; `balance <= 0` → emerald (mismo `isSettled` de la banda) |
| Tab permanentemente vacío en compras puede confundir | Vacío explica que las retenciones se registran en `/retenciones` y solo recibidas |

## What is **not** in this spec

Registrar ajustes desde el detalle, retenciones emitidas en compras, cambios de datos/RPC, anulación desde el detalle y paginación de ajustes. Cada uno, si llega, va en su propia spec.
