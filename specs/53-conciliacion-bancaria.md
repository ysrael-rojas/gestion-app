# SPEC 53 — Conciliación bancaria formal

> **Status:** Aprobado
> **Depends on:** SPEC 19, SPEC 33, SPEC 35, SPEC 49, SPEC 51
> **Date:** 2026-10-28
> **Objective:** Permitir conciliar cada cuenta bancaria por período: el dueño copia el saldo de su extracto, agrega las partidas que explican la diferencia (en tránsito, pagado no debitado, cargos y abonos no registrados), ve el saldo conciliado contra sus registros y archiva el acta firmada — persistida en la BD, imprimible y exportable, sin importación de extractos.

## Why this spec exists

**F10 de la auditoría de tesorería (2026-10-27): conciliación sin formato.** El procedimiento para MYPE pide conciliar **todas** las cuentas bancarias **cada mes**: comparar el extracto del banco contra los registros propios y explicar toda diferencia. Hoy el módulo solo tiene:

- "Marcar verificado" (SPEC 33): una marca manual de recibo por recibo, sin formato, sin partidas, sin saldo conciliado.
- "Saldo según extracto" opcional al cerrar el banco (SPEC 35): una comparación puntual dentro del cierre, sin persistencia de la explicación.

**No existe nada** de la conciliación formal: ninguna tabla, RPC, lib ni página con el formato oficial (saldo según extracto ± 4 partidas = saldo conciliado vs saldo según libros). Las specs 33/35 dejaron explícitamente fuera la importación de extractos y el cruce automático — y siguen fuera; esta spec asume que el dueño **lee su extracto del banco y copia los datos a mano**.

Es la última pieza del bloque de reportes (51 acta y extracto → 52 flujo proyectado → **53 conciliación formal**).

## Scope

**In:**

1. **Dos tablas nuevas + un enum.**
   - `bank_reconciliation` (cabecera): `owner_id`, `cash_account_id` (solo `BANK_ACCOUNT` se concilia), `period_start`, `period_end`, `statement_balance` (lo copia el dueño del extracto), `books_balance` (snapshot del saldo según registros, actualizable), `prepared_by`, `reviewed_by`, `notes`, timestamps. Unique `(cash_account_id, period_start, period_end)`.
   - `bank_reconciliation_item` (partidas): `reconciliation_id` (cascade), `kind` (enum), `description`, `amount > 0`, `created_at`.
   - Enum `reconciliation_item_kind`: `DEPOSITO_EN_TRANSITO` (+), `PAGO_NO_DEBITADO` (−), `CARGO_NO_REGISTRADO` (−), `ABONO_NO_REGISTRADO` (+) — con etiquetas simples y su explicación en la UI.
   - RLS por owner con el patrón `(select auth.uid())` (hoja de trabajo editable: select/insert/update/delete, como `voucher_series`).
   - **Los valores calculados no se persisten** (saldo conciliado y diferencia se computan siempre en el cliente con un helper puro); la cabecera guarda solo los datos de entrada.
2. **RPC `save_bank_reconciliation`** (`security definer`, `search_path=''`): upsert atómico de cabecera + reemplazo de todas las partidas en una sola operación (editable siempre, sin parciales). Valida dueño de la cuenta, rango coherente y cuenta de tipo banco.
3. **Helper puro `computeReconciliation`** (`lib/caja/conciliacion.ts`): suma partidas con su signo, `reconciledBalance = statementBalance ± partidas`, `difference = booksBalance − reconciledBalance`, totales por tipo y estado "Conciliado" (diferencia 0). Constantes de signo y etiquetas con hint en lenguaje simple.
4. **Página `/cajas-bancos/conciliacion`** (`conciliacion-view.tsx` + ruta fina), con ítem "Conciliación" en el navbar (grupo Caja y bancos):
   - Selector con **solo cuentas bancarias** (las cajas se controlan con arqueo/cierre).
   - Rango Desde/Hasta con **el mes actual precargado** y atajos "Este mes" / "Mes anterior" (patrón Extractos).
   - **Saldo según extracto**: campo numérico que el dueño copia de su extracto, con la pista "Ábrelo en la app de tu banco y copia el saldo final del período."
   - **Saldo según registros**: `getCashPosition(accountId, periodEnd)` en vivo, con botón "Actualizar libros" que refresca y guarda el snapshot.
   - **Partidas**: lista editable (agregar / corregir / quitar) con selector de las 4 clases, descripción y monto; cada clase muestra su signo y su explicación ("yo registré, el banco aún no").
   - **Sugerencias** (nunca se suman solas): los recibos `EN_REVISION` del período (`getCashAccountStatement`) se listan como chips ("RI-000031 · S/ 850 · 30/10") con un botón para agregarlos como partida (INGRESO → en tránsito; EGRESO → pagado no debitado). Se descartan al agregar.
   - Cálculo en vivo con `computeReconciliation`: "SALDO CONCILIADO (extracto ± partidas)" y **DIFERENCIA** en rose mientras ≠ 0, con texto guía "Hay una diferencia por encontrar: revisa si falta registrar un cargo o abono del banco, o si un monto está mal escrito." Badge "Conciliado" cuando llega a 0.
   - **Guardar** (RPC atómica) con toast; reabrir el mismo período recarga lo guardado.
