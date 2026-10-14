"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  cashTransferSchema,
  type CashTransferFormInput,
  type CashTransferFormValues,
} from "@/lib/schemas/cash-transfer";
import type { CashAccount } from "@/lib/cuentas/entidades";
import { getTodayLocalDate } from "@/lib/utils";

export const CASH_TRANSFER_FORM_ID = "cash-transfer-form";

interface CashTransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: CashAccount[];
  onDone: (values: CashTransferFormValues) => void;
  isSaving?: boolean;
}

function createEmptyValues(): CashTransferFormInput {
  return {
    sourceAccountId: "",
    targetAccountId: "",
    amount: undefined as unknown as number,
    transferDate: getTodayLocalDate(),
    notes: "",
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

export function CashTransferModal({
  open,
  onOpenChange,
  accounts,
  onDone,
  isSaving = false,
}: CashTransferModalProps) {
  const form = useForm<CashTransferFormInput, unknown, CashTransferFormValues>({
    resolver: zodResolver(cashTransferSchema),
    defaultValues: createEmptyValues(),
  });

  useEffect(() => {
    if (open) {
      form.reset(createEmptyValues());
    }
  }, [open, form]);

  const errors = form.formState.errors;
  const accountItems = accounts.map((account) => ({
    value: account.id,
    label: `${account.name} · ${account.currency}`,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <form
          id={CASH_TRANSFER_FORM_ID}
          onSubmit={form.handleSubmit(onDone)}
          className="flex flex-col gap-5 p-6"
        >
          <div className="flex flex-col gap-1">
            <DialogTitle>Transferir entre cuentas</DialogTitle>
            <DialogDescription>
              Mueve dinero de una caja o banco a otro en una sola operación.
            </DialogDescription>
          </div>

          <Controller
            control={form.control}
            name="sourceAccountId"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sourceAccountId">Cuenta de origen</Label>
                <Select
                  value={field.value || null}
                  items={accountItems}
                  onValueChange={(value) => field.onChange(value ?? "")}
                >
                  <SelectTrigger id="sourceAccountId" className="w-full">
                    <SelectValue placeholder="Selecciona el origen" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountItems.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={errors.sourceAccountId?.message} />
              </div>
            )}
          />

          <Controller
            control={form.control}
            name="targetAccountId"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="targetAccountId">Cuenta de destino</Label>
                <Select
                  value={field.value || null}
                  items={accountItems}
                  onValueChange={(value) => field.onChange(value ?? "")}
                >
                  <SelectTrigger id="targetAccountId" className="w-full">
                    <SelectValue placeholder="Selecciona el destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountItems.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={errors.targetAccountId?.message} />
              </div>
            )}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Monto (S/)</Label>
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
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transferDate">Fecha</Label>
            <Input
              id="transferDate"
              type="date"
              aria-invalid={!!errors.transferDate}
              {...form.register("transferDate")}
            />
            <FieldError message={errors.transferDate?.message} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              placeholder="Observaciones (opcional)"
              aria-invalid={!!errors.notes}
              {...form.register("notes")}
            />
            <FieldError message={errors.notes?.message} />
          </div>

          <div className="flex items-center justify-end gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" form={CASH_TRANSFER_FORM_ID} disabled={isSaving}>
              {isSaving ? "Transfiriendo…" : "Transferir"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
