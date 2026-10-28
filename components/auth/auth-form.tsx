"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, type AuthFormState } from "@/app/login/actions";
import { loginSchema, type LoginFormInput } from "@/lib/schemas/auth";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/**
 * Solo inicio de sesión. El alta de cuentas no existe en la app: las crea el
 * dueño desde el panel de Supabase (SPEC 56).
 */
export function AuthForm() {
  const [isPending, startTransition] = useTransition();
  const [serverState, setServerState] = useState<AuthFormState>({
    error: null,
    success: null,
  });

  const form = useForm<LoginFormInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const onSubmit = (values: LoginFormInput) => {
    const formData = new FormData();
    formData.set("email", values.email ?? "");
    formData.set("password", values.password ?? "");

    startTransition(async () => {
      setServerState(await signIn({ error: null, success: null }, formData));
    });
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
        <CardDescription>Ingresa con tu correo y contraseña</CardDescription>
      </CardHeader>
      <CardContent>
        {/* noValidate: la validación nativa de required/type=email bloquea el submit
        antes de que corra handleSubmit, dejando los mensajes de zod
        inalcanzables. El schema es el único dueño de la validación. */}
        <form
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            <FieldError message={errors.email?.message} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <FieldError message={errors.password?.message} />
          </div>

          {serverState.error && (
            <p role="alert" className="text-sm text-destructive">
              {serverState.error}
            </p>
          )}
          {serverState.success && (
            <p role="status" className="text-sm text-muted-foreground">
              {serverState.success}
            </p>
          )}

          <Button type="submit" disabled={isPending}>
            {isPending ? "Procesando..." : "Iniciar sesión"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
