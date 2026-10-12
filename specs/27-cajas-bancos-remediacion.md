# SPEC 27 — Cajas y bancos: remediación de hallazgos de auditoría

> **Status:** Draft (Fase 0 — propuesta)
> **Depends on:** SPEC 09, SPEC 16, SPEC 17, SPEC 19, SPEC 26
> **Date:** 2026-10-08
> **Objective:** cerrar los hallazgos de la auditoría del modelo de caja y bancos (drift de enum, RLS permisiva en `cash_close`, inmutabilidad/idempotencia de `payment`, transferencias entre cuentas, refinamientos transaccionales, multi-moneda y auditoría), siguiendo el orden priorizado acordado con el usuario.

## Why this spec exists

La auditoría READ-ONLY del modelo de caja y bancos (sesión del 2026-10-08) dejó 10 hallazgos con prioridades 🔴/🟠/🟡. Tres son críticos o altos y tocan invariantes financieras reales: la deriva de enum en funciones vivas (riesgo de pantallas rotas), la policy `cash_close_delete` (borra cierres "irreversibles") y la falta de tabla de transferencias (obligación operativa de registrar 2 piernas a mano). Esta spec es el plan de remediación priorizado que el usuario aprobó y la única forma de que esos arreglos queden versionados en el repo en lugar de aplicados en caliente sin trazabilidad.

## Scope

**In:**

- Migración versionada para el fix del enum y recompilación de las RPC afectadas por SPEC 26.
- Hardening de `cash_close` (sin `DELETE`, `UPDATE` restringido).
- Hardening de `payment` (inmutabilidad de `amount` post-INSERT, void idempotente, `voided_at` no nulo cuando `status='ANULADO'`).
- Statement / reporte: `ANULADO` se muestra con marca visible (no se filtra).
- Modelo `cash_transfer` con RPC atómica (Fase 3) — sujeto a la decisión del usuario.
- `addAllocations` → una sola RPC transaccional.
- Verificación en DB de las CHECKs declaradas en specs 09/26 (`amount > 0`, suma de allocations ≤ amount, `(status='ANULADO') = (voided_at IS NOT NULL)`); versionar las faltantes.
- Decisión documentada sobre auditoría y multi-moneda real (Fase 5).

**Out of scope (for future specs):**

- Conciliación bancaria / estado de cuenta que marca un recibo como `PROCESADO` (se mantiene como decisión de SPEC 26 §"Out of scope").
- Multi-moneda real con tasas por fecha y enum ISO-4217 (Fase 5, solo si el usuario la activa).
- Tabla `audit_log` de cambios (Fase 5, solo si el usuario la pide).
- Cambios de UX que no sean los estrictamente necesarios para mostrar `ANULADO` en statements.

## Hallazgos cubiertos (referencia auditoría)

| # | Severidad | Hallazgo | Spec destino |
| --- | --- | --- | --- |
| H1 | 🔴 | Funciones vivas filtran `status='REGISTRADO'` (drift) | T1, T2 |
| H2 | 🔴 | `cash_close_delete` reabre períodos | T3 |
| H3 | 🟠 | `payment` mutable (amount, void) sin invariantes DB | T4, T5 |
| H4 | 🟠 | Sin tabla de transferencias entre cuentas | T6 (A o B) |
| H5 | 🟡 | Statement no marca `ANULADO` | T7 |
| H6 | 🟡 | `addAllocations` no es transaccional | T8 |
| H7 | 🟡 | Validaciones `amount > 0` y suma allocations ≤ amount no verificadas en DB | T9 |
| H8 | 🟡 | RLS catálogos permite `DELETE` (borrar metadata en uso) | T10 |
| H9 | ⚪ | `listCashPositions` N+1 | T11 (perf, no corrección) |
| H10 | 🟠 | Sin tabla de auditoría | T12 (decisión) |

## Data model

### H1 — Fix de enum y recompilación de RPC

Migración versionada `fix_payment_status_drift_v1` con `apply_migration`:

