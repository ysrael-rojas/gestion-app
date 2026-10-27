# SPEC 47 — Chip de conteo en los tabs del detalle de comprobantes

> **Status:** Aprobado
> **Depends on:** SPEC 43
> **Date:** 2026-10-27
> **Objective:** Reemplazar el indicador `Hand` (mano ámbar) de las pestañas del detalle de comprobantes por un chip de conteo neutral que muestre cuántos registros tiene cada pestaña (pagos, notas, retenciones), sin cambios de esquema ni de queries.

## Why this spec exists

El detalle de comprobantes (`/ventas/[id]` y `/compras/[id]`, SPEC 43) indica "esta pestaña tiene información" con un ícono de mano levantada (`Hand` ámbar) junto al label. El usuario pidió el 2026-10-27 un indicador más profesional: la mano solo comunica presencia vaga, mientras que un contador numérico (patrón de bandeja de entrada: Gmail, GitHub) comunica magnitud — cuántos pagos registrados, cuántas notas aplicadas, cuántas retenciones — y lee como dato, no como decoración.

## Scope

**In:**

1. En `components/comprobantes/voucher-detalle-view.tsx`, sustituir el componente interno `TabHand` por un chip de conteo en las 3 pestañas con vacío posible:
   - **Historial de pagos**: `paymentHistory.length` (todas las filas del historial, incluidos pagos anulados).
   - **Notas de crédito/débito**: `notasCount` (conteo unificado NC + ND).
   - **Retenciones**: `retencionesCount`.
2. Diseño del chip: contador redondeado (`rounded-full`), `text-[10px] font-medium tabular-nums`, ancho mínimo fijo (`min-w-*`) para que el pill no "baile" al cambiar el conteo. En pill inactivo usa tokens neutrales (`bg-muted` / `text-muted-foreground`); sobre el pill activo de pagos (fondo rose/emerald sólido) usa un tratamiento contrastante (p. ej. `bg-white/20` / `text-white`).
3. El chip aparece **solo cuando el conteo > 0**; sin registros, la pestaña queda exactamente como hoy (silencio = vacío).
4. "Datos" sigue sin indicador (decisión de SPEC 43: siempre tiene contenido, sería ruido permanente).
5. El tono rose/emerald del pill de pagos (`paymentsTone`) se conserva intacto: cantidad va en el chip, estado va en el tono, el icono identifica — una sola señal por concepto.
6. Sin queries ni cambios de datos: los conteos ya viven en el estado de la vista; el refresco tras registrar un pago sigue siendo el `onRegistered` existente (`reload()` + `loadAdjustments()` + `loadPaymentHistory()`).
7. Tests: actualizar `tests/components/voucher-detalle-view.test.tsx`: reemplazar el helper `handOf` (selector `svg.lucide-hand`) por un selector del chip y adaptar los casos de la mano a casos del chip (conteo visible con registros, ausente sin registros).

**Out of scope (for future specs):**

- Mostrar montos en el chip (Σ NC, Σ retenido): la banda de totales dentro de cada sección ya lo muestra.
- Tonos de estado para los pills de Notas/Retenciones cuando tienen contenido.
- Indicador en la pestaña "Datos".
- Cambios de esquema, vistas, queries, RPC o del `PaymentDrawer`.
- Rediseño de los pills más allá del chip ni paso a `Tabs` de shadcn (vigente la decisión post-implementación de SPEC 43: pills de `Button`).

## Data model

Sin cambios en la DB ni en `lib/`. Solo estado de UI ya existente en `VoucherDetalleView`, reutilizado tal cual:

```ts
// Estado derivado actual en la vista (líneas ~148-160) — sin queries extra
paymentHistory: PaymentHistoryEntry[];  // getPaymentHistory() — todas las filas, incl. anuladas
notasCount: number;                     // ajustes con voucherType !== "COMPROBANTE_RETENCION"
retencionesCount: number;               // ajustes con voucherType === "COMPROBANTE_RETENCION"

// Nuevo componente interno (reemplaza a TabHand)
function TabCount({ count, solid }: { count: number; solid: boolean });
// solid=true cuando el pill está activo (fondo coloreado del tab de pagos)
```

## Implementation plan

