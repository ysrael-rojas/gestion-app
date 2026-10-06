"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cashCloseSchema,
  type CashCloseFormInput,
  type CashCloseFormValues,
} from "@/lib/schemas/cash-close";
import type { CashAccount } from "@/lib/cuentas/entidades";
import { formatDate } from "@/lib/utils";

const CASH_CLOSE_FORM_ID = "cash-close-form";

interface CashCloseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: CashAccount | null;
  defaultPeriod: { periodStart: string; periodEnd: string };
  onClose: (values: CashCloseFormValues) => void;
  isSaving?: boolean;
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function CashCloseModal({
  open,
  onOpenChange,
  account,
  defaultPeriod,
  onClose,
  isSaving = false,
}: CashCloseModalProps) {
  const isBank = account?.type === "BANK_ACCOUNT";

  const form = useForm<CashCloseFormInput, unknown, CashCloseFormValues>({
    resolver: zodResolver(cashCloseSchema),
    defaultValues: {
      cashAccountId: account?.id ?? "",
      periodEnd: defaultPeriod.periodEnd,
      countedBalance: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        cashAccountId: account?.id ?? "",
        periodEnd: defaultPeriod.periodEnd,
        countedBalance: "",
        notes: "",
      });
    }
  }, [open, account?.id, defaultPeriod.periodEnd, form]);

  const errors = form.formState.errors;

  function handleSubmit(values: CashCloseFormValues) {
    if (
      !isBank &&
      (values.countedBalance === undefined || values.countedBalance === null)
    ) {
      toast.error("Ingresa el conteo físico de efectivo para cerrar la caja.");
      return;
    }

    onClose(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <Card className="ring-0">
          <CardHeader>
            <DialogTitle>Cerrar caja</DialogTitle>
            <DialogDescription>
              {account
                ? `${account.name} · período desde ${formatDate(defaultPeriod.periodStart)}`
                : "Selecciona una cuenta"}
            </DialogDescription>
          </CardHeader>
          <CardContent>
            <form
              id={CASH_CLOSE_FORM_ID}
              onSubmit={form.handleSubmit(handleSubmit)}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="periodEnd">Cerrar hasta</Label>
                <Input
                  id="periodEnd"
                  type="date"
                  aria-invalid={!!errors.periodEnd}
                  {...form.register("periodEnd")}
                />
                <FieldError message={errors.periodEnd?.message} />
                <p className="text-xs text-muted-foreground">
                  No se podrán registrar ni modificar recibos de esta cuenta con
                  fecha anterior o igual a este día.
                </p>
              </div>

              {isBank ? null : (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="countedBalance">Conteo físico (arqueo)</Label>
                  <Input
                    id="countedBalance"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    aria-invalid={!!errors.countedBalance}
                    {...form.register("countedBalance")}
                  />
                  <FieldError message={errors.countedBalance?.message} />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="closeNotes">Notas (opcional)</Label>
                <Textarea
                  id="closeNotes"
                  placeholder="Observaciones del cierre"
                  {...form.register("notes")}
                />
                <FieldError message={errors.notes?.message} />
              </div>
            </form>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" form={CASH_CLOSE_FORM_ID} disabled={isSaving}>
              Cerrar caja
            </Button>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