```sql
-- 1. Inspeccionar previamente con execute_sql (no DDL):
--    SELECT proname, prosrc FROM pg_proc
--    WHERE prosrc ILIKE '%''REGISTRADO''%' OR prosrc ILIKE '%issue_date%';
--
-- 2. CREATE OR REPLACE FUNCTION de las candidatas conocidas, con el
--    filtro actualizado al criterio de SPEC 26 (EN_REVISION cuenta como
--    aplicado, PROCESADO también; solo ANULADO se excluye de saldos).
--    Candidatas:
--      - public.get_cash_position
--      - public.create_payment_with_allocations
--      - private.validate_allocation
--      - private.refresh_comprobante_status
--    Si la inspección encuentra más, se incluyen.
```

Criterio de filtrado (alineado con decisión de SPEC 26): `status <> 'ANULADO'`. La auditoría debe verificar contra este criterio, no contra "EN_REVISION" literal.

### H2 — Hardening de `cash_close`

Migración `hardening_cash_close_rls_v1`:

```sql
-- 1. Drop de la policy cash_close_delete.
drop policy if exists cash_close_delete on public.cash_close;
-- 2. Reemplazo de update: solo la columna notes es editable.
drop policy if exists cash_close_update on public.cash_close;
create policy cash_close_update_notes on public.cash_close
for update to authenticated
using ( (select auth.uid()) = owner_id )
with check ( (select auth.uid()) = owner_id );
-- 3. Si la lógica anterior permitía cambiar income/expected/difference,
--    no se recrea ninguna policy de update: solo insert (hecha en el RPC)
--    y select por owner.
```

Justificación: la decisión de "cierre irreversible" ya está documentada en SPEC 19. La policy de update anterior rompía esa invariante.

### H3 — Inmutabilidad e idempotencia de `payment`

Migración `hardening_payment_immutability_v1`:

```sql
-- 1. Trigger que rechaza UPDATE de amount una vez insertado.
create or replace function private.payment_freeze_amount()
returns trigger
language plpgsql
as $$
begin
  if new.amount is distinct from old.amount then
    raise exception 'payment.amount is immutable after insert';
  end if;
  return new;
end $$;

create trigger trg_payment_freeze_amount
before update of amount on public.payment
for each row execute function private.payment_freeze_amount();

-- 2. Constraint: void idempotente y voided_at no nulo si ANULADO.
alter table public.payment
  add constraint payment_void_consistency
  check ( (status = 'ANULADO') = (voided_at is not null) );

-- 3. voided_at se setea por la app; trigger que lo protege de UPDATE
--    a NULL si el status sigue ANULADO.
create or replace function private.payment_guard_voided_at()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'ANULADO' and new.voided_at is null then
    raise exception 'payment.voided_at cannot be null when status is ANULADO';
  end if;
  return new;
end $$;

create trigger trg_payment_guard_voided_at
before update of voided_at on public.payment
for each row execute function private.payment_guard_voided_at();
```

Acción complementaria en app: `voidPayment` debe rechazar re-anular si el status ya es `ANULADO` (defensa en profundidad, no sustituye la CHECK).

### H4 — Modelo `cash_transfer` (Opción A) o flag en `payment` (Opción B)

**Opción A (recomendada):**

```sql
create table public.cash_transfer (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  from_cash_account_id uuid not null references public.cash_account(id) on delete restrict,
  to_cash_account_id uuid not null references public.cash_account(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  transfer_date date not null,
  reference text,
  note text,
  status text not null default 'PROCESADO'
    check (status in ('PROCESADO','ANULADO')),
  void_reason text,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_cash_account_id <> to_cash_account_id)
);

create index cash_transfer_owner_date_idx
  on public.cash_transfer (owner_id, transfer_date desc);
create index cash_transfer_from_idx
  on public.cash_transfer (from_cash_account_id);
create index cash_transfer_to_idx
  on public.cash_transfer (to_cash_account_id);

alter table public.cash_transfer enable row level security;
create policy cash_transfer_select on public.cash_transfer
  for select to authenticated using ( (select auth.uid()) = owner_id );
create policy cash_transfer_insert on public.cash_transfer
  for insert to authenticated with check ( (select auth.uid()) = owner_id );
create policy cash_transfer_update_void on public.cash_transfer
  for update to authenticated
  using ( (select auth.uid()) = owner_id )
  with check ( (select auth.uid()) = owner_id );
-- DELETE no habilitado (transferencias son inmutables salvo anulación lógica).
```