1. En `voucher-detalle-view.tsx`: eliminar `TabHand` y crear `TabCount` (chip descrito en Scope 2); montarlo en los 3 pills con su conteo, pasando `solid` según el pill activo, y ajustar clases para contraste en claro/oscuro.
2. Verificar el nombre accesible: el botón pasa a leer p. ej. "Historial de pagos 3" — el e2e usa `getByRole("button", { name: /Historial de pagos/ })` (regex), por lo que sigue matcheando; confirmarlo.
3. Actualizar `tests/components/voucher-detalle-view.test.tsx`: nuevo helper (p. ej. `countOf(tab)`) en lugar de `handOf`, renombrar/ajustar los casos de la mano a casos del chip, incluyendo el conteo con pagos anulados.
4. Validación final: `npm run lint` + `npm test` + `npm run build` (+ e2e de pago con dev server y seed si el entorno lo permite).

## Acceptance criteria

- [ ] El chip de conteo aparece en Historial de pagos / Notas / Retenciones solo cuando hay registros (> 0) y no aparece cuando no los hay.
- [ ] Historial de pagos cuenta todas las filas del historial, incluidos pagos anulados (p. ej. 2 activos + 1 anulado → chip "3").
- [ ] Notas muestra un conteo unificado NC + ND (no desglosado).
- [ ] "Datos" no lleva chip.
- [ ] El chip es legible tanto en pill inactivo (muted) como sobre el pill activo rose/emerald de pagos, en modo claro y oscuro.
- [ ] El tono rose/emerald del pill de pagos se mantiene igual que antes (`paymentsTone` sin cambios).
- [ ] Tras registrar un pago desde el detalle, el chip de pagos se actualiza en vivo sin recargar la página (vía `onRegistered` existente).
- [ ] Los selectores del e2e `registrar-pago-y-ver-saldo.spec.ts` siguen funcionando (regex sobre el nombre del botón).
- [ ] `tests/components/voucher-detalle-view.test.tsx` actualizado y en verde; `npm run lint`, `npm test` y `npm run build` pasan.

## Decisions

- **Sí:** chip con conteo numérico. **No:** punto de presencia (tan vago como la mano), conteo + monto (ancho variable, ruido), iconos `Bell`/`Info` (leen como aviso, ya descartados en SPEC 43), `HandCoins` (choca con el icono del tab).
- **Sí:** conteo de pagos por filas del historial (incluye anulados), consistente con la corrección post-implementación de SPEC 43 y con la tabla visible. **No:** solo pagos activos (el chip diferiría de las filas que la pestaña muestra).
- **Sí:** conteo de notas unificado NC + ND. **No:** desglosado en dos chips (saturaría el pill; la sección ya separa por tipo).
- **Sí:** "Datos" sin indicador (se mantiene SPEC 43). **No:** chip permanente de ruido.
- **Sí:** alcance limitado al indicador. **No:** tonos para Notas/Retenciones.
- **Sí:** `tabular-nums` en el chip. **No:** números proporcionales (el ancho cambia entre 9 y 10).
- **Sí:** chips neutrales (`muted`) reservando el color para el estado de pagos. **No:** color propio del chip (competiría con rose/emerald).
- **Pase previo por `frontend-design`** (2026-10-27): concepto "el conteo comunica magnitud, el tono comunica estado, el icono identifica", tokens existentes del tema, sin colores nuevos.

## Risks

| Risk | Mitigation |
| --- | --- |
| Chip sobre el pill activo rose (fondo sólido) puede perder contraste | Tratamiento contrastante (`bg-white/20` / `text-white`); verificar en claro y oscuro (paso 1 del plan) |
| El nombre accesible del botón cambia al incluir el número | El e2e usa regex `/Historial de pagos/`, no string exacto; confirmarlo en el paso 2 |
| Conteos altos (10+ pagos) ensanchan el pill | Chip compacto con `min-w` fijo; el conteo rara vez pasa de 2 dígitos |
| Chips desincronizados tras registrar pago/anular | Ya cubierto por `onRegistered` (recarga voucher + ajustes + historial); no se agrega estado nuevo |

## What is **not** in this spec

Montos en el chip, tonos de Notas/Retenciones, indicador en "Datos", cambios de datos/RPC y rediseño de los pills. Cada uno, si llega, va en su propia spec.
