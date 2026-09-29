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

import { PURCHASE_FORM_ID, PurchaseForm } from "@/components/compras/purchase-form";
import type { Purchase } from "@/components/compras/types";
import type { PurchaseFormValues } from "@/lib/schemas/purchase";

interface PurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: Purchase | null;
  onSave: (values: PurchaseFormValues) => void;
}

export function PurchaseModal({
  open,
  onOpenChange,
  purchase,
  onSave,
}: PurchaseModalProps) {
  const isEditing = purchase !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <Card className="ring-0">
          <CardHeader>
            <DialogTitle>
              {isEditing ? "Editar compra" : "Registrar compra"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Modifica los datos del comprobante"
                : "Completa los datos para registrar una nueva compra"}
            </DialogDescription>
          </CardHeader>
          <CardContent>
            <PurchaseForm purchase={purchase} onSubmit={onSave} />
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" form={PURCHASE_FORM_ID}>
              {isEditing ? "Guardar cambios" : "Registrar"}
            </Button>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}