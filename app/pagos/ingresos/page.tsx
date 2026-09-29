import { PaymentsView } from "@/components/pagos/payments-view";

export default async function PagosIngresosPage({
  searchParams,
}: PageProps<"/pagos/ingresos">) {
  const params = await searchParams;
  const entityId =
    typeof params.entityId === "string" ? params.entityId : undefined;
  const comprobanteId =
    typeof params.comprobanteId === "string" ? params.comprobanteId : undefined;

  return (
    <PaymentsView
      direction="INGRESO"
      initialEntityId={entityId}
      initialComprobanteId={comprobanteId}
    />
  );
}
