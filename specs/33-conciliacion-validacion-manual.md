# SPEC 33 — Conciliación bancaria por validación manual

> **Status:** Draft
> **Depends on:** SPEC 09, SPEC 26
> **Date:** 2026-10-14
> **Objective:** Validar los movimientos de cada cuenta contra el extracto del banco: statement con columna de estado, acción de marcar `PROCESADO` y registro de cargos bancarios (ITF, comisión, detracción SPOT) como recibos de egreso.

## Why this spec exists

Hoy no existe conciliación: ninguna acción de UI ni de `lib` escribe `status='PROCESADO'` (la única transición disponible es Anular). El statement (`listAccountStatement`) mezcla `EN_REVISION`, `PROCESADO` y `ANULADO` sin columna de estado, y el reporte/CSV del cuadre tampoco la muestra (hallazgo H5 de SPEC 27, aún sin resolver). SPEC 26 dejó explícitamente "fuera de scope" la conciliación y prometió una spec futura; esta es esa spec. Se elige la modalidad **simple (validación manual)**: sin importar extractos ni cruce automático, adecuada para una MYPE.

## Scope

**In:**

- RPC `mark_payments_processed(p_payment_ids uuid[])`: pasa `EN_REVISION → PROCESADO` solo si el pago está en `EN_REVISION` y pertenece al owner.
- Statement por cuenta con columna "Estado" (badge) y acción "Marcar verificado" por fila y por selección múltiple.
- Reporte y CSV del cuadre con columna "Estado" (`ANULADO` visible como anulado).
- Siembra de categorías de egreso: `ITF`, `Comisión bancaria`, `Detracción SPOT` en `defaults.ts`.
- Acceso "Registrar cargo bancario" desde el statement: crea un recibo de egreso con esas categorías.
- Tests unitarios + `npm run lint` + `npm run build`.

**Out of scope (for future specs):**

- Importación o carga de extractos/CSV del banco.
- Cruce automático de movimientos, partidas en tránsito y formato de conciliación mensual firmable.
- Conciliación formal por períodos cerrados (decisión: validación manual).

## Data model

Sin tablas ni columnas nuevas. La conciliación opera sobre `payment.status` existente (enum con `EN_REVISION`, `PROCESADO`, `ANULADO`) y añade tres filas sembradas en `cash_receipt_category` (dirección `EGRESO`).

- **RPC `mark_payments_processed(p_payment_ids uuid[])`**: valida que cada `payment` sea del owner y esté en `EN_REVISION`; los pasa a `PROCESADO` en una sola operación. Respeta los invariantes de SPEC 30 (no toca `amount`, `entity_id`, `void_reason`/`voided_at`); solo actualiza `status`.
- **Categorías sembradas (EGRESO):** `ITF`, `Comisión bancaria`, `Detracción SPOT`.

## Implementation plan

1. `lib/caja/defaults.ts`: sembrar las tres categorías de egreso.
2. `lib/pagos/pagos.ts`: `markPaymentsProcessed(ids)` que llama a la RPC y maneja errores (incluido el intento de re-marcar).
3. Statement UI (`components/cajas-bancos/` y el componente de movimientos): columna "Estado" + acción "Marcar verificado" por fila y selección múltiple con confirmación.
4. `cuadre-report.tsx` y export CSV: columna "Estado"; `ANULADO` visible como anulado.
5. Flujo "Registrar cargo bancario": recibo de egreso prellenado con categoría de cargo (ITF/comisión/detracción).
6. Tests unitarios (validación de estados) + `npm run lint` + `npm run build`.

## Acceptance criteria

- [ ] El statement muestra la columna "Estado" distinguiendo `EN_REVISION`, `PROCESADO` y `ANULADO`.
- [ ] "Marcar verificado" pasa `EN_REVISION → PROCESADO` y persiste tras recargar.
- [ ] No es posible marcar un pago `ANULADO` ni re-marcar uno ya `PROCESADO` (la RPC rechaza ambos).
- [ ] La selección múltiple marca varios pagos a la vez de forma consistente.
- [ ] Las categorías `ITF`, `Comisión bancaria` y `Detracción SPOT` aparecen sembradas para el owner.
- [ ] "Registrar cargo bancario" crea un recibo de egreso con la categoría elegida y queda visible en el statement.
- [ ] El reporte y el CSV del cuadre incluyen la columna "Estado".
- [ ] `npm test`, `npm run lint` y `npm run build` pasan.

## Decisions

- **Yes:** conciliación **simple por validación manual** (sin extracto importado ni cruce automático), elegida por el usuario.
- **Yes:** el cuadre sigue incluyendo `EN_REVISION` en su cálculo; la validación es un control operativo, no cambia el saldo.
- **Yes:** cargos bancarios como categorías de egreso sembradas (ITF, comisión, detracción), no como concepto aparte.
- **No:** no introducir un "período de conciliación cerrado" ni acta de conciliación firmable en esta spec.

## Risks

| Risk | Mitigation |
| --- | --- |
| RLS de `payment` restringe el `UPDATE` de `status` (SPEC 30). | Usar una RPC dedicada que solo permite la transición `EN_REVISION → PROCESADO`, respetando los invariantes. |
| Marca masiva con muchos ids. | La RPC procesa el array en una sola transacción; la UI muestra error claro si algún id es inválido. |
| Confundir "PROCESADO" con "conciliado contra extracto". | El término en UI es "Marcar verificado"; `PROCESADO` sigue siendo el estado técnico del recibo. |
