import {
  PaymentsView,
  type PaymentsFilter,
} from "@/components/pagos/payments-view";
import {
  parseListadoFilters,
  PAYMENT_RECEIPT_STATUSES,
} from "@/lib/filters/listado-filters";

const FILTERS: PaymentsFilter[] = ["pendientes", "sin-asignar", "vencidas"];

export default async function PagosEgresosPage({
  searchParams,
}: PageProps<"/pagos/egresos">) {
  const params = await searchParams;
  const filters = parseListadoFilters(params, PAYMENT_RECEIPT_STATUSES);
  const entityId =
    typeof params.entityId === "string" ? params.entityId : undefined;
  const comprobanteId =
    typeof params.comprobanteId === "string" ? params.comprobanteId : undefined;
  const rawFilter =
    typeof params.filtro === "string" ? params.filtro : undefined;
  const initialFilter = FILTERS.find((value) => value === rawFilter);

  return (
    <PaymentsView
      direction="EGRESO"
      filters={filters}
      initialEntityId={entityId}
      initialComprobanteId={comprobanteId}
      initialFilter={initialFilter}
    />
  );
}
