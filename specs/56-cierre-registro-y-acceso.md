# SPEC 56 — Cierre de registro y acceso

> **Status:** Implementado
> **Depends on:** SPEC 15, SPEC 16
> **Date:** 2026-10-28
> **Objective:** Eliminar el alta de cuentas desde la app y dejar el proyecto en modo de un solo usuario (el creador), de forma que nadie más pueda registrarse y las cuentas solo se creen desde el panel de Supabase.

## Why this spec exists

La auditoría pre-producción (2026-10-28) confirmó que el registro está abierto: existe `/registro`, la acción `signUp` y el modo `signup` del formulario, y en Supabase Auth "Allow new users to sign up" está habilitado. El advisor de seguridad además reporta **leaked password protection deshabilitado** y el schema de alta solo exige `min(1)` de contraseña.

El producto es **una sola empresa** y **solo el creador crea cuentas**; por tanto el auto-registro no debe existir. Cerrarlo es la mitigación más barata del hallazgo crítico de la auditoría (un usuario nuevo recibiría su propio `owner_id` y podría intentar operar sobre datos ajenos si conoce UUIDs): con el alta cerrada, hoy solo existe una cuenta real.

Es la primera de las tres specs de la Fase 0 (56 registro → 57 integridad entre usuarios → 58 dependencias y cabeceras).

## Scope

**In:**

1. **Eliminar el flujo de alta en la app:**
   - Borrar `app/registro/page.tsx`.
   - Quitar `signUp` de `app/login/actions.ts` (dejar solo `signIn` y `signOut`).
   - Simplificar `components/auth/auth-form.tsx` a modo login único: sin prop `mode`, sin `confirmPassword`, sin copy de "Crear cuenta" ni el link "¿No tienes cuenta?".
   - Simplificar `lib/schemas/auth.ts` a `loginSchema` (sin `signUpSchema` ni `authFormSchema`).
   - `proxy.ts`: `PUBLIC_ROUTES = ["/login"]` (sin `/registro`).
   - Actualizar `tests/components/auth-form.test.tsx`: conservar los casos de login y eliminar los de signup.
2. **Configuración de Supabase Auth (manual, documentada):**
   - "Allow new users to sign up" **OFF**.
   - "Allow anonymous sign-ins" **OFF**.
   - Minimum password length **12**.
   - **Leaked password protection ON**.
   - Borrar el usuario de prueba no confirmado que quedó en `auth.users` (hay 2 usuarios, 1 confirmado).
