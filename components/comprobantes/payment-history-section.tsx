"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  PaymentDirection,
  PaymentHistoryEntry,
  PaymentStatus,
} from "@/components/pagos/types";
import { PAYMENT_METHODS, PAYMENT_STATUSES } from "@/lib/data/payment-options";
import { getOptionLabel } from "@/lib/data/sale-options";
import { getPaymentHistory } from "@/lib/pagos/pagos";
import { formatCurrency, formatDate } from "@/lib/utils";

const COLUMNS_COUNT = 6;
const SKELETON_ROWS = 3;

interface PaymentHistorySectionProps {
  comprobanteId: string;
  direction: PaymentDirection;
  onPrint: (paymentId: string) => void;
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  const isRegistered = status === "REGISTRADO";

  return (
    <Badge
      variant="outline"
      className={
        isRegistered
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "text-muted-foreground"
      }
    >
      {getOptionLabel(PAYMENT_STATUSES, status)}
    </Badge>
  );
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
        <TableRow key={`payment-history-skeleton-${rowIndex}`}>
          {Array.from({ length: COLUMNS_COUNT }).map((_, cellIndex) => (
            <TableCell key={`payment-history-skeleton-${rowIndex}-${cellIndex}`}>
              <Skeleton className="h-5 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function PaymentHistorySection({
  comprobanteId,
  direction,
  onPrint,
}: PaymentHistorySectionProps) {
  const [entries, setEntries] = useState<PaymentHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getPaymentHistory(comprobanteId);

        if (isMounted) {
          setEntries(data);
        }
      } catch (err) {
        if (isMounted) {
          const message =
            err instanceof Error
              ? err.message
              : "No se pudo cargar el historial de pagos. Intenta nuevamente.";
          setEntries([]);
          setError(message);
          toast.error(message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [comprobanteId, direction]);

  return (
    <Card className="bg-muted/30 ring-0">
      <CardHeader>
        <CardTitle>Historial de pagos</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : !isLoading && entries.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-6 text-center">
            <p className="text-sm font-medium">
              Aún no se han registrado pagos para este comprobante.
            </p>
            <p className="text-sm text-muted-foreground">
              Puedes registrar uno desde el botón Registrar pago de arriba.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha de pago</TableHead>
                  <TableHead>Recibo</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Importe asignado</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <LoadingRows />
                ) : (
                  entries.map((entry) => (
                    <TableRow key={entry.allocationId}>
                      <TableCell>{formatDate(entry.paymentDate)}</TableCell>
                      <TableCell>{entry.receiptNumber}</TableCell>
                      <TableCell>
                        {getOptionLabel(PAYMENT_METHODS, entry.method)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(entry.amount)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={entry.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onPrint(entry.paymentId)}
                        >
                          <Printer />
                          Imprimir recibo
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
