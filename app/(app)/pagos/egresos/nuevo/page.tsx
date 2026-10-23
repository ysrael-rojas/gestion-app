import { PaymentsCreateView } from "@/components/pagos/payments-create-view";

export default async function NuevoEgresoPage({
  searchParams,
}: PageProps<"/pagos/egresos/nuevo">) {
  const params = await searchParams;
  const entityId =
    typeof params.entityId === "string" ? params.entityId : undefined;
  const comprobanteId =
    typeof params.comprobanteId === "string" ? params.comprobanteId : undefined;

  return (
    <PaymentsCreateView
      direction="EGRESO"
      initialEntityId={entityId}
      initialComprobanteId={comprobanteId}
    />
  );
}
