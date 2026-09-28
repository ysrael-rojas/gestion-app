<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Proyecto: gestion-app

## Comandos

- `npm run dev` — servidor de desarrollo (http://localhost:3000)
- `npm run lint` — ESLint (`eslint-config-next`)
- `npm run build` — build de producción (también ejecuta el typecheck)

No hay runner de tests ni scripts `test`/`typecheck`. Para validar cambios: `npm run lint` y luego `npm run build`.

## Estructura y alias

- App Router en `app/` (sin carpeta `src/`).
- Alias `@/*` → raíz del repo (`tsconfig.json`), no `src/`: importar con `@/app/...`, `@/components/...`, etc.
- `components/` y `lib/` todavía no existen; crearlas si hace falta.

## Stack

- Next 16.3.6 / React 19.2.
- Tailwind CSS v4: configurado por CSS en `app/globals.css` (`@import "tailwindcss"` + `@theme inline`). No hay `tailwind.config.*`.
- shadcn/ui 4.x (MCP configurado en `opencode.json`).
- Supabase (base de datos Postgres + Auth) vía MCP de Supabase.

## Supabase

- Proyecto: `hurattoyvarlfdydvugd` (`https://hurattoyvarlfdydvugd.supabase.co`).
- MCP `supabase` disponible: inspeccionar tablas, ejecutar SQL, aplicar migraciones, advisors, logs y Edge Functions. La DB aún no tiene tablas.
- Migraciones/DDL siempre con `apply_migration` (snake_case en el nombre); consultas de lectura con `execute_sql`. Nunca leer archivos del servidor ni ejecutar comandos del SO vía SQL.
- Tras cambios de esquema, revisar advisors de seguridad y rendimiento.
- Env: `SUPABASE_DB_PASSWORD` en `.env` (ignorado por git). No hardcodear credenciales; usar variables de entorno y `.env.template` para lo que deba versionarse.
- Antes de escribir o cambiar algo en Postgres (tablas, columnas, RLS, índices, migraciones), cargar el skill `supabase-postgres-best-practices`.

## UI

- Usar siempre shadcn/ui; no crear botones, cards, inputs, etc. desde cero. Importar desde `@/components/ui/[nombre]`.
- Estilos adicionales con Tailwind. No usar colores hardcodeados; usar las variables de diseño de shadcn.
- Iconos con `lucide-react`.
- shadcn aún no está inicializado (no existe `components.json`). Ejecutar `npx shadcn@latest init` antes de `npx shadcn@latest add [componente]`.
- Antes de instalar un componente nuevo, preguntar.

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
- `supabase` — tareas de Supabase (Database, Auth, Edge Functions, Realtime, Storage, SSR, RLS, CLI/MCP).
- `supabase-postgres-best-practices` — cargar antes de crear/alterar tablas, RLS, índices o migraciones en Postgres.

## Flujo de trabajo (specs)

- Los specs se guardan en `specs/` (se crea al primer uso).
- Nunca hacer commit sin que el usuario lo pida explícitamente.
