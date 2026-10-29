# SPEC 60 — Entornos dev y producción separados

> **Status:** Draft
> **Depends on:** SPEC 56, SPEC 57, SPEC 58, SPEC 59
> **Date:** 2026-10-29
> **Objective:** Separar el entorno de desarrollo del de producción recuperando el historial real de migraciones desde la base, sin Docker, y dejar todas las herramientas locales apuntando a dev.

## Why this spec exists

La app está desplegada en Vercel y **Production apunta a `hurattoyvarlfdydvugd`** (proyecto `gestion-comercial`): la base con datos reales, el usuario del dueño y el historial de migraciones. Ese mismo proyecto es el que usan hoy el `.env` local y el MCP de Supabase de `opencode.json`. No hay separación de entornos: **cualquier prueba local escribe en producción**.

Se creó `gestion-comercial-dev` (`dzbtcisqvnoplsfrakbs`), que está vacío y debe pasar a ser el destino de todo el trabajo de desarrollo.

Dos hechos del repo condicionan el cómo:

1. **El repo no puede reconstruir la base desde cero.** `entidad`, `comprobante`, `payment` y `payment_allocation` se crearon por migración, pero esos archivos nunca se guardaron en `supabase/migrations/`. Hay 31 archivos locales frente a 47 versiones en el historial de producción: **11 archivos locales tienen otro timestamp que la migración real** (specs 49–57 se aplicaron por MCP con la hora real) y **27 versiones del historial no tienen archivo**.
2. **El seed está atado al usuario de producción.** `supabase/seed-semana.sql` declara `v_owner := '7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782'` y `owner_id` tiene FK a `auth.users(id)`, así que en dev hay que usar el UUID del usuario de dev.

**No se usa Docker.** En Windows el CLI de Supabase no tiene binario nativo de `pg_dump` y `db dump` exige un contenedor. En su lugar se aprovecha que Supabase guarda el SQL de cada migración aplicada en `supabase_migrations.schema_migrations.statements`: se lee de producción y se reaplica en dev. Son 47 migraciones y 188 KB de SQL, ya verificado.

Efecto secundario valioso: el repo recupera las 27 migraciones perdidas y queda alineado con la base real.

## Scope

**In:**

1. **Recuperar el historial real de migraciones:**
   - Script `scripts/db.mjs` (modo `export`) con la dependencia de desarrollo `pg`, que lee `version`, `name` y `statements` de `supabase_migrations.schema_migrations` en producción y escribe los archivos faltantes en `supabase/migrations/<version>_<name>.sql`.
   - Reporta los 11 archivos locales huérfanos (versión inexistente en la base) y se eliminan: son duplicados con otro timestamp de migraciones que sí existen.
   - Resultado: **47 archivos = 47 versiones** del historial real.
2. **Preparar dev:**
   - `create schema if not exists private;` (ninguna migración lo crea y varias funciones viven ahí).
   - Verificar que `pgcrypto` y `uuid-ossp` existen en el esquema `extensions` (vienen por defecto).
3. **Aplicar el esquema a dev** con `npx supabase db push --db-url "<DEV_URL>"` (conexión directa, sin Docker). Deben aplicarse las 47.
4. **Verificar paridad con producción:** tablas, vistas, funciones (`public` + `private`), policies, triggers y enums; `security_invoker` en `payment_balance` y `voucher_balance`; advisors de seguridad. Dev queda con **0 filas** en las tablas de negocio.
5. **Auth de dev:** usuario del dueño con auto-confirm, Site URL `http://localhost:3000`, redirect `http://localhost:3000/**`, signup **OFF**, anonymous **OFF**, mínimo 12.
6. **Datos de prueba en dev:** `supabase/seed-semana.sql` con `v_owner` reescrito al UUID del usuario de dev, aplicado con `scripts/db.mjs` (modo `run`). El archivo original no se modifica.
7. **Herramientas locales apuntando a dev:**
   - `.env`: URL, publishable key y password de dev.
   - `supabase link --project-ref dzbtcisqvnoplsfrakbs` (así `npm run gen:types` genera desde dev).
   - `opencode.json`: `project_ref` del MCP a dev, y reinicio de OpenCode.
