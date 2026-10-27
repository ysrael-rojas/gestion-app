"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CashValeModal } from "@/components/cajas-bancos/cash-vale-modal";
import { CashCountModal } from "@/components/cajas-bancos/cash-count-modal";
import { PettyCashReplenishModal } from "@/components/cajas-bancos/petty-cash-replenish-modal";
import {
  anularVale,
  createVale,
  listVales,
  pendingValesTotal,
  replenishPettyCash,
  type PettyCashVale,
  type ValeStatus,
} from "@/lib/caja/caja-chica";
import {
  createCashCount,
  listCashCounts,
  type CashCount,
} from "@/lib/caja/arqueos";
import type { CashAccount } from "@/lib/cuentas/entidades";
import type {
  PettyCashReplenishFormValues,
  PettyCashValeFormValues,
} from "@/lib/schemas/petty-cash-vale";
import type { CashCountFormValues } from "@/lib/schemas/cash-count";
import { formatCurrency, formatDate, round2 } from "@/lib/utils";

const STATUS_LABEL: Record<ValeStatus, string> = {
  PENDIENTE: "Pendiente",
  REPUESTO: "Repuesto",
  ANULADO: "Anulado",
};

const STATUS_VARIANT: Record<
  ValeStatus,
  "default" | "secondary" | "outline"
> = {
  PENDIENTE: "default",
  REPUESTO: "secondary",
  ANULADO: "outline",
};

interface PettyCashPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: CashAccount;
  /** Cuentas disponibles para financiar la reposición. */
  accounts: CashAccount[];
  /** Se llama tras una reposición (mueve saldos entre cuentas). */
  onChanged?: () => void;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

