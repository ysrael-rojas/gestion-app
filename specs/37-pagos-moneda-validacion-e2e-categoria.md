# SPEC 37 — Pagos: moneda real, validación en vivo, e2e y categoría estable

> **Status:** Aprobado
> **Depends on:** SPEC 09, SPEC 25, SPEC 26
> **Date:** 2026-10-15
> **Objective:** Corregir los cuatro defectos operativos del módulo de pagos (ingresos y egresos): mostrar cada pago con la moneda real de su cuenta, validar el reparto a comprobantes antes de guardar, alinear el test e2e al flujo vigente y dar a las categorías de caja un código estable.

## Why this spec exists

Revisión del módulo de pagos con el agente `explore` y la skill `consultor-pagos-cobranzas` (2026-10-15): el núcleo del módulo es sólido (RPC atómica, correlativo sin huecos, estado derivado por triggers, guardas de inmutabilidad), pero cuatro defectos operativos afectan el día a día: `formatCurrency` en `lib/utils.ts` tiene `currency: "PEN"` hardcodeado (un pago en una cuenta USD se muestra como "S/"), el formulario solo detecta que el reparto supera los saldos al llegar el error de la BD, el e2e `registrar-pago-y-ver-saldo.spec.ts` apunta al flujo anterior a SPEC 25 (roto tras el cambio a drawers), y el drawer wizard busca la categoría por nombre exacto con fallback silencioso. Los otros hallazgos (duplicación modal/wizard, mappers duplicados, paginación client-side) quedan para specs futuras.

## Scope

**In:**

1. Moneda en pantalla: los importes de pagos (columna Importe, detalle, recibo térmico y banda de montos del wizard) se formatean con la moneda de su cuenta de caja (`cash_account.currency`, PEN/USD). `formatCurrency` en `lib/utils.ts` acepta `currency` con default `"PEN"`.
2. `listPayments`, `getPaymentDetail` y `listAccountStatement` (en `lib/pagos/pagos.ts`) traen `cash_account.currency` vía join; el tipo `Payment` del dominio gana el campo `currency`.
3. Validación en vivo del reparto: `AllocationPicker` clampea el total repartido contra la suma de saldos de los comprobantes seleccionados, y `PaymentForm` muestra un error inline antes del submit si la suma del reparto supera los saldos (hoy solo se valida `Σ reparto ≤ importe del pago` y el saldo real lo verifica la RPC al guardar).
4. Test e2e reescrito: `tests/e2e/registrar-pago-y-ver-saldo.spec.ts` apunta al flujo vigente de SPEC 25 (listado de ventas → botón Wallet → drawers → registrar → verificar saldo y estado PAGADO), con el seed exacto documentado en el comentario inicial.
5. Categoría por código estable: migración que añade `cash_receipt_category.code text` con constraint único y backfill de las semillas por nombre; las semillas de `lib/caja/defaults.ts` definen el `code` (`COBRANZA_VENTA`, `ANTICIPO_CLIENTE`, `OTRO_INGRESO`, `PAGO_PROVEEDOR`, `ANTICIPO_PROVEEDOR`, `GASTO_OPERATIVO`, `RETIRO_PROPIETARIO`, `ITF`, `COMISION_BANCARIA`, `DETRACCION_SPOT`, `OTRO_EGRESO`); el wizard busca por `code` y muestra un error visible si no existe (sin fallback silencioso a la primera categoría).

**Out of scope (for future specs):**

- Unificar `PaymentModal` y `NestedPaymentDrawers` (decisión preferida registrada: extraer un hook común, sin reescribir las UIs).
- Eliminar los mappers duplicados entre `lib/pagos/pagos.ts` y `lib/pagos/cartera.ts`.
- Paginación server-side del listado de pagos.
- Guardar la moneda como columna en `payment` (elegimos solo display con join).
- Conversión entre monedas / tipo de cambio fuera del cierre de caja.
- Pagos recurrentes, notas de crédito/débito, edición de pagos y anulación masiva (out of scope de SPEC 26, siguen pendientes).
- RPC transaccional para `addAllocations` (asignación tardía en dos roundtrips).
- Revisar el chequeo de estado obsoleto (`REGISTRADO`) en el archivo SQL versionado de la RPC original.
- Tests de componente de `PaymentForm`, `AllocationPicker` y `NestedPaymentDrawers` (más allá de lo que exija el e2e).

