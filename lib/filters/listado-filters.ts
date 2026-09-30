export type PaymentStatusFilter = "TODOS" | "PAGADO" | "PENDIENTE";

export interface ListadoFilters {
  desde: string | null;
  hasta: string | null;
  estado: PaymentStatusFilter;
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

function parseStatus(
  value: string | string[] | undefined
): PaymentStatusFilter {
  const raw = firstValue(value);

  if (raw === "PAGADO" || raw === "PENDIENTE") {
    return raw;
  }

  return DEFAULT_PAYMENT_STATUS_FILTER;
}

export function parseListadoFilters(
  params: Record<string, string | string[] | undefined>
): ListadoFilters {
  return {
    desde: parseDate(params.desde),
    hasta: parseDate(params.hasta),
    estado: parseStatus(params.estado),
  };
}

export function filtersToSearchParams(filters: ListadoFilters): URLSearchParams {
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

export function applyListadoFilters<T extends { issueDate: string; status: string }>(
  rows: T[],
  filters: ListadoFilters
): T[] {
  return rows.filter((row) => {
    if (filters.desde && row.issueDate < filters.desde) {
      return false;
    }

    if (filters.hasta && row.issueDate > filters.hasta) {
      return false;
    }

    if (filters.estado !== DEFAULT_PAYMENT_STATUS_FILTER && row.status !== filters.estado) {
      return false;
    }

    return true;
  });
}
