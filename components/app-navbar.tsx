"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Building2,
  Calculator,
  Database,
  FileCheck,
  FileMinus,
  FilePlus,
  FileText,
  Landmark,
  LayoutDashboard,
  Receipt,
  Scale,
  ScrollText,
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
  { label: "Ventas", href: "/ventas", icon: Receipt },
  { label: "Compras", href: "/compras", icon: ShoppingCart },
];

/** Marca activa la entrada también en sus rutas hijas (/ventas/nuevo, /ventas/[id]...). */
function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const groups: NavGroup[] = [
  {
    label: "Notas y retenciones",
    icon: FileText,
    items: [
      { label: "Notas de crédito", href: "/notas/credito", icon: FileMinus },
      { label: "Notas de débito", href: "/notas/debito", icon: FilePlus },
      {
        label: "Comprobante de retención",
        href: "/retenciones",
        icon: FileCheck,
      },
    ],
  },
  {
    label: "Maestro",
    icon: Database,
    items: [
      { label: "Clientes/Proveedores", href: "/clientes/listado", icon: Users },
    ],
  },
  {
    label: "Pagos",
    icon: Wallet,
    items: [
      { label: "Ingresos", href: "/pagos/ingresos", icon: ArrowDownCircle },
      { label: "Egresos", href: "/pagos/egresos", icon: ArrowUpCircle },
    ],
  },
  {
    label: "Caja y bancos",
    icon: Landmark,
    items: [
      { label: "Resumen", href: "/cajas-bancos", icon: LayoutDashboard },
      { label: "Detalle de Cuentas", href: "/cajas-bancos/cuentas", icon: Wallet },
      { label: "Cuadres de Caja", href: "/cajas-bancos/cuadres", icon: Calculator },
      {
        label: "Conciliación",
        href: "/cajas-bancos/conciliacion",
        icon: Scale,
      },
      { label: "Extractos", href: "/cajas-bancos/extractos", icon: ScrollText },
      { label: "Configuración", href: "/cajas-bancos/configuracion", icon: Settings },
    ],
  },
  {
    label: "Configuración",
    icon: Settings,
    items: [
      {
        label: "Series de comprobantes",
        href: "/configuracion",
        icon: Settings,
      },
    ],
  },
];

export function AppNavbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full px-4 pt-4">
      <div className="mx-auto flex h-14 w-full items-center gap-3 rounded-2xl border-[3px] border-ink bg-card px-3 shadow-[var(--clay-shadow)]">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg border-[3px] border-ink bg-pastel-mint">
            <Building2 className="size-5" />
          </span>
          <span className="hidden font-heading text-base font-semibold sm:inline">
            Gestión Comercial
          </span>
        </Link>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <NavigationMenu>
            <NavigationMenuList>
              {directLinks.map((item) => (
                <NavigationMenuItem key={item.href}>
                  <NavigationMenuLink
                    active={isPathActive(pathname, item.href)}
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
                        "bg-pastel-mint text-brand-strong hover:text-brand-strong"
                    )}
                  >
                    <group.icon />
                    <span>{group.label}</span>
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-56 gap-1 p-1.5">
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
      </div>
    </header>
  );
}
