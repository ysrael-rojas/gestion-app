"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Building2,
  ChevronRight,
  Database,
  Landmark,
  Receipt,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { usePagos } from "@/components/pagos/pagos-provider";

const menu = {
  group: "MAESTRO",
  items: [
    { label: "Clientes/Proveedores", href: "/clientes/listado" },
    { label: "Cajas y Bancos", href: "/cajas-bancos/listado" },
  ],
};

export function AppSidebar() {
  const pathname = usePathname();
  const { summary, isSummaryLoading } = usePagos();

  const ingresosCount = summary
    ? summary.receivable.count + summary.unassignedReceipts.count
    : 0;
  const egresosCount = summary
    ? summary.payable.count + summary.unassignedPayments.count
    : 0;
  const pagosCount = ingresosCount + egresosCount;
  const showBadge = (count: number) => !isSummaryLoading && count > 0;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Building2 className="size-5 shrink-0" />
          <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
            GESTION COMERCIAL
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <Collapsible defaultOpen render={<SidebarMenuItem />}>
              <CollapsibleTrigger
                render={<SidebarMenuButton tooltip={menu.group} />}
              >
                <Database />
                <span>{menu.group}</span>
                <ChevronRight className="ml-auto transition-transform duration-200 [[data-panel-open]_&]:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {menu.items.map((item) => (
                    <SidebarMenuSubItem key={item.href}>
                      <SidebarMenuSubButton
                        render={<Link href={item.href} />}
                        isActive={pathname === item.href}
                      >
                        {item.label === "Cajas y Bancos" ? <Landmark /> : <Users />}
                        <span>{item.label}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href="/ventas/listado" />}
                isActive={pathname === "/ventas/listado"}
                tooltip="VENTAS"
              >
                <Receipt />
                <span>VENTAS</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href="/compras/listado" />}
                isActive={pathname === "/compras/listado"}
                tooltip="COMPRAS"
              >
                <ShoppingCart />
                <span>COMPRAS</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <Collapsible defaultOpen render={<SidebarMenuItem />}>
              <CollapsibleTrigger
                render={<SidebarMenuButton tooltip="PAGOS" />}
              >
                <Wallet />
                <span>PAGOS</span>
                <ChevronRight className="ml-auto transition-transform duration-200 [[data-panel-open]_&]:rotate-90" />
              </CollapsibleTrigger>
              {showBadge(pagosCount) ? (
                <SidebarMenuBadge className="group-data-[collapsible=icon]:flex">
                  {pagosCount}
                </SidebarMenuBadge>
              ) : null}
              <CollapsibleContent>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      render={<Link href="/pagos/ingresos" />}
                      isActive={pathname === "/pagos/ingresos"}
                    >
                      <ArrowDownCircle />
                      <span>INGRESOS</span>
                    </SidebarMenuSubButton>
                    {showBadge(ingresosCount) ? (
                      <SidebarMenuBadge>{ingresosCount}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      render={<Link href="/pagos/egresos" />}
                      isActive={pathname === "/pagos/egresos"}
                    >
                      <ArrowUpCircle />
                      <span>EGRESOS</span>
                    </SidebarMenuSubButton>
                    {showBadge(egresosCount) ? (
                      <SidebarMenuBadge>{egresosCount}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
