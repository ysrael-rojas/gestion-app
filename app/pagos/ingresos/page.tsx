import {
  PaymentsView,
  type PaymentsFilter,
} from "@/components/pagos/payments-view";

const FILTERS: PaymentsFilter[] = ["pendientes", "sin-asignar", "vencidas"];

export default async function PagosIngresosPage({
  searchParams,
}: PageProps<"/pagos/ingresos">) {
  const params = await searchParams;
  const entityId =
    typeof params.entityId === "string" ? params.entityId : undefined;
  const comprobanteId =
    typeof params.comprobanteId === "string" ? params.comprobanteId : undefined;
  const rawFilter =
    typeof params.filtro === "string" ? params.filtro : undefined;
  const initialFilter = FILTERS.find((value) => value === rawFilter);

  return (
    <PaymentsView
      direction="INGRESO"
      initialEntityId={entityId}
      initialComprobanteId={comprobanteId}
      initialFilter={initialFilter}
    />
  );
}
