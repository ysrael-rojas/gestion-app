function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export interface SaleAmounts {
  subtotal: number;
  igv: number;
  total: number;
}

export function calculateAmounts(total: number): SaleAmounts {
  const subtotal = round(total / 1.18, 2);
  const igv = round(total - subtotal, 2);
  return { subtotal, igv, total };
}
