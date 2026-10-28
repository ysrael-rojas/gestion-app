# SPEC 58 — Dependencias y cabeceras

> **Status:** Implementado
> **Depends on:** SPEC 15, SPEC 56, SPEC 57
> **Date:** 2026-10-28
> **Objective:** Actualizar las dependencias con vulnerabilidades conocidas y agregar las cabeceras de seguridad que faltan, dejando la app lista para exponerse a internet sin cambiar funcionalidad.

## Why this spec exists

La auditoría pre-producción (2026-10-28) encontró dos frentes abiertos:

1. **Dependencias:** `npm audit` reporta **15 vulnerabilidades** (1 critical, 9 high, 4 moderate, 1 low). Las de producción son:
   - `next@16.3.6` → **critical** (fix disponible en **16.4.3**, no es major).
   - `zod@4.6.5` → high (fix en **4.6.7**).
   - `sharp`, `undici`, `body-parser` → high (transitivas; se resuelven con el upgrade de Next y `npm audit fix`).
   Las demás (`shadcn`, `vite`, `@modelcontextprotocol/sdk`, `qs`, `hono`, `ip-address`, `fast-uri`, `deepmerge`) son de desarrollo o transitivas de herramientas.
2. **Cabeceras:** `next.config.ts` está vacío. No hay HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` ni CSP; y `X-Powered-By` sigue expuesto.

Es la tercera y última spec de la Fase 0 (56 registro → 57 integridad → **58 dependencias y cabeceras**). El endurecimiento de la VPS (TLS, proxy, Docker, backups) es la Fase 1 y no entra aquí.

## Scope

**In:**

1. **Dependencias de producción:**
   - `next` **16.3.6 → 16.4.3** (instalación explícita; `package.json` fija la versión exacta).
   - `zod` **4.6.5 → 4.6.7**.
   - `npm audit fix` para `sharp`, `undici`, `body-parser` y demás transitivas, revisando el diff del lockfile.
   - Leer la documentación local de Next 16 (`node_modules/next/dist/docs/`) antes de tocar configuración y correr build/tests después.
2. **Dependencias de desarrollo (best effort):** subir `shadcn` y `vite` si el upgrade no rompe tests ni el build; si rompe, dejar constancia y posponerlo.
3. **Cabeceras en `next.config.ts`:**
   - `poweredByHeader: false`.
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
   - `X-Content-Type-Options: nosniff`.
   - `X-Frame-Options: DENY`.
   - `Referrer-Policy: strict-origin-when-cross-origin`.
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
   - **CSP en `Content-Security-Policy-Report-Only`** con `default-src 'self'`, `script-src 'self' 'unsafe-inline'` (Next inyecta scripts), `style-src 'self' 'unsafe-inline'` (Tailwind), `img-src 'self' data: blob:`, `font-src 'self' data:`, `connect-src 'self' <SUPABASE_URL> <SUPABASE_WSS>`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`. La URL de Supabase sale de `NEXT_PUBLIC_SUPABASE_URL` en build.
