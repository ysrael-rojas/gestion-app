import { redirect } from "next/navigation";

import {
  PaymentsView,
  type PaymentsFilter,
} from "@/components/pagos/payments-view";
import {
  parseListadoFilters,
  PAYMENT_RECEIPT_STATUSES,
} from "@/lib/filters/listado-filters";

const FILTERS: PaymentsFilter[] = ["pendientes", "sin-asignar", "vencidas"];

export default async function PagosIngresosPage({
  searchParams,
}: PageProps<"/pagos/ingresos">) {
  const params = await searchParams;
  const entityId =
    typeof params.entityId === "string" ? params.entityId : undefined;
  const comprobanteId =
    typeof params.comprobanteId === "string" ? params.comprobanteId : undefined;

  // Compatibilidad (SPEC 42): el deep link que antes abría el modal de pago
  // ahora lleva a la página dedicada de registro.
  if (entityId || comprobanteId) {
    const query = new URLSearchParams();

    if (entityId) {
      query.set("entityId", entityId);
    }

    if (comprobanteId) {
      query.set("comprobanteId", comprobanteId);
    }

    redirect(`/pagos/ingresos/nuevo?${query.toString()}`);
  }

  const filters = parseListadoFilters(params, PAYMENT_RECEIPT_STATUSES);
  const rawFilter =
    typeof params.filtro === "string" ? params.filtro : undefined;
  const initialFilter = FILTERS.find((value) => value === rawFilter);

  return (
    <PaymentsView
      direction="INGRESO"
      filters={filters}
      initialFilter={initialFilter}
    />
  );
}
