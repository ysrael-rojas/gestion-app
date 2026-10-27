# SPEC 49 — Integridad del cuadre de caja (vales, tolerancia, arqueo sorpresivo)

> **Status:** Aprobado
> **Depends on:** SPEC 19, SPEC 30, SPEC 31, SPEC 32, SPEC 33, SPEC 35
> **Date:** 2026-10-27
> **Objective:** Corregir las fallas de integridad del cuadre de caja y bancos: que los vales de caja chica generen su egreso (hoy el cierre los ignora), bloquear cierres con fecha futura, exigir motivo cuando la diferencia supere una tolerancia, registrar arqueos sorpresivos que no cierran periodo, mostrar la secuencia de recibos en el reporte y limpiar deuda técnica del dominio.

## Why this spec exists

Una auditoría operativa del módulo (2026-10-27, comparando la implementación contra el procedimiento estándar peruano de arqueo, conciliación y control interno para MYPE) encontró fallas que hacen que el cuadre pueda cerrar con números incorrectos o sin explicación:

- **F1 (grave):** `close_cash_account` calcula el saldo esperado solo con `payment` + `cash_transfer`, y `create_petty_cash_vale` **no genera recibo**. Cada reposición de caja chica (transferencia entrante) infla el esperado mientras el efectivo ya se gastó: al cerrar una caja chica, la diferencia sale igual a los vales repuestos. Verificado con `pg_get_functiondef` en la BD viva. Hoy no existe ninguna cuenta `is_petty_cash` ni vales (0 filas), así que es una bomba de tiempo, no un dato roto.
- **F2:** la RPC de cierre solo valida `period_end >= apertura` y `> último cierre`; permite cerrar periodos futuros (hallazgo abierto de SPEC 29, sigue vivo).
- **F3:** la diferencia se acepta sin explicación ni tolerancia. El último cierre de "Caja General" tiene diferencia **S/ 1,038.00** sin motivo registrado. El procedimiento de arqueo exige explicación escrita del cajero y una tolerancia definida (ej. S/ 0.50 por redondeo).
- **F4:** no existe el arqueo sorpresivo/intermedio (conteo que no cierra periodo), que es el control más efectivo en una MYPE de 1–5 personas; además el "efectivo contado" del panel de caja chica es estado local y no persiste.
- **F12 (deuda):** el reporte del cierre no muestra la secuencia de recibos del periodo ni los anulados; las categorías de cargo bancario se filtran por **nombre** (si se renombra "ITF" desaparece del combo) en vez de por `code`; `cuentas-view.tsx` usa `listCashPositions` marcada `@deprecated` (N+1: una RPC por cuenta) más una consulta por cuenta para el último movimiento.

Esta spec es la primera de tres (49 integridad → 50 registro ágil → 51 reportes y actas), en ese orden por decisión del usuario: sin integridad, los reportes salen mal.

## Scope

**In:**

1. **El vale de caja chica genera su egreso (F1).**
   - `petty_cash_vale` gana `payment_id uuid null` (FK → `payment`), poblado por la RPC; nullable porque los vales históricos no lo tienen (no hay ninguno).
   - `create_petty_cash_vale` recibe `p_category_id uuid` (categoría de egreso existente) e inserta un `payment` EGRESO contra la cuenta de caja chica, con método EFECTIVO, sin entidad y sin asignaciones, y notas `"Vale de caja chica N.º {serial}"`. Los triggers vigentes asignan el correlativo `RE-` y respetan el periodo abierto.
   - `void_petty_cash_vale` anula además el recibo ligado (`status='ANULADO'` + `void_reason` + `voided_at`), respetando `payment_guard_history_mutation`.
   - El modal de vale (`cash-vale-modal.tsx`) añade el select de categoría de egreso con el ítem "Seleccionar" persistente (patrón SPEC 44).
   - La reposición (`replenish_petty_cash`) no cambia: con el egreso del vale ya registrado, la transferencia entrante restaura el fondo y el cierre cuadra.
