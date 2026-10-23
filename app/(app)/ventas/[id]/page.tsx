import { VoucherDetalleView } from "@/components/comprobantes/voucher-detalle-view";

export default async function VentaDetallePage({
  params,
}: PageProps<"/ventas/[id]">) {
  const { id } = await params;

  return <VoucherDetalleView voucherKind="VENTA" voucherId={id} />;
}
