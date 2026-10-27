"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  getCashDifferenceTolerance,
  getCashPosition,
} from "@/lib/caja/caja";
import {
  cashCloseSchema,
  type CashCloseFormInput,
  type CashCloseFormValues,
} from "@/lib/schemas/cash-close";
import type { CashAccount } from "@/lib/cuentas/entidades";
import { cn, formatCurrency, formatDate, getTodayLocalDate } from "@/lib/utils";

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
    differenceReason: "",
    countedBy: "",
    verifiedBy: "",
    emptyCashConfirmed: false,
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
  const [expectedBalance, setExpectedBalance] = useState<number | null>(null);
  const [tolerance, setTolerance] = useState(0.5);

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
  const emptyConfirmed = useWatch({
    control: form.control,
    name: "emptyCashConfirmed",
  });
  const watchedPeriodEnd = useWatch({
    control: form.control,
    name: "periodEnd",
  });
  const rawCountedBalance = useWatch({
    control: form.control,
    name: "countedBalance",
  });
  const watchedCountedBalance =
    rawCountedBalance === undefined || rawCountedBalance === null
      ? ""
      : String(rawCountedBalance);
  const watchedReason = useWatch({
    control: form.control,
    name: "differenceReason",
  });

  // Saldo esperado al período elegido y tolerancia vigente (SPEC 49): son la
  // base para mostrar la diferencia en vivo y exigir el motivo.
  useEffect(() => {
    if (!open || !account) {
      return;
    }

    let isMounted = true;

    void (async () => {
      try {
        const asOf = watchedPeriodEnd || defaultPeriod.periodEnd;
        const [position, nextTolerance] = await Promise.all([
          getCashPosition(account.id, asOf),
          getCashDifferenceTolerance(),
        ]);

        if (isMounted) {
          setExpectedBalance(position);
          setTolerance(nextTolerance);
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
  }, [open, account, watchedPeriodEnd, defaultPeriod.periodEnd]);

  // Suma en vivo del arqueo: total de valores en caja y efectivo neto.
  const countedTotal = useMemo(
    () => sumDenominationCounts(toCounts(watchedDenominations)),
    [watchedDenominations]
  );
  const changeFund = account?.changeFund ?? 0;
  const netTotal = netCash(countedTotal, changeFund);

  const bankCounted = Number(watchedCountedBalance);
  const countedForDifference = isBank
    ? Number.isFinite(bankCounted) && watchedCountedBalance.trim() !== ""
      ? bankCounted
      : null
    : countedTotal > 0
      ? countedTotal
      : emptyConfirmed
        ? 0
        : null;
  const difference =
    countedForDifference !== null && expectedBalance !== null
      ? Math.round((countedForDifference - expectedBalance) * 100) / 100
      : null;
  const overTolerance =
    difference !== null && Math.abs(difference) > tolerance;
  const missingReason = overTolerance && !watchedReason?.trim();

  function handleSubmit(values: CashCloseFormValues) {
    const denominationsTotal = sumDenominationCounts(
      toCounts(values.denominations)
    );
    let counted: number | null;

    if (isBank) {
      counted = values.countedBalance ?? null;
    } else if (denominationsTotal > 0) {
      counted = denominationsTotal;
    } else if (values.emptyCashConfirmed) {
      counted = 0;
    } else {
      toast.error(
        "Marca la confirmación para cerrar la caja sin efectivo, o ingresa el conteo."
      );
      return;
    }

    // Mismo criterio que la RPC (SPEC 49): sobre la tolerancia, el motivo es
    // obligatorio. Aquí se avisa antes de enviar.
    if (counted !== null && expectedBalance !== null) {
      const diff = Math.round((counted - expectedBalance) * 100) / 100;

      if (Math.abs(diff) > tolerance && !values.differenceReason?.trim()) {
        const message = `La diferencia (${formatCurrency(diff)}) supera la tolerancia (${formatCurrency(tolerance)}). Escribe el motivo del cierre.`;
        form.setError("differenceReason", { message });
        toast.error(message);
        return;
      }
    }

    onClose({
      ...values,
      countedBalance: isBank
        ? values.countedBalance
        : denominationsTotal > 0
          ? undefined
          : 0,
      denominations:
        isBank || denominationsTotal <= 0 ? undefined : values.denominations,
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
                  max={getTodayLocalDate()}
                  aria-invalid={!!errors.periodEnd}
                  {...form.register("periodEnd")}
                />
                <FieldError message={errors.periodEnd?.message} />
                <p className="text-xs text-muted-foreground">
                  No se podrán registrar ni modificar recibos de esta cuenta con
                  fecha anterior o igual a este día. No se puede cerrar el
                  futuro.
                </p>
              </div>

              {isBank ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="countedBalance">
                    Saldo según extracto (opcional)
                  </Label>
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
                  <p className="text-xs text-muted-foreground">
                    Si lo dejas vacío, el cierre no compara contra el extracto.
                  </p>
                </div>
              ) : (
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

                  {countedTotal <= 0 ? (
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="emptyCashConfirmed"
                        checked={Boolean(emptyConfirmed)}
                        onCheckedChange={(checked) =>
                          form.setValue(
                            "emptyCashConfirmed",
                            Boolean(checked)
                          )
                        }
                      />
                      <Label
                        htmlFor="emptyCashConfirmed"
                        className="text-sm font-normal"
                      >
                        Confirmo que la caja quedó sin efectivo
                      </Label>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    Saldo esperado al cierre
                  </span>
                  <span className="font-medium tabular-nums">
                    {expectedBalance === null
                      ? "…"
                      : formatCurrency(expectedBalance)}
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
                <p className="text-xs text-muted-foreground">
                  Tolerancia permitida: {formatCurrency(tolerance)}.
                </p>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="differenceReason">
                    Motivo de la diferencia
                    {overTolerance ? " (obligatorio)" : " (opcional)"}
                  </Label>
                  <Textarea
                    id="differenceReason"
                    placeholder={
                      overTolerance
                        ? "Explica por qué la diferencia supera la tolerancia"
                        : "Ej. redondeo al dar vuelto"
                    }
                    aria-invalid={!!errors.differenceReason || missingReason}
                    {...form.register("differenceReason")}
                  />
                  <FieldError message={errors.differenceReason?.message} />
                  {missingReason && !errors.differenceReason ? (
                    <p role="alert" className="text-sm text-destructive">
                      La diferencia supera la tolerancia: escribe el motivo.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="countedBy">¿Quién contó la caja?</Label>
                    <Input
                      id="countedBy"
                      placeholder="Ej. Ana Ríos"
                      {...form.register("countedBy")}
                    />
                    <FieldError message={errors.countedBy?.message} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="verifiedBy">
                      ¿Quién revisó el arqueo?
                    </Label>
                    <Input
                      id="verifiedBy"
                      placeholder="Ej. Luis Torres"
                      {...form.register("verifiedBy")}
                    />
                    <FieldError message={errors.verifiedBy?.message} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Si lo hiciste tú, escribe tu nombre. Se imprime en el acta.
                </p>
              </div>

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