## Data model

- **Migración `add_cash_receipt_category_code`** (vía MCP `apply_migration`, snake_case) — parte 1 de 2:

```sql
alter table public.cash_receipt_category add column code text;
-- backfill por nombre semilla exacto (solo categorías aún no renombradas)
update public.cash_receipt_category set code = 'PAGO_PROVEEDOR' where name = 'Pago a proveedor' and direction = 'EGRESO';
-- ... (una línea por semilla)
create unique index cash_receipt_category_owner_id_code_key
  on public.cash_receipt_category (owner_id, code);
```

  La columna queda **nullable** en esta primera migración: `createCategory` (formulario de categorías personalizadas) e `ensureCatalogsSeeded` aún no envían `code`, y un `NOT NULL` inmediato rompería crear categorías. El índice único admite varios `NULL` (Postgres), así que las categorías personalizadas conviven. Luego `npm run gen:types` para regenerar `lib/supabase/types.ts`.
- **Migración `set_cash_receipt_category_code_not_null`** — parte 2 de 2, en el paso 6 (con las semillas): se aplica `alter column code set not null` tras confirmar 0 filas sin código, cuando la app siempre envía `code` (semillas con código + `createCategory` generando slug).
- **Tipos TS**: `Payment` (en `components/pagos/types.ts`) gana `currency: "PEN" | "USD"` — derivado del join, no es columna nueva en `payment`.
- Sin tablas nuevas, sin cambios de enum, sin tocar `payment`, `payment_allocation`, vistas ni RPCs existentes.

## Implementation plan

1. Migración `add_cash_receipt_category_code` (columna nullable + backfill + índice único `(owner_id, code)`), regenerar tipos y revisar advisors de seguridad y rendimiento.
2. `lib/utils.ts`: `formatCurrency(amount: number, currency: "PEN" | "USD" = "PEN")` — default PEN para que ventas/compras no cambien. Test unitario nuevo que verifique el símbolo de cada moneda.
3. `lib/pagos/pagos.ts`: join de `cash_account` en `listPayments`, `getPaymentDetail` y `listAccountStatement`; mapear `currency` al tipo `Payment`. Prueba manual: registrar un pago en una cuenta USD y ver `currency: "USD"` en el detalle.
4. UI de pagos: `payments-columns.tsx` (Importe), `payment-detail-modal.tsx`, `receipt-dialog.tsx` y `voucher-amounts-band.tsx` usan la moneda del pago. Prueba manual: el recibo de un pago USD muestra "$".
5. Validación en vivo: en `allocation-picker.tsx`, el `toggle`/edición de importe clampea contra el saldo restante disponible (saldo del voucher menos ya repartido en otras filas); en `payment-form.tsx`, validar `Σ reparto ≤ Σ saldos seleccionados` y mostrar el error inline en el picker, antes del submit.
6. Categoría por código: semillas con `code` en `lib/caja/defaults.ts`; `ensureCatalogsSeeded` rellena `code` en categorías existentes que matcheen por nombre; `nested-payment-drawers.tsx` resuelve la categoría por `code` y, si falta, muestra error visible (toast/estado) en lugar de fallback a la primera. `createCategory` genera el `code` automáticamente como slug del nombre (mayúsculas, sin acentos ni espacios). Migración `set_cash_receipt_category_code_not_null` (0 nulos → `set not null`).
7. Reescribir `tests/e2e/registrar-pago-y-ver-saldo.spec.ts` contra el flujo de drawers, con seed documentado en el comentario inicial.
8. Validación completa: `npm run lint` + `npm test` + `npm run build`.

