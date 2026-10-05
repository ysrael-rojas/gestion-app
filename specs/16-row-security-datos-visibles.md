# SPEC 16 — Row Security operativa: datos visibles y esquema a prueba de seeds sin sesión

> **Estado:** Aprobado
> **Depende de:** SPEC 06, SPEC 07, SPEC 08, SPEC 09, SPEC 13
> **Fecha:** 2026-10-05
> **Objetivo:** Hacer que la app muestre los datos existentes (hoy invisibles por RLS con `owner_id` nulo), agregar las políticas DELETE faltantes y endurecer el esquema para que inserts sin sesión de Auth no vuelvan a crear filas huérfanas.

---

## 1 — Por qué existe esta spec (diagnóstico)

La app inserta en la DB apoyándose en el trigger `set_owner_id_on_insert()`: si `owner_id` viene nulo, lo rellena con `auth.uid()`.

El problema: las filas actuales se insertaron **sin sesión de Auth activa** (seed manual vía SQL/MCP), así que `auth.uid()` era `NULL` y el trigger no rellenó nada. El resultado:

| Tabla | Filas | Filas con `owner_id = NULL` |
|---|---|---|
| `entidad` | 18 | **18** |
| `comprobante` | 8 | **8** |
| `payment` | 7 | **7** |

Con `owner_id = NULL`, la política RLS de SELECT (`owner_id = auth.uid()`) no matchea a ningún usuario, así que **la app filtra todo y muestra las tablas vacías** aunque en la DB sí haya datos.

Además, las políticas cubren SELECT / INSERT / UPDATE, pero **falta la política de DELETE** en las 5 tablas → el botón de eliminar de la app fallaría aunque los datos fueran visibles.

---

## 2 — Scope

**In:**

- Limpiar las filas huérfanas actuales (33 en total: 18 `entidad`, 8 `comprobante`, 7 `payment`, más sus 9 `payment_allocation`), respetando el orden de las FKs.
- Hardening del esquema: convertir `owner_id` en `NOT NULL` con `DEFAULT auth.uid()` en `entidad`, `comprobante`, `payment`, `payment_allocation` y `cash_account`.
- Agregar políticas RLS de DELETE (`USING (owner_id = auth.uid())`) en las 5 tablas.
- Ajustar el trigger `set_owner_id_on_insert()` a un rol de respaldo (el DEFAULT cubre el caso normal; el trigger queda para compatibilidad).

**Out of scope:**

- Cambiar el modelo de tenancy (sigue siendo 1 usuario = 1 owner).
- Tocar `receipt_sequence` (no tiene `owner_id`; su lógica no cambia).
- Migrar datos entre usuarios ni permisos compartidos.
- Cambiar la capa de datos cliente (`lib/clientes/`, `lib/pagos/`, etc.).
- Compartir datos entre los dos usuarios existentes (`ysrael@google.com` y `yrra_rojas@hotmail.com`).

---

## 3 — Modelo de datos

Esta spec no introduce estructuras nuevas. Modifica restricciones y políticas sobre el esquema de las specs 06–13.

| Tabla | Columna | Antes | Después |
|---|---|---|---|
| `entidad`, `comprobante`, `payment`, `payment_allocation`, `cash_account` | `owner_id` | nullable, sin default, el trigger lo rellena si hay sesión | `NOT NULL DEFAULT auth.uid()` |

`receipt_sequence` queda fuera: no tiene `owner_id` ni políticas propias.

---

## 4 — Plan de implementación

Cada paso es una migración con `apply_migration`, nombre snake_case, y deja la DB funcional.

1. **Migración `delete_orphan_rows_before_not_null`**
   - `DELETE FROM payment_allocation;` (9 filas, hoja del grafo de FKs)
   - `DELETE FROM payment;` (7 filas)
   - `DELETE FROM comprobante;` (8 filas)
   - `DELETE FROM entidad;` (18 filas)
   - Orden obligatorio por las FKs de SPEC 13. Queda `receipt_sequence` intacta (su fila no depende de `owner_id`).
   - Decisión tomada en la fase de preguntas: los datos son de prueba y se reingresan desde la app; si prefirieras conservarlos, el paso sería `UPDATE ... SET owner_id = '7f9e00ea-...'` en lugar del DELETE.

2. **Migración `harden_owner_id_not_null_with_default`**
   - Para las 5 tablas: `ALTER TABLE ... ALTER COLUMN owner_id SET DEFAULT auth.uid();` y `ALTER TABLE ... ALTER COLUMN owner_id SET NOT NULL;`
   - Sin filas NULL (paso 1), el `SET NOT NULL` no puede fallar por datos existentes.
   - Efecto: un INSERT vía API (REST autenticado) sin `owner_id` explícito lo toma del DEFAULT `auth.uid()`; un INSERT desde SQL/MCP **sin sesión** evalúa `auth.uid()` como NULL y **rechaza el insert** (viola NOT NULL). Esto es exactamente el comportamiento preventivo acordado.