5. **Acta imprimible** (`conciliacion-acta.tsx`): patrón del acta de arqueo (portal A4 + `@page` inyectado + `afterprint`), con el **formato oficial** (banco, cuenta, período, fecha de impresión, saldo según extracto, las 4 partidas con signo, saldo conciliado, saldo según registros, diferencia), notas y firmas **"Elaborado por" / "Revisado por"** (`prepared_by`/`reviewed_by`, campos en la vista). Botón "Imprimir acta".
6. **"Descargar CSV (se abre en Excel)"**: cabecera (banco, cuenta, período, saldos) + filas de partidas (signo, clase, descripción, monto) + saldo conciliado y diferencia.
7. **Acceso rápido corregido en el Resumen**: "Cuadres y conciliación" pasa a llamarse **"Cuadres de caja"** (hoy promete algo que no cumple) y se agrega **"Conciliación"** → `/cajas-bancos/conciliacion`.
8. Tras la migración: verificar `lib/supabase/types.ts` contra `generate_typescript_types` (MCP) y versionar el SQL en `supabase/migrations/`.
9. Tests: unitarios de `computeReconciliation` (signos, suma por tipo, diferencia, conciliado) y del schema zod; de la RPC (args, upsert, validaciones); de componente de la vista (solo bancos, mes por defecto, sugerencias, agregar partida, diferencia rose, guardar) y del acta (formato, partidas, firmas).

**Out of scope (for future specs):**

- **Importación de extractos** (CSV/PDF del banco) y cruce automático de movimientos: fuera desde SPEC 33/35; el dueño copia a mano.
- Arrastre de partidas pendientes entre períodos (la conciliación de cada mes empieza limpia).
- Sellar/cerrar la conciliación (editable siempre; sin estados de ciclo).
- Conciliación de cajas de efectivo (se controlan con arqueo/cierre, SPEC 32/49).
- Multi-moneda real: la conciliación va **en la moneda de la cuenta** (el extracto del banco viene en esa moneda); sin TC.
- Matching automático de recibos contra líneas del extracto; aging; cambios en `cash_close`, `mark_payments_processed` o los estados de recibo.

## Data model

```sql
-- 1) Clases de partida con su signo en el formato oficial
create type public.reconciliation_item_kind as enum (
  'DEPOSITO_EN_TRANSITO',   -- (+) yo registré, el banco aún no lo abonó
  'PAGO_NO_DEBITADO',       -- (−) yo pagué, el banco aún no lo debitó
  'CARGO_NO_REGISTRADO',    -- (−) cargo del extracto que aún no registro
  'ABONO_NO_REGISTRADO'    -- (+) abono del extracto que aún no registro
);

-- 2) Cabecera por cuenta + rango (hoja de trabajo editable del owner)
create table public.bank_reconciliation (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users(id),
  cash_account_id   uuid not null references public.cash_account(id),
  period_start      date not null,
  period_end        date not null,
  statement_balance numeric(12,2) not null,   -- lo copia el dueño del extracto
  books_balance     numeric(12,2) not null,   -- snapshot del saldo según registros
  prepared_by       varchar(100),
  reviewed_by       varchar(100),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint bank_reconciliation_period_unique
    unique (cash_account_id, period_start, period_end),
  constraint bank_reconciliation_period_check
    check (period_end >= period_start)
);
create index bank_reconciliation_owner_idx on public.bank_reconciliation (owner_id);
create index bank_reconciliation_item_parent_idx
  on public.bank_reconciliation_item (reconciliation_id);

-- 3) Partidas
create table public.bank_reconciliation_item (
  id               uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.bank_reconciliation(id)
    on delete cascade,
  kind             public.reconciliation_item_kind not null,
  description      text not null,
  amount           numeric(12,2) not null check (amount > 0),
  created_at       timestamptz not null default now()
);

-- RLS: hoja de trabajo editable del owner (patrón voucher_series, con
-- (select auth.uid()) para el initplan). Ambas tablas: select/insert/
-- update/delete. Los items además heredan por el FK a la cabecera.

-- 4) RPC atómica de guardado
--    save_bank_reconciliation(p_reconciliation jsonb, p_items jsonb) → uuid
--    Upsert por (cuenta, rango): actualiza la cabecera y reemplaza todas las
--    partidas en una transacción; valida dueño, tipo BANK_ACCOUNT y rango.
```

