import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Crear cuenta",
};

export default function SignUpPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Crear cuenta</h1>
        <p className="text-sm text-muted-foreground">
          Tus datos quedarán asociados a tu cuenta
        </p>
        <p className="text-xs text-muted-foreground">
          Si el proyecto pide confirmación de correo, activatora antes de
          intentar iniciar sesión.
        </p>
      </div>
      <AuthForm mode="signup" />
    </main>
  );
}