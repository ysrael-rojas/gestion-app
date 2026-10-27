import { describe, expect, it } from "vitest";

import {
  formatReceiptRanges,
  summarizeReceiptSequence,
  summarizeStatement,
} from "@/lib/caja/reportes";

describe("reportes.ts", () => {
  it("calcula el primer y último recibo por prefijo", () => {
    const summary = summarizeReceiptSequence([
      { receiptNumber: "RI-000012", status: "EN_REVISION" },
      { receiptNumber: "RI-000031", status: "PROCESADO" },
      { receiptNumber: "RI-000020", status: "EN_REVISION" },
      { receiptNumber: "RE-000004", status: "EN_REVISION" },
      { receiptNumber: "RE-000006", status: "EN_REVISION" },
    ]);

    expect(summary.ranges).toEqual([
      { prefix: "RE-", first: "RE-000004", last: "RE-000006", count: 2 },
      { prefix: "RI-", first: "RI-000012", last: "RI-000031", count: 3 },
    ]);
    expect(formatReceiptRanges(summary)).toBe(
      "RE-000004 → RE-000006 · RI-000012 → RI-000031"
    );
  });

  it("cuenta los recibos anulados del período", () => {
    const summary = summarizeReceiptSequence([
      { receiptNumber: "RI-000001", status: "ANULADO" },
      { receiptNumber: "RI-000002", status: "EN_REVISION" },
      { receiptNumber: "RI-000003", status: "ANULADO" },
    ]);

    expect(summary.annulled).toBe(2);
  });

  it("muestra un solo número cuando el rango es de un recibo", () => {
    const summary = summarizeReceiptSequence([
      { receiptNumber: "RI-000005", status: "EN_REVISION" },
    ]);

    expect(formatReceiptRanges(summary)).toBe("RI-000005");
  });

  it("devuelve — sin recibos e ignora números vacíos", () => {
    expect(formatReceiptRanges(summarizeReceiptSequence([]))).toBe("—");
    expect(
      formatReceiptRanges(
        summarizeReceiptSequence([{ receiptNumber: "  ", status: "ANULADO" }])
      )
    ).toBe("—");
    expect(
      summarizeReceiptSequence([{ receiptNumber: "", status: "ANULADO" }])
        .annulled
    ).toBe(1);
  });
});

describe("summarizeStatement", () => {
  it("suma ingresos y egresos sin anulados y cuenta transferencias", () => {
    const summary = summarizeStatement(
      [
        { direction: "INGRESO", amount: 100, status: "EN_REVISION" },
        { direction: "INGRESO", amount: 50, status: "ANULADO" },
        { direction: "EGRESO", amount: 30, status: "PROCESADO" },
      ],
      [{ id: "t-1" }, { id: "t-2" }]
    );

    expect(summary).toEqual({
      income: 100,
      expense: 30,
      movements: 2,
      transfers: 2,
    });
  });

  it("devuelve cero sin movimientos", () => {
    expect(summarizeStatement([], [])).toEqual({
      income: 0,
      expense: 0,
      movements: 0,
      transfers: 0,
    });
  });

  it("redondea los totales a dos decimales", () => {
    const summary = summarizeStatement(
      [
        { direction: "INGRESO", amount: 0.1, status: "EN_REVISION" },
        { direction: "INGRESO", amount: 0.2, status: "EN_REVISION" },
      ],
      []
    );

    expect(summary.income).toBe(0.3);
  });
});