2. **Bloqueo de fecha futura (F2).** `close_cash_account` rechaza `p_period_end > current_date` con mensaje claro; el modal de cierre lo valida también en cliente.
3. **Tolerancia y motivo de diferencia (F3).**
   - Nuevo ajuste `cash_difference_tolerance` en `app_setting` (default `"0.50"`), editable en `GeneralSettingsCard` junto a periodicidad y TC.
   - `cash_close` gana `difference_reason text null` y `difference_tolerance numeric(12,2) null` (snapshot de la tolerancia usada, mismo criterio que `change_fund` de SPEC 35).
   - `close_cash_account` recibe `p_difference_reason text`: si el conteo no es nulo y `abs(diferencia) > tolerancia`, exige motivo no vacío (excepción en caso contrario); dentro de la tolerancia se permite sin motivo.
   - El modal de cierre muestra la diferencia en vivo y habilita "Motivo de la diferencia" (obligatorio) cuando excede la tolerancia.
   - `CuadreReport` y su CSV muestran tolerancia, motivo y el resultado del arqueo (Cuadrado / Faltante / Sobrante).
4. **Arqueo sorpresivo (F4).**
   - Tablas `cash_count` (arqueo que **no** cierra periodo: cuenta, fecha, contado, esperado snapshot, diferencia, contado por, notas) y `cash_count_denomination` (misma forma que `cash_close_denomination`, normalizada, no JSONB — decisión de SPEC 32).
   - Función privada única `private.cash_expected_balance(account_id, as_of)` con la fórmula de saldo esperado, reutilizada por `close_cash_account` y por la nueva RPC `register_cash_count` (evita duplicar la fórmula).
   - UI en `/cajas-bancos/cuadres`: botón "Arqueo sorpresivo" + modal con denominaciones y responsable, e historial de arqueos por cuenta.
   - Queda listo para que SPEC 50 persista el arqueo de caja chica sobre la misma tabla.
5. **Secuencia de recibos en el reporte (parte de F12).** `CuadreReport` y el CSV muestran el primer y último recibo del periodo (p. ej. "RI-000012 → RI-000031") y cuántos recibos anulados hay.
6. **Categorías de cargo bancario por `code` (F12).** `bank-charge-modal.tsx` filtra por `code` (`ITF`, `COMISION_BANCARIA`, `DETRACCION_SPOT`) en vez de por nombre.
7. **Fin del N+1 en Detalle de Cuentas (F12).** `cuentas-view.tsx` usa `listCashPositionsConsolidated` y una única consulta agregada de últimos movimientos por cuenta; se elimina `listCashPositions` (`@deprecated`) al quedar sin consumidores.
8. Tras las migraciones: `npm run gen:types` para regenerar `lib/supabase/types.ts`, y revisión de advisors de seguridad y rendimiento.
9. Tests: unitarios de las RPCs/helpers nuevos y modificados (vales con recibo, anulación encadenada, tolerancia, fecha futura, saldo esperado, `register_cash_count`), de schemas zod actualizados, y de componente (modal de vale con categoría, modal de cierre con motivo, arqueo sorpresivo, reporte con secuencia de recibos, cargo por code).

**Out of scope (for future specs):**

- **SPEC 50 (registro ágil):** movimiento de caja sin comprobante (aporte/retiro del propietario, gasto hormiga, depósito y abono bancario) y arqueo de caja chica persistente sobre `cash_count`.
- **SPEC 51 (reportes y actas):** acta de arqueo imprimible con doble firma, extracto por rango arbitrario + CSV, flujo de caja proyectado y formato de conciliación bancaria.
- Descartados por decisión del usuario en esta ronda: validación de periodo cerrado en el wizard de pagos, ITF sugerido (0.005%), registro consecutivo de pagos.
- Multi-moneda real (tasas por fecha), transferencias entre monedas, tabla `audit_log`, permisos/roles de caja.
- Corrección de los 34 avisos RLS `auth_rls_initplan` y unificación de `formatAmount`/`mapError`/`getErrorMessage` duplicados (higiene técnica, spec propia).
- Reabrir o editar cierres existentes (siguen siendo irreversibles por decisión de SPEC 19/30).

## Data model

Cambios en Postgres (todo vía `apply_migration`, nombres snake_case; **cargar el skill `supabase-postgres-best-practices` antes de escribir DDL**):

