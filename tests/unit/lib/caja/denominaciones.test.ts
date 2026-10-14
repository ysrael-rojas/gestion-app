import { describe, expect, it } from "vitest";

import {
  PEN_DENOMINATIONS,
  denominationKind,
  formatDenomination,
  isPenDenomination,
  netCash,
  sumDenominationCounts,
  toDenominationPayload,
} from "@/lib/caja/denominaciones";

describe("denominaciones", () => {
  it("lista las denominaciones del sol de S/ 200 a S/ 0.10", () => {
    expect(PEN_DENOMINATIONS).toEqual([
      200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1,
    ]);
  });

  it("reconoce solo las denominaciones válidas", () => {
    expect(isPenDenomination(200)).toBe(true);
    expect(isPenDenomination(0.1)).toBe(true);
    expect(isPenDenomination(25)).toBe(false);
    expect(isPenDenomination(0.25)).toBe(false);
  });

  it("formatea la etiqueta según el formato de arqueo", () => {
    expect(formatDenomination(200)).toBe("S/ 200");
    expect(formatDenomination(2)).toBe("S/ 2");
    expect(formatDenomination(0.5)).toBe("S/ 0.50");
  });

  it("distingue billetes de monedas", () => {
    expect(denominationKind(200)).toBe("Billete");
    expect(denominationKind(2)).toBe("Billete");
    expect(denominationKind(1)).toBe("Moneda");
    expect(denominationKind(0.1)).toBe("Moneda");
  });

  it("suma los subtotales del conteo", () => {
    const total = sumDenominationCounts([
      { denomination: 100, quantity: 3 },
      { denomination: 50, quantity: 2 },
      { denomination: 0.5, quantity: 1 },
    ]);

    expect(total).toBe(400.5);
  });

  it("ignora las filas sin cantidad y los conteos vacíos", () => {
    expect(
      sumDenominationCounts([
        { denomination: 200, quantity: undefined },
        { denomination: 10, quantity: 2 },
      ])
    ).toBe(20);
    expect(sumDenominationCounts([])).toBe(0);
    expect(sumDenominationCounts(undefined)).toBe(0);
  });

  it("redondea el ruido de punto flotante", () => {
    // 0.1 + 0.2 en binario da 0.30000000000000004.
    expect(
      sumDenominationCounts([
        { denomination: 0.1, quantity: 1 },
        { denomination: 0.2, quantity: 1 },
      ])
    ).toBe(0.3);
  });

  it("construye el payload solo con las filas contadas", () => {
    expect(
      toDenominationPayload([
        { denomination: 200, quantity: 0 },
        { denomination: 100, quantity: 2 },
        { denomination: 50, quantity: undefined },
        { denomination: 0.1, quantity: 5 },
      ])
    ).toEqual([
      { denomination: 100, quantity: 2 },
      { denomination: 0.1, quantity: 5 },
    ]);
    expect(toDenominationPayload(undefined)).toEqual([]);
  });

  it("calcula el efectivo neto restando el fondo de cambio", () => {
    expect(netCash(400.5, 100)).toBe(300.5);
    expect(netCash(100, null)).toBe(100);
    expect(netCash(50, 100)).toBe(-50);
  });
});
