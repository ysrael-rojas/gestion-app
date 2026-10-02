# Tarea: módulo Cajas y Bancos (fase 1 — Administrar)

**Feature:** `cajas-bancos`
**Estado:** shipped (PR #22 mergeado en main)
**Rama:** actual (no se creará rama a menos que el usuario lo pida; los cambios son work-unit commits)
**Módulos afectados:** Cajas y Bancos (nuevo), navegación, DB

## Objetivo

Crear el módulo Cajas y Bancos para llevar el control del flujo de caja
en efectivo y de la cuenta de banco. Esta **primera entrega** cubre solo
la administración (CRUD) de cajas y bancos; los movimientos
(cobros/pagos sobre cuentas) entran en una fase posterior.

El módulo debe permitir:

- Registrar una **Caja** (efectivo) con nombre, moneda y saldo inicial.
- Registrar un **Banco** (cuenta bancaria) con nombre, banco, número de
  cuenta, CCI, moneda y saldo inicial.
- Editar y dar de baja (soft-delete) cuentas.
- Filtrar el listado por tipo (Cajas / Bancos / Todos).

## Decisiones confirmadas con el usuario

1. **Modelo de datos:** tabla nueva `cash_account` en Supabase (no se
   extiende `entidad`).
2. **Path del módulo:** `/cajas-bancos/listado`.
3. **Saldo inicial:** editable, default 0.

## Decisiones técnicas (documentadas aquí)

1. **Sidebar:** item principal (top-level), entre el grupo MAESTRO y
   VENTAS. Icono: `Landmark`. Cambió desde el diseño original (estaba
   como sub-item de MAESTRO) para reflejar que Cajas y Bancos es un
   dominio operativo y no un maestro.
3. **Catálogo de bancos:** texto libre al inicio (`bank_name`). No se
   crea catálogo aparte.
4. **Soft-delete:** campo `deleted_at`, mismo patrón que `entidad`.
5. **Monedas:** columna `currency text default 'PEN'`. Aunque ahora
   solo soportemos soles, dejamos la puerta abierta.
6. **RLS:** NO se habilita en esta migración, por consistencia con el
   resto del proyecto (`entidad`, `payment`, `comprobante` no tienen
   RLS). Riesgo de seguridad documentado; queda como mejora futura.
7. **Movimientos** sobre cuentas NO entran en esta fase (fase 2).

## Cambios

### A. Migración SQL

Archivo nuevo:
`supabase/migrations/<ts>_create_cash_account.sql`

- `create type public.cash_account_type as enum ('CASH_BOX', 'BANK_ACCOUNT')`.
- `create table public.cash_account (...)` con:
  - `id uuid primary key default gen_random_uuid()`
  - `type public.cash_account_type not null`
  - `name text not null`
  - `currency text not null default 'PEN'`
  - `bank_name text` (nullable)
  - `account_number text` (nullable)
  - `cci text` (nullable)
  - `opening_balance numeric(12,2) not null default 0`
  - `opening_balance_date date not null default current_date`
  - `notes text` (nullable)
  - `is_active boolean not null default true`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
  - `deleted_at timestamptz` (nullable)
- `check (char_length(name) >= 1)`
- `check ((type='BANK_ACCOUNT' and bank_name is not null) or
         (type='CASH_BOX' and bank_name is null and account_number is null and cci is null))`
- Índices:
  - `(type)`
  - `(deleted_at)`
  - parcial `(is_active) where deleted_at is null`
- Trigger `set_updated_at` que actualiza `updated_at` en cada UPDATE.

### B. Tipos de Supabase

`lib/supabase/types.ts`: añadir bloque `cash_account` con Row/Insert/Update
y `Enums.cash_account_type`. Se regenera con `npm run gen:types` si el
CLI está disponible; si no, se edita manualmente.

### C. Schemas

Archivo nuevo: `lib/schemas/cash-account.ts`

- `cashAccountTypeSchema`: z.enum(['CASH_BOX', 'BANK_ACCOUNT']).
- `cashAccountFormSchema`: discriminated union o refinements condicionales
  por tipo. Para `BANK_ACCOUNT`, `bankName` obligatorio;
  `accountNumber` y `cci` opcionales pero normalizados.

### D. Capa de datos

Archivo nuevo: `lib/cuentas/entidades.ts`

- `listCashAccounts({ includeDeleted?: boolean }): Promise<CashAccount[]>`
- `createCashAccount(values: CashAccountFormValues): Promise<CashAccount>`
- `updateCashAccount(id: string, values: CashAccountFormValues): Promise<CashAccount>`
- `softDeleteCashAccount(id: string): Promise<void>`

Misma forma que `lib/clientes/entidades.ts` (mapeo Row → CashAccount, error
mapErrors).

### E. Provider

Archivo nuevo: `components/cajas-bancos/cajas-bancos-provider.tsx`

Context con `accounts`, `isLoading`, `error`, `refresh`, `addAccount`,
`updateAccount`, `removeAccount`. Mismo patrón que `clientes-provider`.

### F. UI

Archivos nuevos en `components/cajas-bancos/`:

- `cash-account-form.tsx` — formulario con RHF + Zod.
- `cash-account-modal.tsx` — modal de crear/editar/eliminar (mismo patrón
  que `client-modal`).
- `cash-account-detail-modal.tsx` — opcional, ver detalles y eliminarlos.
- `cash-accounts-columns.tsx` — columnas del data table.
- `cash-accounts-data-table.tsx` — tabla con TanStack.
- `cajas-bancos-listado-view.tsx` — vista cliente con toolbar + filtros.

### G. Página y layout

- `app/cajas-bancos/listado/page.tsx` — server page.
- `app/layout.tsx` — envolver con `<CajasBancosProvider>`.
- `components/app-sidebar.tsx` — añadir ítem `Cajas y Bancos` como
  entrada top-level (entre MAESTRO y VENTAS).

### H. Tests

- `tests/unit/lib/cuentas/cuentas.test.ts` — CRUD con mocks de supabase.
- `tests/components/cash-account-form.test.tsx` — render del formulario
  (validaciones condicionales, errores).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| El proyecto actual no tiene RLS; saltarla en `cash_account` deja el mismo riesgo que en el resto | Documentado como mejora futura; no habilitar RLS parcial sería inconsistente |
| `npm run gen:types` puede fallar (CLI no disponible); `lib/supabase/types.ts` queda en 0 bytes | Backup con `git checkout HEAD -- lib/supabase/types.ts`; edición manual como fallback |
| El campo `opening_balance` no genera un "movimiento" porque no existe tabla de movimientos aún | Aceptado; cuando exista, el saldo se calculará desde `opening_balance` + suma de movimientos |
| El saldo inicial es editable incluso después de crear la cuenta | Permitido (sin movimientos aún); en fase 2 se cierra esa puerta |
| _(Resuelto)_ Sidebar promovido de sub-item de MAESTRO a item top-level (commit `96eab45`) | QA manual + screenshot |

## Evidencia de cierre

- `npm run lint` pasa.
- `npm test` pasa (incluyendo los 2 nuevos archivos de tests).
- `npm run build` pasa.
- Verificación manual en el navegador: registrar una caja y un banco,
  ver el listado, editar, eliminar, filtrar por tipo.