## Acceptance criteria

- [ ] Un pago en una cuenta USD se muestra con "$" en la columna del listado, en el modal de detalle y en el recibo; un pago en PEN sigue mostrándose con "S/".
- [ ] `formatCurrency` con default sigue emitiendo "S/" en todos los puntos que no pasan moneda (ventas/compras no cambian).
- [ ] Intentar repartir más que la suma de los saldos muestra un error inline en el formulario, sin enviar el formulario y sin llegar a la RPC.
- [ ] El e2e `registrar-pago-y-ver-saldo` pasa de verde contra el flujo de drawers (ventas → Wallet → asistente → verificar saldo/PAGADO).
- [ ] Renombrar la categoría "Pago a proveedor" en la configuración NO rompe el wizard de compras (resuelve por `code`).
- [ ] Si ninguna categoría tiene el `code` esperado, el wizard muestra un error visible (no elige la primera en silencio).
- [ ] Tras el backfill hay 0 categorías sin código, y al terminar el paso 6 la columna `code` queda en `NOT NULL`.
- [ ] `npm run lint`, `npm test` y `npm run build` pasan.

## Decisions

- **Sí:** moneda solo en display con join a `cash_account.currency`. **No:** columna `currency` en `payment` — movimiento acordado con el usuario: sin migración sobre pagos, riesgo cero para el histórico.
- **Sí:** reescribir el e2e al flujo de drawers vigente. **No:** retirarlo — el flujo de cobranza es crítico y merece cobertura.
- **Sí:** `code` en `cash_receipt_category` siguiendo el patrón de `payment_method.code`. **No:** identificar categorías por id fijo (los ids cambian por dueño) ni por nombre (se puede renombrar).
- **Sí:** migración partida en dos (columna nullable + backfill en el paso 1; `NOT NULL` en el paso 6 cuando la app siempre envía `code`). **No:** `NOT NULL` desde el paso 1 — rompía `createCategory` (categorías personalizadas) e `ensureCatalogsSeeded`, y la spec exige que cada paso deje el sistema funcional.
- **Sí:** `createCategory` genera el `code` como slug automático del nombre. **No:** añadir campo de código al formulario (el usuario no necesita verlo).
- **Sí:** `formatCurrency` con default `"PEN"`. **No:** propagar moneda a ventas/compras en esta spec — solo el módulo de pagos la maneja hoy.
- **Diferido:** unificación modal/wizard; cuando entre, extraer hook común (preferencia del usuario), **no** reescribir las UIs.

## Risks

| Risk | Mitigation |
| --- | --- |
| Categorías ya renombradas por el usuario no matchean el nombre semilla y quedan sin `code` | El backfill solo matchea nombres semilla exactos; verificar `0 filas sin código` tras la migración antes del `set not null`. Si aparecen renombradas, se asigna `code` manualmente con el usuario. |
| El `set not null` falla si queda alguna fila sin código | Correr el backfill, contar nulos y solo entonces aplicar `not null` + unique (en esa orden, dentro de la misma migración con chequeo previo). |
| El e2e requiere dev server + credenciales Supabase + seed manual | Condiciones documentadas en AGENTS.md y seed en el comentario inicial del spec; se ejecuta como paso final del plan. |
| Sumas de cartera/dashboard mezclando cuentas PEN y USD | Preexistente (hallazgo de la revisión); fuera de alcance, anotado para spec futura de multi-moneda. |

## What is **not** in this spec

- Unificación de `PaymentModal` y `NestedPaymentDrawers` (hook común en una spec futura).
- Mappers duplicados `pagos.ts`/`cartera.ts` y paginación server-side.
- Moneda como columna en `payment`, conversión de divisas ni tipo de cambio.
- Pagos recurrentes, notas de crédito/débito, edición de pagos y anulación masiva.

Cada uno, si llega, va en su propia spec.