```sql
-- 1. Vale ligado a su egreso
alter table public.petty_cash_vale
  add column payment_id uuid references public.payment(id);

-- 2. Tolerancia y motivo en el cierre
alter table public.cash_close
  add column difference_reason    text,
  add column difference_tolerance numeric(12,2);
-- app_setting: key 'cash_difference_tolerance', valor por defecto '0.50'

-- 3. Arqueo que no cierra periodo
create table public.cash_count (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id),
  cash_account_id  uuid not null references public.cash_account(id),
  count_date       date not null,
  counted_balance  numeric(12,2) not null,
  expected_balance numeric(12,2) not null,
  difference       numeric(12,2) not null,
  change_fund      numeric(12,2),
  counted_by       text,
  is_surprise      boolean not null default true,
  notes            text,
  created_at       timestamptz not null default now()
);
create table public.cash_count_denomination (
  cash_count_id uuid not null references public.cash_count(id) on delete cascade,
  denomination  numeric(12,2) not null check (denomination in (200,100,50,20,10,5,2,1,0.50,0.20,0.10)),
  quantity      integer not null check (quantity >= 0),
  primary key (cash_count_id, denomination)
);
-- RLS por owner_id (select/insert; sin update ni delete, como cash_close)

-- 4. Fórmula única de saldo esperado (la reusan cierre y arqueo)
create function private.cash_expected_balance(p_cash_account_id uuid, p_as_of date)
  returns numeric(12,2) language sql stable set search_path = '' as $$ … $$;

-- 5. RPC nueva
create function public.register_cash_count(
  p_cash_account_id uuid, p_count_date date, p_counted_balance numeric,
  p_denominations jsonb default null, p_counted_by text default null, p_notes text default null
) returns uuid security definer set search_path = '' as $$ … $$;

-- 6. RPC modificadas (create or replace, mismos invariantes de SPEC 30/35)
--   create_petty_cash_vale(+ p_category_id)  → inserta payment EGRESO y guarda payment_id
--   void_petty_cash_vale                     → anula también el recibo ligado
--   close_cash_account(+ p_difference_reason)→ rechaza fecha futura y exige motivo sobre tolerancia
```

Sin backfill: no hay vales ni cuentas de caja chica en la BD (verificado el 2026-10-27), y las columnas nuevas de `cash_close` quedan nulas en cierres históricos (mismo criterio que `change_fund`).

Tipos de cliente: `CashCount`, `CashCountDenomination` y los campos nuevos en `CashClose`/`PettyCashVale` tras `npm run gen:types`.

## Implementation plan

1. Cargar `supabase-postgres-best-practices`. Migración A: `petty_cash_vale.payment_id` + `create_petty_cash_vale` con categoría y recibo + `void_petty_cash_vale` encadenado. Cliente: schema zod del vale con `categoryId`, modal con select de categoría, `lib/caja/caja-chica.ts` actualizado. `gen:types` + tests.
2. Migración B: `private.cash_expected_balance` + `close_cash_account` con validación de fecha futura, tolerancia y motivo (columnas `difference_reason`/`difference_tolerance`). Cliente: ajuste `cash_difference_tolerance` en `GeneralSettingsCard`, motivo en `CashCloseModal`, tolerancia/resultado en `CuadreReport` y CSV. `gen:types` + tests.
3. Migración C: tablas `cash_count`/`cash_count_denomination` (RLS por owner) + `register_cash_count`. Cliente: `lib/caja/arqueos.ts` (listar/crear), modal de arqueo sorpresivo e historial en `cuadres-view.tsx`. `gen:types` + tests.
4. Reporte: secuencia de recibos (primer/último + anulados) en `CuadreReport` y en el bloque CSV. Tests de componente.
5. Deuda técnica: categorías de cargo por `code`; `cuentas-view.tsx` con `listCashPositionsConsolidated` + una consulta agregada de últimos movimientos; eliminar `listCashPositions`. Tests.
6. Validación final: `npm run gen:types` + `npm run lint` + `npm test` + `npm run build`, y revisión de advisors de seguridad y rendimiento tras las migraciones.

## Acceptance criteria

- [ ] Crear un vale de caja chica genera un recibo de egreso (`RE-…`) contra esa cuenta, con la categoría elegida, y el vale queda ligado por `payment_id`.
- [ ] El saldo esperado de una caja chica baja al emitir el vale: tras emitir vales y reponer el fondo, el cierre de la caja chica queda **sin diferencia**.
- [ ] Anular un vale pendiente anula también su recibo (con motivo y fecha) y el saldo esperado se recupera; un vale ya repuesto no se puede anular (comportamiento vigente).
- [ ] El modal de vale exige categoría de egreso y mantiene el ítem "Seleccionar" persistente.
- [ ] `close_cash_account` rechaza un `period_end` posterior a hoy con mensaje claro, y el modal de cierre lo impide en cliente.
- [ ] Con diferencia mayor a la tolerancia, el cierre exige motivo escrito; dentro de la tolerancia se puede cerrar sin motivo. El motivo y la tolerancia usada quedan guardados y visibles en el reporte y el CSV.
- [ ] La tolerancia es configurable en Configuración → General (`cash_difference_tolerance`, default 0.50) y se respeta al cerrar.
- [ ] El arqueo sorpresivo registra conteo (con denominaciones opcionales), responsable y fecha **sin cerrar el periodo**, mostrando esperado, contado y diferencia; queda listado en el historial de la cuenta.
- [ ] El reporte del cierre muestra la secuencia de recibos del periodo (primero y último) y la cantidad de anulados.
- [ ] El modal de cargo bancario lista las categorías por `code`: renombrar "ITF" no lo hace desaparecer.
- [ ] `/cajas-bancos/cuentas` carga saldos con una sola RPC y últimos movimientos con una sola consulta; `listCashPositions` ya no existe ni se usa.
- [ ] `lib/supabase/types.ts` regenerado con `npm run gen:types`; advisors de seguridad y rendimiento revisados tras las migraciones.
- [ ] `npm run lint`, `npm test` y `npm run build` pasan con los tests nuevos en verde.

