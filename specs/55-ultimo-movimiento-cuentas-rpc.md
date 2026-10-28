# SPEC 55 — Último movimiento de cuentas vía RPC

> **Status:** Implementado
> **Depends on:** SPEC 19, SPEC 28, SPEC 34, SPEC 49
> **Date:** 2026-10-28
> **Objective:** Que `/cajas-bancos/cuentas` vuelva a cargar saldos y último movimiento reemplazando la consulta con agregado PostgREST (`payment_date.max()`) por una RPC SQL, de modo que un fallo secundario no deje la página en cero y el error deje de ser genérico.

## Why this spec exists

El 2026-10-28, al barrer las rutas de la app con Playwright, `/cajas-bancos/cuentas` apareció como la única pantalla que falla:

- Alerta: **"No se pudo completar la operación con la base de datos. Intenta nuevamente."**
- Totales en **S/ 0.00**, **0 cuentas registradas** y tabla vacía, aunque los datos están intactos (Caja General S/ 15,409 y Banco BCP S/ 24,194).

Cadena del defecto:

```
components/cajas-bancos/cuentas-view.tsx  Promise.all([...])
  → lib/caja/caja.ts#listLastMovementDates
      supabase.from("payment").select("cash_account_id, last_date:payment_date.max()")
  → PostgREST 400 { code: "PGRST123", message: "Use of aggregate functions is not allowed" }
  → mapError no mapea PGRST123 → texto genérico
  → Promise.all rechaza → la vista nunca recibe saldos ni cuentas → todo en cero
```

El proyecto tiene los **agregados de PostgREST deshabilitados** (valor por defecto de PostgREST; no hay override `pgrst.*` en `pg_db_role_setting`). El mismo cálculo en SQL puro responde bien, así que el problema es la capa REST, no la consulta ni los datos.

La consulta se introdujo en `56e0b85` (2026-10-27, SPEC 49, "fin del N+1 en Detalle de Cuentas"). Los tests unitarios mockean el cliente de Supabase y nunca emiten el HTTP 400, por eso pasó desapercibido. Es el **único** agregado PostgREST del repositorio.

## Scope

**In:**

1. **RPC `list_last_movement_dates()`** (`supabase/migrations/`):
   - `returns table (cash_account_id uuid, last_date date)`.
   - `language sql`, `stable`, `security invoker`, `set search_path = ''`.
   - Agrupa `public.payment` por `cash_account_id` con `max(payment_date)` y **excluye `status = 'ANULADO'`** (un recibo anulado no es un movimiento real).
   - `revoke all ... from public, anon` y `grant execute ... to authenticated`; RLS de `payment` aplica por ser `security invoker`.
2. **`lib/caja/caja.ts`**:
   - `listLastMovementDates()` pasa a `supabase.rpc("list_last_movement_dates")` y mantiene el contrato `Promise<Record<string, string>>` (cuenta → fecha ISO).
   - `mapError` agrega una rama para `PGRST123` con un mensaje claro ("La consulta usó una función no permitida por la API"), para que un caso futuro no caiga en el texto genérico.
3. **`components/cajas-bancos/cuentas-view.tsx`**:
   - Cambiar `Promise.all` por `Promise.allSettled` con esta jerarquía:
     - `listCashPositionsConsolidated` es **obligatoria**: si falla, se muestra el error de la página (comportamiento actual).
     - `getPenUsdRate` es **opcional**: si falla, se usa `null` (la UI ya sabe mostrar el aviso de TC).
     - `listLastMovementDates` es **opcional**: si falla, la tabla se muestra sin "último movimiento" y aparece un aviso discreto ("No se pudo cargar el último movimiento") en lugar de dejar todo en cero.
