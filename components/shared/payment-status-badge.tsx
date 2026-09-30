import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

export type BadgeStatus = "PAGADO" | "PENDIENTE";

const STATUS_STYLES: Record<BadgeStatus, string> = {
  PAGADO: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  PENDIENTE: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const STATUS_LABELS: Record<BadgeStatus, string> = {
  PAGADO: "Pagado",
  PENDIENTE: "Pendiente",
};

interface PaymentStatusBadgeProps {
  status: BadgeStatus;
  className?: string;
}

export function PaymentStatusBadge({
  status,
  className,
}: PaymentStatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn(STATUS_STYLES[status], className)}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
