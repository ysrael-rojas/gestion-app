# SPEC 32 — Arqueo por denominaciones, fondo fijo y caja chica

> **Status:** Implementado
> **Depends on:** SPEC 31, SPEC 19
> **Date:** 2026-10-14
> **Objective:** Elevar el cuadre de caja a arqueo real (conteo por denominaciones S/ 200→0.10 con fondo de cambio) y agregar caja chica como cuenta con fondo fijo, vales prenumerados y reposición.

## Why this spec exists

El arqueo actual (`cash_close.counted_balance`) guarda **un solo monto total**; no hay conteo por denominaciones, ni fondo de cambio, ni vales. El procedimiento estándar de arqueo exige contar billetes y monedas denominación por denominación: un error de conteo se detecta solo porque la suma no cuadra, y el formato sirve de acta firmable. La caja chica (fondo fijo para gastos menores) no existe como concepto: solo hay cajas `CASH_BOX` genéricas. Esta spec incorpora ambos, aprovechando que el fondo de cambio del arqueo y la caja chica son el mismo mecanismo de fondo fijo.

## Scope

**In:**

- Tabla `cash_close_denomination` (conteo por denominación ligado al cierre).
- Campos nuevos en `cash_account`: `is_petty_cash`, `change_fund`, `petty_expense_limit`, `custodian_name`.
- Tabla `petty_cash_vale` (vales prenumerados por cuenta, con estado).
- Extender `close_cash_account` con parámetro opcional de denominaciones (solo cajas).
- Grilla de denominaciones en el modal de cuadre, con suma en vivo y efectivo neto = total − fondo de cambio.
- Reporte y CSV del cuadre con tabla de denominaciones y fondo de cambio.
- Sección "Caja chica" en el formulario de cuenta (solo `CASH_BOX`).
- Vista de vales por caja chica (crear/anular) y botón "Reponer fondo" que crea una transferencia (SPEC 31) y marca los vales como repuestos.
- Arqueo de caja chica: efectivo + vales pendientes = fondo total.
- Tests unitarios + `npm run lint` + `npm run build`.

**Out of scope (for future specs):**

- Aprobación multi-usuario / segregación de funciones automatizada (no hay usuarios adicionales).
- Adjuntar comprobantes (archivos) a los vales.
- Multi-moneda (denominaciones fijas del sol peruano).
- Planillas o plantillas de arqueo imprimibles (solo estructura de datos y UI).

## Data model

- **`cash_close_denomination`**
  - `id uuid pk`
  - `cash_close_id uuid not null references cash_close(id) on delete cascade`
  - `denomination numeric(5,2) not null check (denomination in (200,100,50,20,10,5,2,1,0.50,0.20,0.10))`
  - `quantity integer not null check (quantity >= 0)`
  - `unique (cash_close_id, denomination)`
- **`cash_account`** (columnas nuevas):
  - `is_petty_cash boolean not null default false`
  - `change_fund numeric(12,2) not null default 0`
  - `petty_expense_limit numeric(12,2) null`
  - `custodian_name varchar(100) null`
- **`petty_cash_vale`**
  - `id uuid pk`
  - `owner_id uuid not null` (RLS: `owner_id = auth.uid()`)
  - `account_id uuid not null references cash_account(id)`
  - `serial integer not null` (prenumerado por cuenta)
  - `vale_date date not null default current_date`
  - `paid_to varchar(200) not null`
  - `concept varchar(300) not null`
  - `amount numeric(12,2) not null check (amount > 0)`
  - `has_receipt boolean not null default false`
  - `status vale_status not null default 'PENDIENTE'` (enum: `PENDIENTE`, `REPUESTO`, `ANULADO`)
  - `created_at timestamptz not null default now()`
- **RPC `close_cash_account`**: nuevo parámetro opcional `p_denominations jsonb` (array `{denomination, quantity}`). Si viene y la cuenta es caja, `counted_balance` = suma de denominaciones; si es banco, se ignora. Mantiene compatibilidad con las llamadas existentes sin el parámetro.
- **RPC `replenish_petty_cash(p_account_id uuid, p_source_account_id uuid, p_vale_ids uuid[])`**: atómica — crea la transferencia desde `p_source_account_id` a la caja chica por el total de los vales seleccionados y marca esos vales como `REPUESTO`.

## Implementation plan

1. Migración versionada (tablas, columnas, enum `vale_status`, RLS, RPCs) vía Supabase MCP `apply_migration`.
2. `npm run gen:types`.
3. Esquemas Zod: `cash-close.ts` (denominaciones), `cash-account.ts` (campos de caja chica), nuevo `petty-cash-vale.ts`.
4. `lib/caja`: entidades y funciones `listVales`, `createVale`, `anularVale`, `replenishPettyCash`.
5. Modal de cuadre: grilla de denominaciones (solo `CASH_BOX`), suma en vivo, efectivo neto = total − fondo de cambio.
6. `cuadre-report.tsx` y CSV: tabla de denominaciones + fondo de cambio.
7. Formulario de cuenta: sección "Caja chica" visible solo para `CASH_BOX`.
8. Vista de vales por cuenta + botón "Reponer fondo" (usa `replenish_petty_cash`).
9. Tests unitarios + `npm run lint` + `npm run build`.

## Acceptance criteria

- [ ] El cuadre de una caja captura cantidades por denominación y el total calculado se guarda como `counted_balance`, con detalle en `cash_close_denomination`.
- [ ] La suma por denominaciones es verificable en la BD (consulta por `cash_close_id`).
- [ ] El reporte y el CSV del cuadre incluyen la tabla de denominaciones y el fondo de cambio.
- [ ] Una cuenta `CASH_BOX` puede marcarse caja chica con fondo, límite por gasto y custodio.
- [ ] Se registran vales prenumerados con monto, concepto y estado; un vale con monto mayor al límite es rechazado por validación.
- [ ] El arqueo de caja chica muestra efectivo + vales pendientes = fondo total.
- [ ] "Reponer fondo" crea una transferencia atómica (SPEC 31) y marca los vales como `REPUESTO`.
- [ ] `npm test`, `npm run lint` y `npm run build` pasan.

## Decisions

- **Yes:** conteo guardado en tabla hija normalizada (`cash_close_denomination`), no en JSONB (consulta y suma verificables en BD).
- **Yes:** caja chica modelada como cuenta `CASH_BOX` marcada (`is_petty_cash`), no como módulo aparte (evita duplicar saldos y reportes).
- **Yes:** la reposición de caja chica usa la transferencia atómica de SPEC 31.
- **Yes:** denominaciones fijas del sol peruano; sin USD.
- **No:** no sembrar categorías de gasto nuevas para caja chica (usa las categorías de egreso existentes).

## Risks

| Risk | Mitigation |
| --- | --- |
| Cambiar la firma de `close_cash_account` rompe llamadas existentes. | Parámetro `p_denominations` opcional con default `null`; comportamiento previo intacto. |
| Prelenumerado de vales por cuenta con concurrencia. | Serial calculado dentro de una RPC/transacción con lock por cuenta (no en el cliente). |
| Cierres históricos sin denominaciones. | `cash_close_denomination` es opcional; el detalle solo existe para cierres nuevos con conteo. |
