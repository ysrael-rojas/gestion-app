# SPEC 06 — Conexión de clientes a Supabase (tabla `entidad`)

> **Status:** Aprobado
> **Depends on:** SPEC 01, SPEC 03, SPEC 05
> **Date:** 2026-09-28
> **Objective:** Persistir en Supabase (tabla `entidad`) el registro, listado, edición y baja lógica de clientes de `/clientes/listado`, sustituyendo el estado en memoria del `ClientesProvider` por acceso a la base de datos.

## Why this spec exists

Hasta ahora todos los specs de clientes y ventas viven en memoria y se pierden al recargar. Esta spec introduce la primera tabla real y rompe el patrón en memoria, así que define el modelo de conexión y datos que usarán los specs siguientes (proveedores, productos, ventas). La tabla se llama `entidad` porque debe representar clientes, proveedores o ambos.

## Scope

**In:**

- Instalar `@supabase/supabase-js` y crear el cliente browser en `lib/supabase/client.ts`.
- Añadir `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` a `.env` y `.env.template`.
- Crear el tipo Postgres `document_type` con `SIN_DOCUMENTO`, `RUC`, `DNI`, `CARNET_EXTRANJERIA`.
- Crear la tabla `public.entidad` con los 8 campos de cliente actuales + `is_client`, `is_supplier` + `created_at`, `updated_at`, `deleted_at`.
- RLS activado con políticas permisivas para `anon` y `authenticated`.
- Baja lógica: `Eliminar` setea `deleted_at`; las consultas filtran `deleted_at is null`.
- Capa de acceso a datos `lib/clientes/entidades.ts` (listar, crear, actualizar, baja lógica).
- Reescribir `components/clientes/clientes-provider.tsx` como provider asíncrono con `clients`, `isLoading`, `error`, `refresh`, `addClient`, `updateClient`, `removeClient`.
- Actualizar `app/clientes/listado/page.tsx` a handlers asíncronos, con skeleton al cargar y toast de error si una operación falla.
- Mantener intactas las validaciones actuales (nombre y correo de facturación obligatorios) y el formulario; solo cambia la persistencia.
- Mantener funcionando `/ventas/listado`, que consume `useClientes()`.

**Out of scope (for future specs):**

- UI de proveedores y cualquier campo/toogle de `is_supplier`; esta spec siempre crea entidades con `is_client = true` e `is_supplier = false`.
- Autenticación, sesiones y RLS por usuario.
- Persistir ventas u otras entidades en la DB (siguen en memoria).
- Migración de datos en memoria existentes (no hay datos previos que conservar).
- Búsqueda/orden/paginación en el servidor (siguen en el cliente, sobre la lista cargada).
- Filtros por cliente/proveedor en la tabla.

## Data model

Esquema Postgres (migración `create_entidad_table` vía MCP `apply_migration`):

```sql
create type public.document_type as enum (
  'SIN_DOCUMENTO', 'RUC', 'DNI', 'CARNET_EXTRANJERIA'
);

create table public.entidad (
  id uuid primary key default gen_random_uuid(),
  document_type public.document_type not null default 'SIN_DOCUMENTO',
  document_number text not null default '',
  name text not null,
  address text not null default '',
  phone text not null default '',
  contact_name text not null default '',
  billing_email text not null,
  management_email text not null default '',
  is_client boolean not null default false,
  is_supplier boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint entidad_document_type_required check (
    (document_type = 'SIN_DOCUMENTO' and document_number = '')
    or (document_type <> 'SIN_DOCUMENTO' and length(trim(document_number)) > 0)
  ),
  constraint entidad_some_role check (is_client or is_supplier)
);

create unique index entidad_document_unique
  on public.entidad (document_type, document_number)
  where deleted_at is null and document_number <> '';

create index entidad_clientes_idx
  on public.entidad (created_at desc)
  where is_client and deleted_at is null;

-- trigger updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger entidad_set_updated_at
  before update on public.entidad
  for each row execute function public.set_updated_at();

alter table public.entidad enable row level security;

create policy entidad_select on public.entidad
  for select to anon, authenticated using (true);
create policy entidad_insert on public.entidad
  for insert to anon, authenticated with check (true);
create policy entidad_update on public.entidad
  for update to anon, authenticated using (true) with check (true);
```

