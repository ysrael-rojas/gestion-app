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

import { SALE_FORM_ID, SaleForm } from "@/components/ventas/sale-form";
import type { Sale } from "@/components/ventas/types";
import type { SaleFormValues } from "@/lib/schemas/sale";

interface SaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
  onSave: (values: SaleFormValues) => void;
}

export function SaleModal({ open, onOpenChange, sale, onSave }: SaleModalProps) {
  const isEditing = sale !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <Card className="ring-0">
          <CardHeader>
            <DialogTitle>
              {isEditing ? "Editar venta" : "Registrar venta"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Modifica los datos del comprobante"
                : "Completa los datos para registrar una nueva venta"}
            </DialogDescription>
          </CardHeader>
          <CardContent>
            <SaleForm sale={sale} onSubmit={onSave} />
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" form={SALE_FORM_ID}>
              {isEditing ? "Guardar cambios" : "Registrar"}
            </Button>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
