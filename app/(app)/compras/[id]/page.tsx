import { VoucherDetalleView } from "@/components/comprobantes/voucher-detalle-view";

export default async function CompraDetallePage({
  params,
}: PageProps<"/compras/[id]">) {
  const { id } = await params;

  return <VoucherDetalleView voucherKind="COMPRA" voucherId={id} />;
}
