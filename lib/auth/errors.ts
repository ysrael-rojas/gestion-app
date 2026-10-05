/**
 * Traduccion de errores de Supabase Auth.
 *
 * Vive aparte de las server actions porque es logica pura y testeable: las
 * acciones importan `next/headers` y `next/navigation`, que no se pueden cargar
 * en el entorno de tests.
 *
 * Se indexa por `error.code`, nunca por `error.message`: el code es estable y en
 * snake_case, mientras que el mensaje es texto combinado de la API y puede
 * cambiar entre versiones de la plataforma.
 */

export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Correo o contraseña incorrectos",
  email_not_confirmed: "Confirma tu correo antes de iniciar sesión",
  user_already_exists: "Ya existe una cuenta con ese correo",
  email_exists: "Ya existe una cuenta con ese correo",
  weak_password: "La contraseña debe tener al menos 6 caracteres",
  over_request_rate_limit: "Demasiados intentos. Espera un momento.",
  over_email_send_rate_limit: "Demasiados correos enviados. Espera un momento.",
  email_address_invalid: "Ingresa un correo válido",
  email_address_not_authorized: "Ese correo no está autorizado",
  signup_disabled: "El registro está deshabilitado en este proyecto",
  validation_failed: "Los datos enviados no son válidos",
};

export interface AuthErrorLike {
  code?: string;
  message?: string;
}

export const AUTH_FALLBACK_MESSAGE =
  "No se pudo completar la operación. Intenta nuevamente.";

export function translateAuthError(error: AuthErrorLike): string {
  // El error crudo se registra para que un fallo nunca quede enmascarado: sin
  // esto, un code no mapeado es indistinguible de un problema de red.
  console.error("[auth] error de Supabase:", error.code, error.message);

  if (error.code && AUTH_ERROR_MESSAGES[error.code]) {
    return AUTH_ERROR_MESSAGES[error.code];
  }

  return AUTH_FALLBACK_MESSAGE;
}