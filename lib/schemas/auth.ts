import { z } from "zod";

const isValidEmail = (value: string) => z.email().safeParse(value).success;

export const loginSchema = z.object({
  email: z.string().refine(isValidEmail, {
    error: "Ingresa un correo válido",
  }),
  password: z.string().min(1, "La contraseña es requerida"),
});

export type LoginFormValues = z.output<typeof loginSchema>;
export type LoginFormInput = z.input<typeof loginSchema>;
