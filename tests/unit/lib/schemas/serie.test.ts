import { describe, expect, it } from "vitest";

import { serieFormSchema } from "@/lib/schemas/serie";

const validSerie = () => ({
  voucherType: "FACTURA" as const,
  code: "F001",
  isDefault: true,
});

describe("serieFormSchema", () => {
  it("acepta una serie válida", () => {
    const result = serieFormSchema.safeParse(validSerie());
    expect(result.success).toBe(true);
  });

  it("recorta espacios y acepta el código en minúsculas", () => {
    const result = serieFormSchema.safeParse({
      ...validSerie(),
      code: " f001 ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("f001");
    }
  });

  it("rechaza un código vacío", () => {
    const result = serieFormSchema.safeParse({ ...validSerie(), code: "  " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "El código de serie es requerido"
      );
    }
  });

  it("rechaza códigos de más de 4 caracteres o con símbolos", () => {
    for (const code of ["F0001", "F00-1", "F 01", "F_01"]) {
      const result = serieFormSchema.safeParse({ ...validSerie(), code });
      expect(result.success, code).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "Usa 1 a 4 caracteres alfanuméricos, por ejemplo F001"
        );
      }
    }
  });

  it("rechaza un tipo de comprobante fuera del catálogo", () => {
    const result = serieFormSchema.safeParse({
      ...validSerie(),
      voucherType: "OTRO",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Selecciona el tipo de comprobante"
      );
    }
  });
});
