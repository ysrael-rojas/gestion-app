import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/lib/utils";

// Intl puede usar espacio no separable (U+00A0) tras el símbolo.
const normalize = (value: string) =>
  value.split(String.fromCharCode(160)).join(" ");

describe("formatCurrency", () => {
  it("formatea en soles por defecto (S/)", () => {
    expect(normalize(formatCurrency(1234.5))).toBe("S/ 1,234.50");
  });

  it("formatea en soles cuando se pasa PEN explícito", () => {
    expect(normalize(formatCurrency(1234.5, "PEN"))).toBe("S/ 1,234.50");
  });

  it("formatea en dólares cuando se pasa USD", () => {
    expect(normalize(formatCurrency(1234.5, "USD"))).toBe("$ 1,234.50");
  });

  it("mantiene 2 decimales en ambas monedas", () => {
    expect(normalize(formatCurrency(10, "PEN"))).toBe("S/ 10.00");
    expect(normalize(formatCurrency(10, "USD"))).toBe("$ 10.00");
  });

  it("formatea montos negativos con el signo de la moneda", () => {
    expect(normalize(formatCurrency(-5, "USD"))).toBe("-$ 5.00");
  });
});
