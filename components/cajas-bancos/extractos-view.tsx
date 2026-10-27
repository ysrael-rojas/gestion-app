"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCajasBancos } from "@/components/cajas-bancos/cajas-bancos-provider";
import {
  StatementTable,
  buildStatementRows,
} from "@/components/cajas-bancos/statement-table";
import { getCashAccountStatement } from "@/lib/caja/caja";
import { downloadCsv, toCsv } from "@/lib/caja/csv";
import { getMonthRange } from "@/lib/caja/dashboard";
import { addDays } from "@/lib/caja/periodo";
import { summarizeStatement } from "@/lib/caja/reportes";
import { listAccountTransfers } from "@/lib/caja/transferencias";
import type { CashTransfer } from "@/lib/caja/transferencias";
import type { Payment } from "@/components/pagos/types";
import { formatCurrency, getTodayLocalDate } from "@/lib/utils";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No se pudieron cargar los movimientos. Intenta nuevamente.";
}

/** Mes anterior completo (primer y último día). */
function previousMonthRange(today: string): { start: string; end: string } {
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  return getMonthRange(addDays(firstOfMonth, -1));
}

export function ExtractosView() {
  const { accounts } = useCajasBancos();
  const today = getTodayLocalDate();
  const currentMonth = getMonthRange(today);

  const [accountId, setAccountId] = useState<string>("");
  const [from, setFrom] = useState(currentMonth.start);
  const [to, setTo] = useState(currentMonth.end);
  const [statement, setStatement] = useState<Payment[]>([]);
  const [transfers, setTransfers] = useState<CashTransfer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.isActive),
    [accounts]
  );
  const account =
    activeAccounts.find((item) => item.id === accountId) ??
    activeAccounts[0] ??
    null;

  const load = useCallback(async () => {
    if (!account) {
      return;
    }

    setIsLoading(true);

    try {
      const [nextStatement, nextTransfers] = await Promise.all([
        getCashAccountStatement(account.id, from, to),
        listAccountTransfers(account.id, from, to),
      ]);
      setStatement(nextStatement);
      setTransfers(nextTransfers);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [account, from, to]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const rows = useMemo(
    () => buildStatementRows(statement, transfers, account?.id ?? ""),
    [statement, transfers, account]
  );
  const summary = useMemo(
    () => summarizeStatement(statement, transfers),
    [statement, transfers]
  );
  const rangeIsInverted = from > to;
  const rangeIsLong =
    !rangeIsInverted && (new Date(to).getTime() - new Date(from).getTime()) / 86400000 > 366;

  function handleExport() {
    if (!account) {
      return;
    }

    const csvRows: (string | number | null)[][] = [
      ["Extracto de cuenta"],
      ["Cuenta", account.name],
      ["Rango", `${from} a ${to}`],
      [],
      [
        "Fecha",
        "Tipo",
        "Recibo",
        "Dirección",
        "Categoría",
        "Método",
        "Importe",
        "Estado",
      ],
      ...rows.map((row) => [
        row.date,
        row.kind === "TRANSFER" ? "Transferencia" : "Recibo",
        row.ref,
        row.direction,
        row.category,
        row.method,
        row.amount,
        row.status ?? "—",
      ]),
    ];

    downloadCsv(`extracto-${account.name}-${from}_${to}.csv`, toCsv(csvRows));
  }

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Extractos</h1>
        <p className="text-sm text-muted-foreground">
          Los movimientos de una cuenta en las fechas que elijas.
        </p>
      </div>

      {activeAccounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Registra una caja o banco en Configuración para empezar.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex w-full flex-col gap-1.5 sm:w-64">
              <Label htmlFor="extract-account">Cuenta</Label>
              <Select
                value={account?.id ?? null}
                items={activeAccounts.map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${item.currency}`,
                }))}
                onValueChange={(value) => setAccountId(value ?? "")}
              >
                <SelectTrigger id="extract-account" className="w-full">
                  <SelectValue placeholder="Selecciona una cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} · {item.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extract-from">Desde</Label>
              <Input
                id="extract-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="w-40"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extract-to">Hasta</Label>
              <Input
                id="extract-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="w-40"
              />
            </div>

            <Button
              variant="outline"
              onClick={() => {
                setFrom(currentMonth.start);
                setTo(currentMonth.end);
              }}
            >
              Este mes
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const previous = previousMonthRange(today);
                setFrom(previous.start);
                setTo(previous.end);
              }}
            >
              Mes anterior
            </Button>
            <Button onClick={handleExport} disabled={rows.length === 0}>
              <Download />
              Descargar CSV (se abre en Excel)
            </Button>
          </div>

          {rangeIsInverted ? (
            <p role="alert" className="text-sm text-destructive">
              La fecha «Desde» no puede ser posterior a «Hasta».
            </p>
          ) : null}
          {rangeIsLong ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              El rango supera un año: el listado puede tardar.
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Card className="bg-muted/30 ring-0">
              <CardHeader>
                <CardTitle className="text-sm">Ingresos</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold tabular-nums">
                {formatCurrency(summary.income, account?.currency === "USD" ? "USD" : "PEN")}
              </CardContent>
            </Card>
            <Card className="bg-muted/30 ring-0">
              <CardHeader>
                <CardTitle className="text-sm">Egresos</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold tabular-nums">
                {formatCurrency(summary.expense, account?.currency === "USD" ? "USD" : "PEN")}
              </CardContent>
            </Card>
            <Card className="bg-muted/30 ring-0">
              <CardHeader>
                <CardTitle className="text-sm">Movimientos</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">
                {summary.movements}
              </CardContent>
            </Card>
            <Card className="bg-muted/30 ring-0">
              <CardHeader>
                <CardTitle className="text-sm">Transferencias</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">
                {summary.transfers}
              </CardContent>
            </Card>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Cargando movimientos…
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay movimientos en ese rango. Prueba con otras fechas o elige
              «Este mes».
            </p>
          ) : (
            <StatementTable
              rows={rows}
              currency={account?.currency ?? "PEN"}
            />
          )}
        </>
      )}
    </main>
  );
}