8. **Vercel:** Production sin cambios (se verifica); Preview apuntando a dev; Ignored Build Step = *Only build production*.
9. **Smoke local contra dev:** login, ventas, compras, pagos, caja y cuadres, con verificación de que producción no cambió.
10. **Documentación y cierre:** `docs/operacion/entornos.md` con la matriz de entornos y el procedimiento de migración a producción; SPEC 59 marcada `Obsoleto`.

**Out of scope (for future specs):**

- CI, `db diff` de reconciliación continua, `gen:types` automático y protección de rama.
- Sentry, uptime, backups/PITR y restore probado.
- CSP en modo enforce.
- Dominio propio (se mantiene el `vercel.app`).
- Migrar datos de producción a dev (dev nace del esquema + seed).
- Previews por PR con base propia.
- Tercer entorno *staging*: producción y dev alcanzan para una sola persona.
- Cambios de código de la app. Solo se agregan scripts de base y se toca configuración no versionada, `opencode.json` y `docs/`.

## Data model

**No introduce estructuras de datos nuevas.** No hay cambios de esquema ni de tipos. Artefactos que aparecen o cambian:

| Artefacto | Tipo | Versionado |
| --- | --- | --- |
| `supabase/migrations/<version>_<name>.sql` (27 nuevos) | SQL recuperado de la base | Sí |
| 11 archivos de migración locales duplicados | Se eliminan | Sí |
| `scripts/db.mjs` | Exportar historial y ejecutar archivos SQL | Sí |
| `package.json` | `pg` como devDependency y scripts `db:export` / `db:run` | Sí |
| `supabase/.temp/seed-semana-dev.sql` | Copia del seed con `v_owner` de dev | No (`.temp/` ignorado) |
| `docs/operacion/entornos.md` | Matriz de entornos y procedimiento | Sí |
| `opencode.json` | Una línea: `project_ref` del MCP | Sí |
| `.env` | URL, publishable key y password de dev | No |

## Implementation plan

1. **Preparar credenciales y URLs.** Anotar `REF_PROD=hurattoyvarlfdydvugd`, `REF_DEV=dzbtcisqvnoplsfrakbs` y las contraseñas de ambas bases. Obtener las dos connection strings del dashboard (Connect). Para dev usar el **session pooler**: los proyectos nuevos son IPv6-only en conexión directa. Sin cambios en el repo; la app sigue igual.

2. **Crear `scripts/db.mjs` y agregar `pg`.** Dos modos:
   - `node scripts/db.mjs export --url <PROD_URL>`: consulta `supabase_migrations.schema_migrations` ordenado por `version`, escribe los archivos que faltan en `supabase/migrations/` y lista los archivos locales cuya versión no existe en la base. Con `--all` reescribe los 47.
   - `node scripts/db.mjs run --url <DEV_URL> -f <archivo.sql>`: ejecuta un archivo completo en una transacción y falla en el primer error.
   - `package.json`: `"db:export": "node scripts/db.mjs export"`, `"db:run": "node scripts/db.mjs run"`.

3. **Exportar el historial de producción.** Correr el modo `export` contra producción (solo lectura). Deben aparecer 27 archivos nuevos y 11 huérfanos. Revisar el diff: son ~150 KB de SQL de migraciones ya aplicadas.

4. **Eliminar los 11 duplicados.** Son las versiones locales de specs 49–57 con timestamp inventado; las reales ya entraron en el paso anterior. Después de borrarlos, `supabase/migrations/` tiene 47 archivos con las 47 versiones reales.

5. **Preparar dev.** `create schema if not exists private;` y verificar extensiones:

   ```sql
   select e.extname, n.nspname from pg_extension e
   join pg_namespace n on n.oid = e.extnamespace order by 1;
   ```

   Deben estar `pgcrypto` y `uuid-ossp` en `extensions`.

6. **Aplicar el esquema a dev.**

   ```powershell
   npx supabase db push --db-url "<DEV_SESSION_POOLER_URL>"
   ```

   Debe aplicar las 47 migraciones en orden y dejar `supabase_migrations.schema_migrations` con 47 filas. No usa Docker.

