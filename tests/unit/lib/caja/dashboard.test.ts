import { describe, expect, it } from "vitest";

import {
  getMonthRange,
  summarizeCashFlow,
  summarizePositions,
  toPen,
} from "@/lib/caja/dashboard";

describe("getMonthRange", () => {
  it("devuelve el primer y último día del mes de la fecha dada", () => {
    expect(getMonthRange("2026-10-14")).toEqual({
      start: "2026-10-01",
      end: "2026-10-31",
    });
  });

  it("resuelve meses de 30 días", () => {
    expect(getMonthRange("2026-11-07")).toEqual({
      start: "2026-11-01",
      end: "2026-11-30",
    });
  });

  it("resuelve febrero en año bisiesto", () => {
    expect(getMonthRange("2028-02-20")).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
  });

  it("resuelve febrero en año no bisiesto", () => {
    expect(getMonthRange("2026-02-20")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });
});

describe("summarizeCashFlow", () => {
  it("suma ingresos y egresos y calcula el neto", () => {
    const result = summarizeCashFlow([
      { direction: "INGRESO", amount: 1000 },
      { direction: "INGRESO", amount: 250.5 },
      { direction: "EGRESO", amount: 400 },
    ]);

    expect(result).toEqual({ income: 1250.5, expense: 400, net: 850.5 });
  });

  it("devuelve ceros cuando no hay movimientos", () => {
    expect(summarizeCashFlow([])).toEqual({ income: 0, expense: 0, net: 0 });
  });

  it("permite un neto negativo", () => {
    const result = summarizeCashFlow([
      { direction: "INGRESO", amount: 100 },
      { direction: "EGRESO", amount: 350 },
    ]);

    expect(result.net).toBe(-250);
  });

  it("redondea a dos decimales para evitar ruido de punto flotante", () => {
    const result = summarizeCashFlow([
      { direction: "INGRESO", amount: 0.1 },
      { direction: "INGRESO", amount: 0.2 },
    ]);

    expect(result.income).toBe(0.3);
  });
});

describe("summarizePositions", () => {  it("totaliza y separa caja de banco", () => {
    const result = summarizePositions([
      { type: "CASH_BOX", balance: 500 },
      { type: "BANK_ACCOUNT", balance: 9320 },
      { type: "CASH_BOX", balance: 462 },
    ]);

    expect(result).toEqual({
      total: 10282,
      cashTotal: 962,
      bankTotal: 9320,
      count: 3,
    });
  });

  it("el total cuadra con la suma de las cuentas individuales", () => {
    const positions = [
      { type: "CASH_BOX" as const, balance: 125.25 },
      { type: "BANK_ACCOUNT" as const, balance: 300.75 },
    ];

    const result = summarizePositions(positions);

    expect(result.total).toBe(
      positions.reduce((sum, p) => sum + p.balance, 0)
    );
  });

  it("devuelve ceros sin cuentas", () => {
    expect(summarizePositions([])).toEqual({
      total: 0,
      cashTotal: 0,
      bankTotal: 0,
      count: 0,
    });
  });
});

describe("toPen", () => {
  it("deja los saldos en soles igual", () => {
    expect(toPen(100, "PEN", 3.75)).toBe(100);
  });

  it("convierte dólares con el tipo de cambio", () => {
    expect(toPen(100, "USD", 3.75)).toBe(375);
  });

  it("cuenta los dólares como 0 sin tipo de cambio", () => {
    expect(toPen(100, "USD", null)).toBe(0);
  });
});