4. **Validación:**
   - `npm audit` sin critical ni high en dependencias de producción.
   - `curl -I` (o Playwright) muestra las 5 cabeceras y no muestra `X-Powered-By`.
   - Playwright en 10 rutas: sin violaciones de CSP en consola y sin errores.
   - `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.

**Out of scope (for future specs):**

- CSP en modo enforce (se activa en la Fase 1 con el proxy, después de revisar violaciones).
- TLS, HSTS a nivel de proxy, Docker/standalone, CI, backups y observabilidad (Fase 1).
- `next/image`/`sharp` como optimizador (la app no usa `next/image`).
- Actualizar React 19 o Tailwind 4 (ya están en la versión objetivo).
- Cambios de UI, lógica de negocio o base de datos.

## Data model

**No introduce estructuras nuevas.** Solo cambian `package.json`/`package-lock.json` y `next.config.ts`.

## Implementation plan

1. **Dependencias:** instalar `next@16.4.3` y `zod@4.6.7`, correr `npm audit fix`, revisar el lockfile y ejecutar tests/build. Subir `shadcn`/`vite` si no rompen nada.
2. **Cabeceras:** implementar `headers()` en `next.config.ts` con las cinco cabeceras fijas y la CSP Report-Only armada con la URL de Supabase; `poweredByHeader: false`.
3. **Validación:** `npm audit`, `curl -I`, Playwright en 10 rutas (consola limpia y sin violaciones de CSP), `tsc`, lint, test y build.
4. **Cierre:** notas de implementación y estado `Implementado` si todo pasa.

## Acceptance criteria

- [x] `npm audit` no reporta vulnerabilidades **critical** ni **high** en dependencias de producción.
- [x] `package.json` fija `next` en `16.4.3` y `zod` en `4.6.7`; el lockfile está actualizado.
- [x] `curl -I` devuelve `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy`, y **no** devuelve `X-Powered-By`.
- [x] La respuesta incluye `Content-Security-Policy-Report-Only` con `connect-src` apuntando a la URL de Supabase (https y wss).
- [x] Playwright en `/`, `/login`, `/ventas`, `/compras`, `/pagos/ingresos`, `/pagos/egresos`, `/cajas-bancos`, `/cajas-bancos/cuentas`, `/cajas-bancos/cuadres` y `/clientes/listado`: sin errores de consola ni violaciones de CSP.
- [x] El login y el registro de un pago siguen funcionando (smoke).
- [x] `npx tsc --noEmit`, `npm run lint`, `npm test` y `npm run build` en verde.
- [x] Si `shadcn`/`vite` no se pudieron subir, queda documentado en las notas con el motivo.

## Decisions

- **Sí:** subir Next a 16.4.3 explícitamente. **No:** `npm audit fix --force` (podría saltar de major y romper la app).
- **Sí:** CSP en **Report-Only** ahora. **No:** enforce en esta fase — primero se observan violaciones y se endurece en la Fase 1 con el proxy.
- **Sí:** HSTS desde Next. **No:** esperar solo al proxy: si algún día la app se sirve sin proxy, la cabecera ya está.
- **Sí:** `X-Frame-Options: DENY` (la app no se embebe). **No:** `SAMEORIGIN`.
- **Sí:** `connect-src` armado con `NEXT_PUBLIC_SUPABASE_URL` en build. **No:** comodines (`https:`) que anulan el valor de la CSP.
- **Sí:** mantener `'unsafe-inline'` en `script-src`/`style-src` mientras Next y Tailwind lo requieran; se endurece con nonces en una spec futura.
- **No:** tocar `output: "standalone"` ni Docker: es Fase 1.

### Notas de implementación (2026-10-28)

- `next` quedó fijado en **16.4.3** y `zod` en **4.6.7** (exactos en `package.json`); lockfile actualizado.
- `npm audit`: de **15** (1 critical, 9 high) a **3 low**. `npm audit --omit=dev` = **0**. Las 3 restantes son de desarrollo (`shadcn` → `@shadcn/registry` → `deepmerge`); el fix pide `shadcn@1.0.0` (downgrade breaking), así que se pospone y se documenta. `shadcn` quedó en 4.23.0 y `vite` en su rango, sin romper tests ni build.
- Cabeceras verificadas con `curl -I http://localhost:3000/login`: HSTS, nosniff, `X-Frame-Options: DENY`, Referrer-Policy y Permissions-Policy; **sin** `X-Powered-By`. La CSP Report-Only incluye `connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co` y `'unsafe-eval'` solo en desarrollo.
- Playwright: 10 rutas sin errores de consola ni violaciones de CSP; login/logout OK y el e2e `registrar-pago-y-ver-saldo` pasó **1/1** sobre Next 16.4.3.
- `npx tsc --noEmit`, `npm run lint`, `npm test` (**632 tests / 75 archivos**) y `npm run build` en verde con Next 16.4.3.
- Operativo: tras el upgrade, el dev server anterior retenía el binario SWC (`EPERM` al limpiar `node_modules/@next`); se detuvo y se levantó de nuevo, y `.next` se regeneró. `next dev` reescribió el bloque de reglas de `AGENTS.md` y quedó como cambio sin commitear (no forma parte de esta spec).
- La CSP pasa a **enforce** en la Fase 1, con el proxy y después de revisar violaciones.

## Risks

| Risk | Mitigación |
| --- | --- |
| El upgrade de Next cambia APIs o el build | Leer los docs locales de Next 16, correr `tsc`, tests y build; revisar rutas generadas |
| `npm audit fix` mueve transitivas inesperadas | Revisar el diff del lockfile y correr la suite completa |
| La CSP rompe Supabase Auth o el websocket | Report-Only, `connect-src` explícito con https y wss, verificación con Playwright |
| HSTS en localhost molesta en desarrollo | Los navegadores ignoran HSTS sobre http; si molesta, condicionar a `NODE_ENV === "production"` |
| Subir `shadcn`/`vite` rompe tooling | Best effort: si falla, se documenta y se pospone |
| El lockfile queda con vulnerabilidades de dev | Se documentan; no afectan el runtime de producción |

## What is **not** in this spec

CSP enforce, TLS/proxy, Docker/standalone, CI, backups, observabilidad, React/Tailwind, `next/image` y cualquier cambio de UI, lógica o base de datos.
