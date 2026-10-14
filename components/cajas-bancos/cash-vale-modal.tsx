"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  createPettyCashValeSchema,
  type PettyCashValeFormInput,
  type PettyCashValeFormValues,
} from "@/lib/schemas/petty-cash-vale";
import type { CashAccount } from "@/lib/cuentas/entidades";
import { formatCurrency, getTodayLocalDate } from "@/lib/utils";

export const PETTY_CASH_VALE_FORM_ID = "petty-cash-vale-form";

interface CashValeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: CashAccount;
  onDone: (values: PettyCashValeFormValues) => void;
  isSaving?: boolean;
}

function createEmptyValues(accountId: string): PettyCashValeFormInput {
  return {
    accountId,
    valeDate: getTodayLocalDate(),
    paidTo: "",
    concept: "",
    amount: undefined as unknown as number,
    hasReceipt: false,
  };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function CashValeModal({
  open,
  onOpenChange,
  account,
  onDone,
  isSaving = false,
}: CashValeModalProps) {
  const limit = account.pettyExpenseLimit;

  const form = useForm<PettyCashValeFormInput, unknown, PettyCashValeFormValues>({
    resolver: zodResolver(createPettyCashValeSchema(limit)),
    defaultValues: createEmptyValues(account.id),
  });

  useEffect(() => {
    if (open) {
      form.reset(createEmptyValues(account.id));
    }
  }, [open, account.id, form]);

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <form
          id={PETTY_CASH_VALE_FORM_ID}
          onSubmit={form.handleSubmit(onDone)}
          className="flex flex-col gap-5 p-6"
        >
          <div className="flex flex-col gap-1">
            <DialogTitle>Nuevo vale de caja chica</DialogTitle>
            <DialogDescription>
              {account.name} · el número de vale lo asigna el sistema.
            </DialogDescription>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="valeDate">Fecha</Label>
            <Input
              id="valeDate"
              type="date"
              aria-invalid={!!errors.valeDate}
              {...form.register("valeDate")}
            />
            <FieldError message={errors.valeDate?.message} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paidTo">Pagado a</Label>
            <Input
              id="paidTo"
              placeholder="Ej. Juan Pérez"
              aria-invalid={!!errors.paidTo}
              {...form.register("paidTo")}
            />
            <FieldError message={errors.paidTo?.message} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="concept">Concepto</Label>
            <Textarea
              id="concept"
              placeholder="Ej. Pasajes y movilidad"
              aria-invalid={!!errors.concept}
              {...form.register("concept")}
            />
            <FieldError message={errors.concept?.message} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Importe (S/)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              aria-invalid={!!errors.amount}
              {...form.register("amount", { valueAsNumber: true })}
            />
            <FieldError message={errors.amount?.message} />
            {limit !== null ? (
              <p className="text-xs text-muted-foreground">
                Límite por gasto: {formatCurrency(limit)}.
              </p>
            ) : null}
          </div>

          <Controller
            control={form.control}
            name="hasReceipt"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasReceipt"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="hasReceipt">Tiene comprobante adjunto</Label>
              </div>
            )}
          />

          <div className="flex items-center justify-end gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button
              type="submit"
              form={PETTY_CASH_VALE_FORM_ID}
              disabled={isSaving}
            >
              {isSaving ? "Registrando…" : "Registrar vale"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
