"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import type {
  CashReceiptCategory,
  PaymentMethodRef,
} from "@/components/pagos/types";
import {
  ensureCatalogsSeeded,
  getLastClose,
  listCategories,
  listPaymentMethods,
} from "@/lib/caja/caja";
import { firstOpenDate, isDateClosed } from "@/lib/caja/periodo";
import { CASH_METHOD_CODE } from "@/lib/caja/defaults";
import {
  cashMovementSchema,
  type CashMovementFormInput,
  type CashMovementFormValues,
} from "@/lib/schemas/cash-movement";
import type { CashAccount } from "@/lib/cuentas/entidades";
import { cn, formatDate, getTodayLocalDate } from "@/lib/utils";

export const CASH_MOVEMENT_FORM_ID = "cash-movement-form";

interface CashMovementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: CashAccount | null;
  onDone: (values: CashMovementFormValues) => void;
  isSaving?: boolean;
}

function createEmptyValues(accountId: string): CashMovementFormInput {
  return {
    cashAccountId: accountId,
    direction: "EGRESO",
    methodId: "",
    categoryId: "",
    amount: undefined as unknown as number,
    movementDate: getTodayLocalDate(),
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
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function CashMovementModal({
  open,
  onOpenChange,
  account,
  onDone,
  isSaving = false,
}: CashMovementModalProps) {
  const isBank = account?.type === "BANK_ACCOUNT";
  const [methods, setMethods] = useState<PaymentMethodRef[]>([]);
  const [categories, setCategories] = useState<CashReceiptCategory[]>([]);
  const [openFrom, setOpenFrom] = useState<string>(() => getTodayLocalDate());
  const [lastClosedEnd, setLastClosedEnd] = useState<string | null>(null);

  const form = useForm<
    CashMovementFormInput,
    unknown,
    CashMovementFormValues
  >({
    resolver: zodResolver(cashMovementSchema),
    defaultValues: createEmptyValues(account?.id ?? ""),
  });

  const direction = useWatch({ control: form.control, name: "direction" });

  useEffect(() => {
    if (!open || !account) {
      return;
    }

    let isMounted = true;

    void (async () => {
      let lastCloseEnd: string | null = null;

      try {
        const lastClose = await getLastClose(account.id);
        lastCloseEnd = lastClose?.periodEnd ?? null;

        if (isMounted) {
          setLastClosedEnd(lastCloseEnd);
        }
      } catch (error) {
        if (isMounted) {
          toast.error(getErrorMessage(error));
        }
      }

      const nextOpenFrom = firstOpenDate(lastCloseEnd, getTodayLocalDate());

      if (isMounted) {
        setOpenFrom(nextOpenFrom);
      }

      try {
        await ensureCatalogsSeeded();
        const [nextMethods, nextCategories] = await Promise.all([
          listPaymentMethods(),
          listCategories(),
        ]);

        if (!isMounted) {
          return;
        }

        // En cajas solo hay Efectivo; en bancos, los demás métodos.
        const usableMethods = nextMethods.filter((method) =>
          isBank
            ? method.code !== CASH_METHOD_CODE
            : method.code === CASH_METHOD_CODE
        );
        setMethods(usableMethods);
        setCategories(nextCategories);

        form.reset({
          ...createEmptyValues(account.id),
          movementDate: nextOpenFrom,
          // La caja solo admite Efectivo: se preselecciona.
          methodId: usableMethods.length === 1 ? usableMethods[0].id : "",
        });
      } catch (error) {
        if (isMounted) {
          toast.error(getErrorMessage(error));
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [open, account, isBank, form]);

  const errors = form.formState.errors;

  const methodItems = useMemo(
    () => methods.map((method) => ({ value: method.id, label: method.name })),
    [methods]
  );
  const categoryItems = useMemo(
    () =>
      categories
        .filter((category) => category.direction === direction)
        .map((category) => ({ value: category.id, label: category.name })),
    [categories, direction]
  );

  function handleSubmit(values: CashMovementFormValues) {
    if (lastClosedEnd && isDateClosed(values.movementDate, lastClosedEnd)) {
      const message = `La fecha cae en un período cerrado (hasta ${formatDate(
        lastClosedEnd
      )}). Usa una fecha posterior al cierre.`;
      form.setError("movementDate", { message });
      toast.error(message);
      return;
    }

    onDone(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <form
          id={CASH_MOVEMENT_FORM_ID}
          noValidate
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex flex-col gap-5 p-6"
        >
          <div className="flex flex-col gap-1">
            <DialogTitle>Registrar movimiento</DialogTitle>
            <DialogDescription>
              {account
                ? `${account.name} · dinero que entra o sale sin comprobante`
                : "Selecciona una cuenta"}
            </DialogDescription>
          </div>

          <Controller
            control={form.control}
            name="direction"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <Label>Tipo</Label>
                <div
                  role="group"
                  aria-label="Tipo de movimiento"
                  className="flex gap-2"
                >
                  {(
                    [
                      { value: "INGRESO", label: "Ingreso" },
                      { value: "EGRESO", label: "Egreso" },
                    ] as const
                  ).map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={field.value === option.value ? "default" : "outline"}
                      size="sm"
                      aria-pressed={field.value === option.value}
                      className={cn("flex-1")}
                      onClick={() => {
                        field.onChange(option.value);
                        // La categoría depende de la dirección.
                        form.setValue("categoryId", "");
                      }}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          />

          <Controller
            control={form.control}
            name="methodId"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="movement-method">Método</Label>
                <Select
                  value={field.value || null}
                  items={methodItems}
                  onValueChange={(value) => field.onChange(value ?? "")}
                >
                  <SelectTrigger id="movement-method" className="w-full">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Seleccionar</SelectItem>
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

          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="movement-category">Categoría</Label>
                <Select
                  value={field.value || null}
                  items={categoryItems}
                  onValueChange={(value) => field.onChange(value ?? "")}
                >
                  <SelectTrigger id="movement-category" className="w-full">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Seleccionar</SelectItem>
                    {categoryItems.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={errors.categoryId?.message} />
              </div>
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="movement-amount">Importe (S/)</Label>
              <Input
                id="movement-amount"
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
              <Label htmlFor="movement-date">Fecha</Label>
              <Input
                id="movement-date"
                type="date"
                min={openFrom}
                max={getTodayLocalDate()}
                aria-invalid={!!errors.movementDate}
                {...form.register("movementDate")}
              />
              <FieldError message={errors.movementDate?.message} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-reference">Referencia (opcional)</Label>
            <Input
              id="movement-reference"
              maxLength={60}
              placeholder="Ej. operación 0012345"
              {...form.register("reference")}
            />
            <FieldError message={errors.reference?.message} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-notes">Notas (opcional)</Label>
            <Textarea
              id="movement-notes"
              placeholder="Ej. aporte para capital de trabajo"
              {...form.register("notes")}
            />
            <FieldError message={errors.notes?.message} />
          </div>

          <div className="flex items-center justify-end gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Registrando…" : "Registrar movimiento"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
