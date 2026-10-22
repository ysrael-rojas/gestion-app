import { VoucherFormView } from "@/components/comprobantes/voucher-form-view";

export default async function EditarVentaPage({
  params,
}: PageProps<"/ventas/[id]/editar">) {
  const { id } = await params;

  return <VoucherFormView voucherKind="VENTA" voucherId={id} />;
}
