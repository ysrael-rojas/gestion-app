export type PaymentStatusFilter = "TODOS" | "PAGADO" | "PENDIENTE";

export interface ListadoFilters<TStatus extends string = PaymentStatusFilter> {
  desde: string | null;
  hasta: string | null;
  estado: TStatus;
}

export const DEFAULT_PAYMENT_STATUS_FILTER: PaymentStatusFilter = "TODOS";

export const PAYMENT_STATUS_FILTER_OPTIONS: {
  value: PaymentStatusFilter;
  label: string;
}[] = [
  { value: "TODOS", label: "Todos" },
  { value: "PAGADO", label: "Pagado" },
  { value: "PENDIENTE", label: "Pendiente" },
];

export const PAYMENT_RECEIPT_STATUSES = ["EN_REVISION", "PROCESADO"] as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function firstValue(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parseDate(value: string | string[] | undefined): string | null {
  const raw = firstValue(value);

  if (!raw || !DATE_PATTERN.test(raw)) {
    return null;
  }

  return raw;
}

function parseStatus<TStatus extends string>(
  value: string | string[] | undefined,
  acceptedStatuses: readonly TStatus[],
  defaultValue: "TODOS" | TStatus = "TODOS"
): "TODOS" | TStatus {
  const raw = firstValue(value);

  if (raw && acceptedStatuses.includes(raw as TStatus)) {
    return raw as "TODOS" | TStatus;
  }

  return defaultValue;
}

export function parseListadoFilters(
  params: Record<string, string | string[] | undefined>
): ListadoFilters;
export function parseListadoFilters<TStatus extends string>(
  params: Record<string, string | string[] | undefined>,
  acceptedStatuses: readonly TStatus[]
): ListadoFilters<"TODOS" | TStatus>;
export function parseListadoFilters(
  params: Record<string, string | string[] | undefined>,
  acceptedStatuses: readonly string[] = ["PAGADO", "PENDIENTE"]
): ListadoFilters<string> {
  return {
    desde: parseDate(params.desde),
    hasta: parseDate(params.hasta),
    estado: parseStatus(params.estado, acceptedStatuses),
  };
}

export function filtersToSearchParams(
  filters: ListadoFilters<string>
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.desde) {
    searchParams.set("desde", filters.desde);
  }

  if (filters.hasta) {
    searchParams.set("hasta", filters.hasta);
  }

  if (filters.estado !== DEFAULT_PAYMENT_STATUS_FILTER) {
    searchParams.set("estado", filters.estado);
  }

  return searchParams;
}

export function applyListadoFilters<
  T extends { issueDate?: string; paymentDate?: string; status: string },
>(
  rows: T[],
  filters: ListadoFilters<string>,
  options: {
    dateField?: "issueDate" | "paymentDate";
    matchesStatus?: (row: T, status: string) => boolean;
  } = {}
): T[] {
  const dateField = options.dateField ?? "issueDate";

  return rows.filter((row) => {
    const rowDate = row[dateField] ?? "";

    if (filters.desde && rowDate < filters.desde) {
      return false;
    }

    if (filters.hasta && rowDate > filters.hasta) {
      return false;
    }

    if (
      filters.estado !== DEFAULT_PAYMENT_STATUS_FILTER &&
      !(options.matchesStatus
        ? options.matchesStatus(row, filters.estado)
        : row.status === filters.estado)
    ) {
      return false;
    }

    return true;
  });
}
