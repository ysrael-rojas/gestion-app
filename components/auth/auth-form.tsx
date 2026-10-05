"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
import { signIn, signUp, type AuthFormState } from "@/app/login/actions";
import { authFormSchema, type AuthFormInput } from "@/lib/schemas/auth";

type AuthMode = "login" | "signup";

const COPY = {
  login: {
    title: "Iniciar sesión",
    description: "Ingresa con tu correo y contraseña",
    submit: "Iniciar sesión",
    switchPrompt: "¿No tienes cuenta?",
    switchLabel: "Crear cuenta",
    switchHref: "/registro",
  },
  signup: {
    title: "Crear cuenta",
    description: "Registra tu cuenta para acceder al sistema",
    submit: "Crear cuenta",
    switchPrompt: "¿Ya tienes cuenta?",
    switchLabel: "Iniciar sesión",
    switchHref: "/login",
  },
} as const;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const copy = COPY[mode];
  const [isPending, startTransition] = useTransition();
  const [serverState, setServerState] = useState<AuthFormState>({
    error: null,
    success: null,
  });

  const form = useForm<AuthFormInput>({
    resolver: zodResolver(authFormSchema),
    defaultValues:
      mode === "signup"
        ? { email: "", password: "", confirmPassword: "" }
        : { email: "", password: "" },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const onSubmit = (values: AuthFormInput) => {
    const formData = new FormData();
    formData.set("email", values.email ?? "");
    formData.set("password", values.password ?? "");
    if (mode === "signup") {
      formData.set("confirmPassword", values.confirmPassword ?? "");
    }

    startTransition(async () => {
      const action = mode === "signup" ? signUp : signIn;
      setServerState(await action({ error: null, success: null }, formData));
    });
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
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
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              required
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <FieldError message={errors.password?.message} />
          </div>

          {mode === "signup" && (
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                aria-invalid={Boolean(errors.confirmPassword)}
                {...register("confirmPassword")}
              />
              <FieldError message={errors.confirmPassword?.message} />
            </div>
          )}

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
            {isPending ? "Procesando..." : copy.submit}
          </Button>

          <p className="text-sm text-muted-foreground">
            {copy.switchPrompt}{" "}
            <Link href={copy.switchHref} className="underline">
              {copy.switchLabel}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}