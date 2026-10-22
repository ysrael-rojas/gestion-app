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

import { NOTA_FORM_ID, NotaForm } from "@/components/notas/nota-form";
import type { Nota, ReferableComprobante } from "@/components/notas/types";
import type { AdjustmentVoucherType } from "@/lib/data/nota-options";
import type { NotaFormValues } from "@/lib/schemas/nota";

interface NotaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucherType: AdjustmentVoucherType;
  nota: Nota | null;
  referable: ReferableComprobante | null;
  resolveEntityName: (entityId: string) => string;
  onSave: (values: NotaFormValues) => void;
}

const TYPE_LABELS: Record<AdjustmentVoucherType, string> = {
  NOTA_CREDITO: "una nota de crédito",
  NOTA_DEBITO: "una nota de débito",
  COMPROBANTE_RETENCION: "un comprobante de retención",
};

export function NotaModal({
  open,
  onOpenChange,
  voucherType,
  nota,
  referable,
  resolveEntityName,
  onSave,
}: NotaModalProps) {
  const isEditing = nota !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <Card className="ring-0">
          <CardHeader>
            <DialogTitle>
              {isEditing ? "Editar" : "Registrar"} {TYPE_LABELS[voucherType]}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Modifica los datos del documento"
                : `Completa los datos para registrar ${TYPE_LABELS[voucherType]}`}
            </DialogDescription>
          </CardHeader>
          <CardContent>
            <NotaForm
              voucherType={voucherType}
              nota={nota}
              referable={referable}
              resolveEntityName={resolveEntityName}
              onSubmit={onSave}
            />
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" form={NOTA_FORM_ID}>
              {isEditing ? "Guardar cambios" : "Registrar"}
            </Button>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
