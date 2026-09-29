export function computeBalance(total: number, paidAmount: number): number {
  const balance = Math.round((total - paidAmount) * 100) / 100;

  return balance > 0 ? balance : 0;
}

export function isOverdue(
  effectiveDueDate: string | null,
  balance: number,
  today: string
): boolean {
  if (!effectiveDueDate || balance <= 0) {
    return false;
  }

  return effectiveDueDate < today;
}
