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

export function calculateDueDate(issueDate: string, creditDays: number): string {
  const [year, month, day] = issueDate.split("-").map(Number);
  const date = new Date(year, month - 1, day + creditDays);

  const dueYear = date.getFullYear();
  const dueMonth = String(date.getMonth() + 1).padStart(2, "0");
  const dueDay = String(date.getDate()).padStart(2, "0");

  return `${dueYear}-${dueMonth}-${dueDay}`;
}