RPC `create_cash_transfer` (atómica, `FOR UPDATE` sobre ambas cuentas):

```sql
create or replace function public.create_cash_transfer(
  p_from uuid,
  p_to uuid,
  p_amount numeric,
  p_date date,
  p_reference text,
  p_note text
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_owner uuid := (select auth.uid());
  v_id uuid;
  v_from_currency text;
  v_to_currency text;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;
  if p_from = p_to then
    raise exception 'from and to accounts must differ';
  end if;

  -- Lock de ambas cuentas en orden estable por id.
  perform 1 from public.cash_account
   where id in (p_from, p_to) and owner_id = v_owner
   for update;
  if not found then
    raise exception 'account not found or not owned';
  end if;

  select currency into v_from_currency from public.cash_account where id = p_from;
  select currency into v_to_currency   from public.cash_account where id = p_to;
  if v_from_currency <> v_to_currency then
    raise exception 'cross-currency transfers not supported in this version';
  end if;

  insert into public.cash_transfer
    (owner_id, from_cash_account_id, to_cash_account_id, amount, transfer_date, reference, note)
  values
    (v_owner, p_from, p_to, p_amount, p_date, p_reference, p_note)
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.create_cash_transfer(uuid,uuid,numeric,date,text,text) from public;
grant execute on function public.create_cash_transfer(uuid,uuid,numeric,date,text,text) to authenticated;
```

**Importante:** esta RPC **no inserta `payment`** todavía. Decisión explícita del usuario: hoy las posiciones de caja se calculan como `opening + sum(payments)`. Agregar una tabla `cash_transfer` sin engancharla a la posición la dejaría como dato decorativo. **T6.1 y T6.2 son prerrequisito**: o se decide cambiar la fórmula del RPC `get_cash_position` para incluir transferencias, o se documenta que la fórmula no las ve. Mi recomendación: incluirlas (suma transferencias desde la cuenta origen como egreso, a la cuenta destino como ingreso, ambas con un `payment_id` derivado o vía join directo). Se aborda en T6.3.

**Opción B (mínima):** no crear tabla. Agregar columna `counterparty_cash_account_id uuid null references cash_account(id)` a `payment`. Mantener el patrón actual de 2 recibos. Documentar la decisión en SPEC 27. Pro: barato. Con: no resuelve el riesgo de doble conteo si se olvida una pierna.

**T6.0 — Decisión de diseño:** el usuario elige A o B antes de T6.1.

### H7 — Validaciones de amount y suma de allocations

Verificar primero con `execute_sql`:

```sql
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.payment'::regclass
   and contype = 'c';
```

Si la CHECK `amount > 0` no existe:

```sql
alter table public.payment
  add constraint payment_amount_positive check (amount > 0);
```

Para la suma de allocations ≤ amount, la opción limpia es un trigger (no hay forma sencilla de CHECK cross-row en Postgres) o mover la validación al RPC `create_payment_with_allocations` con un assert al final de la transacción. T9.2 elige una.

### H8 — RLS catálogos

Migración `hardening_catalog_rls_v1`:

```sql
drop policy if exists payment_method_delete on public.payment_method;
drop policy if exists cash_receipt_category_delete on public.cash_receipt_category;
-- Insert/update/select quedan igual. Soft-delete via is_active=false ya existe.
```

## Implementation plan

Las tareas se numeran con prefijo T# para que la spec, el feature doc y el todo queden alineados. La fase 1.5 (fix en caliente) solo aplica si T1 confirma drift.

**Fase 1 — Verificación (read-only, no rompe nada):**

