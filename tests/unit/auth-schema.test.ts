import { describe, expect, it } from "vitest";

import { authFormSchema, loginSchema, signUpSchema } from "@/lib/schemas/auth";

describe("loginSchema", () => {
  it("acepta un correo y contraseña válidos", () => {
    const result = loginSchema.safeParse({
      email: "admin@gestion.pe",
      password: "secreto123",
    });

    expect(result.success).toBe(true);
  });

  it("rechaza un correo inválido", () => {
    const result = loginSchema.safeParse({
      email: "no-es-correo",
      password: "secreto123",
    });

    expect(result.success).toBe(false);
  });

  it("rechaza una contraseña vacía", () => {
    const result = loginSchema.safeParse({
      email: "admin@gestion.pe",
      password: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("signUpSchema", () => {
  it("acepta contraseñas que coinciden", () => {
    const result = signUpSchema.safeParse({
      email: "admin@gestion.pe",
      password: "secreto123",
      confirmPassword: "secreto123",
    });

    expect(result.success).toBe(true);
  });

  it("rechaza contraseñas que no coinciden", () => {
    const result = signUpSchema.safeParse({
      email: "admin@gestion.pe",
      password: "secreto123",
      confirmPassword: "otra-cosa",
    });

    expect(result.success).toBe(false);
  });

  it("exige la confirmación de contraseña", () => {
    const result = signUpSchema.safeParse({
      email: "admin@gestion.pe",
      password: "secreto123",
    });

    expect(result.success).toBe(false);
  });
});

describe("authFormSchema", () => {
  it("permite omitir confirmPassword en modo login", () => {
    const result = authFormSchema.safeParse({
      email: "admin@gestion.pe",
      password: "secreto123",
    });

    expect(result.success).toBe(true);
  });

  it("falla cuando confirmPassword está presente y no coincide", () => {
    const result = authFormSchema.safeParse({
      email: "admin@gestion.pe",
      password: "secreto123",
      confirmPassword: "otra-cosa",
    });

    expect(result.success).toBe(false);
  });
});