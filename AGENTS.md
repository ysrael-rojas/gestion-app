<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Proyecto: gestion-app

## Comandos

- `npm run dev` — servidor de desarrollo (http://localhost:3000)
- `npm run lint` — ESLint (`eslint-config-next`)
- `npm run build` — build de producción (también ejecuta el typecheck)
- `npm test` — Vitest (unit + components) una vez
- `npm run test:unit` — solo tests unitarios (`tests/unit/`)
- `npm run test:components` — solo tests de componente (`tests/components/`)
- `npm run test:watch` — Vitest en modo watch
- `npm run test:coverage` — Vitest con coverage v8 (umbral informativo, no rompe CI)
- `npm run test:e2e` — Playwright contra el dev server (ver sección Tests)
- `npm run gen:types` — regenera `lib/supabase/types.ts` desde el CLI de Supabase (ver sección Tests)

Para validar cambios: `npm run lint` + `npm test` + `npm run build`.

## Tests

- **Unit + componentes:** `npm test` (cubre `lib/pagos/`, `lib/comprobantes/`, `lib/schemas/`, `lib/ventas/`, `lib/clientes/` y tres componentes: `PaymentHistorySection`, `PaymentStatusBadge`, `DataTablePagination`).
- **Cobertura:** `npm run test:coverage`. Métrica informativa, sin umbral que rompa builds.
- **E2E:** `npm run test:e2e` requiere:
  1. El CLI de Playwright con browsers instalados (`npx playwright install chromium` la primera vez).
  2. **El dev server debe estar accesible en `http://localhost:3000`.** El config lo arranca automáticamente con `reuseExistingServer: true`; si ya hay un dev server corriendo, lo reusa.
  3. Credenciales Supabase válidas en `.env` y seed manual en la DB (el e2e `tests/e2e/registrar-pago-y-ver-saldo.spec.ts` documenta el seed exacto en su comentario inicial).
- **`npm run gen:types`:** regenera `lib/supabase/types.ts` con `scripts/gen-types.mjs` desde el CLI oficial de Supabase. Requiere `supabase` instalado globalmente y `supabase link --project-ref hurattoyvarlfdydvugd`. El script escribe en un temporal y solo reemplaza el archivo si el comando termina bien y la salida no está vacía; si falla, conserva el `types.ts` anterior y sale con código 1.
  - **Alternativa sin CLI (MCP):** con el MCP de Supabase disponible, `generate_typescript_types` devuelve el `types.ts` generado desde la BD viva (campo `types`). Al reemplazar el archivo hay que reponer la cabecera `// GENERATED — NO EDITAR — npm run gen:types` (el generador no la incluye) y validar con `npx tsc --noEmit`, `npm test` y `npm run build`.

## Estructura y alias

- App Router en `app/` (sin carpeta `src/`).
- Alias `@/*` → raíz del repo (`tsconfig.json`), no `src/`: importar con `@/app/...`, `@/components/...`, etc.
- `components/` organizada por dominio (`auth/`, `clientes/`, `ventas/`, `comprobantes/`, `pagos/`, `cartera/`, `compras/`, `cajas-bancos/`, `shared/`, `ui/`) y `lib/` por dominio (`auth/`, `caja/`, `clientes/`, `comprobantes/`, `cuentas/`, `data/`, `filters/`, `pagos/`, `schemas/`, `supabase/`, `ventas/`).

## Stack

- Next 16.3.6 / React 19.2.
- Tailwind CSS v4: configurado por CSS en `app/globals.css` (`@import "tailwindcss"` + `@theme inline`). No hay `tailwind.config.*`.
- shadcn/ui 4.x (MCP configurado en `opencode.json`).
- Supabase (base de datos Postgres + Auth) vía MCP de Supabase.

## Supabase

- Proyecto: `hurattoyvarlfdydvugd` (`https://hurattoyvarlfdydvugd.supabase.co`).
- MCP `supabase` disponible: inspeccionar tablas, ejecutar SQL, aplicar migraciones, advisors, logs y Edge Functions. La DB ya tiene esquema aplicado vía specs (clientes, comprobantes/compras, pagos, caja, RLS) y tipos generados en `lib/supabase/types.ts`.
- Migraciones/DDL siempre con `apply_migration` (snake_case en el nombre); consultas de lectura con `execute_sql`. Nunca leer archivos del servidor ni ejecutar comandos del SO vía SQL.
- Tras cambios de esquema, revisar advisors de seguridad y rendimiento.
- Env: `SUPABASE_DB_PASSWORD` en `.env` (ignorado por git). No hardcodear credenciales; usar variables de entorno y `.env.template` para lo que deba versionarse.
- Antes de escribir o cambiar algo en Postgres (tablas, columnas, RLS, índices, migraciones), cargar el skill `supabase-postgres-best-practices`.

## UI

- Usar siempre shadcn/ui; no crear botones, cards, inputs, etc. desde cero. Importar desde `@/components/ui/[nombre]`.
- Estilos adicionales con Tailwind. No usar colores hardcodeados; usar las variables de diseño de shadcn.
- Iconos con `lucide-react`.
- shadcn ya está inicializado (`components.json` existe y hay componentes en `components/ui/`). Añadir más con `npx shadcn@latest add [componente]`; **no** volver a correr `init`.
- Antes de instalar un componente nuevo, preguntar.

### Propuestas de diseño — obligatorio pasar por `frontend-design`

- **Toda** propuesta de diseño (UI nueva, rediseño, elección de paleta, tipografía, escala, layout o tratamiento de componentes) **debe** pasar por el skill `frontend-design` **antes** de presentarse al usuario, de pedir una decisión o de escribir código. No se proponen direcciones estéticas sin ese paso.
- Proceso mínimo a seguir del skill: (1) plan compacto con color (4–6 hex con nombre), tipografías y sus roles, layout con wireframes ASCII y principios de diseño; (2) revisión del plan contra el brief y contra los "tells" de diseño generado que el skill enumera, indicando qué se cambió y por qué; (3) recién entonces proponer o codear.
- Las propuestas se fundan en el tema real del producto (gestión comercial en español: comprobantes, cobros, caja, cuentas por cobrar, clientes), no en defaults genéricos. Evitar explícitamente los patrones plantilla que el skill marca: eyebrows en MAYÚSCULAS, meta-strings con puntos medios (`A · B · C`), `→` al final de links/botones, monospace para etiquetas de datos, cards idénticas con el mismo radio y la misma sombra, y el par "fondo casi negro + acento verde ácido o bermellón".
- El motor `ui-ux-pro-max` sigue aportando datos de dominio y reglas de accesibilidad; la **dirección estética** la define `frontend-design`.

## Idioma

- Comunicación con el usuario, logs y mensajes de commit: español.
- Código (variables, hooks, funciones, estado): inglés, camelCase.
- Esquemas/API (`app/api/`): inglés, snake_case o camelCase.
- Textos literales que ve el usuario en la UI: español.

## Next 16 — gotchas

- No editar nada dentro de los marcadores `<!-- BEGIN/END:nextjs-agent-rules -->`: `next dev` reescribe ese bloque.
- `params` y `searchParams` son `Promise`: usar `await`.
- Usar los tipos globales generados `PageProps` y `LayoutProps` (p. ej. `LayoutProps<"/">`) en lugar de tipar a mano.
- `proxy.ts` reemplaza `middleware.ts`.

## Herramientas / MCPs

- Context7: para traer documentación actualizada del framework.
- Playwright: capturas y artefactos en `.playwright-mcp/` (ya ignorado en `.gitignore`).
- Supabase: inspección de tablas, migraciones, advisors y logs (ver sección Supabase).

## Skills instalados (`.agents/skills/`)

- `spec` — diseñar una spec antes de escribir código.
- `spec-impl` — implementar una spec aprobada (crea rama y avanza por pasos).
- `spec-multi` — diseñar una spec orquestable multiagente (fases, reparto sin traslape de archivos y asignación de modelos). Invocar con `/spec-multi`.
- `supabase` — tareas de Supabase (Database, Auth, Edge Functions, Realtime, Storage, SSR, RLS, CLI/MCP).
- `supabase-postgres-best-practices` — cargar antes de crear/alterar tablas, RLS, índices o migraciones en Postgres.
- `caja-bancos-mype` — experto operativo de caja y bancos para MYPE en Perú (arqueo, conciliación bancaria, caja chica, tesorería, ITF, detracciones). **Cargar antes de planear o tocar el módulo de caja y bancos**; actúa como maestro que enseña el procedimiento ideal y recomienda mejoras al sistema, sin asientos contables.
- `consultor-pagos-cobranzas` — consultor de negocios digitales / "director de obra" para dueños de negocio y emprendedores: guía en lenguaje simple (sin tecnicismos) el diseño de un módulo de pagos (CxP) y cobranzas (CxC), el diagnóstico de código/datos existentes, las pasarelas de pago y los recordatorios automáticos. Úsala cuando el usuario quiera montar u ordenar cobros/pagos "para su negocio".
- `facturacion-sunat-mype` — experto en facturación SUNAT (Perú) para MYPE: comprobantes de venta (factura, boleta, notas de crédito/débito) y de compra, IGV, series y correlativos, y facturación electrónica (CPE). Explica la regla en simple y guía el desarrollo web; **cargar antes de tocar la emisión de comprobantes o el cálculo de impuestos**.
- `frontend-design` — dirección visual distintiva. **Obligatorio** para toda propuesta de diseño (ver sección UI).

### Skills de diseño instalados (`.opencode/skills/`)

Instalados con `uipro init --ai opencode` (CLI `ui-ux-pro-max-cli`). Aportan datos y reglas, no la dirección estética:

- `ui-ux-pro-max` — base de datos: estilos, paletas por industria, tipografías, iconos, gráficos y guías UX. Motor: `python .opencode/skills/ui-ux-pro-max/scripts/search.py "<consulta>" --design-system -p "gestion-app"` (o `--domain style|color|typography|chart|ux`). Design system persistido en `design-system/gestion-app/MASTER.md`.
- `ui-styling`, `design-system`, `design`, `brand`, `slides`, `banner-design` — apoyo (shadcn/Tailwind, tokens, marca, slides, banners).

## Agentes (`.opencode/agent/`)

- `spec-verifier` — verifica los criterios de aceptación de una spec: revisa el código, contrasta las recomendaciones de Next.js con Context7, prueba las pantallas con Playwright y marca los checks del bloque "Acceptance criteria". Invocarlo para verificar/validar una spec.

## Ramas y flujo de Git

- Rama de integración: **`dev`**. Todo el trabajo nace de `dev`, nunca de `main`.
- `main` está protegida en GitHub: PR obligatorio, sin push directo, sin force push y sin borrado.
- Ramas de trabajo desde `dev`: `spec-NN-slug` (las crea `/spec-impl`), `feat/...`, `fix/...`, `chore/...`.
- El PR de una implementación apunta siempre a `dev` (`gh pr create --base dev`).
- El release a producción es un PR `dev → main`, y solo cuando el dueño lo decida.
- Antes de `/spec-impl`: `git switch dev && git pull`, porque la rama se crea desde la rama actual.
- Mapeo código ↔ base de datos: ramas de trabajo y `dev` → Supabase dev (`gestion-comercial-dev`); `main` → Supabase producción (`gestion-comercial`). Las migraciones viajan en la rama de la spec: se aplican a dev al integrarla y a producción solo en el merge `dev → main`.

## Flujo de trabajo (specs)

- Los specs se guardan en `specs/` (se crea al primer uso).
- Nunca hacer commit sin que el usuario lo pida explícitamente.
