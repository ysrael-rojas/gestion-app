# SPEC 61 — CI y guard de migraciones

> **Status:** Implementado
> **Depends on:** SPEC 58, SPEC 60
> **Date:** 2026-10-29
> **Objective:** Verificar cada PR con lint, tipos, tests y build, y bloquear el merge cuando las migraciones del repo no coincidan con la base de dev, sin depender de Docker.

## Why this spec exists

Dos huecos concretos, ambos ya pagados caros:

1. **No hay CI.** El repo no tiene `.github/`. Un PR puede llegar a `dev` con el build roto, con tests en rojo o con tipos que no compilan; el primero en enterarse es el deploy de Vercel o, peor, el dueño usando la app.
2. **Nadie vigila la deriva de migraciones.** En la SPEC 60 descubrimos que el repo tenía 31 archivos frente a 47 versiones en la base: 27 migraciones aplicadas nunca se guardaron y 11 archivos tenían un timestamp inventado. Eso estuvo así semanas sin que nada lo detectara, y el costo fue reconstruir el historial leyendo `schema_migrations.statements`.

El guard de migraciones es el corazón de esta spec: convierte "acordarse de commitear el archivo" en un check que falla solo.

## Scope

**In:**

1. **Workflow `.github/workflows/ci.yml`** que corre en `pull_request` contra `dev` y `main`, con dos jobs:
   - **`checks`**: `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`. Node 24 (igual que local y que Vercel), caché de npm y `concurrency` para cancelar runs viejos del mismo PR.
   - **`migraciones`**: `npm run db:export -- --check --url "$SUPABASE_DB_URL_DEV"` con el secret `SUPABASE_DB_URL_DEV`. Solo lectura.
2. **Modo `--check` en `scripts/db.mjs`**: el modo `export` deja de escribir cuando se pasa `--check`; en su lugar informa y sale con código 1 si falta algún archivo de migración o si hay archivos locales cuya versión no existe en la base.
3. **Protección de ramas**: exigir los dos checks en `main` y en `dev` mediante `gh api`, manteniendo lo que ya tiene `main` (PR obligatorio, sin force push, sin borrado).
4. **Documentación**: sección "CI" en `docs/operacion/entornos.md` y regla en `AGENTS.md` (qué corre en cada PR y cómo se ve un fallo por deriva).

**Out of scope (for future specs):**

- **E2E en CI.** Playwright necesita una base con el seed semanal y credenciales reales; se queda como verificación manual antes de liberar.
- **Observabilidad y backups**: Sentry, uptime, backups/PITR, restore probado y CSP en enforce → **SPEC 62**.
- **`db diff`**: exige Docker, que está descartado. La comparación se hace con `db:export`, que lee `schema_migrations` directamente.
- **Dependabot / Renovate** y actualizaciones automáticas de dependencias.
- **Deploy desde CI**: Vercel ya despliega por integración con Git.
- **Nightly / cron** de cualquier tipo.
- **Cambios de código de la app**: solo el script de base y la configuración.

## Data model

**No introduce estructuras de datos.** Artefactos que aparecen o cambian:

| Artefacto | Tipo | Versionado |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Workflow de GitHub Actions | Sí |
| `scripts/db.mjs` | Nuevo flag `--check` en el modo `export` | Sí |
| `docs/operacion/entornos.md` | Sección "CI" | Sí |
| `AGENTS.md` | Regla de checks por PR | Sí |
| Protección de `main` y `dev` | Configuración en GitHub | No (externo) |

## Implementation plan

1. **Agregar `--check` a `scripts/db.mjs`.** En modo `export --check`: no escribe archivos, informa faltantes y huérfanos, y sale con código 1 si hay cualquiera de los dos. Sin `--check` se comporta como hoy.

2. **Probarlo local contra dev.** Con el repo alineado debe salir `0`. Para probar el fallo: renombrar temporalmente un archivo de `supabase/migrations/` a una versión inexistente, correr otra vez (debe salir `1` y nombrar el archivo), y restaurarlo.

3. **Crear `.github/workflows/ci.yml`** con los dos jobs, `on: pull_request: branches: [dev, main]`, `permissions: contents: read` y `concurrency` por PR.

4. **Abrir el PR de la spec y ver los dos jobs en verde** en la pestaña Actions. Si `migraciones` falla por conexión, revisar que el secret exista y que el proyecto dev no esté pausado.

5. **Configurar los checks requeridos** en `main` y en `dev` con `gh api`, usando los nombres exactos de los jobs. Verificar con `gh api .../protection` que quedaron listados.

6. **Probar el candado de verdad.** En una rama de prueba: renombrar una migración, abrir PR a `dev`, comprobar que `migraciones` falla y que GitHub muestra el merge bloqueado. Cerrar el PR sin mergear y borrar la rama.

7. **Documentar** en `docs/operacion/entornos.md` (qué corre, cuánto tarda, qué hacer si falla por deriva o por base pausada) y en `AGENTS.md` (regla de una línea).

## Acceptance criteria

