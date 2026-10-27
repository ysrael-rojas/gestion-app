"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

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
import { AllocationPicker } from "@/components/pagos/allocation-picker";
import { usePagos } from "@/components/pagos/pagos-provider";
import { useEntityOptions } from "@/components/pagos/use-entity-name";
import type {
  AllocationInput,
  PaymentListItem,
} from "@/components/pagos/types";
import {
  EntityAutocomplete,
  toEntityAutocompleteItems,
} from "@/components/shared/entity-autocomplete";
import { formatCurrency } from "@/lib/utils";

interface PaymentAssignDialogProps {
  /** Pago a completar; `null` cierra el diálogo. */
  payment: PaymentListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se ejecuta después de asignar (el provider ya refresca los listados). */
  onAssigned?: () => void;
}

interface PaymentAssignContentProps {
  payment: PaymentListItem;
  onOpenChange: (open: boolean) => void;
  onAssigned?: () => void;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function AmountField({
  label,
  value,
  currency,
  tone,
}: {
  label: string;
  value: number;
  currency: PaymentListItem["currency"];
  tone?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${tone ?? ""}`}>
        {formatCurrency(value, currency)}
      </span>
    </div>
  );
}

/**
 * Cuerpo del diálogo. Se monta con `key={payment.id}` para que cada pago
 * arranque con el estado limpio (sin resetear en un effect).
 */
function PaymentAssignContent({
  payment,
  onOpenChange,
  onAssigned,
}: PaymentAssignContentProps) {
  const { assignAllocations } = usePagos();
  const [items, setItems] = useState<AllocationInput[]>([]);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const entityOptions = useEntityOptions(payment.direction);
  const entityItems = useMemo(
    () => toEntityAutocompleteItems(entityOptions),
    [entityOptions]
  );

  const assignEntity = payment.entityId ?? entityId;
  const assignedTotal = round2(
    items.reduce((sum, item) => sum + item.amount, 0)
  );
  const unassignedAmount = payment.unassignedAmount;
  const assignedAmount = round2(payment.amount - unassignedAmount);
  const canAssign =
    assignEntity !== null &&
    items.length > 0 &&
    assignedTotal > 0 &&
    assignedTotal <= unassignedAmount;

  async function handleAssign() {
    try {
      setIsSubmitting(true);
      await assignAllocations(payment.id, items, assignEntity ?? undefined);
      toast.success("Saldo asignado");
      onAssigned?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo asignar el saldo."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-3">
          <AmountField
            label="Importe"
            value={payment.amount}
            currency={payment.currency}
          />
          <AmountField
            label="Asignado"
            value={assignedAmount}
            currency={payment.currency}
          />
          <AmountField
            label="Por asignar"
            value={unassignedAmount}
            currency={payment.currency}
            tone={
              unassignedAmount > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
            }
          />
        </div>

        {payment.entityId ? null : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assignPaymentEntityId">
              {payment.direction === "INGRESO" ? "Cliente" : "Proveedor"}
            </Label>
            <EntityAutocomplete
              id="assignPaymentEntityId"
              items={entityItems}
              value={entityId}
              onValueChange={(value) => {
                setEntityId(value ? value : null);
                setItems([]);
              }}
              placeholder={
                payment.direction === "INGRESO"
                  ? "Buscar cliente..."
                  : "Buscar proveedor..."
              }
            />
            <p className="text-xs text-muted-foreground">
              Elige una entidad para asignar el saldo a sus comprobantes.
            </p>
          </div>
        )}

        <AllocationPicker
          direction={payment.direction}
          entityId={assignEntity ?? undefined}
          amount={unassignedAmount}
          value={items}
          onChange={setItems}
        />
      </CardContent>

      <CardFooter className="justify-end gap-2">
        <DialogClose render={<Button variant="outline" />}>
          Cancelar
        </DialogClose>
        <Button
          onClick={() => void handleAssign()}
          disabled={!canAssign || isSubmitting}
        >
          Asignar
        </Button>
      </CardFooter>
    </>
  );
}

export function PaymentAssignDialog({
  payment,
  open,
  onOpenChange,
  onAssigned,
}: PaymentAssignDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <Card className="ring-0">
          <CardHeader>
            <DialogTitle>Asignar saldo del pago</DialogTitle>
            <DialogDescription>
              {payment
                ? `Recibo ${payment.receiptNumber}`
                : "Reparte el saldo pendiente entre uno o varios comprobantes"}
            </DialogDescription>
          </CardHeader>

          {payment ? (
            <PaymentAssignContent
              key={payment.id}
              payment={payment}
              onOpenChange={onOpenChange}
              onAssigned={onAssigned}
            />
          ) : null}
        </Card>
      </DialogContent>
    </Dialog>
  );
}
