"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Building2,
  Calculator,
  Database,
  Landmark,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

type NavLink = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type NavGroup = {
  label: string;
  icon: LucideIcon;
  items: NavLink[];
};

const directLinks: NavLink[] = [
  { label: "VENTAS", href: "/ventas/listado", icon: Receipt },
  { label: "COMPRAS", href: "/compras/listado", icon: ShoppingCart },
];

const groups: NavGroup[] = [
  {
    label: "MAESTRO",
    icon: Database,
    items: [
      { label: "Clientes/Proveedores", href: "/clientes/listado", icon: Users },
    ],
  },
  {
    label: "PAGOS",
    icon: Wallet,
    items: [
      { label: "INGRESOS", href: "/pagos/ingresos", icon: ArrowDownCircle },
      { label: "EGRESOS", href: "/pagos/egresos", icon: ArrowUpCircle },
    ],
  },
  {
    label: "CAJA Y BANCOS",
    icon: Landmark,
    items: [
      { label: "Detalle de Cuentas", href: "/cajas-bancos/cuentas", icon: Wallet },
      { label: "Cuadres de Caja", href: "/cajas-bancos/cuadres", icon: Calculator },
      { label: "Configuración", href: "/cajas-bancos/configuracion", icon: Settings },
    ],
  },
];

export function AppNavbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center gap-3 border-b bg-background px-4">
      <Link href="/" className="flex shrink-0 items-center gap-2">
        <Building2 className="size-5" />
        <span className="hidden font-semibold sm:inline">
          GESTION COMERCIAL
        </span>
      </Link>

      <div className="min-w-0 flex-1 overflow-x-auto">
        <NavigationMenu>
          <NavigationMenuList>
            {directLinks.map((item) => (
              <NavigationMenuItem key={item.href}>
                <NavigationMenuLink
                  active={pathname === item.href}
                  render={<Link href={item.href} />}
                  className={cn(navigationMenuTriggerStyle(), "gap-2")}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}

            {groups.map((group) => (
              <NavigationMenuItem key={group.label}>
                <NavigationMenuTrigger
                  className={cn(
                    "gap-2",
                    group.items.some((item) => item.href === pathname) &&
                      "bg-muted/50"
                  )}
                >
                  <group.icon />
                  <span>{group.label}</span>
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-56 gap-1 p-1">
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <NavigationMenuLink
                          active={pathname === item.href}
                          closeOnClick
                          render={<Link href={item.href} />}
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </NavigationMenuLink>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
      </div>

      <div className="shrink-0">
        <SignOutButton className="w-auto justify-center" />
      </div>
    </header>
  );
}