7. **Verificar paridad con producción.** Comparar en ambos proyectos: 18 tablas, 2 vistas, 31 funciones (`public` + `private`), 39 policies, 31 triggers y 11 enums. Comprobar `security_invoker=true` en `payment_balance` y `voucher_balance`, y correr advisors de seguridad. Confirmar 0 filas en `entidad`, `comprobante`, `payment`, `payment_allocation`, `cash_account`, `cash_close`, `cash_transfer`, `voucher_series` y `receipt_sequence`. Si falta algún objeto, se crea una migración de catch-up con el delta.

8. **Auth de dev.** Crear el usuario del dueño desde el dashboard con auto-confirm (procedimiento de `docs/operacion/crear-usuario.md`), Site URL `http://localhost:3000`, redirect `http://localhost:3000/**`, signup OFF, anonymous OFF, mínimo 12. Anotar el UUID.

9. **Sembrar dev.** Generar la copia con el UUID de dev y aplicarla:

   ```powershell
   (Get-Content supabase/seed-semana.sql) `
     -replace '7f9e00ea-c5a0-4ddb-b72c-4f6ad912f782', '<UUID_DEV>' |
     Set-Content supabase/.temp/seed-semana-dev.sql
   npm run db:run -- --url "<DEV_SESSION_POOLER_URL>" -f supabase/.temp/seed-semana-dev.sql
   ```

   Verificar los conteos del encabezado del seed: 29 comprobantes de venta (28 + 1 nota de crédito), 12 compras, 45 recibos (28 ingresos / 17 egresos, 1 anulado), 60 asignaciones, 7 cierres de Caja General y 1 cierre semanal de Banco BCP.

10. **Reapuntar las herramientas locales.** `.env` a dev; `npx supabase link --project-ref dzbtcisqvnoplsfrakbs`; en `opencode.json` cambiar `project_ref=hurattoyvarlfdydvugd` por `project_ref=dzbtcisqvnoplsfrakbs` y reiniciar OpenCode. Verificar con `get_project_url` que devuelve `https://dzbtcisqvnoplsfrakbs.supabase.co`.

11. **Vercel.** Confirmar que Production conserva las variables de producción (no se tocan). Poner las variables de Preview apuntando a dev. En Settings → Build and Deployment → Ignored Build Step elegir **Only build production** (el comando devuelve 0 para cancelar el build y 1 para continuarlo). Sin cambios en Production no hace falta redeploy; si se toca una variable de Production, redeploy explícito porque `NEXT_PUBLIC_*` se incrusta en build y la CSP se arma con esa URL.

12. **Smoke local contra dev.** `npm run dev`, login con el usuario de dev y recorrido por ventas, compras, pagos, caja y cuadres. Los datos del seed deben verse (RLS con el usuario correcto). Comparar conteos de producción antes y después: deben ser idénticos.

13. **Documentación y cierre.** Escribir `docs/operacion/entornos.md` con la matriz (entorno, project ref, dónde viven las variables, quién escribe), el procedimiento de migración a producción y la regla de `--project-ref` explícito. Marcar SPEC 59 como `Obsoleto` y esta como `Implementado` cuando todo pase.

## Acceptance criteria