- T1: ejecutar `execute_sql` para inspeccionar `pg_proc.prosrc`, default de `payment.status`, y CHECKs de `payment`/`cash_close` (queries en §"Data model / H1" y §"H7").
- T2: si T1 confirma drift, abrir fase 1.5 (fix en caliente + versionar migración de SPEC 26 en el repo). Si no, saltar a Fase 2.

**Fase 1.5 — Fix en caliente (solo si drift):**

- T2.1: `CREATE OR REPLACE FUNCTION` de las funciones afectadas con el filtro `status <> 'ANULADO'`.
- T2.2: `npm run gen:types` y commit.
- T2.3: crear migración versionada `payment_lifecycle_en_revision_processed` retroactiva (copia del SQL de SPEC 26) y aplicarla si no estaba versionada.

**Fase 2 — Hardening RLS e inmutabilidad:**

- T3: migración `hardening_cash_close_rls_v1` (drop delete + update restringido) y tests de `caja.test.ts`.
- T4: migración `hardening_payment_immutability_v1` (freeze amount + void consistency + guard voided_at) y tests de `pagos.test.ts`.
- T5: defensa en app: `voidPayment` rechaza re-anular; validaciones redundantes con zod.

**Fase 3 — Transferencias entre cuentas:**

- T6.0: el usuario elige Opción A (entidad propia) o B (columna en `payment`).
- T6.1: si A, crear tabla `cash_transfer` + RLS; si B, agregar columna + migración.
- T6.2: RPC `create_cash_transfer` (A) o ajustar `create_payment_with_allocations` (B).
- T6.3: actualizar `get_cash_position` y `close_cash_account` para que consideren las transferencias según la decisión de T6.0. Test RED que pruebe "una transferencia de 100 entre dos cuentas no cambia el saldo consolidado pero sí las posiciones individuales".
- T6.4: UI mínima: botón "Transferir" en `cuentas-view.tsx` con modal que invoca la RPC. (Aplica solo a Opción A; B no requiere UI nueva, solo documentar la práctica.)

**Fase 4 — Refinamientos:**

- T7: `listAccountStatement` y `cuadre-report.tsx` muestran `ANULADO` con badge (no filtrar). Test de snapshot del CSV que valide la columna de estado.
- T8: `addAllocations` → una sola RPC transaccional `add_payment_allocations` (UPDATE `entity_id` + INSERT allocations en una sola tx). Test que pruebe fallo atómico.
- T9: verificación y aplicación de CHECKs (`amount > 0`, suma allocations ≤ amount) según §"H7".
- T10: drop policies `delete` de `payment_method` y `cash_receipt_category`.

**Fase 5 — Performance y roadmap (no MVP):**

- T11: `listCashPositions` (N+1) → una sola RPC `list_cash_positions` que devuelva el array consolidado.
- T12: decisión documentada de auditoría (sí/no/roadmap) y de multi-moneda real (sí/no/roadmap).

## Acceptance criteria

- [ ] T1 deja evidencia (capturas de `execute_sql`) del estado real de funciones y CHECKs.
- [ ] Si T1 confirma drift: las RPC `get_cash_position`, `create_payment_with_allocations`, `validate_allocation` y `refresh_comprobante_status` referencian el enum vivo y no `'REGISTRADO'`.
- [ ] La migración de SPEC 26 está versionada en `supabase/migrations/` con un nombre coherente.
- [ ] `cash_close` no tiene policy de `DELETE`; `UPDATE` está restringido a `notes` o inexistente.
- [ ] `payment.amount` no se puede modificar tras el INSERT (verificado por test).
- [ ] `payment` con `status='ANULADO'` siempre tiene `voided_at` no nulo y viceversa.
- [ ] `voidPayment` rechaza re-anular desde la app.
- [ ] Statement y reporte de cuadre muestran recibos `ANULADO` con badge visible.
- [ ] Si Opción A: existe `cash_transfer` con RLS por owner, RPC atómica `create_cash_transfer` y la fórmula de posición/cierre incluye transferencias (test cubre el caso).
- [ ] `addAllocations` se ejecuta en una sola RPC transaccional; el test reproduce el fallo de la pierna 2.
- [ ] Las CHECKs de `payment.amount > 0` y la invariante de suma de allocations están en DB.
- [ ] `payment_method` y `cash_receipt_category` no permiten `DELETE` desde la app.
- [ ] `npm run lint`, `npm test` y `npm run build` pasan.
- [ ] Decisión documentada de auditoría y multi-moneda.

