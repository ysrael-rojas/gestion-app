"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChevronRight,
  Database,
  Receipt,
  ShoppingCart,
  Users,
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

const menu = {
  group: "MAESTRO",
  items: [{ label: "Clientes/Proveedores", href: "/clientes/listado" }],
};

export function AppSidebar() {
  const pathname = usePathname();

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
                        <Users />
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
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
