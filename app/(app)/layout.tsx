import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { CajasBancosProvider } from "@/components/cajas-bancos/cajas-bancos-provider";
import { ClientesProvider } from "@/components/clientes/clientes-provider";
import { ComprasProvider } from "@/components/compras/compras-provider";
import { PagosProvider } from "@/components/pagos/pagos-provider";
import { VentasProvider } from "@/components/ventas/ventas-provider";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
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
    <SidebarProvider>
      <ClientesProvider>
        <CajasBancosProvider>
          <VentasProvider>
            <ComprasProvider>
              <PagosProvider>
                <AppSidebar />
                <SidebarInset>
                  <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                    <SidebarTrigger />
                  </header>
                  {children}
                </SidebarInset>
              </PagosProvider>
            </ComprasProvider>
          </VentasProvider>
        </CajasBancosProvider>
      </ClientesProvider>
    </SidebarProvider>
  );
}