Nota: no hay política de `delete` porque la baja es lógica.

Cliente browser:

```ts
// lib/supabase/client.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);
```

Capa de datos:

```ts
// lib/clientes/entidades.ts
// listClients(): Client[]            → select * where is_client and deleted_at is null order created_at desc
// createClient(values): Client       → insert { ...values, is_client: true, is_supplier: false }
// updateClient(id, values): Client   → update ... eq id
// softDeleteClient(id): void         → update { deleted_at: now } eq id
```

Provider (misma forma para no romper a ventas):

```ts
// components/clientes/clientes-provider.tsx
interface ClientesContextValue {
  clients: Client[];
  isLoading: boolean;
  error: string | null;
  addClient: (values: ClientFormValues) => Promise<void>;
  updateClient: (id: string, values: ClientFormValues) => Promise<void>;
  removeClient: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}
```

`Client` (`components/clientes/types.ts`) mantiene los 8 campos actuales. El `id` pasa a ser el `uuid` de Postgres. Se añade internamente `isClient`/`isSupplier` solo si hace falta para el mapeo; no se muestra en UI.

Convenciones:

- Columnas y API en inglés `snake_case` (AGENTS.md); tipos y campos de TS en `camelCase`.
- Etiquetas de UI en español: "Sin documento" (por defecto), "RUC", "DNI", "Carné de extranjería".
- El mapeo DB ↔ `Client` vive en `lib/clientes/entidades.ts`; los componentes no conocen `snake_case`.
- Mensajes de error al usuario en español vía `toast.error`.

## Implementation plan

1. Instalar `@supabase/supabase-js`; añadir `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` a `.env` y `.env.template`; crear `lib/supabase/client.ts`. Verificar `npm run build`.
2. Aplicar la migración `create_entidad_table` vía MCP con el SQL del data model; revisar advisors de seguridad y rendimiento; confirmar con `list_tables`.
3. Generar los tipos TS de Supabase y guardarlos en `lib/supabase/types.ts` (o, si no, declarar un tipo `EntityRow` mínimo a mano). Verificar `npm run lint`.
4. Crear `lib/clientes/entidades.ts` con `listClients`, `createClientRecord`, `updateClientRecord`, `softDeleteClient`, incluido el mapeo `snake_case → Client`.
5. Reescribir `components/clientes/clientes-provider.tsx` como provider asíncrono: carga inicial en `useEffect`, estado `isLoading`/`error`, y `addClient`/`updateClient`/`removeClient` que mutan en la DB y recargan la lista. Verificar `npm run lint`.
6. Actualizar `app/clientes/listado/page.tsx`: `handleSave` y `handleDelete` asíncronos con `try/catch` y `toast.error`; deshabilitar el submit mientras hay una operación en curso.
7. Actualizar `components/clientes/clients-data-table.tsx` para mostrar un `Skeleton` mientras `isLoading`, mantener el estado vacío y la búsqueda/orden/paginación actuales.
8. Verificar `/ventas/listado`: el selector de cliente usa los clientes de la DB y registrar una venta sigue funcionando.
9. Verificar `npm run lint` y `npm run build`.

## Acceptance criteria