4. **Tipos:** regenerar `lib/supabase/types.ts` (MCP `generate_typescript_types` o `npm run gen:types`), reponer la cabecera `// GENERATED — NO EDITAR — npm run gen:types` y validar con `npx tsc --noEmit`.
5. **Tests:**
   - Unitario de `listLastMovementDates`: llama a la RPC (no a `from("payment")`), mapea filas, ignora `last_date` nulo y propaga el error con el texto mapeado.
   - Unitario de `mapError` con `PGRST123`.
   - Componente de `cuentas-view`: si `listLastMovementDates` rechaza, las cuentas y saldos se siguen mostrando y aparece el aviso discreto; si rechaza `listCashPositionsConsolidated`, se muestra el error de página.
6. **Validación:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`, advisors de Supabase y Playwright sobre `/cajas-bancos/cuentas` (sin 400 en la red, sin alerta, saldos y "27/10/2026" visibles).

**Out of scope (for future specs):**

- Habilitar agregados de PostgREST en el proyecto (`pgrst.db_aggregates_enabled`): no se toca configuración del proyecto.
- Cambiar `listCashPositionsConsolidated` ni la RPC `get_cash_positions`.
- Rediseñar el Detalle de Cuentas (columnas, filtros, paginación).
- Cambiar la semántica de "último movimiento" en otras pantallas (Extractos y Cuadres no lo usan).
- Historial de movimientos por cuenta o auditoría de recibos anulados.

## Data model

No hay tablas ni columnas nuevas. Solo una función de lectura:

```sql
create or replace function public.list_last_movement_dates()
returns table (cash_account_id uuid, last_date date)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.cash_account_id, max(p.payment_date) as last_date
    from public.payment p
   where p.status <> 'ANULADO'
   group by p.cash_account_id;
$$;

revoke all on function public.list_last_movement_dates() from public, anon;
grant execute on function public.list_last_movement_dates() to authenticated;
```

```ts
// lib/caja/caja.ts — mismo contrato público, distinta implementación
export async function listLastMovementDates(): Promise<Record<string, string>>;
```

## Implementation plan

1. **Migración**: crear la RPC con `security invoker`, grants y verificación de que RLS de `payment` sigue aplicando. Revisar el plan con `EXPLAIN` sobre `payment` agrupado por cuenta; si no existe un índice que lo cubra, agregar `(cash_account_id, payment_date)` en la misma migración.
2. **Tipos y acceso**: regenerar `lib/supabase/types.ts` y cambiar `listLastMovementDates()` a `supabase.rpc(...)`; agregar la rama `PGRST123` en `mapError`. Tests unitarios.
3. **Vista resiliente**: `Promise.allSettled` en `cuentas-view` con la jerarquía obligatoria/opcional y el aviso discreto. Test de componente.
4. **Validación**: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`, advisors y Playwright en `/cajas-bancos/cuentas` (2 cuentas, saldos, "27/10/2026", 0 errores de consola, 0 respuestas 400).

## Acceptance criteria

- [x] `/cajas-bancos/cuentas` muestra las 2 cuentas (Caja General y Banco BCP) con sus saldos (S/ 15,409.00 y S/ 24,194.00) y "Último movimiento" 27/10/2026.
- [x] La pantalla no muestra la alerta "No se pudo completar la operación con la base de datos…" ni deja los totales en S/ 0.00.
- [x] La red no registra ninguna respuesta 400 de `/rest/v1/payment` al cargar la pantalla.
- [x] `listLastMovementDates` invoca la RPC `list_last_movement_dates` y ya no usa `select(...payment_date.max())`.
- [x] Un recibo `ANULADO` no cuenta como último movimiento (test unitario con un anulado más reciente que el procesado).
- [x] Si la RPC falla, la tabla de cuentas y los saldos se siguen mostrando, con un aviso discreto en lugar de la página vacía; si falla `listCashPositionsConsolidated`, se mantiene el error de página.
- [x] `PGRST123` se traduce a un mensaje claro y no al texto genérico.
- [x] `lib/supabase/types.ts` regenerado y `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` en verde; advisors sin hallazgos nuevos.

## Decisions

