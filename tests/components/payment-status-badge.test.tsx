import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaymentStatusBadge } from "@/components/shared/payment-status-badge";

describe("PaymentStatusBadge", () => {
  it("renderiza PAGADO con variante verde (emerald)", () => {
    render(<PaymentStatusBadge status="PAGADO" />);

    const badge = screen.getByText("Pagado");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("emerald");
  });

  it("renderiza PENDIENTE con variante roja (red)", () => {
    render(<PaymentStatusBadge status="PENDIENTE" />);

    const badge = screen.getByText("Pendiente");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("red");
  });

  it("acepta className adicional sin romper estilos base", () => {
    render(<PaymentStatusBadge status="PAGADO" className="ml-2" />);

    const badge = screen.getByText("Pagado");
    expect(badge.className).toContain("emerald");
    expect(badge.className).toContain("ml-2");
  });
});