function SummaryValue({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={strong ? "text-lg font-semibold" : "text-lg"}>
        {value}
      </span>
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

export function PettyCashPanel({
  open,
  onOpenChange,
  account,
  accounts,
  onChanged,
}: PettyCashPanelProps) {
  const [vales, setVales] = useState<PettyCashVale[]>([]);
  const [counts, setCounts] = useState<CashCount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [valeOpen, setValeOpen] = useState(false);
  const [replenishOpen, setReplenishOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingCount, setIsSavingCount] = useState(false);
  const [busyValeId, setBusyValeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [nextVales, nextCounts] = await Promise.all([
        listVales(account.id),
        listCashCounts(account.id),
      ]);
      setVales(nextVales);
      setCounts(nextCounts);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [account.id]);

  const [wasOpen, setWasOpen] = useState(open);

  // Al abrir se limpia el arqueo anterior. Es el patrón de React para reiniciar
  // estado cuando cambia una prop, sin recurrir a un effect.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCountedCash("");
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    void (async () => {
      await load();
    })();
  }, [open, load]);

  const pendingVales = useMemo(
    () => vales.filter((vale) => vale.status === "PENDIENTE"),
    [vales]
  );
  const pendingTotal = pendingValesTotal(vales);

  // Arqueo: efectivo contado + vales pendientes debe dar el fondo total.
  const countedValue = Number(countedCash);
  const hasCountedCash =
    countedCash.trim() !== "" && Number.isFinite(countedValue);
  const arqueoTotal = round2(
    (hasCountedCash ? countedValue : 0) + pendingTotal
  );
  const difference = round2(arqueoTotal - account.changeFund);

  async function handleCreateVale(values: PettyCashValeFormValues) {
    setIsSaving(true);
    try {
      const created = await createVale(values);
      toast.success(`Vale N.º ${created.serial} registrado`);
      setValeOpen(false);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAnular(vale: PettyCashVale) {
    setBusyValeId(vale.id);
    try {
      await anularVale(vale.id);
      toast.success(`Vale N.º ${vale.serial} anulado`);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyValeId(null);
    }
  }

  async function handleReplenish(values: PettyCashReplenishFormValues) {
    setIsSaving(true);
    try {
      await replenishPettyCash(values);
      toast.success("Fondo repuesto");
      setReplenishOpen(false);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveCount(values: CashCountFormValues) {
    setIsSavingCount(true);
    try {
      const created = await createCashCount(values);
      toast.success(
        created.difference === 0
          ? "Arqueo guardado: cuadrado"
          : `Arqueo guardado: ${
              created.difference < 0 ? "faltante" : "sobrante"
            } de ${formatCurrency(Math.abs(created.difference))}`
      );
      setCountOpen(false);
      setCounts(await listCashCounts(account.id));
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSavingCount(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-3xl">
          <div className="flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-1">
              <DialogTitle>Caja chica · {account.name}</DialogTitle>
              <DialogDescription>
                {account.custodianName
                  ? `Custodio: ${account.custodianName}`
                  : "Sin custodio asignado"}
                {account.pettyExpenseLimit !== null
                  ? ` · Límite por gasto: ${formatCurrency(account.pettyExpenseLimit)}`
                  : " · Sin límite por gasto"}
              </DialogDescription>
            </div>

            <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <SummaryValue
                  label="Fondo total (fondo fijo)"
                  value={formatCurrency(account.changeFund)}
                  strong
                />
                <SummaryValue
                  label="Vales pendientes"
                  value={formatCurrency(pendingTotal)}
                />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="countedCash" className="text-xs">
                    Efectivo contado (S/)
                  </Label>
                  <Input
                    id="countedCash"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={countedCash}
                    onChange={(event) => setCountedCash(event.target.value)}
                  />
                </div>
                <SummaryValue
                  label="Efectivo contado + vales pendientes"
                  value={formatCurrency(arqueoTotal)}
                  strong
                />
              </div>

              <div className="flex items-center gap-2 text-sm">
                {hasCountedCash ? (
                  difference === 0 ? (
                    <>
                      <Badge variant="secondary">Cuadrado</Badge>
                      <span className="text-muted-foreground">
                        El fondo está completo.
                      </span>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline">
                        {difference < 0 ? "Faltante" : "Sobrante"}
                      </Badge>
                      <span className="text-muted-foreground">
                        {formatCurrency(Math.abs(difference))} respecto al fondo
                        total.
                      </span>
                    </>
                  )
                ) : (
                  <span className="text-muted-foreground">
                    Ingresa el efectivo contado para cuadrar el arqueo contra el
                    fondo total.
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setValeOpen(true)}>Nuevo vale</Button>
              <Button
                variant="outline"
                onClick={() => setReplenishOpen(true)}
                disabled={pendingVales.length === 0}
              >
                Reponer fondo
              </Button>
              <Button variant="outline" onClick={() => setCountOpen(true)}>
                Guardar arqueo
              </Button>
              <span className="text-sm text-muted-foreground">
                {pendingVales.length === 0
                  ? "No hay vales pendientes."
                  : `${pendingVales.length} vale(s) pendiente(s) por ${formatCurrency(pendingTotal)}.`}
              </span>
            </div>

            {counts.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Últimos arqueos</span>
                <div className="flex flex-col divide-y rounded-md border">
                  {counts.slice(0, 3).map((count) => (
                    <div
                      key={count.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm"
                    >
                      <span>{formatDate(count.countDate)}</span>
                      <span className="text-muted-foreground">
                        {count.countedBy || "—"}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          count.difference === 0
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        }
                      >
                        {count.difference === 0
                          ? "Cuadrado"
                          : count.difference < 0
                            ? "Faltante"
                            : "Sobrante"}
                      </Badge>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(count.difference)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">N.º</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Pagado a</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Comprob.</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`}>
                        {Array.from({ length: 8 }).map((_, cell) => (
                          <TableCell key={`skeleton-${index}-${cell}`}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : vales.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-sm text-muted-foreground"
                      >
                        Aún no hay vales registrados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    vales.map((vale) => (
                      <TableRow key={vale.id}>
                        <TableCell>{vale.serial}</TableCell>
                        <TableCell>{formatDate(vale.valeDate)}</TableCell>
                        <TableCell>{vale.paidTo}</TableCell>
                        <TableCell>{vale.concept}</TableCell>
                        <TableCell>{vale.hasReceipt ? "Sí" : "No"}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(vale.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[vale.status]}>
                            {STATUS_LABEL[vale.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {vale.status === "PENDIENTE" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyValeId === vale.id}
                              onClick={() => void handleAnular(vale)}
                            >
                              Anular
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-end">
              <DialogClose render={<Button variant="outline" />}>
                Cerrar
              </DialogClose>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CashValeModal
        open={valeOpen}
        onOpenChange={setValeOpen}
        account={account}
        onDone={(values) => void handleCreateVale(values)}
        isSaving={isSaving}
      />

      <PettyCashReplenishModal
        open={replenishOpen}
        onOpenChange={setReplenishOpen}
        account={account}
        accounts={accounts}
        pendingVales={pendingVales}
        onDone={(values) => void handleReplenish(values)}
        isSaving={isSaving}
      />

      <CashCountModal
        open={countOpen}
        onOpenChange={setCountOpen}
        account={account}
        onDone={(values) => void handleSaveCount(values)}
        isSaving={isSavingCount}
      />
    </>
  );
}