3. **Migración `add_delete_policies`**
   - `CREATE POLICY "<tabla>_delete" ON <tabla> FOR DELETE TO authenticated USING (owner_id = auth.uid());`
   - Para: `entidad`, `comprobante`, `payment`, `payment_allocation`, `cash_account`.

4. **Verificación estructural** (una sola consulta `execute_sql`):
   - `pg_policies` debe listar 4 políticas por tabla (select/insert/update/delete), todas `TO authenticated` y con `owner_id = auth.uid()`.
   - `pg_class` debe confirmar RLS habilitado en las 6 tablas.

5. **Verificación funcional en la app (manual, una vez terminado el código):**
   - Con sesión activa como `yrra_rojas@hotmail.com`: Clientes, Ventas, Pagos y Cajas/Bancos muestran estado vacío limpio (los datos de prueba se eliminaron en el paso 1).
   - Crear un cliente desde la app → aparece en el listado y en la DB con `owner_id` asignado (por DEFAULT, no por trigger).
   - Eliminar ese cliente desde la app → se elimina (la política DELETE funciona).

El paso 5 se hará durante `/spec-impl`; aquí solo se deja documentado.

---

## 5 — Criterios de aceptación

- [ ] Tras las migraciones, ninguna tabla tiene filas con `owner_id IS NULL` (la restricción NOT NULL lo garantiza estructuralmente).
- [ ] Las 5 tablas con `owner_id` tienen exactamente 4 políticas RLS cada una (select/insert/update/delete), todas `TO authenticated` con `owner_id = auth.uid()`.
- [ ] Con sesión activa en la app, crear un cliente lo hace aparecer en el listado inmediatamente.
- [ ] El cliente recién creado se puede eliminar desde la app (política DELETE operativa).
- [ ] Un INSERT vía SQL/API **sin sesión** falla con violación de NOT NULL en `owner_id` (ya no se crean filas invisibles).
- [ ] Un INSERT vía API **con sesión** funciona sin especificar `owner_id` (DEFAULT `auth.uid()`).
- [ ] Los advisors de seguridad de Supabase no reportan políticas faltantes ni tablas sin RLS.
- [ ] `npm run lint && npm test && npm run build` pasan (no hubo cambios de código TS, pero se validan regresiones).

---

## 6 — Decisiones tomadas y descartadas

- **Sí:** eliminar los datos de prueba en vez de reasignarlos. Es data de prueba y se reingresa desde la app, que a partir de ahora asigna `owner_id` por DEFAULT sin depender del trigger.
- **No:** reasignar las filas huérfanas a `yrra_rojas@hotmail.com` (`7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782`). Era la alternativa; se descartó porque conservar el historial de prueba no aporta valor y reasignar filas huérfanas con referencias cruzadas (allocation → voucher → payment → entidad) es más frágil que borrarlas todas.
- **Sí:** `NOT NULL DEFAULT auth.uid()` como mecanismo preventivo. Resuelve la clase de bug ("insert sin sesión genera filas invisibles") a nivel de esquema, no de trigger.
- **No:** mantener el trigger como único mecanismo. Antes de esta spec, un insert sin sesión dejaba `owner_id` NULL silenciosamente; con NOT NULL la DB rechaza la operación y el error es explícito.
- **Sí:** agregar las políticas DELETE en la misma spec. La app ya tiene flujo de eliminación (soft delete vía `deleted_at` en `entidad`, hard delete en otras entidades) y sin política DELETE fallaría siempre.
- **No:** retocar `set_owner_id_on_insert()`. El trigger queda como respaldo para inserts que traigan su propio `owner_id` y no rompe nada con el DEFAULT; modificarlo solo agrega riesgo sin beneficio.

---

## 7 — Riesgos

| Riesgo | Mitigación |
|---|---|
| El DELETE masivo borra datos que el usuario quería conservar | Se confirmó explícitamente en la fase de preguntas. Si se arrepiente, el seed desde la app es rápido (clientes + 2 comprobantes). |
| Alguna FK con `ON DELETE RESTRICT` bloquea el borrado en cascada manual | El plan ya ordena los DELETE de hoja a raíz (allocation → payment → comprobante → entidad). Si aparece una FK no prevista, la migración lo reporta y se ajusta el orden. |
| `cash_account` hoy tiene 0 filas, así que su backfill era no-op | El hardening aplica igual (NOT NULL + DEFAULT) para prevenir el mismo bug a futuro. |

---

## 8 — Qué NO está en esta spec

- Cambiar políticas a `public` o `service_role` (inseguro).
- Bloquear SQL directo o acceso por MCP (solo se restringe lo que entra por la API autenticada).
- Re-triularizar `receipt_sequence` (no tiene `owner_id`, su lógica no cambia).
- Compartir datos entre los dos usuarios de Auth.
- Cambiar la capa de datos cliente (`lib/`).

Cada uno, si algún día aterriza, va en su propia spec.

---

## Recordatorio de flujo

La spec queda en **Borrador**. Cámbialo a **Aprobado** cuando la revises. Después, `/spec-impl 16-row-security-datos-visibles` para implementar (creará rama y avanzará por pasos).
