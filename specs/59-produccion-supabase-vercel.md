# SPEC 59 — Producción: Supabase nuevo y Vercel

> **Status:** Obsoleto
> **Depends on:** SPEC 16, SPEC 56, SPEC 57, SPEC 58
> **Date:** 2026-10-28
> **Objective:** Crear el proyecto Supabase de producción a partir de un baseline del esquema actual, apuntar el deploy de Production de Vercel a él y verificar el flujo completo, dejando el proyecto actual como staging y sin previews contra producción.
>
> **Obsoleto desde 2026-10-29 — sustituida por SPEC 60.** La realidad cambió: producción quedó en el proyecto existente (`hurattoyvarlfdydvugd`, nombre `gestion-comercial`) y el entorno de desarrollo se creó como proyecto aparte (`gestion-comercial-dev`, `dzbtcisqvnoplsfrakbs`). La SPEC 60 resuelve la separación de entornos sin Docker, recuperando el historial real de migraciones desde `supabase_migrations.schema_migrations.statements`. Este documento se conserva solo como registro histórico de las decisiones de la Fase 1.

## Why this spec exists

La app ya está desplegada en Vercel (`https://gestion-app-green.vercel.app`) y funciona contra el proyecto Supabase de desarrollo (`hurattoyvarlfdydvugd`), que contiene el seed semanal y el usuario real. La verificación en vivo confirmó que el deploy está sano (redirección a `/login`, cabeceras completas, sin `X-Powered-By`, CSP Report-Only apuntando a ese proyecto, región `gru1`).

Para operar de verdad hace falta separar entornos. El problema es que **el repo no puede reconstruir la base desde cero**: tiene 31 migraciones, pero las tablas base (`entidad`, `comprobante`, `payment`, `payment_allocation`) se crearon por MCP antes de que existiera la carpeta de migraciones. Un `supabase db push` en un proyecto vacío fallaría. Por eso esta spec usa un **baseline** del esquema actual en lugar de reproducir el historial.

Es la primera spec de la Fase 1 (59 producción → 60 CI/migraciones → 61 observabilidad/backups).

**Alcance funcional confirmado (2026-10-28):** no se quita ningún módulo. Compras, recibos de pago (RI-/RE-), caja y bancos, notas de crédito/débito y series se mantienen tal como están. Lo que cambia es el **punto de partida**: producción nace con el esquema y **sin datos** (ni comprobantes, ni pagos, ni series, ni cuentas, ni entidades), para que el dueño cargue sus propios comprobantes desde el número 1 y configure series, saldos iniciales, clientes y proveedores.

## Scope

**In:**

1. **Proyecto Supabase de producción** (acción del dueño):
   - Región **sa-east-1 (São Paulo)** para coincidir con la región de Vercel (`gru1`).
   - Plan Pro recomendado (el Free pausa proyectos por inactividad).
   - Guardar URL, publishable key y password de la base en un lugar seguro.
2. **Baseline del esquema** (dev → prod):
   - Instalar el CLI (`npx supabase`), crear un token de acceso y enlazar el proyecto actual.
   - `db dump` del esquema `public` y `private` **sin datos** (tablas, RLS, policies, funciones, triggers, grants).
   - Aplicarlo al proyecto nuevo y verificar que existan: RLS en todas las tablas, `private.assert_owner_consistency`, `list_last_movement_dates`, `get_cash_positions`, `create_payment_with_allocations` y las vistas `payment_balance`/`voucher_balance` con `security_invoker`.
   - Versionar el baseline en el repo (`supabase/baseline/`), marcar las 31 migraciones viejas como aplicadas en el proyecto nuevo (`migration repair`) y dejar el flujo normal (`migration new` + `db push`) para adelante.
3. **Auth de producción:**
   - Crear el usuario del dueño desde el dashboard con auto-confirm.
   - Signup **OFF**, anonymous **OFF**, mínimo 12, leaked protection si el plan lo permite.
   - Site URL y redirect URLs = `https://gestion-app-green.vercel.app`.
4. **Vercel:**
   - Variables de **Production** → URL y publishable key del proyecto nuevo.
   - Variables de **Preview** → proyecto de desarrollo (staging), para que ninguna preview escriba en producción.
   - Saltar builds que no sean de `main` ("Ignored Build Step") para no generar previews.
   - Redeploy de Production (las `NEXT_PUBLIC_*` se inlinan en build: cambiar la variable sin redeploy no hace nada).
5. **Puesta en marcha en producción (base limpia):**
   - Login con el usuario nuevo.
   - Crear las series de venta: **FV01** (factura), **BV01** (boleta), **NV01** (nota de venta), **NC01** (nota de crédito) y **ND01** (nota de débito), con su predeterminada por tipo.
   - Crear **Caja General** (efectivo, PEN) y **Banco BCP** (PEN) con sus **saldos iniciales** y fecha de apertura.
   - Los métodos de pago y las categorías se siembran solos en el primer cobro/pago (`ensureCatalogsSeeded`).
   - Cargar clientes y proveedores a mano.
   - Registrar los primeros comprobantes de venta y de compra, un cobro con asignación y un cierre de caja.
   - Verificar que el primer recibo sea `RI-000001` / `RE-000001` y que cada serie arranque en `000001`.
   - Verificar que la CSP apunte al proyecto nuevo y que no haya errores de consola.
6. **Verificación de integridad en producción:** correr `supabase/verify-owner-consistency.sql` (bloques con `rollback`) contra el proyecto nuevo.
7. **Documentación:** matriz de entornos (dev/staging/prod), procedimiento de baseline y de alta de usuario en `docs/operacion/`.

**Out of scope (for future specs):**

