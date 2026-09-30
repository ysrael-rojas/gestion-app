export interface CarteraBucket {
  count: number;
  amount: number;
  overdueCount: number;
  overdueAmount: number;
}

export interface CarteraResumen {
  receivable: CarteraBucket;
  payable: CarteraBucket;
  unassignedReceipts: CarteraBucket;
  unassignedPayments: CarteraBucket;
  today: string;
}
