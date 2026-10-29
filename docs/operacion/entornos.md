# Entornos (local, dev y producción)

Tres entornos, un proyecto de Vercel y dos proyectos de Supabase. La base que usa la
app se elige con **dos variables** (`NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), que Next incrusta en el bundle **al compilar**:
cambiar la variable sin volver a compilar no cambia nada.

## Matriz de entornos

| Entorno | Dónde corre | Proyecto Supabase | Ref | Quién escribe |
| --- | --- | --- | --- | --- |
| Local | `npm run dev` en tu máquina | `gestion-comercial-dev` | `dzbtcisqvnoplsfrakbs` | tú y el agente, libremente |
| Producción | Vercel, solo desde `main` | `gestion-comercial` | `hurattoyvarlfdydvugd` | solo con `--project-ref` explícito |
| Preview | Vercel, **cancelado** por `vercel.json` | — | — | nadie |

`vercel.json` define `ignoreCommand`: si `VERCEL_ENV` no es `production`, el build se
cancela. Las variables de Preview apuntan a dev igualmente, como red de seguridad.

## Dónde viven las variables

| Variable | Local (`.env`) | Vercel Production | Vercel Preview |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | dev | prod | dev |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | dev | prod | dev |
| `SUPABASE_DB_PASSWORD` | dev | — | — |
| `SUPABASE_DB_URL_DEV` | dev (session pooler) | — | — |
| `SUPABASE_DB_URL_PROD` | prod (session pooler) | — | — |
| `SUPABASE_ACCESS_TOKEN` | token de cuenta (CLI) | — | — |

`.env` no se versiona; `.env.template` documenta las claves. El `.env` local **nunca**
debe apuntar a producción.

## Reglas

1. **`--project-ref` explícito** en todo comando que escriba en producción. Nunca
   confiar en `--linked` para eso: el link apunta a dev.
2. **`npm run db:push` es solo para dev.** Usa el proyecto linkeado (`--linked`).
3. **Producción se toca solo en el merge `dev → main`**, nunca desde una rama de trabajo.
4. Antes de cualquier `db push` contra producción: `--dry-run` y backup/PITR confirmado.
5. No correr `vercel env pull` sin querer: escribe `.env.local`, que Next carga
   **después** de `.env` y por tanto lo sobrescribe.

## Cambiar el esquema (flujo diario)

```powershell
git switch dev
git pull
git switch -c spec-61-lo-que-sea

npx supabase migration new nombre_del_cambio   # crea supabase/migrations/<ts>_nombre.sql
# escribir el SQL

npm run db:push          # aplica a dev (proyecto linkeado)
npm run gen:types        # regenera lib/supabase/types.ts desde dev
npm run lint; npm test; npm run build
```

La migración viaja en la misma rama y en el mismo PR que el código que la usa.

## Promover a producción

1. Confirmar backup/PITR de producción.
2. `npx supabase db push --project-ref hurattoyvarlfdydvugd --password "<PASS_PROD>" --dry-run`
3. Aplicar sin `--dry-run`.
4. Comparar tipos: `npx supabase gen types typescript --project-id hurattoyvarlfdydvugd`
   contra `lib/supabase/types.ts`. Si difiere, dev y producción divergieron: parar.
5. Smoke en `https://gestion-app-green.vercel.app`.

El deploy a producción ocurre solo con el merge a `main`; no hace falta tocar Vercel.

## Crear un entorno desde cero

Lo que este repo necesita y no es obvio:

1. Crear el proyecto Supabase en la misma región y guardar la contraseña.
2. `create schema if not exists private;` — ninguna migración lo crea y varias
   funciones viven ahí.
3. Verificar que `pgcrypto` y `uuid-ossp` estén en el esquema `extensions` (vienen por
   defecto).
4. `npx supabase db push --db-url "<session pooler del proyecto>"` — aplica las 48
   migraciones. En proyectos nuevos la conexión directa es IPv6-only: usar el pooler.
5. Crear el usuario en Auth y aplicar la configuración de `crear-usuario.md`.
6. Catálogos: `payment_method` y `cash_receipt_category` los siembra la app sola al
   abrir el módulo de caja (`ensureCatalogsSeeded`).
7. Datos de demo (opcional): `seed-demo.sql` crea los 6 clientes y las 2 cuentas;
   `seed-semana.sql` siembra una semana operativa. Ese seed **no es autónomo**:
   - espera que existan clientes, cuentas y catálogos (su BLOQUE 0 los conserva);
   - trae IDs de catálogo de producción hardcodeados: en un entorno nuevo hay que
     reemplazarlos por búsquedas por `code`;
   - hay que reescribir `v_owner` con el UUID del usuario del entorno;
   - se ejecuta **bloque por bloque**, cada uno en su propia transacción.

## Detalles que muerden

- **`NEXT_PUBLIC_*` se incrusta en build.** Cambiarla en Vercel sin redeploy deja la CSP
  apuntando al Supabase anterior (`next.config.ts` arma `connect-src` con esa URL).
- **Plan Free pausa proyectos por inactividad.** Dev se pausa si no se usa; se reactiva
  desde el panel.
- **`supabase/.temp/`** guarda el link y las credenciales del pooler. Está ignorado por
  git; si se borra, hay que volver a `supabase link`.
- **Advisors aceptados** (no son hallazgos nuevos): `receipt_sequence` con RLS sin
  políticas, 10 funciones `SECURITY DEFINER` ejecutables por `authenticated`, y
  `leaked_password_protection` (requiere plan Pro).
- **Un dev server viejo** puede quedar colgado con `EPIPE: broken pipe` y dejar el puerto
  3000 sin responder. Si `/login` no contesta, matar el proceso y relanzar.
