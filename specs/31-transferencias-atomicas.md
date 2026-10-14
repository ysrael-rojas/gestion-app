# SPEC 31 — Transferencias atómicas entre cuentas

> **Status:** Implementado
> **Depends on:** SPEC 09, SPEC 27 (`cajas-bancos-remediacion`, Fase 3)
> **Date:** 2026-10-14
> **Objective:** Permitir mover fondos entre cuentas de caja/banco como una sola operación atómica (tabla `cash_transfer` + RPC), eliminando el registro manual con dos recibos y su riesgo de doble conteo u omisión.

## Why this spec exists

Hoy no existe la tabla `cash_transfer` (0 coincidencias en `lib/supabase/types.ts`) ni botón "Transferir" en `components/cajas-bancos/`. Mover dinero de caja al banco se hace registrando **dos recibos manuales** (un egreso en origen y un ingreso en destino), lo que la auditoría de SPEC 27 registró como hallazgo H4: riesgo de doble conteo, olvido de una pierna y saldos que no cuadran. SPEC 27 Fase 3 ya diseñó la solución (Opción A: tabla `cash_transfer` + RPC atómica) pero quedó en Draft bloqueada y nunca se ejecutó. Esta spec ejecuta ese diseño sin reabrir ni modificar la SPEC 27.

## Scope

**In:**

- Tabla `cash_transfer` con RLS por owner.
- RPC atómica `create_cash_transfer` (valida cuentas distintas, activas, misma moneda PEN, monto > 0).
- Ajustar `get_cash_position` y `close_cash_account` para que incluyan el movimiento neto de transferencias.
- Botón "Transferir" y modal en el módulo cajas-bancos con validación Zod.
- Transferencias visibles e identificadas en el statement por cuenta y en el export CSV.
- Tests unitarios + `npm run lint` + `npm run build`.

**Out of scope (for future specs):**

- Transferencias entre propietarios distintos.
- Multi-moneda real (se mantiene PEN único, decisión de SPEC 27 Fase 5).
- Anulación, edición o reversión de transferencias ya registradas.
- Importación de movimientos bancarios o conciliación (SPEC 33).

## Data model

- **`cash_transfer`**
  - `id uuid pk default gen_random_uuid()`
  - `owner_id uuid not null` (RLS: `owner_id = auth.uid()`)
  - `source_account_id uuid not null references cash_account(id)`
  - `target_account_id uuid not null references cash_account(id)`
  - `amount numeric(12,2) not null check (amount > 0)`
  - `transfer_date date not null default current_date`
  - `notes varchar(200) null`
  - `created_at timestamptz not null default now()`
  - Índice: `(owner_id, transfer_date)`.
- **`cash_close`** (columnas nuevas, `null` por defecto para no afectar cierres históricos):
  - `transfer_in_total numeric(12,2) not null default 0`
  - `transfer_out_total numeric(12,2) not null default 0`
- **RPC `create_cash_transfer(p_source_account_id uuid, p_target_account_id uuid, p_amount numeric, p_transfer_date date, p_notes text)`** → devuelve `uuid`. Atómica: valida que las cuentas existen, pertenecen al owner, están activas, son distintas y son PEN; inserta la fila; **no inserta `payment`** (evita doble escritura, decisión de SPEC 27).
- **Ajustes de cálculo:**
  - `get_cash_position`: `opening + ingresos − egresos + transferencias entrantes − transferencias salientes`.
  - `close_cash_account`: `expected_balance = opening + income_total − expense_total + transfer_in_total − transfer_out_total`; la RPC persiste ambos totales de transferencia del período.

## Implementation plan

1. Migración versionada (tabla + columnas de `cash_close` + RPC + RLS + índice) vía Supabase MCP `apply_migration` (nombre en snake_case).
2. `npm run gen:types` para regenerar `lib/supabase/types.ts`.
3. `lib/caja/transferencias.ts`: entidad camelCase + `createCashTransfer` + `listAccountTransfers`.
4. Esquema Zod `lib/schemas/cash-transfer.ts` (cuentas requeridas y distintas, monto > 0, fecha, notas ≤ 200).
5. Ajustar `get_cash_position`/`close_cash_account` según el modelo (paso 1, en la misma migración).
6. UI: botón "Transferir" en la vista de cuentas + modal (`cash-transfer-modal.tsx`) con cuenta origen, destino, monto, fecha y notas.
7. Statement por cuenta: incluir transferencias como filas marcadas "Transferencia"; export CSV las incluye.
8. Tests unitarios (esquema y helpers de posición) + `npm run lint` + `npm run build`.

## Acceptance criteria

- [ ] `create_cash_transfer` cambia ambos saldos de forma atómica (o falla sin efectos parciales) y no crea registros en `payment`.
- [ ] La RPC rechaza origen = destino, monto ≤ 0, cuentas inactivas, distinto owner y moneda distinta de PEN.
- [ ] `get_cash_position` refleja la transferencia: origen resta, destino suma.
- [ ] El cuadre del período persiste `transfer_in_total`/`transfer_out_total` y su `expected_balance` los incluye.
- [ ] La UI muestra el botón "Transferir", valida con Zod y refresca los saldos tras confirmar.
- [ ] El statement y el CSV identifican las transferencias como tales.
- [ ] `npm test`, `npm run lint` y `npm run build` pasan.

## Decisions

- **Yes:** seguir la Opción A de SPEC 27 Fase 3 (tabla propia + RPC atómica) sin insertar `payment`.
- **Yes:** persistir los totales de transferencia en `cash_close` como columnas nuevas con default 0 (no se reescriben cierres históricos).
- **Yes:** PEN único; sin conversión de moneda en la transferencia.
- **No:** no tocar el estado de la SPEC 27 ni reabrir sus demás fases.
- **No:** no permitir anular/editar transferencias en esta spec.

## Risks

| Risk | Mitigation |
| --- | --- |
| Cierres históricos no tienen totales de transferencia. | Columnas nuevas con default 0; el cálculo mantiene el resultado anterior para períodos sin transferencias. |
| El statement mezcla pagos y transferencias. | Fila de transferencia marcada con tipo/fuente distinta a "Recibo". |
| Duplicar suma si el dashboard o el cuadre cuentan la transferencia en ambos lados. | Cálculo centralizado: entrante suma, saliente resta; el neto se aplica una sola vez por cuenta. |