```ts
// lib/caja/conciliacion.ts — helpers y acceso
export type ReconciliationItemKind =
  | "DEPOSITO_EN_TRANSITO" | "PAGO_NO_DEBITADO"
  | "CARGO_NO_REGISTRADO" | "ABONO_NO_REGISTRADO";

export const ITEM_SIGN: Record<ReconciliationItemKind, 1 | -1>;

export const ITEM_META: Record<ReconciliationItemKind, {
  label: string;    // "En tránsito (banco aún no abona)"
  hint: string;     // "Yo registré el ingreso y el banco todavía no lo muestra."
}>;

export interface ReconciliationItem { id?: string; kind; description; amount }
export interface BankReconciliation {
  id: string; accountId: string; periodStart: string; periodEnd: string;
  statementBalance: number; booksBalance: number;
  preparedBy: string | null; reviewedBy: string | null; notes: string | null;
  items: ReconciliationItem[];
}

export interface ReconciliationSummary {
  adjustedByKind: Record<ReconciliationItemKind, number>;
  reconciledBalance: number;   // statement ± partidas
  difference: number;          // books − reconciled (≠ 0 → hay un error)
  isConciled: boolean;
}

export function computeReconciliation(
  statementBalance: number,
  booksBalance: number,
  items: ReconciliationItem[]
): ReconciliationSummary;

export async function getReconciliation(
  accountId: string, periodStart: string, periodEnd: string
): Promise<BankReconciliation | null>;

export async function saveReconciliation(
  values: BankReconciliationInput
): Promise<BankReconciliation>;  // RPC atómica

// lib/schemas/reconciliation.ts — zod
// statementBalance ≥ 0, partidas con amount > 0 y descripción requerida,
// preparedBy/reviewedBy opcionales (máx. 100).
```

UI nueva: `components/cajas-bancos/conciliacion-view.tsx` y `components/cajas-bancos/conciliacion-acta.tsx`; ruta `app/(app)/cajas-bancos/conciliacion/page.tsx`; ítem "Conciliación" en el navbar.

## Implementation plan

1. Cargar `supabase-postgres-best-practices`. **Migración**: enum + 2 tablas + índices + RLS editable por owner (initplan) + RPC `save_bank_reconciliation` atómica. Versionar el SQL y verificar `lib/supabase/types.ts` contra `generate_typescript_types`.
2. **lib**: `lib/caja/conciliacion.ts` (`computeReconciliation`, `ITEM_SIGN`, `ITEM_META`, `getReconciliation`, `saveReconciliation`) y `lib/schemas/reconciliation.ts`. Tests unitarios del cálculo (signos, por tipo, diferencia, conciliado) y del schema.
3. **Vista**: `conciliacion-view.tsx` (solo bancos, mes por defecto, extracto a mano, partidas CRUD, sugerencias EN_REVISION, cálculo en vivo, guardar) + ruta + ítem de navbar + corrección del acceso rápido del Resumen. Tests de componente.
4. **Acta imprimible** (`conciliacion-acta.tsx`, portal A4 + firmas Elaborado/Revisado) + **"Descargar CSV (se abre en Excel)"**. Tests del acta y del CSV.
5. **Validación final**: prueba de integración en la BD con `rollback` (guardar una conciliación con partidas por una cuenta banco y leerla de vuelta, incluida la validación de tipo de cuenta), `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` y revisión de advisors (RLS nueva).

## Acceptance criteria

- [ ] `/cajas-bancos/conciliacion` existe, aparece en el navbar bajo "Caja y bancos" y abre con el mes actual precargado; el selector solo lista cuentas bancarias.
- [ ] El dueño escribe el saldo según extracto a mano y la vista muestra el saldo según registros (`getCashPosition` al final del período) con botón "Actualizar libros".
- [ ] Las 4 clases de partida tienen etiquetas y explicaciones simples con su signo del formato oficial; se pueden agregar, corregir y quitar.
- [ ] Los recibos `EN_REVISION` del período se ofrecen como sugerencias y se agregan como partida con un clic (INGRESO → en tránsito; EGRESO → pagado no debitado); nunca se suman solas.
- [ ] El cálculo es en vivo: "Saldo conciliado (extracto ± partidas)" y "Diferencia" contra los registros; la diferencia ≠ 0 se muestra en rose con texto guía; al llegar a 0 aparece el badge "Conciliado".
- [ ] "Guardar" persiste cabecera + partidas atómicamente (RPC); reabrir el mismo cuenta+rango recarga lo guardado; no se puede duplicar el mismo período (unique).
- [ ] "Imprimir acta" abre la impresión mostrando solo el acta A4 con el formato oficial (extracto, partidas con signo, conciliado, registros, diferencia), notas y las firmas "Elaborado por" / "Revisado por".
- [ ] "Descargar CSV (se abre en Excel)" genera el formato completo con cabecera y partidas.
- [ ] El acceso rápido del Resumen "Cuadres y conciliación" pasa a "Cuadres de caja" y se agrega "Conciliación".
- [ ] No cambian `cash_close`, `mark_payments_processed` ni los estados de recibo; sin importación de extractos ni cruce automático.
- [ ] `lib/supabase/types.ts` verificado contra `generate_typescript_types`, migración versionada, `npx tsc --noEmit`, `npm run lint`, `npm test` y `npm run build` en verde, y advisors revisados tras las RLS nuevas.

