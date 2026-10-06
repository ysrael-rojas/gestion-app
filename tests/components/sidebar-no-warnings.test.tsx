import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/ventas/listado",
}));

vi.mock("@/components/pagos/pagos-provider", () => ({
  usePagos: () => ({ summary: null, isSummaryLoading: false }),
}));

vi.mock("@/components/auth/sign-out-button", () => ({
  SignOutButton: () => <div data-testid="sign-out" />,
}));

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function renderSidebar() {
  return render(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>
  );
}

describe("AppSidebar", () => {
  it("ordena los grupos de arriba hacia abajo: VENTAS, COMPRAS, MAESTRO, PAGOS, CAJA Y BANCOS", () => {
    renderSidebar();

    const labels = screen
      .getAllByText(/^(VENTAS|COMPRAS|MAESTRO|PAGOS|CAJA Y BANCOS)$/, {
        selector: "span",
      })
      .map((el) => el.textContent);

    expect(labels).toEqual([
      "VENTAS",
      "COMPRAS",
      "MAESTRO",
      "PAGOS",
      "CAJA Y BANCOS",
    ]);
  });

  it("ubica CAJA Y BANCOS al primer nivel, no anidado dentro de MAESTRO", () => {
    renderSidebar();

    const label = screen.getByText("CAJA Y BANCOS", { selector: "span" });

    expect(label.closest('[data-slot="sidebar-menu"]')).not.toBeNull();
    expect(label.closest('[data-slot="sidebar-menu-sub"]')).toBeNull();
  });

  it("mantiene los tres accesos de CAJA Y BANCOS con sus rutas", () => {
    renderSidebar();

    expect(
      screen.getByRole("link", { name: /Detalle de Cuentas/i })
    ).toHaveAttribute("href", "/cajas-bancos/cuentas");
    expect(
      screen.getByRole("link", { name: /Cuadres de Caja/i })
    ).toHaveAttribute("href", "/cajas-bancos/cuadres");
    expect(
      screen.getByRole("link", { name: /Configuración/i })
    ).toHaveAttribute("href", "/cajas-bancos/configuracion");
  });

  it("no emite el warning de nativeButton de Base UI", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    renderSidebar();

    const nativeButtonWarnings = consoleErrorSpy.mock.calls.filter((args) =>
      args.some(
        (arg) =>
          typeof arg === "string" &&
          arg.includes("nativeButton") &&
          arg.includes("expected a native <button>")
      )
    );

    expect(nativeButtonWarnings).toEqual([]);

    consoleErrorSpy.mockRestore();
  });
});
