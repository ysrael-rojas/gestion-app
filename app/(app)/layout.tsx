import { redirect } from "next/navigation";

import { AppNavbar } from "@/components/app-navbar";
import { CajasBancosProvider } from "@/components/cajas-bancos/cajas-bancos-provider";
import { ClientesProvider } from "@/components/clientes/clientes-provider";
import { ComprasProvider } from "@/components/compras/compras-provider";
import { PagosProvider } from "@/components/pagos/pagos-provider";
import { VentasProvider } from "@/components/ventas/ventas-provider";
import { createClient } from "@/lib/supabase/server";

export default async function AuthenticatedLayout({
  children,
}: LayoutProps<"/">) {
  // Defensa en servidor: proxy.ts ya redirige sin sesión, pero un layout
  // protegido no debe depender de un único punto de control.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <ClientesProvider>
      <CajasBancosProvider>
        <VentasProvider>
          <ComprasProvider>
            <PagosProvider>
              <div className="flex min-h-svh flex-col">
                <AppNavbar />
                <main className="flex-1">{children}</main>
              </div>
            </PagosProvider>
          </ComprasProvider>
        </VentasProvider>
      </CajasBancosProvider>
    </ClientesProvider>
  );
}
