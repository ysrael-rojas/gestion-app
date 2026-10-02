import { describe, expect, it } from "vitest";
import { computeBalance, isOverdue } from "@/lib/pagos/saldos";

describe("computeBalance", () => {
  it("devuelve la diferencia redondeada a 2 decimales cuando hay saldo", () => {
    expect(computeBalance(100, 25)).toBe(75);
  });

  it("redondea correctamente cuando hay 3+ decimales", () => {
    expect(computeBalance(100, 33.336)).toBe(66.66);
  });

  it("devuelve 0 cuando el monto pagado iguala al total", () => {
    expect(computeBalance(100, 100)).toBe(0);
  });

  it("devuelve 0 cuando el monto pagado excede al total (no negativos)", () => {
    expect(computeBalance(100, 150)).toBe(0);
  });

  it("devuelve el total cuando no se pagó nada", () => {
    expect(computeBalance(50, 0)).toBe(50);
  });
});

describe("isOverdue", () => {
  const today = "2026-10-01";

  it("devuelve true cuando la fecha de vencimiento es anterior a hoy y hay saldo", () => {
    expect(isOverdue("2026-09-30", 100, today)).toBe(true);
  });

  it("devuelve false cuando la fecha de vencimiento es posterior a hoy y hay saldo", () => {
    expect(isOverdue("2026-10-02", 100, today)).toBe(false);
  });

  it("devuelve false cuando la fecha de vencimiento es exactamente hoy (estricto)", () => {
    expect(isOverdue("2026-10-01", 100, today)).toBe(false);
  });

  it("devuelve false cuando el balance es cero, aunque esté vencido", () => {
    expect(isOverdue("2026-09-30", 0, today)).toBe(false);
  });

  it("devuelve false cuando el balance es negativo, aunque esté vencido", () => {
    expect(isOverdue("2026-09-30", -10, today)).toBe(false);
  });

  it("devuelve false cuando no hay fecha de vencimiento", () => {
    expect(isOverdue(null, 100, today)).toBe(false);
  });
});
