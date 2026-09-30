import { PaymentsView } from "@/components/pagos/payments-view";

export default async function PagosEgresosPage({
  searchParams,
}: PageProps<"/pagos/egresos">) {
  const params = await searchParams;
  const entityId =
    typeof params.entityId === "string" ? params.entityId : undefined;
  const comprobanteId =
    typeof params.comprobanteId === "string" ? params.comprobanteId : undefined;

  return (
    <PaymentsView
      direction="EGRESO"
      initialEntityId={entityId}
      initialComprobanteId={comprobanteId}
    />
  );
}
