# SPEC 35 — Saneamiento del cuadre y los cargos bancarios

> **Status:** Aprobado
> **Depends on:** SPEC 19, SPEC 32, SPEC 33
> **Date:** 2026-10-14
> **Objective:** Cerrar los cinco ajustes pequeños que quedaron tras implementar SPEC 32 y SPEC 33: el resumen por categoría que suma recibos anulados, la fecha del cargo bancario, el cierre de un banco sin saldo de extracto, el cierre de una caja en cero y el fondo de cambio sin snapshot.

## Why this spec exists

Los cinco puntos salieron de la verificación independiente de SPEC 32 y SPEC 33 y de las decisiones tomadas al implementarlas. Ninguno es una funcionalidad nueva: son dos correcciones de reporte, dos desbloqueos de flujo y un dato que hoy no se congela. Se agrupan en una sola spec corta porque viven en el mismo módulo (el cuadre de caja y su reporte) y son independientes entre sí: cada paso se puede implementar y commitear por separado.

## Scope

**In:**

1. El resumen por categoría del cuadre (y su bloque del CSV) deja de sumar los recibos `ANULADO`.
2. El modal de cargo bancario parte de una fecha abierta y rechaza en el cliente una fecha dentro de un período cerrado.
3. El cierre de un banco admite un "Saldo según extracto" opcional que se guarda en `counted_balance`.
4. Una caja se puede cerrar con la grilla de denominaciones en cero, con confirmación explícita.
5. `cash_close` congela el fondo de cambio vigente al cerrar.

**Out of scope (for future specs):**

- Importar extractos del banco, cruce automático de movimientos y acta de conciliación firmable (SPEC 33 ya lo dejó fuera).
- Cambios en el cálculo del saldo esperado del cuadre.
- El dashboard de tesorería (SPEC 34).

## Data model

- **`cash_close`** (columna nueva): `change_fund numeric(12,2) null` — fondo de cambio vigente al cerrar. Nullable a propósito: los cierres históricos no lo tienen y el reporte cae al valor actual de la cuenta.
- **RPC `close_cash_account`**: al insertar el cierre copia `cash_account.change_fund` en `change_fund`. No cambian sus argumentos ni su firma.
- Sin tablas nuevas y sin cambios de enum.

## Implementation plan

1. Migración: columna `cash_close.change_fund` y snapshot en `close_cash_account`; regenerar tipos.
2. `cuadre-report.tsx`: el resumen por categoría ignora los recibos `ANULADO` (en pantalla y en el CSV); el fondo de cambio se lee del cierre con respaldo al valor actual de la cuenta; el conteo se etiqueta "Conteo físico" en cajas y "Saldo según extracto" en bancos.
3. `cash-close-modal.tsx`: campo opcional "Saldo según extracto" para bancos, y confirmación explícita para cerrar una caja con la grilla en cero.
4. `bank-charge-modal.tsx`: propone como fecha el primer día abierto de la cuenta y bloquea en el cliente una fecha dentro del período cerrado.
5. Tests unitarios y de componente de los cinco puntos + `npm run lint` + `npm run build`.

## Acceptance criteria

- [x] Un recibo `ANULADO` del período no suma en el resumen por categoría ni en su bloque del CSV.
- [x] Los totales por dirección del resumen coinciden con la suma de los recibos no anulados del período.
- [x] El cierre de un banco permite registrar el saldo según extracto y el reporte lo muestra con su diferencia; si se deja vacío, `counted_balance` queda `null` como hoy.
- [x] El reporte etiqueta el conteo como "Conteo físico" en cajas y "Saldo según extracto" en bancos.
- [x] Una caja con la grilla en cero solo se cierra tras marcar "Confirmo que la caja quedó sin efectivo", y queda `counted_balance = 0`.
- [x] Sin esa confirmación, el cierre con la grilla en cero sigue bloqueado.
- [x] El modal de cargo bancario propone una fecha abierta (posterior al último cierre) y rechaza en el cliente una fecha dentro del período cerrado con un mensaje explícito.
- [x] `cash_close.change_fund` guarda el fondo vigente al cerrar; cambiar el fondo de la cuenta después no altera el reporte de ese cierre.
- [x] Un cierre histórico sin snapshot sigue mostrando el fondo actual de la cuenta.
- [x] `npm test`, `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** agrupar los cinco ajustes en una spec corta aunque toquen tres pantallas: son independientes y comparten módulo.
- **Sí:** excluir los anulados del resumen por categoría en lugar de mostrarlos en una línea aparte; así cuadra con los totales de Ingresos y Egresos, y el rastro del anulado sigue en Movimientos con su estado.
- **Sí:** `change_fund` nullable con respaldo al valor actual de la cuenta, para no alterar cierres históricos.
- **Sí:** la confirmación de caja en cero es una casilla explícita, no el envío de una grilla vacía.
- **Sí:** el saldo según extracto es opcional en el cierre del banco; no se obliga a registrarlo.
- **No:** cambiar el cálculo del saldo esperado ni la validación de conciliación de SPEC 33.
- **No:** importar extractos ni cruzar movimientos (SPEC 33 lo dejó fuera).

## Risks

| Risk | Mitigation |
| --- | --- |
| El snapshot del fondo toca la RPC `close_cash_account` | Se cambia solo el cuerpo: los argumentos y la firma siguen igual, así que las llamadas existentes no se rompen. |
| La etiqueta del conteo depende del tipo de cuenta | El tipo se pasa desde `cuadres-view`, que ya tiene la cuenta seleccionada. |
| Cerrar una caja en cero puede tapar un error de conteo | Exige una casilla explícita y el reporte muestra el conteo 0 con la diferencia resultante. |
| El resumen cambia para cierres ya emitidos | Es una corrección: el resumen pasa a coincidir con los totales; los movimientos anulados siguen visibles con su estado. |

## What is **not** in this spec

- Importación de extractos, cruce automático y acta de conciliación firmable.
- Dashboard de tesorería (SPEC 34).
- Cambios en el estado de conciliación o en la RPC `mark_payments_processed`.

Cada uno de esos, si llega, va en su propia spec.