- [x] `npm run db:export -- --check` contra dev, con el repo alineado, sale con código `0` (48 archivos = 48 versiones).
- [x] Con un archivo de migración con versión inexistente, el mismo comando sale con código `1` y nombra el archivo.
- [x] `--check` no escribe ni modifica ningún archivo del repo (verificado con `git status` después de correrlo).
- [x] El workflow corre en PRs contra `dev` (verificado con #74 y #75) y está configurado para `main` en el mismo trigger.
- [x] El job `checks` ejecuta `npm ci`, lint, `next typegen` + `tsc --noEmit`, `npm test` y `npm run build`, y pasa en verde en el PR de la spec.
- [x] El job `migraciones` usa el secret `SUPABASE_DB_URL_DEV` y falla si hay deriva.
- [x] `main` y `dev` exigen los dos checks para mergear, y un PR con deriva queda bloqueado (PR #75: `migraciones` FAILURE, `mergeStateStatus` BLOCKED).
- [x] Un run completo tarda menos de 10 minutos: **2m9s** (checks 2m6s, migraciones 16s).
- [x] `docs/operacion/entornos.md` y `AGENTS.md` describen el CI y qué hacer ante un fallo.

## Decisions

- **Sí:** GitHub Actions. **No:** otro proveedor: el repo ya vive en GitHub y no hay costo extra en repos públicos.
- **Sí:** `db:export --check` para la deriva. **No:** `supabase db diff`: exige Docker y además compara esquemas, no historiales.
- **Sí:** exigir los checks en `main` **y** `dev`. **No:** solo en `main`: el objetivo es que la rama de integración nunca se rompa.
- **Sí:** Node 24 en CI. **No:** Node 22 LTS: local y Vercel ya usan 24 y no queremos dos runtime distintos.
- **Sí:** un job para los cuatro checks de código. **No:** cuatro jobs en paralelo: `npm ci` y el build dominan el tiempo, y separarlos solo multiplica la instalación.
- **Sí:** `migraciones` como job aparte. **No:** meterlo en `checks`: necesita el secret y así el fallo se lee distinto (deriva ≠ código roto).
- **No:** e2e en CI: necesita base con seed y credenciales reales; el costo de mantenimiento supera el valor hoy.
- **No:** deploy desde CI: Vercel ya lo hace y duplicarlo genera dos fuentes de verdad.

### Notas de implementación (2026-10-29)

- **El primer run falló en `Tipos`.** `PageProps` y `LayoutProps` los genera Next en `.next/types`, y `.next/` y `next-env.d.ts` están en `.gitignore`: en un clon limpio `tsc` no los encuentra. Se resolvió con `npx next typegen` antes de `tsc --noEmit`. Conclusión incómoda y útil: **el repo no compilaba desde un clon limpio** y nadie lo sabía hasta que hubo CI.
- **`dev` había desaparecido de GitHub.** El `gh pr create` falló con "Base ref must be a branch" y el API devolvía 404. El repo tiene `delete_branch_on_merge: false`, así que fue un borrado manual al limpiar después de un merge. Se restauró en `e1b9fd5` (merge del PR #72), que ya estaba dentro de `main` como segundo padre de `d8f32fc`.
- **El secret se cargó dos veces.** La primera con un pipe de PowerShell: `gh secret set` no recorta el stdin y podía haber quedado un `\n` al final, que rompería la conexión sin decir por qué. La segunda con `--body`, que no lleva salto.
- **El guard se probó de verdad** con el PR #75: una migración renombrada, `migraciones` en FAILURE con el nombre del archivo, `checks` en verde y `mergeStateStatus: BLOCKED`. PR cerrado sin mergear y rama borrada.
- **`enforce_admins` quedó activo en `main` y `dev`.** Consecuencia: si el proyecto dev se pausa por inactividad, el job `migraciones` falla por conexión y no se puede mergear nada. El escape de emergencia (quitar y reponer el requisito de checks) está documentado en `docs/operacion/entornos.md`.
- Tiempos del run completo: **2m9s** (checks 2m6s, migraciones 16s).

## Risks

| Risk | Mitigación |
| --- | --- |
| El proyecto dev está pausado (plan Free) y `migraciones` falla por conexión, no por deriva | El mensaje del job debe distinguir "no se pudo conectar" de "hay deriva"; se documenta cómo reactivar el proyecto |
| El secret `SUPABASE_DB_URL_DEV` se filtra en logs | El script nunca imprime la URL (solo `host:puerto/base`); el workflow no hace `echo` de secretos |
| Un PR de un fork no recibe secretos y `migraciones` falla | Hoy no hay forks; si aparecen, ese job se condiciona a `github.event.pull_request.head.repo.full_name == github.repository` |
| El guard bloquea PRs legítimos cuando dev tiene migraciones aplicadas sin archivo | Es exactamente lo que debe pasar: el arreglo es commitear la migración, y el mensaje dice cuál |
| Los checks requeridos se configuran con un nombre distinto al del job | Se leen los nombres reales desde la pestaña Actions antes de configurar, y se verifica con `gh api` |
| `npm test` tarda ~2 min y el run se acerca al límite de 10 min | `concurrency` cancela runs viejos; si crece, se separa `test` en su propio job |

## What is **not** in this spec

E2E en CI, Sentry, uptime, backups/PITR, restore probado, CSP en enforce, `db diff`, Dependabot/Renovate, deploy desde CI, cron nocturno y cualquier cambio de código de la app.

Cada uno de esos, si llega, va en su propia spec (observabilidad y backups en la 62).