## Decisions

- **Sí:** fix de drift con `CREATE OR REPLACE FUNCTION`, no recreando todo el cuerpo de la función — minimiza el diff y la regresión.
- **Sí:** filtro `status <> 'ANULADO'` para los cálculos de posición de caja, alineado con la decisión de SPEC 26 ("EN_REVISION cuenta como aplicado").
- **Sí:** `cash_close` sin `UPDATE` salvo `notes` (o sin update). La anulación se hace con un registro de "ajuste de cierre" o documento de soporte, no editando el cierre original.
- **Sí:** void idempotente vía CHECK en DB + defensa redundante en app.
- **Sí:** `ANULADO` visible con badge en statements (transparencia sobre borrado).
- **Pendiente:** Opción A vs B para transferencias — bloqueante de T6.1.
- **Pendiente:** auditoría y multi-moneda — ver T12.
- **No:** no se inserta `payment` desde `create_cash_transfer` para evitar doble escritura; las transferencias afectan la posición vía la propia tabla.
- **No:** no se permite DELETE de `cash_close` aunque la cuenta quede cerrada hace años — la operación correcta es "ajuste de cierre" con su propia fila.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Reemplazar el cuerpo de las RPC cambia el plan de ejecución y timings | Tests de `pagos.test.ts` y `caja.test.ts` cubren la lógica; smoke de Cuentas/Cuadres en `npm run dev` antes de cerrar Fase 2. |
| `addAllocations` transaccional requiere reemplazar la firma actual; los call-sites en la UI deben actualizarse en el mismo commit | Búsqueda de `addAllocations` en `grep` antes de cambiar; UI ajustada en la misma tarea. |
| `cash_transfer` (Opción A) obliga a reescribir `get_cash_position` y `close_cash_account`; si el test no cubre el caso "transferencia entre cuentas del mismo owner", el bug pasa | T6.3 define explícitamente ese test RED. |
| Si la CHECK `(status='ANULADO') = (voided_at IS NOT NULL)` no estaba en DB y se agrega ahora, los datos existentes podrían no cumplirla | Antes de crear la CHECK, `SELECT count(*) FROM payment WHERE (status='ANULADO') <> (voided_at IS NOT NULL);` debe ser 0. Si no lo es, `update payment set voided_at = coalesce(voided_at, now()) where status='ANULADO';` antes. |
| `payment_freeze_amount` puede romper updates legítimos de migración de datos | El trigger `before update of amount` solo se dispara cuando se intenta cambiar `amount`. Si la migración toca `amount`, hay que deshabilitar el trigger temporalmente. Documentar en la migración. |
| `lib/pagos/pagos.ts:185` se usa también en otros reportes; cambiar el formato del statement puede romper consumidores | Buscar referencias con `grep` antes de T7 y ajustar consumidores en el mismo commit. |

## What is **not** in this spec

- Conciliación bancaria (queda en SPEC 26 como futura).
- Multi-moneda con tasas por fecha (Fase 5 condicional).
- Tabla `audit_log` (Fase 5 condicional).
- Cambios UX que no sean mostrar `ANULADO` con badge y, en Opción A, el modal "Transferir".

## Log

- **L1** (verbatim del usuario, 2026-10-08): "plan de remediacion priorizado".
- **L2** (decisión de fase): "dale fase 0 y 1 en paralelo".
- **L3** (bloqueante): MCP de Supabase sin conexión OAuth funcional; el usuario aprobó PAT scoped como camino alterno, pero por ahora T1 queda bloqueado hasta que la sesión quede con `Tools > 0`.
- **L4** (abrirá al cierre de T1): ¿T2.1 aplica? ¿Opciones de T6.0?
