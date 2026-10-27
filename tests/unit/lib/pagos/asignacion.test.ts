import { describe, expect, it } from "vitest";

import { getAssignState } from "@/lib/pagos/asignacion";

describe("asignacion.ts", () => {
  it("marca POR_ASIGNAR cuando hay saldo pendiente", () => {
    expect(getAssignState("EN_REVISION", 400)).toBe("POR_ASIGNAR");
    expect(getAssignState("PROCESADO", 0.01)).toBe("POR_ASIGNAR");
  });

  it("marca ASIGNADO cuando el saldo llega a cero", () => {
    expect(getAssignState("EN_REVISION", 0)).toBe("ASIGNADO");
    expect(getAssignState("PROCESADO", 0)).toBe("ASIGNADO");
  });

  it("marca ANULADO sin importar el saldo (la vista no excluye anulados)", () => {
    expect(getAssignState("ANULADO", 0)).toBe("ANULADO");
    expect(getAssignState("ANULADO", 500)).toBe("ANULADO");
  });

  it("marca MOVIMIENTO para un recibo de caja, aunque tenga saldo sin asignar", () => {
    expect(getAssignState("EN_REVISION", 400, true)).toBe("MOVIMIENTO");
    expect(getAssignState("PROCESADO", 0, true)).toBe("MOVIMIENTO");
  });

  it("ANULADO gana sobre la bandera de movimiento", () => {
    expect(getAssignState("ANULADO", 400, true)).toBe("ANULADO");
  });
});
