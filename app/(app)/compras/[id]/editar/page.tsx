import { VoucherFormView } from "@/components/comprobantes/voucher-form-view";

export default async function EditarCompraPage({
  params,
}: PageProps<"/compras/[id]/editar">) {
  const { id } = await params;

  return <VoucherFormView voucherKind="COMPRA" voucherId={id} />;
}
