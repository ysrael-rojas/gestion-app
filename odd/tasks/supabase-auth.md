# Tarea: autenticación con Supabase Auth

**Feature:** `supabase-auth`
**Estado:** implementación completa; pendiente la adopción de datos con el UID real
**Rama:** `main` (sin commit: el usuario no lo pidió)
**Módulos afectados:** infra de servidor, layout raíz, route group, RLS

## Objetivo

Incorporar Supabase Auth para que las políticas RLS por propietario tengan un
`auth.uid()` real contra el cual evaluar. Sin esto, `owner_id = auth.uid()`
siempre es `NULL` y ninguna fila es visible.

La sesión se mantiene en cookies vía `@supabase/ssr`; la renovación del token
ocurre en `proxy.ts` (Next 16 renombró `middleware` a `proxy`).

## Decisiones confirmadas con el usuario

1. **Aislamiento por propietario** (opción B): cada usuario ve solo sus filas.
   No se usa el modelo "todos los autenticados ven todo".
2. **`create_payment_with_allocations` sigue siendo `SECURITY DEFINER`**, con
   `EXECUTE` revocado a `anon` y a `PUBLIC`. No se reescribe la función.
3. **`receipt_sequence` no lleva `owner_id`**: el correlativo de recibos es
   global por dirección, no por usuario.

## Estado previo (ya aplicado, migración 20261003120000)

- 17 políticas `owner_id = auth.uid()` para el rol `authenticated`.
- `owner_id uuid references auth.users(id) on delete cascade` en `entidad`,
  `comprobante`, `payment`, `payment_allocation`, `cash_account`.
- `auth.users` tiene 0 filas; las 18 entidades, 8 comprobantes y 7 pagos
  quedaron con `owner_id IS NULL` y por tanto invisibles.

## Cambios

### A. Infraestructura de servidor

- `lib/supabase/server.ts` (nuevo): `createServerClient` con cookies
  `getAll`/`setAll` sobre `cookies()` de Next. Reutiliza el cliente existente
  para no abrir una conexión por render.
- `lib/supabase/client.ts` (existente): pasa a usar `createBrowserClient` de
  `@supabase/ssr` para que el cliente del navegador comparta el formato de
  cookie con el servidor.
- `proxy.ts` (nuevo, raíz): refresca la sesión en cada request y redirige a
  `/login` cuando no hay usuario. Excluye assets estáticos del matcher.
  Nombre y export correctos para Next 16 (`proxy`, no `middleware`).

### B. Esquema de validación

- `lib/schemas/auth.ts` (nuevo): `loginSchema` (correo + contraseña),
  `signUpSchema` (correo + contraseña + confirmación). Mensajes en español,
  mismo estilo que `lib/schemas/client.ts` (`error:` en vez de `message:`).

### C. Acciones de servidor

- `app/login/actions.ts`: `signIn`, `signUp`, `signOut` como server actions
  con `useActionState` de React 19. Traducen los errores de Supabase a
  mensajes en español.

### D. UI

- `app/login/page.tsx`: formulario de acceso con shadcn (`Card`, `Input`,
  `Label`, `Button`), textos en español.
- `app/registro/page.tsx`: alta de usuario.
- `components/auth/auth-form.tsx`: componente compartido entre login y registro.
- `components/auth/sign-out-button.tsx`: cierre de sesión.
- `app/layout.tsx`: envuelve el árbol; el layout raíz deja de renderizar el
  sidebar para los no autenticados (se mueve a un layout de grupo autenticado).
- `app/(authenticated)/layout.tsx`: nuevo grupo de rutas con `SidebarProvider`,
  providers de datos y sidebar, protegido por `getUser()` en servidor con
  `redirect("/login")`.
- `components/app-sidebar.tsx`: agrega el botón de cerrar sesión.

### E. Asignación de `owner_id` en inserts (migración 20261003130000)

Las políticas exigen `with check (owner_id = auth.uid())` pero ninguna ruta de
inserción envía ese campo: los formularios de clientes, comprobantes y cajas
insertan desde el navegador, y `create_payment_with_allocations` inserta desde
una función `SECURITY DEFINER` que ignora RLS. Sin trigger, todo insert falla.

