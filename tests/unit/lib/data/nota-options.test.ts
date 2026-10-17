import { describe, expect, it } from "vitest";

import {
  ADJUSTMENT_VOUCHER_TYPES,
  CREDIT_NOTE_MOTIVES,
  DEBIT_NOTE_MOTIVES,
  NOTE_MOTIVES,
  NOTA_RELATIONS,
  RETENCION_RELATIONS,
} from "@/lib/data/nota-options";

describe("nota-options", () => {
  it("lista los motivos de nota de crédito del catálogo SUNAT (sin el 08)", () => {
    expect(CREDIT_NOTE_MOTIVES.map((motive) => motive.value)).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "09",
      "10",
    ]);
  });

  it("lista los motivos de nota de débito del catálogo SUNAT", () => {
    expect(DEBIT_NOTE_MOTIVES.map((motive) => motive.value)).toEqual([
      "01",
      "02",
      "03",
    ]);
  });

  it("todas las etiquetas de motivo están en español y sin vacíos", () => {
    for (const motive of [...CREDIT_NOTE_MOTIVES, ...DEBIT_NOTE_MOTIVES]) {
      expect(motive.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("NOTE_MOTIVES asocia cada tipo de nota con su catálogo", () => {
    expect(NOTE_MOTIVES.NOTA_CREDITO).toBe(CREDIT_NOTE_MOTIVES);
    expect(NOTE_MOTIVES.NOTA_DEBITO).toBe(DEBIT_NOTE_MOTIVES);
  });

  it("define etiquetas para los tres tipos de ajuste", () => {
    expect(ADJUSTMENT_VOUCHER_TYPES).toEqual([
      { value: "NOTA_CREDITO", label: "Nota de crédito" },
      { value: "NOTA_DEBITO", label: "Nota de débito" },
      { value: "COMPROBANTE_RETENCION", label: "Comprobante de retención" },
    ]);
  });

  it("expone Emitida/Recibida para notas y solo Recibida para retenciones", () => {
    expect(NOTA_RELATIONS.map((relation) => relation.label)).toEqual([
      "Emitida",
      "Recibida",
    ]);
    expect(RETENCION_RELATIONS).toEqual([
      { value: "RECIBIDA", label: "Recibida" },
    ]);
  });
});