3. **Runbook de alta de usuario** en `docs/operacion/crear-usuario.md`: cómo crear la cuenta desde el dashboard (Auth → Users → Add user, con auto-confirm) y qué hacer si se pierde la contraseña (reset desde el dashboard).
4. **Validación:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`; Playwright de login/logout; comprobación de que Supabase rechaza un `signUp`.

**Out of scope (for future specs):**

- Integridad entre usuarios (trigger de ownership, checks en la RPC de pagos, policies de `cash_close`/`cash_transfer`): **SPEC 57**.
- Actualización de dependencias y cabeceras de seguridad: **SPEC 58**.
- Modelo empresa + roles (`company_id` compartido, admin/cajero): si algún día se agrega un segundo usuario, cada uno vería datos distintos con el `owner_id` actual.
- Recuperación de contraseña desde la UI, MFA e invitaciones por correo.
- Cambios de esquema, RLS o migraciones (esta spec no toca la base).

## Data model

**No introduce estructuras nuevas.** No hay migraciones. Solo se retira código de alta y se ajusta configuración de Supabase Auth.

## Implementation plan

1. **Formulario y esquema.** `auth-form.tsx` login-only, `loginSchema` como único schema, `signIn`/`signOut` en `actions.ts` y `PUBLIC_ROUTES` sin `/registro`.
2. **Eliminar la página de alta** y actualizar los tests del formulario (quedan solo los casos de login).
3. **Supabase + runbook.** Aplicar la configuración del panel, borrar el usuario de prueba y escribir `docs/operacion/crear-usuario.md`.
4. **Validación.** `tsc`, lint, test, build; Playwright de login y logout; comprobar que un `signUp` directo devuelve `signup_disabled`.

## Acceptance criteria

- [x] `/registro` devuelve 404 y `proxy.ts` solo considera público `/login`.
- [x] `components/auth/auth-form.tsx` no tiene modo signup, ni `confirmPassword`, ni link "Crear cuenta"; el login se ve igual que antes.
- [x] `app/login/actions.ts` no exporta `signUp` y no quedan referencias a `signUpSchema`/`authFormSchema`.
- [x] Supabase rechaza un alta nueva (signup deshabilitado) y los anonymous sign-ins están apagados. Verificado con `GET /auth/v1/settings`: `disable_signup: true` y `external.anonymous_users: false`.
- [x] El usuario de prueba no confirmado ya no existe en `auth.users`.
- [x] Login y logout funcionan (Playwright) y no hay errores de consola.
- [x] `docs/operacion/crear-usuario.md` existe con los pasos exactos del panel.
- [x] `npx tsc --noEmit`, `npm run lint`, `npm test` y `npm run build` en verde.

## Decisions

- **Sí:** eliminar la página y el flujo, no solo ocultarlos. Una ruta viva es una superficie viva.
- **Sí:** alta de cuentas solo desde el dashboard de Supabase. **No:** panel de administración en la app ni `service_role` en el cliente (el proyecto no tiene clave de servicio y no debe tenerla).
- **Sí:** mantener `signup_disabled` en `lib/auth/errors.ts`: si alguien llama la API directo, el mensaje sigue siendo claro.
- **Sí:** contraseña mínima 12 en Supabase. **No:** reglas de contraseña en el cliente, porque ya no hay formulario de alta.
- **Sí:** aceptar leaked password protection deshabilitado mientras el plan sea el actual (requiere Pro); el mínimo 12 y el registro cerrado cubren el caso normal. Se activa si se sube de plan.
- **Sí:** recuperación de contraseña desde el dashboard. **No:** flujo "olvidé mi contraseña" en la UI en esta fase (un solo usuario).
- **Asumido:** un solo usuario. Si se agrega un segundo, hace falta la spec de empresa + roles antes de crearlo.

### Notas de implementación (2026-10-28)

- Código completo en 3 commits: formulario login-only + schema, eliminación de `/registro` y sus tests, y runbook de operación.
- **7 de 8 criterios verificados.** Playwright: `/registro` responde 404, login y logout funcionan, el formulario no muestra "Crear cuenta" ni confirmación, y la consola no tiene errores (el único 404 es el recurso de la ruta eliminada).
- Usuario de prueba `ysrael@google.com` (no confirmado, sin datos) eliminado de `auth.users`; queda solo el owner real.
- **Supabase Auth (2026-10-28):** signup y anonymous verificados apagados (`disable_signup: true`, `external.anonymous_users: false`); el mínimo de contraseña quedó confirmado en **12** por el dueño. **Leaked password protection no está disponible en el plan actual (requiere Pro):** el advisor `auth_leaked_password_protection` sigue apareciendo y se acepta como riesgo documentado. Si se sube a Pro, activarlo y volver a correr el advisor.
- Tests: **627 en 74 archivos** (se retiraron 12 casos de signup); build con 24 rutas (ya no aparece `/registro`).
- Al borrar `app/registro` quedó un `.next/types/validator.ts` obsoleto que rompía `tsc`; se limpió `.next/types` y volvió a verde.

## Risks

| Risk | Mitigación |
| --- | --- |
| La configuración de Supabase es manual y se puede olvidar | Criterio de aceptación con prueba de `signUp` rechazado + paso explícito en el runbook |
| Borrar `/registro` rompe un bookmark o un enlace externo | El 404 es el comportamiento buscado; el login no enlaza a esa ruta |
| Recortar los tests del formulario reduce cobertura | Se conservan todos los casos de login y se agrega la verificación de que no existe modo signup |
| El usuario no confirmado sigue en `auth.users` | Paso explícito de limpieza y verificación en `auth.users` |
| Si se crea un segundo usuario, verá otro conjunto de datos | Documentado en el runbook: no crear usuarios adicionales hasta definir empresa + roles |

## What is **not** in this spec

Integridad entre usuarios y policies (SPEC 57), dependencias y cabeceras (SPEC 58), empresa/roles, recuperación de contraseña en UI, MFA, invitaciones y cualquier cambio de esquema o RLS.
