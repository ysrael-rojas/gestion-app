import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/ventas/listado",
}));

vi.mock("@/components/auth/sign-out-button", () => ({
  SignOutButton: () => <div data-testid="sign-out" />,
}));

import { AppNavbar } from "@/components/app-navbar";

describe("AppNavbar", () => {
  it("ordena las entradas de izquierda a derecha: VENTAS, COMPRAS, MAESTRO, PAGOS, CAJA Y BANCOS", () => {
    render(<AppNavbar />);

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

  it("enlaza VENTAS y COMPRAS directamente a sus listados", () => {
    render(<AppNavbar />);

    expect(screen.getByRole("link", { name: /VENTAS/ })).toHaveAttribute(
      "href",
      "/ventas/listado"
    );
    expect(screen.getByRole("link", { name: /COMPRAS/ })).toHaveAttribute(
      "href",
      "/compras/listado"
    );
  });

  it("muestra el cierre de sesión", () => {
    render(<AppNavbar />);

    expect(screen.getByTestId("sign-out")).toBeInTheDocument();
  });

  it("abre el grupo CAJA Y BANCOS con sus tres rutas", async () => {
    const user = userEvent.setup();
    render(<AppNavbar />);

    await user.click(screen.getByRole("button", { name: /CAJA Y BANCOS/i }));

    expect(
      await screen.findByRole("link", { name: /Detalle de Cuentas/i })
    ).toHaveAttribute("href", "/cajas-bancos/cuentas");
    expect(
      screen.getByRole("link", { name: /Cuadres de Caja/i })
    ).toHaveAttribute("href", "/cajas-bancos/cuadres");
    expect(
      screen.getByRole("link", { name: /Configuración/i })
    ).toHaveAttribute("href", "/cajas-bancos/configuracion");
  });

  it("abre el grupo PAGOS con sus rutas", async () => {
    const user = userEvent.setup();
    render(<AppNavbar />);

    await user.click(screen.getByRole("button", { name: /^PAGOS$/i }));

    expect(
      await screen.findByRole("link", { name: /INGRESOS/i })
    ).toHaveAttribute("href", "/pagos/ingresos");
    expect(
      screen.getByRole("link", { name: /EGRESOS/i })
    ).toHaveAttribute("href", "/pagos/egresos");
  });

  it("abre el grupo MAESTRO con su ruta", async () => {
    const user = userEvent.setup();
    render(<AppNavbar />);

    await user.click(screen.getByRole("button", { name: /^MAESTRO$/i }));

    expect(
      await screen.findByRole("link", { name: /Clientes\/Proveedores/i })
    ).toHaveAttribute("href", "/clientes/listado");
  });

  it("no emite el warning de nativeButton de Base UI", async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(<AppNavbar />);

    await user.click(screen.getByRole("button", { name: /CAJA Y BANCOS/i }));

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
