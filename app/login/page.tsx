import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Gestión</h1>
        <p className="text-sm text-muted-foreground">
          Ventas, compras, pagos y cajas
        </p>
      </div>
      <AuthForm mode="login" />
    </main>
  );
}