import type { VoucherType } from "@/components/comprobantes/types";
import type { SelectOption } from "@/lib/data/sale-options";

/**
 * Los 6 tipos del enum `voucher_type`, usados para administrar series en
 * Configuración. El formulario de comprobantes solo usa los 3 primeros.
 */
export const SERIES_VOUCHER_TYPES: SelectOption<VoucherType>[] = [
  { value: "FACTURA", label: "Factura" },
  { value: "BOLETA", label: "Boleta" },
  { value: "NOTA_VENTA", label: "Nota de venta" },
  { value: "NOTA_CREDITO", label: "Nota de crédito" },
  { value: "NOTA_DEBITO", label: "Nota de débito" },
  { value: "COMPROBANTE_RETENCION", label: "Comprobante de retención" },
];

export function getSeriesTypeLabel(voucherType: VoucherType): string {
  return (
    SERIES_VOUCHER_TYPES.find((option) => option.value === voucherType)?.label ??
    voucherType
  );
}
