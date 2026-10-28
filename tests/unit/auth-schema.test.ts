import { describe, expect, it } from "vitest";

import { loginSchema } from "@/lib/schemas/auth";

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

  it("no expone campos de alta: confirmPassword sobra en el objeto", () => {
    const result = loginSchema.safeParse({
      email: "admin@gestion.pe",
      password: "secreto123",
      confirmPassword: "secreto123",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      email: "admin@gestion.pe",
      password: "secreto123",
    });
  });
});
