import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/comprobantes/use-voucher-series", () => ({
  useVoucherSeries: () => ({
    series: [
      {
        id: "s-1",
        voucherType: "FACTURA" as const,
        code: "F001",
        lastNumber: 125,
        isDefault: true,
        deletedAt: null,
      },
      {
        id: "s-2",
        voucherType: "BOLETA" as const,
        code: "B001",
        lastNumber: 0,
        isDefault: false,
        deletedAt: null,
      },
    ],
    isLoading: false,
    error: null,
    reload: vi.fn(async () => {}),
  }),
}));

vi.mock("@/lib/comprobantes/series", () => ({
  softDeleteSeries: vi.fn(),
  createSeries: vi.fn(),
  updateSeries: vi.fn(),
  formatSeriesCorrelative: (value: number) => String(value).padStart(6, "0"),
}));

import { SeriesView } from "@/components/configuracion/series-view";

describe("SeriesView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista las series con tipo, correlativo y marca de predeterminada", () => {
    render(<SeriesView />);

    expect(screen.getByText("Factura")).toBeInTheDocument();
    expect(screen.getByText("F001")).toBeInTheDocument();
    expect(screen.getByText("000125")).toBeInTheDocument();
    expect(screen.getByText("Predeterminada")).toBeInTheDocument();
    expect(screen.getByText("Boleta")).toBeInTheDocument();
    expect(screen.getByText("000000")).toBeInTheDocument();
  });

  it("abre el modal de alta al pulsar Agregar serie", async () => {
    const user = userEvent.setup();
    render(<SeriesView />);

    await user.click(screen.getByRole("button", { name: "Agregar serie" }));

    expect(
      await screen.findByRole("heading", { name: "Agregar serie" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo de comprobante")).toBeInTheDocument();
    expect(screen.getByLabelText("Serie")).toBeInTheDocument();
    expect(screen.getAllByText("Requerido")).toHaveLength(2);
  });
});