- [ ] `supabase/migrations/` contiene 47 archivos y sus versiones coinciden exactamente con las 47 filas de `supabase_migrations.schema_migrations` de producción.
- [ ] Los 11 archivos duplicados (specs 49–57 con timestamp inventado) ya no existen.
- [ ] `npx supabase db push` aplica 47/47 migraciones en dev sin errores.
- [ ] Dev tiene 18 tablas, 2 vistas, 31 funciones (`public` + `private`), 39 policies, 31 triggers y 11 enums, igual que producción.
- [ ] `payment_balance` y `voucher_balance` existen en dev con `security_invoker=true`.
- [ ] Los advisors de seguridad de dev no reportan hallazgos nuevos respecto a producción.
- [ ] Antes del seed, dev tiene 0 filas en `entidad`, `comprobante`, `payment`, `payment_allocation`, `cash_account`, `cash_close`, `cash_transfer`, `voucher_series` y `receipt_sequence`.
- [ ] `.env` apunta a `https://dzbtcisqvnoplsfrakbs.supabase.co` y `get_project_url` del MCP devuelve esa misma URL.
- [ ] El login local funciona con el usuario de dev y el dashboard carga sin errores de consola.
- [ ] Tras el seed, dev muestra 29 comprobantes de venta, 12 compras, 45 recibos y 7 cierres de Caja General.
- [ ] Producción conserva exactamente los mismos conteos de filas que antes de empezar.
- [ ] Un push a una rama distinta de `main` no genera deployment en Vercel.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` y `npm run build` en verde.
- [ ] `docs/operacion/entornos.md` existe con la matriz de entornos y el procedimiento de migración.
- [ ] SPEC 59 marcada `Obsoleto`.

## Decisions

- **Sí:** recuperar el historial desde `supabase_migrations.schema_migrations.statements`. **No:** `pg_dump` ni baseline por contenedor: en Windows el CLI exige Docker.
- **Sí:** `pg` como devDependency y un script propio. **No:** copiar 188 KB de SQL a mano por el chat ni instalar el cliente de PostgreSQL.
- **Sí:** reemplazar los 11 archivos duplicados por las migraciones reales. **No:** conservar dos historiales paralelos.
- **Sí:** `db push --db-url` para aplicar. **No:** `apply_migration` por MCP para el alta inicial: asignaría timestamps nuevos y rompería la paridad de versiones.
- **Sí:** bootstrap manual de `create schema private`. **No:** inventar una migración nueva para algo que en producción tampoco está versionado.
- **Sí:** verificar paridad por conteo de objetos. **No:** dar por hecho que el replay reproduce la base: puede haber cambios hechos fuera de migraciones.
- **Sí:** session pooler para dev. **No:** conexión directa: los proyectos nuevos son IPv6-only.
- **Sí:** `--project-ref` explícito en todo comando que escriba. **No:** confiar en `--linked` para operaciones destructivas.
- **Sí:** dev como destino por defecto de `.env`, CLI y MCP. **No:** dejar producción como default: es el error que motiva esta spec.
- **Sí:** `seed-semana.sql` con `v_owner` reescrito en una copia. **No:** editar el archivo original.
- **Sí:** previews deshabilitados con *Only build production*. **No:** previews por PR contra producción.
- **No:** tercer entorno *staging*: una sola persona no lo justifica.

## Risks

| Risk | Mitigation |
| --- | --- |
| Alguna migración del historial depende de un cambio hecho fuera de migraciones y el replay falla | Se corrige con una migración de catch-up; la verificación de conteos la detecta |
| `private` no lo crea ninguna migración | Bootstrap explícito antes del `db push` |
| La conexión directa de dev es IPv6-only | Usar el session pooler en `--db-url` |
| `statements` no refleja cambios manuales posteriores | Comparar catálogos prod vs dev; el delta se corrige con migración |
| `db push` se corta a la mitad | Cada migración va en su transacción; revisar `schema_migrations` y reintentar |
| Se marca como aplicada una migración que no lo está | Solo se aplican archivos que existen en el historial real; no hay reparación a ciegas |
| El seed falla por FK a `auth.users` | Crear el usuario de dev primero y reescribir `v_owner` con su UUID |
| El MCP sigue apuntando a producción | Reiniciar OpenCode y verificar con `get_project_url` antes de cualquier SQL |
| El script exporta SQL equivocado | Modo `export` es de solo lectura y el diff se revisa antes de commitear |
| El plan Free pausa dev por inactividad | Reactivarlo en el dashboard; anotar la política en `entornos.md` |
| Producción cambia sin querer | Conteos de filas y advisors comparados antes y después |

## What is **not** in this spec

CI, `db diff` de reconciliación continua, `gen:types` automático, Sentry, backups/PITR, restore probado, CSP enforce, dominio propio, migración de datos de producción a dev, previews por PR y cambios de código de la app.

Cada uno de esos, si llega, va en su propia spec.
