import { Badge } from "@/components/ui/badge";
import type { PaymentStatus } from "@/components/pagos/types";
import { PAYMENT_STATUSES } from "@/lib/data/payment-options";
import { getOptionLabel } from "@/lib/data/sale-options";

const STATUS_STYLES: Record<PaymentStatus, string> = {
  EN_REVISION:
    "bg-pastel-lilac text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  PROCESADO:
    "bg-pastel-mint text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  ANULADO: "bg-red-500/15 text-red-700 dark:text-red-300",
};

export function ReceiptStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status]}>
      {getOptionLabel(PAYMENT_STATUSES, status)}
    </Badge>
  );
}
