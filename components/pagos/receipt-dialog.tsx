"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Client } from "@/components/clientes/types";
import type { PaymentDetail } from "@/components/pagos/types";
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "@/lib/data/payment-options";
import { getOptionLabel, VOUCHER_TYPES } from "@/lib/data/sale-options";
import { getPaymentDetail } from "@/lib/pagos/pagos";
import { formatCurrency, formatDate } from "@/lib/utils";

const WIDTH_STORAGE_KEY = "gestion-app:receipt-width";
const DEFAULT_WIDTH = 80;

type ReceiptWidth = 58 | 80;

const WIDTH_ITEMS = [
  { value: "58", label: "58 mm" },
  { value: "80", label: "80 mm" },
];

interface ReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string | null;
  clients: Client[];
}

function ReceiptRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className={strong ? "text-right font-semibold" : "text-right"}>
        {value}
      </span>
    </div>
  );
}

function ReceiptContent({
  detail,
  clients,
  width,
}: {
  detail: PaymentDetail;
  clients: Client[];
  width: ReceiptWidth;
}) {
  const entityName =
    clients.find((client) => client.id === detail.entityId)?.name ??
    "Entidad no encontrada";

  return (
    <div
      className="receipt-print bg-white p-3 text-xs text-black"
      style={{ width: `${width}mm` }}
    >
      <div className="text-center">
        <div className="text-sm font-semibold">GESTIÓN COMERCIAL</div>
        <div className="font-medium">
          RECIBO DE {detail.direction === "INGRESO" ? "INGRESO" : "EGRESO"}
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <ReceiptRow label="Nro" value={detail.receiptNumber} strong />
      <ReceiptRow label="Emisión" value={formatDate(detail.issueDate)} />
      <ReceiptRow label="Fecha de pago" value={formatDate(detail.paymentDate)} />
      <ReceiptRow label="Entidad" value={entityName} />
      <ReceiptRow
        label="Método"
        value={getOptionLabel(PAYMENT_METHODS, detail.method)}
      />
      {detail.reference ? (
        <ReceiptRow label="Referencia" value={detail.reference} />
      ) : null}

      <div className="my-2 border-t border-dashed border-black" />

      <ReceiptRow label="Importe" value={formatCurrency(detail.amount)} strong />

      <div className="my-2 border-t border-dashed border-black" />

      <div className="font-semibold">Asignaciones</div>
      {detail.allocations.length === 0 ? (
        <ReceiptRow label="(sin asignaciones)" value={formatCurrency(0)} />
      ) : (
        detail.allocations.map((allocation) => (
          <ReceiptRow
            key={allocation.id}
            label={`${getOptionLabel(VOUCHER_TYPES, allocation.voucherType)} ${allocation.voucherNumber}`}
            value={formatCurrency(allocation.amount)}
          />
        ))
      )}

      <div className="my-2 border-t border-dashed border-black" />

      <ReceiptRow
        label="Saldo sin asignar"
        value={formatCurrency(detail.unassignedAmount)}
      />
      <ReceiptRow
        label="Estado"
        value={getOptionLabel(PAYMENT_STATUSES, detail.status)}
      />

      {detail.status === "ANULADO" ? (
        <div className="mt-2 text-center font-semibold">*** ANULADO ***</div>
      ) : null}
      {detail.voidReason ? (
        <div className="mt-1">Motivo: {detail.voidReason}</div>
      ) : null}

      <div className="mt-3 text-center text-[10px]">
        Documento interno, no fiscal
      </div>
    </div>
  );
}

function ReceiptPreview({
  paymentId,
  clients,
  width,
}: {
  paymentId: string;
  clients: Client[];
  width: ReceiptWidth;
}) {
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      if (isMounted) {
        setIsLoading(true);
      }

      try {
        const data = await getPaymentDetail(paymentId);

        if (isMounted) {
          setDetail(data);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar el recibo."
          );
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
  }, [paymentId]);

  if (isLoading) {
    return <Skeleton className="mx-auto h-72 w-full max-w-xs" />;
  }

  if (error || !detail) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error ?? "No se encontró el pago."}
      </p>
    );
  }

  return (
    <>
      <div className="flex justify-center overflow-x-auto">
        <ReceiptContent detail={detail} clients={clients} width={width} />
      </div>

      {typeof document !== "undefined"
        ? createPortal(
            <div className="receipt-print-portal">
              <ReceiptContent detail={detail} clients={clients} width={width} />
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export function ReceiptDialog({
  open,
  onOpenChange,
  paymentId,
  clients,
}: ReceiptDialogProps) {
  const [width, setWidth] = useState<ReceiptWidth>(DEFAULT_WIDTH);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const stored = window.localStorage.getItem(WIDTH_STORAGE_KEY);

      if (isMounted && (stored === "58" || stored === "80")) {
        setWidth(Number(stored) as ReceiptWidth);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  function changeWidth(next: ReceiptWidth) {
    setWidth(next);
    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(next));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-md">
        <Card className="ring-0">
          <CardHeader>
            <DialogTitle>Recibo</DialogTitle>
            <DialogDescription>
              Vista previa e impresión del recibo
            </DialogDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="receiptWidth">Ancho</Label>
              <Select
                value={String(width)}
                items={WIDTH_ITEMS}
                onValueChange={(value) => {
                  if (value === "58" || value === "80") {
                    changeWidth(Number(value) as ReceiptWidth);
                  }
                }}
              >
                <SelectTrigger id="receiptWidth" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WIDTH_ITEMS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {paymentId ? (
              <ReceiptPreview
                key={paymentId}
                paymentId={paymentId}
                clients={clients}
                width={width}
              />
            ) : null}
          </CardContent>
          <CardFooter className="justify-between gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              Imprimir
            </Button>
            <DialogClose render={<Button variant="outline" />}>
              Cerrar
            </DialogClose>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
