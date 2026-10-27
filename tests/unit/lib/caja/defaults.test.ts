import { describe, expect, it } from "vitest";
import {
  categoryCodeFromName,
  DEFAULT_CATEGORIES,
} from "@/lib/caja/defaults";

describe("categoryCodeFromName", () => {
  it("genera un slug en mayúsculas sin acentos ni espacios", () => {
    expect(categoryCodeFromName("Comisión bancaria")).toBe("COMISION_BANCARIA");
    expect(categoryCodeFromName("Detracción SPOT")).toBe("DETRACCION_SPOT");
  });

  it("colapsa separadores y limpia los bordes", () => {
    expect(categoryCodeFromName("  Gastos  varios!! ")).toBe("GASTOS_VARIOS");
    expect(categoryCodeFromName("Retiro del propietario")).toBe(
      "RETIRO_DEL_PROPIETARIO"
    );
  });

  it("devuelve vacío cuando el nombre no tiene letras ni números", () => {
    expect(categoryCodeFromName("!!!")).toBe("");
  });
});

describe("DEFAULT_CATEGORIES", () => {
  it("las semillas tienen código único por dirección", () => {
    for (const direction of ["INGRESO", "EGRESO"] as const) {
      const codes = DEFAULT_CATEGORIES[direction].map((seed) => seed.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("incluye las categorías de movimiento de caja (SPEC 50)", () => {
    const codes = DEFAULT_CATEGORIES.INGRESO.map((seed) => seed.code);

    expect(codes).toContain("APORTE_PROPIETARIO");
    expect(codes).toContain("ABONO_BANCARIO");
  });
});