## Decisions

- **Sí:** persistir la conciliación (2 tablas + enum) como hoja de trabajo editable. **No:** cálculo efímero (al mes siguiente no quedaría rastro) ni partidas fuera del período (sin arrastre: cada mes empieza limpio).
- **Sí:** editable siempre, sin sellado. **No:** botón "Finalizar" que inmutabilice (patrón cash_close) — para una MYPE la conciliación es una hoja de trabajo; el acta impresa firmada es el archivo.
- **Sí:** guardar con una RPC atómica (cabecera + partidas juntas). **No:** inserts/updates sueltos desde el cliente (riesgo de partidas a medias, documentado desde SPEC 13).
- **Sí:** los valores calculados se computan en el cliente con helper puro. **No:** persistirlos — evitar que una edición deje el guardado inconsistente con las partidas.
- **Sí:** página propia con ítem en el navbar. **No:** sección dentro de Cuadres (mezcla dos lecturas) — y de paso se corrige el acceso rápido que decía "Cuadres y conciliación" apuntando solo a los cuadres.
- **Sí:** manual + sugerencias (recibos EN_REVISION como chips, nunca auto-sumados). **No:** solo manual (el dueño tendría que buscar los pendientes por su cuenta) ni auto-matching (fuera desde SPEC 33).
- **Sí:** acta imprimible A4 con firmas "Elaborado por"/"Revisado por" + CSV. **No:** solo pantalla — el procedimiento pide firmar y archivar junto al extracto.
- **Sí:** solo cuentas `BANK_ACCOUNT`. **No:** conciliar cajas de efectivo (su control es el arqueo/cierre de SPEC 32/49).
- **Sí:** la conciliación va en la moneda de la cuenta. **No:** convertir a soles — el extracto del banco viene en la moneda de la cuenta y el dueño copia esos números.
- **Sí:** `books_balance` como snapshot guardado con botón "Actualizar libros". **No:** recalcularlo en cada render y perder el registro de con qué libros se concilió.
- **Asumido:** la sugerencia EN_REVISION no prueba que el banco no haya mostrado el recibo; es una pista que el dueño confirma o descarta.
- **Pase previo por `frontend-design`** (2026-10-28): "la conciliación es una explicación, no un misterio" — dos bloques con números grandes, las 4 partidas como puentes con el signo textual del formato del contador, la diferencia como protagonista (rose mientras ≠ 0) y silencio discreto al llegar a 0; descartados gráficos, tarjetas idénticas y eyebrows; montos con `tabular-nums`.

## Risks

| Risk | Mitigación |
| --- | --- |
| El dueño copia mal el saldo del extracto y la diferencia nunca llega a 0 | Texto guía que sugiere revisar los montos escritos y los cargos/abonos pendientes de registrar |
| Partidas reemplazadas y guardado parcial | RPC atómica (upsert + reemplazo en una transacción); tests de la RPC |
| El snapshot de libros queda viejo tras registrar movimientos tardíos | Botón "Actualizar libros" siempre visible junto al valor |
| Dos conciliaciones con períodos solapados confunden | Unique por (cuenta, inicio, fin) y la vista carga por rango exacto; se documenta que el rango típico es el mes |
| Sugerencias EN_REVISION no cuadran con la realidad del extracto | Es una pista, nunca se suma sola; el dueño agrega o descarta |
| RLS nueva con write policies | Patrón voucher_series (owner-scoped con `(select auth.uid())`); revisar advisors de seguridad tras la migración |
| Migraciones vía MCP sin CLI instalada | Versionar el SQL en `supabase/migrations/` y verificar los tipos contra `generate_typescript_types` |
| El contador espera partidas de "cheques girados" que el sistema no modela | `PAGO_NO_DEBITADO` cubre ese caso con etiqueta simple ("Pagué y el banco aún no debita"); los cheques como tales no existen en el sistema |

## What is **not** in this spec

Importación de extractos y cruce automático; arrastre de partidas entre períodos; sellado/inmutabilidad; conciliación de cajas; multi-moneda real; aging; matching automático; cambios en el cierre, la validación "Marcar verificado" o los estados de recibo. Cada uno, si llega, va en su propia spec.
