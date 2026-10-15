"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

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
  ensureCatalogsSeeded,
  getLastClose,
  listCategories,
  listPaymentMethods,
} from "@/lib/caja/caja";
import { addDays } from "@/lib/caja/periodo";
import { BANK_CHARGE_CATEGORIES } from "@/lib/caja/defaults";
import {
  bankChargeSchema,
  type BankChargeFormInput,
  type BankChargeFormValues,
} from "@/lib/schemas/bank-charge";
import type { PaymentMethodRef, CashReceiptCategory } from "@/components/pagos/types";
import type { CashAccount } from "@/lib/cuentas/entidades";
import { formatDate, getTodayLocalDate } from "@/lib/utils";

export const BANK_CHARGE_FORM_ID = "bank-charge-form";

interface BankChargeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: CashAccount;
  onDone: (values: BankChargeFormValues) => void;
  isSaving?: boolean;
}

function createEmptyValues(accountId: string): BankChargeFormInput {
  return {
    cashAccountId: accountId,
    categoryId: "",
    methodId: "",
    amount: undefined as unknown as number,
    chargeDate: getTodayLocalDate(),
    reference: "",
    notes: "",
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function BankChargeModal({
  open,
  onOpenChange,
  account,
  onDone,
  isSaving = false,
}: BankChargeModalProps) {
  const [methods, setMethods] = useState<PaymentMethodRef[]>([]);
  const [categories, setCategories] = useState<CashReceiptCategory[]>([]);
  // Primer día abierto de la cuenta (posterior al último cierre) y fin del
  // último período cerrado, para proponer la fecha y bloquear una cerrada.
  const [openFrom, setOpenFrom] = useState<string>(() => getTodayLocalDate());
  const [lastClosedEnd, setLastClosedEnd] = useState<string | null>(null);

  const form = useForm<BankChargeFormInput, unknown, BankChargeFormValues>({
    resolver: zodResolver(bankChargeSchema),
    defaultValues: createEmptyValues(account.id),
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    void (async () => {
      let nextOpenFrom = getTodayLocalDate();

      try {
        const lastClose = await getLastClose(account.id);
        if (lastClose) {
          nextOpenFrom = addDays(lastClose.periodEnd, 1);
        }
        setLastClosedEnd(lastClose?.periodEnd ?? null);
      } catch (error) {
        toast.error(getErrorMessage(error));
      }

      setOpenFrom(nextOpenFrom);
      form.reset({ ...createEmptyValues(account.id), chargeDate: nextOpenFrom });

      try {
        // Las categorías de cargo son semillas: si el dueño aún no abrió un
        // formulario de pago, hay que sembrarlas antes de listarlas.
        await ensureCatalogsSeeded();
        const [nextMethods, nextCategories] = await Promise.all([
          listPaymentMethods(),
          listCategories("EGRESO"),
        ]);
        setMethods(nextMethods);
        setCategories(
          nextCategories.filter((category) =>
            (BANK_CHARGE_CATEGORIES as readonly string[]).includes(
              category.name
            )
          )
        );
      } catch (error) {
        toast.error(getErrorMessage(error));
      }
    })();
  }, [open, account.id, form]);

  function handleSubmit(values: BankChargeFormValues) {
    if (lastClosedEnd && values.chargeDate <= lastClosedEnd) {
      const message = `La fecha cae en un período cerrado (hasta ${formatDate(
        lastClosedEnd
      )}). Usa una fecha posterior al cierre.`;
      form.setError("chargeDate", { message });
      toast.error(message);
      return;
    }

    onDone(values);
  }

  const errors = form.formState.errors;
  const methodItems = methods.map((method) => ({
    value: method.id,
    label: method.name,
  }));
  const categoryItems = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <form
          id={BANK_CHARGE_FORM_ID}
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex flex-col gap-5 p-6"
        >
          <div className="flex flex-col gap-1">
            <DialogTitle>Registrar cargo bancario</DialogTitle>
            <DialogDescription>
              {account.name} · se registra como un recibo de egreso con la
              categoría del cargo (ITF, comisión o detracción).
            </DialogDescription>
          </div>

          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="categoryId">Tipo de cargo</Label>
                <Select
                  value={field.value || null}
                  items={categoryItems}
                  onValueChange={(value) => field.onChange(value ?? "")}
                >
                  <SelectTrigger id="categoryId" className="w-full">
                    <SelectValue placeholder="Selecciona el cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryItems.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={errors.categoryId?.message} />
                {categories.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Las categorías de cargo bancario se siembran al abrir el
                    módulo de caja; si no aparecen, revisa Configuración.
                  </p>
                ) : null}
              </div>
            )}
          />

          <Controller
            control={form.control}
            name="methodId"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="methodId">Método</Label>
                <Select
                  value={field.value || null}
                  items={methodItems}
                  onValueChange={(value) => field.onChange(value ?? "")}
                >
                  <SelectTrigger id="methodId" className="w-full">
                    <SelectValue placeholder="Selecciona el método" />
                  </SelectTrigger>
                  <SelectContent>
                    {methodItems.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={errors.methodId?.message} />
              </div>
            )}
          />

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
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chargeDate">Fecha</Label>
            <Input
              id="chargeDate"
              type="date"
              min={openFrom}
              aria-invalid={!!errors.chargeDate}
              {...form.register("chargeDate")}
            />
            <FieldError message={errors.chargeDate?.message} />
            <p className="text-xs text-muted-foreground">
              Solo fechas abiertas: el último cierre bloquea los días anteriores.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reference">Referencia (opcional)</Label>
            <Input
              id="reference"
              placeholder="Ej. operación 0012345"
              aria-invalid={!!errors.reference}
              {...form.register("reference")}
            />
            <FieldError message={errors.reference?.message} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bankChargeNotes">Notas (opcional)</Label>
            <Textarea
              id="bankChargeNotes"
              placeholder="Observaciones del cargo"
              aria-invalid={!!errors.notes}
              {...form.register("notes")}
            />
            <FieldError message={errors.notes?.message} />
          </div>

          <div className="flex items-center justify-end gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" form={BANK_CHARGE_FORM_ID} disabled={isSaving}>
              {isSaving ? "Registrando…" : "Registrar cargo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
