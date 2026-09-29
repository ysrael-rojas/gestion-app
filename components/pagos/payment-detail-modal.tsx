"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { Client } from "@/components/clientes/types";
import { AllocationPicker } from "@/components/pagos/allocation-picker";
import { usePagos } from "@/components/pagos/pagos-provider";
import type {
  AllocationInput,
  PaymentDetail,
} from "@/components/pagos/types";
import {
  getOptionLabel,
  VOUCHER_TYPES,
} from "@/lib/data/sale-options";
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "@/lib/data/payment-options";
import { getPaymentDetail } from "@/lib/pagos/pagos";
import { formatCurrency, formatDate } from "@/lib/utils";

interface PaymentDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string | null;
  clients: Client[];
}

type DetailMode = "view" | "assign" | "annul";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

function getEntityName(clients: Client[], entityId: string): string {
  return (
    clients.find((client) => client.id === entityId)?.name ??
    "Entidad no encontrada"
  );
}

function PaymentDetailContent({
  paymentId,
  clients,
}: {
  paymentId: string;
  clients: Client[];
}) {
  const { assignAllocations, annulPayment } = usePagos();
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<DetailMode>("view");
  const [assignItems, setAssignItems] = useState<AllocationInput[]>([]);
  const [voidReason, setVoidReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadDetail = useCallback(async () => {
    setIsLoading(true);

    try {
      const data = await getPaymentDetail(paymentId);
      setDetail(data);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo cargar el pago."));
    } finally {
      setIsLoading(false);
    }
  }, [paymentId]);

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
          setError(getErrorMessage(err, "No se pudo cargar el pago."));
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

  const assignTotal = assignItems.reduce((sum, item) => sum + item.amount, 0);
  const canAssign =
    detail !== null &&
    assignItems.length > 0 &&
    assignTotal > 0 &&
    assignTotal <= detail.unassignedAmount;

  async function handleAssign() {
    if (!detail) {
      return;
    }

    try {
      setIsSubmitting(true);
      await assignAllocations(detail.id, assignItems);
      toast.success("Saldo asignado");
      setAssignItems([]);
      setMode("view");
      await loadDetail();
    } catch (err) {
      toast.error(getErrorMessage(err, "No se pudo asignar el saldo."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAnnul() {
    if (!detail) {
      return;
    }

    try {
      setIsSubmitting(true);
      await annulPayment(detail.id, voidReason.trim());
      toast.success("Pago anulado");
      setVoidReason("");
      setMode("view");
      await loadDetail();
    } catch (err) {
      toast.error(getErrorMessage(err, "No se pudo anular el pago."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-6">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <p role="alert" className="text-sm text-destructive">
          {error ?? "No se encontró el pago."}
        </p>
        <Button variant="outline" onClick={() => void loadDetail()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const isRegistered = detail.status === "REGISTRADO";
  const hasUnassigned = detail.unassignedAmount > 0;

  return (
    <>
      <CardContent className="flex flex-col gap-4">
        <Card className="bg-muted/30 ring-0">
          <CardHeader>
            <CardTitle>Datos del pago</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailField label="Recibo" value={detail.receiptNumber} />
              <DetailField
                label="Estado"
                value={getOptionLabel(PAYMENT_STATUSES, detail.status)}
              />
              <DetailField
                label="Fecha de emisión"
                value={formatDate(detail.issueDate)}
              />
              <DetailField
                label="Fecha de pago"
                value={formatDate(detail.paymentDate)}
              />
              <div className="sm:col-span-2">
                <DetailField
                  label="Entidad"
                  value={getEntityName(clients, detail.entityId)}
                />
              </div>
              <DetailField
                label="Método"
                value={getOptionLabel(PAYMENT_METHODS, detail.method)}
              />
              <DetailField label="Referencia" value={detail.reference ?? ""} />
              <DetailField
                label="Importe"
                value={formatCurrency(detail.amount)}
              />
              <DetailField
                label="Saldo sin asignar"
                value={formatCurrency(detail.unassignedAmount)}
              />
              {detail.voidReason ? (
                <div className="sm:col-span-2">
                  <DetailField
                    label="Motivo de anulación"
                    value={detail.voidReason}
                  />
                </div>
              ) : null}
              {detail.notes ? (
                <div className="sm:col-span-2">
                  <DetailField label="Notas" value={detail.notes} />
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 ring-0">
          <CardHeader>
            <CardTitle>Asignaciones</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.allocations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin asignaciones. El importe queda como saldo sin asignar.
              </p>
            ) : (
              <div className="flex flex-col divide-y rounded-md border">
                {detail.allocations.map((allocation) => (
                  <div
                    key={allocation.id}
                    className="flex items-center justify-between gap-2 p-3"
                  >
                    <span className="text-sm">
                      {getOptionLabel(
                        VOUCHER_TYPES,
                        allocation.voucherType
                      )}{" "}
                      {allocation.voucherNumber}
                    </span>
                    <span className="text-sm font-medium">
                      {formatCurrency(allocation.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {mode === "assign" ? (
          <Card className="bg-muted/30 ring-0">
            <CardHeader>
              <CardTitle>Asignar saldo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <AllocationPicker
                direction={detail.direction}
                entityId={detail.entityId}
                amount={detail.unassignedAmount}
                value={assignItems}
                onChange={setAssignItems}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAssignItems([]);
                    setMode("view");
                  }}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => void handleAssign()}
                  disabled={!canAssign || isSubmitting}
                >
                  Asignar
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {mode === "annul" ? (
          <Card className="bg-muted/30 ring-0">
            <CardHeader>
              <CardTitle>Anular pago</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="voidReason">Motivo de anulación</Label>
                <Textarea
                  id="voidReason"
                  placeholder="Describe el motivo de la anulación"
                  value={voidReason}
                  onChange={(event) => setVoidReason(event.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setVoidReason("");
                    setMode("view");
                  }}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void handleAnnul()}
                  disabled={!voidReason.trim() || isSubmitting}
                >
                  Confirmar anulación
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </CardContent>

      {mode === "view" ? (
        <CardFooter className="justify-between gap-2">
          <div className="flex gap-2">
            {isRegistered && hasUnassigned ? (
              <Button variant="outline" onClick={() => setMode("assign")}>
                Asignar saldo
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            {isRegistered ? (
              <Button variant="destructive" onClick={() => setMode("annul")}>
                Anular pago
              </Button>
            ) : null}
            <DialogClose render={<Button variant="outline" />}>
              Cerrar
            </DialogClose>
          </div>
        </CardFooter>
      ) : null}
    </>
  );
}

export function PaymentDetailModal({
  open,
  onOpenChange,
  paymentId,
  clients,
}: PaymentDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <Card className="ring-0">
          <CardHeader>
            <DialogTitle>Detalle del pago</DialogTitle>
            <DialogDescription>
              Información del recibo y sus asignaciones
            </DialogDescription>
          </CardHeader>
          {paymentId ? (
            <PaymentDetailContent
              key={paymentId}
              paymentId={paymentId}
              clients={clients}
            />
          ) : null}
        </Card>
      </DialogContent>
    </Dialog>
  );
}
