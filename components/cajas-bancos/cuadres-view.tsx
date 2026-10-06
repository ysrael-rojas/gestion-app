"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCajasBancos } from "@/components/cajas-bancos/cajas-bancos-provider";
import { CashCloseModal } from "@/components/cajas-bancos/cash-close-modal";
import { CuadreReport } from "@/components/cajas-bancos/cuadre-report";
import {
  closeCashAccount,
  getCashAccountStatement,
  getCashPosition,
  getLastClose,
  listCashCloses,
  proposeClosePeriod,
} from "@/lib/caja/caja";
import { getPeriodicityLabel } from "@/lib/data/cash-options";
import type { CashClose, Payment } from "@/components/pagos/types";
import type { CashCloseFormValues } from "@/lib/schemas/cash-close";
import { formatCurrency, formatDate, getTodayLocalDate } from "@/lib/utils";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

function formatAmount(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: currency || "PEN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return formatCurrency(value);
  }
}

interface AccountState {
  position: number;
  lastClose: CashClose | null;
  proposed: { periodStart: string; periodEnd: string };
  closes: CashClose[];
}

export function CuadresView() {
  const { accounts } = useCajasBancos();
  const today = getTodayLocalDate();

  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [position, setPosition] = useState<number | null>(null);
  const [lastClose, setLastClose] = useState<CashClose | null>(null);
  const [proposed, setProposed] = useState<{
    periodStart: string;
    periodEnd: string;
  } | null>(null);
  const [closes, setCloses] = useState<CashClose[]>([]);
  const [selectedClose, setSelectedClose] = useState<CashClose | null>(null);
  const [statement, setStatement] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Derivado: si el usuario no eligió cuenta, se usa la primera.
  const accountId = selectedAccountId || accounts[0]?.id || "";
  const account = accounts.find((item) => item.id === accountId) ?? null;

  const fetchAccount = useCallback(
    async (id: string): Promise<AccountState> => {
      const [nextPosition, nextLastClose, nextProposed, nextCloses] =
        await Promise.all([
          getCashPosition(id, today),
          getLastClose(id),
          proposeClosePeriod(id, today),
          listCashCloses(id),
        ]);

      return {
        position: nextPosition,
        lastClose: nextLastClose,
        proposed: nextProposed,
        closes: nextCloses,
      };
    },
    [today]
  );

  useEffect(() => {
    let isMounted = true;

    if (!accountId) {
      return;
    }

    void (async () => {
      setIsLoading(true);

      try {
        const state = await fetchAccount(accountId);

        if (isMounted) {
          setPosition(state.position);
          setLastClose(state.lastClose);
          setProposed(state.proposed);
          setCloses(state.closes);
          setSelectedClose(state.closes[0] ?? null);
        }
      } catch (error) {
        if (isMounted) {
          toast.error(getErrorMessage(error));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [accountId, fetchAccount]);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      if (!accountId || !selectedClose) {
        if (isMounted) {
          setStatement([]);
        }
        return;
      }

      try {
        const data = await getCashAccountStatement(
          accountId,
          selectedClose.periodStart,
          selectedClose.periodEnd
        );
        if (isMounted) {
          setStatement(data);
        }
      } catch (error) {
        if (isMounted) {
          toast.error(getErrorMessage(error));
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [accountId, selectedClose]);

  async function handleClose(values: CashCloseFormValues) {
    setIsClosing(true);
    try {
      const created = await closeCashAccount(values);
      const state = await fetchAccount(values.cashAccountId);
      setPosition(state.position);
      setLastClose(state.lastClose);
      setProposed(state.proposed);
      setCloses(state.closes);
      setSelectedClose(created);
      setModalOpen(false);
      toast.success("Caja cerrada");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsClosing(false);
    }
  }

  return (
    <div className="container mx-auto flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Cuadres de caja</h1>
        <p className="text-sm text-muted-foreground">
          Aperturas, cierres y flujo de efectivo por cuenta.
        </p>
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Registra una caja o banco en Configuración para empezar.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5 sm:max-w-sm">
            <label className="text-sm font-medium" htmlFor="accountId">
              Cuenta
            </label>
            <Select
              value={accountId}
              items={accounts.map((item) => ({
                value: item.id,
                label: `${item.name} · ${item.currency}`,
              }))}
              onValueChange={(value) => setSelectedAccountId(value ?? "")}
            >
              <SelectTrigger id="accountId" className="w-full">
                <SelectValue placeholder="Selecciona una cuenta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} · {item.currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="bg-muted/30 ring-0">
              <CardHeader>
                <CardTitle className="text-sm">Saldo a hoy</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">
                {isLoading || position === null || !account ? (
                  <Skeleton className="h-6 w-32" />
                ) : (
                  formatAmount(position, account.currency)
                )}
              </CardContent>
            </Card>

            <Card className="bg-muted/30 ring-0">
              <CardHeader>
                <CardTitle className="text-sm">Último cierre</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">
                {isLoading ? (
                  <Skeleton className="h-6 w-32" />
                ) : lastClose ? (
                  formatDate(lastClose.periodEnd)
                ) : (
                  "Sin cierres"
                )}
              </CardContent>
            </Card>

            <Card className="bg-muted/30 ring-0">
              <CardHeader>
                <CardTitle className="text-sm">Período sugerido</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {isLoading || !proposed ? (
                  <Skeleton className="h-6 w-40" />
                ) : (
                  <span className="text-sm">
                    {formatDate(proposed.periodStart)} —{" "}
                    {formatDate(proposed.periodEnd)}
                  </span>
                )}
                <Button
                  onClick={() => setModalOpen(true)}
                  disabled={isLoading || !account || !proposed}
                >
                  Cerrar caja
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">Historial de cierres</h2>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead>Periodicidad</TableHead>
                    <TableHead className="text-right">Esperado</TableHead>
                    <TableHead className="text-right">Conteo</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`}>
                        {Array.from({ length: 6 }).map((_, cell) => (
                          <TableCell key={`skeleton-${index}-${cell}`}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : closes.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-sm text-muted-foreground"
                      >
                        Aún no hay cierres para esta cuenta.
                      </TableCell>
                    </TableRow>
                  ) : (
                    closes.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {formatDate(item.periodStart)} —{" "}
                          {formatDate(item.periodEnd)}
                        </TableCell>
                        <TableCell>
                          {getPeriodicityLabel(item.periodicity)}
                        </TableCell>
                        <TableCell className="text-right">
                          {account
                            ? formatAmount(item.expectedBalance, account.currency)
                            : item.expectedBalance}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.countedBalance !== null
                            ? account
                              ? formatAmount(item.countedBalance, account.currency)
                              : item.countedBalance
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.difference !== null
                            ? account
                              ? formatAmount(item.difference, account.currency)
                              : item.difference
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedClose(item)}
                          >
                            Ver reporte
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {selectedClose && account ? (
            <CuadreReport
              close={selectedClose}
              statement={statement}
              accountName={account.name}
              currency={account.currency}
            />
          ) : null}

          <CashCloseModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            account={account}
            defaultPeriod={proposed ?? { periodStart: today, periodEnd: today }}
            onClose={(values) => void handleClose(values)}
            isSaving={isClosing}
          />
        </>
      )}
    </div>
  );
}
