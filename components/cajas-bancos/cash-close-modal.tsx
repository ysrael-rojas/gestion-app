"use client";

import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  PEN_DENOMINATIONS,
  denominationKind,
  formatDenomination,
  netCash,
  sumDenominationCounts,
} from "@/lib/caja/denominaciones";
import {
  cashCloseSchema,
  type CashCloseFormInput,
  type CashCloseFormValues,
} from "@/lib/schemas/cash-close";
import type { CashAccount } from "@/lib/cuentas/entidades";
import { formatCurrency, formatDate } from "@/lib/utils";

const CASH_CLOSE_FORM_ID = "cash-close-form";

interface CashCloseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: CashAccount | null;
  defaultPeriod: { periodStart: string; periodEnd: string };
  onClose: (values: CashCloseFormValues) => void;
  isSaving?: boolean;
}

// Acepta tanto los valores del formulario (cantidad como texto) como los ya
// validados (número) y devuelve pares numéricos listos para sumar.
type DenominationRowLike = { denomination?: unknown; quantity?: unknown };

function toCounts(rows: readonly DenominationRowLike[] | undefined) {
  return (rows ?? []).map((row) => {
    const denomination = Number(row?.denomination);
    const quantity = Number(row?.quantity);

    return {
      denomination: Number.isFinite(denomination) ? denomination : 0,
      quantity: Number.isFinite(quantity) ? quantity : undefined,
    };
  });
}

function createEmptyValues(
  accountId: string,
  periodEnd: string
): CashCloseFormInput {
  return {
    cashAccountId: accountId,
    periodEnd,
    countedBalance: "",
    notes: "",
    denominations: PEN_DENOMINATIONS.map((denomination) => ({
      denomination,
      quantity: "",
    })),
  };
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
    defaultValues: createEmptyValues(account?.id ?? "", defaultPeriod.periodEnd),
  });

  useEffect(() => {
    if (open) {
      form.reset(
        createEmptyValues(account?.id ?? "", defaultPeriod.periodEnd)
      );
    }
  }, [open, account?.id, defaultPeriod.periodEnd, form]);

  const errors = form.formState.errors;
  const watchedDenominations = useWatch({
    control: form.control,
    name: "denominations",
  });

  // Suma en vivo del arqueo: total de valores en caja y efectivo neto.
  const countedTotal = useMemo(
    () => sumDenominationCounts(toCounts(watchedDenominations)),
    [watchedDenominations]
  );
  const changeFund = account?.changeFund ?? 0;
  const netTotal = netCash(countedTotal, changeFund);

  function handleSubmit(values: CashCloseFormValues) {
    const denominationsTotal = sumDenominationCounts(toCounts(values.denominations));

    if (!isBank && denominationsTotal <= 0) {
      toast.error("Ingresa el conteo por denominación para cerrar la caja.");
      return;
    }

    onClose({
      ...values,
      // En bancos no hay arqueo: el conteo por denominación es solo de cajas.
      countedBalance: isBank ? values.countedBalance : undefined,
      denominations: isBank ? undefined : values.denominations,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
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
                <div className="flex flex-col gap-2">
                  <Label htmlFor="denomination-0">Arqueo por denominación</Label>
                  <div className="overflow-hidden rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Denominación</TableHead>
                          <TableHead className="w-24">Cantidad</TableHead>
                          <TableHead className="text-right">Subtotal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {PEN_DENOMINATIONS.map((denomination, index) => {
                          const quantity = Number(
                            watchedDenominations?.[index]?.quantity
                          );
                          const subtotal = Number.isFinite(quantity)
                            ? denomination * quantity
                            : 0;

                          return (
                            <TableRow key={denomination}>
                              <TableCell>
                                <span className="text-muted-foreground">
                                  {denominationKind(denomination)}
                                </span>{" "}
                                {formatDenomination(denomination)}
                              </TableCell>
                              <TableCell>
                                <Input
                                  id={`denomination-${index}`}
                                  type="number"
                                  inputMode="numeric"
                                  min="0"
                                  step="1"
                                  placeholder="0"
                                  aria-label={`Cantidad de ${formatDenomination(denomination)}`}
                                  {...form.register(
                                    `denominations.${index}.quantity`
                                  )}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(subtotal)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <FieldError
                    message={
                      errors.denominations?.message ??
                      errors.denominations?.root?.message
                    }
                  />

                  <div className="flex flex-col gap-1 rounded-md border bg-muted/30 p-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium">
                        Total valores en caja (A)
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(countedTotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        Menos fondo de cambio (B)
                      </span>
                      <span>{formatCurrency(changeFund)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium">Efectivo neto (A − B)</span>
                      <span className="font-semibold">
                        {formatCurrency(netTotal)}
                      </span>
                    </div>
                  </div>
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