- **Sí:** RPC SQL dedicada (`security invoker`). **No:** habilitar agregados de PostgREST en el proyecto (configuración global, permisos inciertos y afecta a todos los clientes) ni traer todas las filas para calcular el máximo en JS (crece con el histórico).
- **Sí:** excluir `ANULADO`. **No:** mantener la paridad con la consulta actual, que contaba recibos anulados como último movimiento.
- **Sí:** `Promise.allSettled` con consultas opcionales. **No:** dejar `Promise.all`, que convierte un fallo secundario en una página vacía y engañosa.
- **Sí:** mapear `PGRST123` a un mensaje claro. **No:** exponer el mensaje crudo de PostgREST al usuario.
- **Asumido:** el contrato de `listLastMovementDates` (cuenta → fecha ISO) se mantiene para no tocar la tabla ni sus columnas.

### Notas de implementación (2026-10-28)

- **Migración aplicada** (`spec55_last_movement_dates_rpc`, versionada en `supabase/migrations/20261028160000_spec55_last_movement_dates_rpc.sql`): función `security invoker` (verificado `prosecdef = false`), `stable`, `search_path = ''`, `revoke` a `public/anon` y `grant execute` a `authenticated`.
- **RLS verificada**: con `role authenticated` y un `sub` ajeno la RPC devuelve 0 filas; con el owner real devuelve 2. El insert de un recibo `ANULADO` con fecha 28/10 dentro de una transacción con `rollback` mantuvo el último movimiento en 27/10 (exclusión efectiva).
- **Índice**: ya existía `payment_cash_account_date_idx (cash_account_id, payment_date DESC)`; no se agregó ninguno. `EXPLAIN` usa `Seq Scan` porque la tabla tiene 44 filas; el costo es 2.5 ms.
- **Tipos**: el CLI de Supabase no está instalado y la conexión directa por `db.<ref>.supabase.co` no resuelve por DNS. Se generó `generate_typescript_types` por MCP y se aplicó el delta exacto de `list_last_movement_dates` (`Args: never`, `Returns: { cash_account_id, last_date }[]`) sobre `lib/supabase/types.ts`, validado con `tsc`.
- **Tests**: 639 en 75 archivos. `listLastMovementDates` ahora prueba la RPC (no `from("payment")`), filas sin fecha, error mapeado y `PGRST123`; `cuentas-view.test.tsx` cubre éxito, fallo del último movimiento y fallo obligatorio de saldos.
- **Playwright**: `/cajas-bancos/cuentas` sin respuestas 400 ni errores de consola; 2 cuentas, S/ 15,409.00 / S/ 24,194.00, "27/10/2026" y sin alerta. Captura en `.playwright-mcp/spec55-cuentas.png`.
- **Advisors**: la función no aparece entre las `SECURITY DEFINER` ejecutables; sin hallazgos nuevos (los de `receipt_sequence`, las 10 definer y `auth_rls_initplan` son previos).

## Risks

| Risk | Mitigación |
| --- | --- |
| `security invoker` deja de aplicar RLS y expone movimientos de otros owners | La función no es `security definer`; se verifica con un usuario distinto (0 filas) y se revisan advisors |
| El `group by` sobre `payment` se vuelve lento con histórico grande | `EXPLAIN` en la migración; índice `(cash_account_id, payment_date)` si falta |
| Cambiar `Promise.all` por `allSettled` oculta fallos reales | Solo las consultas opcionales degradan; la de saldos sigue siendo obligatoria y muestra el error de página |
| Los tipos generados no coinciden con la RPC nueva | Regenerar con MCP y validar con `npx tsc --noEmit` antes del build |
| Tests unitarios vuelven a mockear y no detectan un 400 real | El test verifica que se use `rpc(...)` (no `from("payment")`) y la validación final es Playwright contra la base viva |

## What is **not** in this spec

Habilitar agregados de PostgREST, cambios en `get_cash_positions` o en los saldos, rediseño del Detalle de Cuentas, historial de movimientos por cuenta y cualquier cambio de esquema más allá de la función de lectura. Cada uno, si llega, va en su propia spec.