- Previews por PR con base propia (se desactivan; si se quieren, van con staging y Deployment Protection).
- CI, reconciliación continua de migraciones y `gen:types` automático: **SPEC 60**.
- Sentry, uptime, backups/PITR y restore probado: **SPEC 61**.
- CSP en enforce: **SPEC 61**.
- Dominio propio (se usa el `vercel.app` por ahora).
- Migrar datos del proyecto actual a producción (la base nueva nace limpia).
- Roles/empresa (`company_id`).

## Data model

No hay cambios de esquema ni de código de la app. El proyecto nuevo se crea con un **baseline** del esquema actual:

```
dev (hurattoyvarlfdydvugd) --db dump (schema public+private, sin datos)--> prod (nuevo)
```

El baseline incluye tablas, constraints, índices, RLS, policies, funciones (`public` y `private`), triggers, grants y comentarios. **No** incluye datos, usuarios de Auth ni configuración de Auth.

## Implementation plan

1. **Crear el proyecto** y guardar credenciales (dueño). Confirmar región y plan.
2. **Baseline**: CLI + token + link; dump del esquema; aplicar al proyecto nuevo; `migration repair` de las migraciones viejas; versionar `supabase/baseline/`.
3. **Verificar el esquema**: advisors 0, RLS activo, funciones y triggers presentes, vistas `security_invoker`.
4. **Auth**: usuario del dueño, signup off, mínimo 12, Site URL/redirect URLs.
5. **Vercel**: env vars por entorno, ignored build step para no-`main`, redeploy.
6. **Smoke y verificación de integridad** en producción; documentación de entornos.

## Acceptance criteria

- [ ] El proyecto de producción tiene todas las tablas, constraints, índices, RLS, policies, funciones, triggers y grants del proyecto actual.
- [ ] `get_advisors` de seguridad no reporta hallazgos nuevos (solo los aceptados: `receipt_sequence`, definer y leaked protection).
- [ ] `payment_balance` y `voucher_balance` existen con `security_invoker=true`.
- [ ] El login en `https://gestion-app-green.vercel.app` funciona contra el proyecto nuevo y no se ven datos del seed.
- [ ] Producción arranca con **0 filas** en `entidad`, `comprobante`, `payment`, `payment_allocation`, `cash_account`, `cash_close`, `cash_transfer`, `voucher_series` y `receipt_sequence`.
- [ ] Tras la puesta en marcha existen FV01, BV01, NV01, NC01 y ND01, Caja General y Banco BCP con saldo inicial, y el primer recibo es `RI-000001`.
- [ ] Compras, recibos de pago, notas de crédito/débito y caja siguen disponibles: no se retiró ningún módulo.
- [ ] Supabase Auth de producción: signup OFF, anonymous OFF, mínimo 12, Site URL y redirect URLs con el dominio de Vercel.
- [ ] Vercel Production apunta al proyecto nuevo; Preview apunta a desarrollo o los previews están deshabilitados.
- [ ] Smoke completo: crear caja/banco/series, venta, cobro con asignación y cierre de caja.
- [ ] `supabase/verify-owner-consistency.sql` pasa en producción (los 5 casos de rechazo y el flujo feliz).
- [ ] La CSP de producción apunta a la URL del proyecto nuevo.
- [ ] `supabase/baseline/` versionado y `docs/operacion/` con la matriz de entornos.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` y `npm run build` siguen en verde (no se toca código de la app).

## Decisions

- **Sí:** baseline + `migration repair`. **No:** intentar reproducir 31 migraciones que asumen tablas creadas fuera de ellas.
- **Sí:** proyecto nuevo y limpio. **No:** limpiar el proyecto actual y usarlo como producción (se pierde el staging y los datos de prueba).
- **Sí:** región `sa-east-1`. **No:** `us-east-1` (suma un salto transatlántico entre Vercel y Supabase).
- **Sí:** solo `main` despliega. **No:** previews por PR contra producción.
- **Sí:** Preview apunta a desarrollo. **No:** previews con la base de producción.
- **Sí:** credenciales de Auth creadas a mano en el dashboard. **No:** panel de administración en la app.
- **Sí:** el proyecto actual queda como staging con el seed. **No:** borrar el seed todavía (sirve para probar).
- **Sí:** producción nace **sin datos** (sin comprobantes, pagos, series, cuentas ni entidades). **No:** copiar el seed o los datos del proyecto actual.
- **Sí:** mantener todos los módulos y tipos de comprobante (compras, recibos, notas de crédito/débito). **No:** quitar módulos; el dueño los llena desde cero.
- **No:** dominio propio en esta spec; se usa el `vercel.app`.

## Risks

| Risk | Mitigación |
| --- | --- |
| El dump omite objetos (funciones `private`, triggers, grants) | Verificar la lista de objetos contra `pg_proc`/`pg_trigger`/`pg_policies` después de aplicar |
| `migration repair` marca como aplicada una migración que no lo está | Reparar solo las 31 versiones históricas, después de aplicar el baseline y comparar `migration list` |
| Cambiar `NEXT_PUBLIC_*` sin redeploy | Redeploy explícito de Production y verificación con Playwright |
| Previews siguen apuntando a producción | Ignored Build Step para no-`main` + scope Preview a desarrollo |
| El plan Free pausa el proyecto | Plan Pro o revisar la política de pausa |
| Auth con Site URL viejo | Configurar antes del primer login y probar recuperación de contraseña |
| El baseline incluye datos o extensiones no deseadas | Dump solo de esquema (`public`, `private`), sin `--data-only` |

## What is **not** in this spec

Previews por PR, CI, reconciliación continua de migraciones, `gen:types` automático, Sentry, uptime, backups/PITR, restore, CSP enforce, dominio propio, migración de datos y roles/empresa.
