"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getCashPosition } from "@/lib/caja/caja";
import {
  PEN_DENOMINATIONS,
  denominationKind,
  formatDenomination,
  sumDenominationCounts,
} from "@/lib/caja/denominaciones";
import {
  cashCountSchema,
  type CashCountFormInput,
  type CashCountFormValues,
} from "@/lib/schemas/cash-count";
import type { CashAccount } from "@/lib/cuentas/entidades";
import { cn, formatCurrency, getTodayLocalDate } from "@/lib/utils";

export const CASH_COUNT_FORM_ID = "cash-count-form";

interface CashCountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: CashAccount | null;
  onDone: (values: CashCountFormValues) => void;
  isSaving?: boolean;
}

function createEmptyValues(accountId: string): CashCountFormInput {
  return {
    accountId,
    countDate: getTodayLocalDate(),
    countedBalance: "",
    countedBy: "",
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

export function CashCountModal({
  open,
  onOpenChange,
  account,
  onDone,
  isSaving = false,
}: CashCountModalProps) {
  const isBank = account?.type === "BANK_ACCOUNT";
  const [expectedBalance, setExpectedBalance] = useState<number | null>(null);

  const form = useForm<CashCountFormInput, unknown, CashCountFormValues>({
    resolver: zodResolver(cashCountSchema),
    defaultValues: createEmptyValues(account?.id ?? ""),
  });

  useEffect(() => {
    if (open) {
      form.reset(createEmptyValues(account?.id ?? ""));
    }
  }, [open, account?.id, form]);

  const errors = form.formState.errors;
  const watchedDate = useWatch({ control: form.control, name: "countDate" });
  const watchedDenominations = useWatch({
    control: form.control,
    name: "denominations",
  });
  const rawCounted = useWatch({ control: form.control, name: "countedBalance" });
  const watchedCounted =
    rawCounted === undefined || rawCounted === null ? "" : String(rawCounted);

  useEffect(() => {
    if (!open || !account) {
      return;
    }

    let isMounted = true;

    void (async () => {
      try {
        const position = await getCashPosition(
          account.id,
          watchedDate || getTodayLocalDate()
        );

        if (isMounted) {
          setExpectedBalance(position);
        }
      } catch {
        if (isMounted) {
          setExpectedBalance(null);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [open, account, watchedDate]);

  const countedTotal = useMemo(
    () => sumDenominationCounts(toCounts(watchedDenominations)),
    [watchedDenominations]
  );
  const bankCounted = Number(watchedCounted);
  const counted = isBank
    ? Number.isFinite(bankCounted) && watchedCounted.trim() !== ""
      ? bankCounted
      : null
    : countedTotal;
  const difference =
    counted !== null && expectedBalance !== null
      ? Math.round((counted - expectedBalance) * 100) / 100
      : null;

  function handleSubmit(values: CashCountFormValues) {
    const denominationsTotal = sumDenominationCounts(
      toCounts(values.denominations)
    );

    if (!isBank && denominationsTotal <= 0) {
      toast.error("Ingresa el conteo por denominación (puede quedar en cero).");
      return;
    }

    if (isBank && values.countedBalance === undefined) {
      toast.error("Ingresa el saldo contado.");
      return;
    }

    onDone({
      ...values,
      countedBalance: isBank ? values.countedBalance : undefined,
      denominations: isBank ? undefined : values.denominations,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <form
          id={CASH_COUNT_FORM_ID}
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex flex-col gap-4 p-6"
        >
          <div className="flex flex-col gap-1">
            <DialogTitle>Arqueo sorpresivo</DialogTitle>
            <DialogDescription>
              {account
                ? `${account.name} · cuenta el efectivo sin cerrar el período`
                : "Selecciona una cuenta"}
            </DialogDescription>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="countDate">Fecha</Label>
              <Input
                id="countDate"
                type="date"
                max={getTodayLocalDate()}
                aria-invalid={!!errors.countDate}
                {...form.register("countDate")}
              />
              <FieldError message={errors.countDate?.message} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="countedBy">Contado por (opcional)</Label>
              <Input
                id="countedBy"
                placeholder="Ej. Ana Ríos"
                aria-invalid={!!errors.countedBy}
                {...form.register("countedBy")}
              />
              <FieldError message={errors.countedBy?.message} />
            </div>
          </div>

          {isBank ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="countedBalance">Saldo según extracto</Label>
              <Input
                id="countedBalance"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                aria-invalid={!!errors.countedBalance}
                {...form.register("countedBalance")}
              />
              <FieldError message={errors.countedBalance?.message} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="count-denomination-0">
                Conteo por denominación
              </Label>
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
                              id={`count-denomination-${index}`}
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
            </div>
          )}

          <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">
                Saldo esperado a la fecha
              </span>
              <span className="font-medium tabular-nums">
                {expectedBalance === null
                  ? "…"
                  : formatCurrency(expectedBalance)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Efectivo contado</span>
              <span className="font-medium tabular-nums">
                {counted === null ? "—" : formatCurrency(counted)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Diferencia</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  difference === null
                    ? "text-muted-foreground"
                    : difference === 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                )}
              >
                {difference === null ? "—" : formatCurrency(difference)}
              </span>
            </div>
            {difference !== null ? (
              <Badge
                variant="outline"
                className={
                  difference === 0
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                }
              >
                {difference === 0
                  ? "Cuadrado"
                  : difference < 0
                    ? "Faltante"
                    : "Sobrante"}
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="countNotes">Notas (opcional)</Label>
            <Textarea
              id="countNotes"
              placeholder="Observaciones del arqueo"
              {...form.register("notes")}
            />
            <FieldError message={errors.notes?.message} />
          </div>

          <div className="flex items-center justify-end gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Registrando…" : "Registrar arqueo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
