import { describe, expect, it, vi } from "vitest";

import {
  AUTH_FALLBACK_MESSAGE,
  translateAuthError,
} from "@/lib/auth/errors";

describe("translateAuthError", () => {
  it.each([
    ["invalid_credentials", "Correo o contraseña incorrectos"],
    ["email_not_confirmed", "Confirma tu correo antes de iniciar sesión"],
    ["user_already_exists", "Ya existe una cuenta con ese correo"],
    ["email_exists", "Ya existe una cuenta con ese correo"],
    ["weak_password", "La contraseña debe tener al menos 6 caracteres"],
    ["over_request_rate_limit", "Demasiados intentos. Espera un momento."],
    ["over_email_send_rate_limit", "Demasiados correos enviados. Espera un momento."],
    ["email_address_invalid", "Ingresa un correo válido"],
    ["signup_disabled", "El registro está deshabilitado en este proyecto"],
    ["validation_failed", "Los datos enviados no son válidos"],
  ])("traduce el code %s", (code, esperado) => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(translateAuthError({ code, message: "texto en ingles" })).toBe(
      esperado
    );
  });

  it("cae al mensaje generico ante un code desconocido", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      translateAuthError({
        code: "code_inventado_del_2050",
        message: "algo raro",
      })
    ).toBe(AUTH_FALLBACK_MESSAGE);
  });

  it("cae al mensaje generico cuando no hay code", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(translateAuthError({ message: "Failed to fetch" })).toBe(
      AUTH_FALLBACK_MESSAGE
    );
  });

  it("registra el error crudo para que no quede enmascarado", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    translateAuthError({ code: "invalid_credentials", message: "Invalid login credentials" });

    expect(spy).toHaveBeenCalledWith(
      "[auth] error de Supabase:",
      "invalid_credentials",
      "Invalid login credentials"
    );
  });

  it("no indexa por message: el mismo texto con code desconocido cae al generico", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      translateAuthError({
        code: "algo_raro",
        message: "Correo o contraseña incorrectos",
      })
    ).toBe(AUTH_FALLBACK_MESSAGE);
  });
});