- [ ] Existe la tabla `public.entidad` con las columnas, checks, índices y trigger descritos, y RLS habilitado con las 3 políticas.
- [ ] El tipo `document_type` contiene `SIN_DOCUMENTO`, `RUC`, `DNI`, `CARNET_EXTRANJERIA` y su default es `SIN_DOCUMENTO`.
- [ ] `.env.template` documenta `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `.env` las tiene con valores reales y sigue ignorado por git.
- [ ] `/clientes/listado` muestra un skeleton mientras carga y luego las filas de la DB.
- [ ] Registrar un cliente válido lo inserta en `entidad` con `is_client = true`, `is_supplier = false` y `deleted_at = null`; aparece en la tabla y persiste al recargar la página.
- [ ] Registrar con `SIN_DOCUMENTO` guarda `document_number = ''`; con `RUC`/`DNI`/`CARNET_EXTRANJERIA` exige el formato correcto.
- [ ] Un `document_number` duplicado para el mismo tipo devuelve error visible (toast) y no inserta.
- [ ] Editar un cliente actualiza la misma fila en la DB sin duplicarla.
- [ ] Eliminar setea `deleted_at` (la fila sigue en la DB), desaparece de la lista y no reaparece al recargar.
- [ ] Si una operación contra Supabase falla, se muestra un `toast.error` en español sin romper la página.
- [ ] Búsqueda global, orden por columna y paginación siguen funcionando sobre las filas cargadas.
- [ ] El modal de detalle sigue mostrando los datos del cliente.
- [ ] El selector de cliente de `/ventas/listado` lista los clientes de la DB.
- [ ] `npm run lint` y `npm run build` pasan.

## Decisions

- **Sí:** `@supabase/supabase-js` con cliente browser y claves `NEXT_PUBLIC_*`; mantiene la arquitectura de componentes cliente y no requiere reescribir la página como server component.
- **Sí:** una sola tabla `entidad` con flags `is_client`/`is_supplier`, para que una misma entidad pueda ser cliente, proveedor o ambos.
- **Sí:** desde `/clientes/listado` las entidades se crean siempre con `is_client = true` e `is_supplier = false`; no se añade UI de proveedor en esta spec.
- **Sí:** enum Postgres `document_type` con `SIN_DOCUMENTO`, `RUC`, `DNI`, `CARNET_EXTRANJERIA` y default `SIN_DOCUMENTO`; "CARNET EXTR." se interpreta como abreviatura del carné de extranjería existente.
- **Sí:** id `uuid` con `gen_random_uuid()` en Postgres.
- **Sí:** baja lógica con `deleted_at`; conserva historial y evita borrados accidentales.
- **Sí:** índice único parcial por `(document_type, document_number)` cuando no está vacío y no está borrado.
- **Sí:** RLS activado con políticas permisivas para `anon`/`authenticated` mientras no exista auth.
- **Sí:** skeleton + `toast.error` + recargar la lista tras cada mutación (sin actualización optimista).
- **Sí:** el provider conserva su forma (`clients` + operaciones) para no romper `/ventas/listado`.
- **No:** server actions / route handlers; se descartó por el alcance actual (todo cliente) y para no reescribir la página.
- **No:** proveedores en UI, auth, RLS por usuario, persistir ventas ni paginación server-side.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_*` ausente en el entorno | `createClient` falla en runtime; documentar en `.env.template` y fallar con `toast.error` legible. |
| El índice único choca con filas borradas lógicamente | El índice es parcial (`deleted_at is null`), así que una baja lógica libera el número. |
| Las políticas permisivas disparan advertencias del advisor de seguridad | Aceptado y consciente; se endurecerán al llegar la spec de auth. |
| El provider asíncrono deja vacío el selector de ventas mientras carga | Mostrar placeholder "Cargando..." y no permitir guardar hasta que haya clientes. |
| Supabase devuelve error de red o sin conexión | `try/catch` + `toast.error`; la página mantiene la lista previa. |
| Recrear el enum en el futuro requiere migración destructiva | Fijar los 4 valores ahora; cambios de valores irán en su propia migración. |
| `@supabase/supabase-js` en un componente cliente expone la publishable key | Es una clave pública por diseño; la protección real son las políticas RLS. |

## What is **not** in this spec

- UI ni lógica de proveedores (`is_supplier` queda siempre en `false`).
- Autenticación y RLS por usuario.
- Persistir ventas u otras entidades.
- Filtros por rol, paginación/orden/búsqueda en el servidor.
- Migrar datos que hoy viven en memoria.

Cada uno de esos, si aparece, va en su propia spec.