Solución en base de datos, no en el cliente: trigger `before insert` que
rellena `owner_id` cuando viene nulo. Cubre ambos caminos y evita que un punto
de inserción futuro olvide el campo y rompa en silencio.

El trigger es `security invoker` a propósito: corre con los privilegios de
quien dispara, no necesita GRANT y no activa el aviso de linter
`security_definer_search_path`. `auth.uid()` funciona igual dentro de una
función `security definer` porque el claim GUC se establece antes de resolver
la consulta.

De paso se eliminó `receipt_sequence_select`, que exponía el contador global con
`using (true)` a todo usuario autenticado sin que ningún flujo lo necesite.

### F. Adopción de datos existentes — PENDIENTE, requiere intervención humana

Estado actual en la base:

| Tabla | Filas huérfanas |
| --- | --- |
| `entidad` | 18 |
| `comprobante` | 8 |
| `payment` | 7 |
| `payment_allocation` | 9 |

`auth.users` tiene 0 filas. Mientras no exista un usuario, RLS oculta todo el
histórico: la app se ve vacía a propósito.

Estas 42 filas son el histórico del proyecto, así que pertenecen a la primera
cuenta que se registre. **No se hace backfill automático**: una función que
auto-asignara filas huérfanas sería invocable por cualquier usuario
registrado, y no hay forma de distinguir "el dueño legítimo" de "alguien que
llegó después".

Pasos cuando el usuario tenga su cuenta creada:

```sql
-- Sustituir <UID> por auth.users.id del primer usuario.
update public.entidad           set owner_id = '<UID>' where owner_id is null;
update public.comprobante       set owner_id = '<UID>' where owner_id is null;
update public.payment           set owner_id = '<UID>' where owner_id is null;
update public.payment_allocation set owner_id = '<UID>' where owner_id is null;
update public.cash_account      set owner_id = '<UID>' where owner_id is null;
```

Se ejecuta una sola vez vía `execute_sql`. Requiere `owner_id is null` para no
pisar filas que ya tengan dueño.

### G. Tests

- `tests/unit/auth-schema.test.ts`: validación de `loginSchema`, `signUpSchema`
  y el schema compartido del formulario.
- `tests/components/auth-form.test.tsx`: render por modo, bloqueo con correo
  inválido y propagación del error del servidor.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| `proxy.ts` con matcher mal escrito rompe CSS/JS y deja la app en blanco | Excluir `_next/static`, `_next/image`, `favicon.ico`, archivos con extensión y `/api` |
| Cambiar `lib/supabase/client.ts` a `createBrowserClient` rompe los providers existentes | Mantener el mismo export `supabase`; los providers no cambian |
| Mover el sidebar a un grupo de rutas cambia URLs | App Router no altera el path público: `/ventas/listado` sigue igual |
| Las 18 entidades quedan invisibles hasta que exista un usuario | Script de adopción documentado; sin backfill automático porque no se sabe a quién pertenece una fila sin dueño |
| `gen:types` trunca `types.ts` si el CLI falla | No se regenera: `supabase` no está instalado. Edición manual |

## Evidencia de cierre

- `npm run build`: compila, TypeScript sin errores, `ƒ Proxy (Middleware)` en la
  tabla de rutas confirma que Next 16 reconoce `proxy.ts`.
- `npm test`: 18 archivos, 127 tests en verde (12 nuevos de auth).
- `npm run lint`: 0 errores. 1 warning preexistente en `coverage/`, ya ignorado
  por git.
- Base de datos: 15 políticas, todas `owner_id = auth.uid()`, sin ningún
  `using (true)` pendiente. 5 triggers `before insert` activos.
- Redirección contra dev server real: `/ventas/listado` y `/clientes/listado`
  devuelven `307` a `/login`; `/login` devuelve `200`; los cuatro assets reales
  de `/_next/static/` devuelven `200`, lo que confirma que el matcher no
  intercepta estáticos (el fallo clásico que deja la app sin CSS).
- **Pendiente de verificación manual:** crear la cuenta, ejecutar el backfill de
  la sección F, confirmar que el histórico aparece y que el alta de un cliente
  nuevo guarda `owner_id`.
