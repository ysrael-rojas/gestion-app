"use client";

import { useWatch } from "react-hook-form";

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
  CASH_ACCOUNT_FORM_ID,
  CashAccountForm,
  useCashAccountForm,
} from "@/components/cajas-bancos/cash-account-form";
import type { CashAccount } from "@/lib/cuentas/entidades";
import type { CashAccountFormValues } from "@/lib/schemas/cash-account";

interface CashAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: CashAccount | null;
  onSave: (values: CashAccountFormValues) => void;
  isSaving?: boolean;
}

export function CashAccountModal({
  open,
  onOpenChange,
  account,
  onSave,
  isSaving = false,
}: CashAccountModalProps) {
  const form = useCashAccountForm({ open, account });
  // Sin tipo elegido ("Seleccionar") no se puede registrar la cuenta.
  const type = useWatch({ control: form.control, name: "type" });
  const isEditing = account !== null;
  const title = isEditing
    ? account?.type === "BANK_ACCOUNT"
      ? "Editar banco"
      : "Editar caja"
    : "Registrar cuenta";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <Card className="ring-0">
          <CardHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Modifica los datos de la cuenta"
                : "Completa los datos para registrar una nueva cuenta"}
            </DialogDescription>
          </CardHeader>
          <CardContent>
            <CashAccountForm form={form} onSubmit={onSave} />
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button
              type="submit"
              form={CASH_ACCOUNT_FORM_ID}
              disabled={isSaving || !type}
            >
              {isEditing ? "Guardar cambios" : "Registrar"}
            </Button>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
