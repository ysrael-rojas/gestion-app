# Crear y administrar usuarios

La aplicación es de **una sola empresa** y **solo el dueño crea cuentas**. No existe
registro público: `/registro` ya no existe y Supabase rechaza cualquier alta que no
venga del panel.

## Configuración única del proyecto (Supabase)

Panel de Supabase → **Authentication**:

1. **Sign In / Providers → Email**
   - `Allow new users to sign up`: **OFF**.
   - `Allow anonymous sign-ins`: **OFF**.
2. **Sessions / Password** (o *Auth Settings* según la versión del panel)
   - `Minimum password length`: **12**.
   - `Leaked password protection`: **ON** (HaveIBeenPwned).
3. Verificar en **Users** que solo está la cuenta del dueño.

> Si el panel cambia de nombre, busca estas tres opciones: *sign up*, *anonymous* y
> *password strength*.

## Crear la cuenta del dueño (o una nueva)

1. Authentication → **Users** → **Add user**.
2. Correo y contraseña (mínimo 12 caracteres).
3. Marca **Auto Confirm User** para que pueda entrar sin correo de confirmación.
4. Guardar y probar el login en `/login`.

## Recuperar o cambiar la contraseña

- Authentication → **Users** → menú de la fila → **Reset password** (envía correo)
  o **Update password** (definir una nueva a mano).
- No hay flujo "olvidé mi contraseña" en la app.

## Borrar o desactivar un usuario

- Authentication → **Users** → menú de la fila → **Delete user**.
- Al borrar, sus datos (`owner_id`) se eliminan en cascada. Confirmar antes.

## Regla importante: no crear un segundo usuario todavía

Hoy el aislamiento es `owner_id = auth.uid()`: **cada usuario ve su propio conjunto
de datos**. Si se crea un segundo usuario (cajero, socio), no verá las ventas,
compras ni cajas del dueño. Antes de crear el segundo usuario hace falta la spec de
**empresa + roles** (`company_id` compartido y roles admin/cajero).

## Verificación rápida

- `GET /registro` → 404.
- `POST /auth/v1/signup` con la publishable key → `signup_disabled` (no crea usuario).
- `GET /auth/v1/settings` → `disable_signup: true`.