## Decisions

- **Sí:** el vale genera un recibo de egreso contra la caja chica. **No:** que el cierre reste los vales del esperado (el gasto no aparecería en el resumen por categoría ni en el flujo mensual) ni bloquear el cierre con vales pendientes (obligaría a reponer antes de cerrar el día).
- **Sí:** categoría de egreso elegida por el usuario en el modal del vale (reutiliza las existentes, decisión de SPEC 32). **No:** crear una categoría fija "Gastos de caja chica" (perdería el detalle del concepto en el resumen por categoría).
- **Sí:** tolerancia global en `app_setting` con snapshot por cierre. **No:** tolerancia por cuenta (complejidad sin necesidad en una MYPE) ni tolerancia hardcoded.
- **Sí:** motivo de diferencia obligatorio solo cuando se excede la tolerancia. **No:** exigirlo siempre (las diferencias de redondeo son normales).
- **Sí:** arqueo sorpresivo en tablas propias (`cash_count`), que no cierran periodo. **No:** reutilizar `cash_close` con un flag (rompería la unicidad `(cash_account_id, period_end)` y la semántica de cierre irreversible).
- **Sí:** denominaciones del arqueo en tabla hija normalizada. **No:** JSONB (consistencia con SPEC 32).
- **Sí:** una única función privada de saldo esperado reutilizada por cierre y arqueo. **No:** duplicar la fórmula (ya hay tres copias históricas entre RPCs).
- **Sí:** secuencia de recibos y anulados en el reporte/CSV actual. **No:** esperar al acta imprimible (SPEC 51) para tener el dato.
- **Sí:** eliminar `listCashPositions` al migrar su único consumidor. **No:** mantenerla "por si acaso" (está marcada `@deprecated` desde SPEC 34).
- **No** en esta spec: validación de periodo en el wizard de pagos, ITF sugerido y registro consecutivo (el usuario los descartó en esta ronda).

## Risks

| Risk | Mitigation |
| --- | --- |
| Cambiar `create_petty_cash_vale` rompe vales existentes | No hay vales ni cuentas de caja chica en la BD (verificado); `payment_id` nullable y sin backfill |
| Doble registro del gasto (vale + egreso manual del wizard) | El recibo del vale lleva notas "Vale de caja chica N.º X" y aparece en el extracto; se documenta en la UI del panel |
| La fórmula de saldo esperado diverge entre cierre y arqueo | Función privada única `private.cash_expected_balance` usada por ambas RPCs |
| Cierres históricos sin tolerancia/motivo | Columnas nullable; el reporte muestra "—" cuando no aplican (mismo criterio que `change_fund`) |
| Migraciones sobre RPCs `security definer` con `search_path=''` | Mantener el patrón vigente (SPEC 19/31/32/33) y revisar advisors tras aplicar |
| `gen:types` falla y deja tipos desactualizados | El script conserva el `types.ts` anterior y sale con código 1; regenerar antes de los tests |
| El arqueo sorpresivo se confunde con un cierre | UI separada ("Arqueo sorpresivo" vs "Cerrar caja") e historial propio; `is_surprise` en la tabla |

## What is **not** in this spec

Movimiento de caja sin comprobante y arqueo persistente de caja chica (SPEC 50); acta de arqueo imprimible con firmas, extracto por rango, flujo de caja proyectado y conciliación bancaria formal (SPEC 51); multi-moneda real, `audit_log`, roles de caja, higiene RLS/duplicados y reabrir cierres. Cada uno, si llega, va en su propia spec.
