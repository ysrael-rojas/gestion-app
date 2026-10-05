import { z } from "zod";

const isValidEmail = (value: string) => z.email().safeParse(value).success;

const baseSchema = z.object({
  email: z.string().refine(isValidEmail, {
    error: "Ingresa un correo válido",
  }),
  password: z.string().min(1, "La contraseña es requerida"),
});

export const loginSchema = baseSchema;

export const signUpSchema = baseSchema
  .extend({
    confirmPassword: z.string().min(1, "Confirma tu contraseña"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

// Un solo schema para el formulario compartido: confirmPassword es opcional y
// solo se compara cuando el modo es registro. Así el resolver tiene un único
// tipo y el componente no necesita casts.
export const authFormSchema = baseSchema
  .extend({
    confirmPassword: z.string().optional(),
  })
  .refine((data) => !data.confirmPassword || data.password === data.confirmPassword, {
    error: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type LoginFormValues = z.output<typeof loginSchema>;
export type LoginFormInput = z.input<typeof loginSchema>;
export type SignUpFormValues = z.output<typeof signUpSchema>;
export type SignUpFormInput = z.input<typeof signUpSchema>;
export type AuthFormValues = z.output<typeof authFormSchema>;
export type AuthFormInput = z.input<typeof authFormSchema>;