import { describe, expect, it } from "vitest";

import {
  addDays,
  computeCashDifference,
  firstOpenDate,
  isDateClosed,
  suggestedPeriodEnd,
} from "@/lib/caja/periodo";

describe("periodo.ts", () => {
  describe("suggestedPeriodEnd", () => {
    // 2026-10-06 es martes.
    it("DAILY sugiere ayer", () => {
      expect(suggestedPeriodEnd("DAILY", "2026-10-06")).toBe("2026-10-05");
    });

    it("WEEKLY sugiere el domingo anterior", () => {
      expect(suggestedPeriodEnd("WEEKLY", "2026-10-06")).toBe("2026-10-04");
    });

    it("WEEKLY cuando hoy es domingo retrocede una semana completa", () => {
      // 2026-10-04 es domingo.
      expect(suggestedPeriodEnd("WEEKLY", "2026-10-04")).toBe("2026-09-27");
    });

    it("MONTHLY sugiere el último día del mes anterior", () => {
      expect(suggestedPeriodEnd("MONTHLY", "2026-10-06")).toBe("2026-09-30");
    });

    it("MONTHLY en enero cae en diciembre del año anterior", () => {
      expect(suggestedPeriodEnd("MONTHLY", "2026-01-15")).toBe("2025-12-31");
    });
  });

  describe("addDays", () => {
    it("suma días cruzando fin de mes", () => {
      expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    });

    it("resta días cruzando año", () => {
      expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    });
  });

  describe("computeCashDifference", () => {
    it("es conteo menos esperado (faltante negativo)", () => {
      expect(computeCashDifference(1480, 1500)).toBe(-20);
    });

    it("es conteo menos esperado (sobrante positivo)", () => {
      expect(computeCashDifference(1520.5, 1500)).toBe(20.5);
    });

    it("devuelve null cuando no hay conteo (banco)", () => {
      expect(computeCashDifference(null, 1500)).toBeNull();
    });
  });

  describe("firstOpenDate", () => {
    it("es el día siguiente al último cierre", () => {
      expect(firstOpenDate("2026-10-31", "2026-11-05")).toBe("2026-11-01");
    });

    it("es hoy cuando la cuenta no tiene cierres", () => {
      expect(firstOpenDate(null, "2026-11-05")).toBe("2026-11-05");
    });
  });

  describe("isDateClosed", () => {
    it("es verdadero para una fecha dentro del período cerrado, inclusive su fin", () => {
      expect(isDateClosed("2026-10-31", "2026-10-31")).toBe(true);
      expect(isDateClosed("2026-10-15", "2026-10-31")).toBe(true);
    });

    it("es falso para una fecha posterior al cierre", () => {
      expect(isDateClosed("2026-11-01", "2026-10-31")).toBe(false);
    });

    it("es falso cuando no hay cierres", () => {
      expect(isDateClosed("2026-10-15", null)).toBe(false);
    });
  });
});
