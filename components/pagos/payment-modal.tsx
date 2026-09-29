"use client";

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

import {
  PAYMENT_FORM_ID,
  PaymentForm,
} from "@/components/pagos/payment-form";
import type { PaymentDirection } from "@/components/pagos/types";
import type { PaymentFormValues } from "@/lib/schemas/payment";

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  direction: PaymentDirection;
  onSave: (values: PaymentFormValues) => void;
}

export function PaymentModal({
  open,
  onOpenChange,
  direction,
  onSave,
}: PaymentModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <Card className="ring-0">
          <CardHeader>
            <DialogTitle>
              {direction === "INGRESO" ? "Registrar ingreso" : "Registrar egreso"}
            </DialogTitle>
            <DialogDescription>
              Completa los datos para registrar el pago
            </DialogDescription>
          </CardHeader>
          <CardContent>
            <PaymentForm
              key={open ? "open" : "closed"}
              direction={direction}
              onSubmit={onSave}
            />
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" form={PAYMENT_FORM_ID}>
              Registrar
            </Button>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
