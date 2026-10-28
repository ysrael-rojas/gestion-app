"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getPenUsdRate,
  listCashPositionsConsolidated,
} from "@/lib/caja/caja";
import { toPen } from "@/lib/caja/dashboard";
import { downloadCsv, toCsv } from "@/lib/caja/csv";
import {
  buildCashFlowProjection,
  type CashFlowProjection,
} from "@/lib/caja/proyeccion";
import { listOpenVouchers } from "@/lib/pagos/cartera";
import { cn, formatCurrency, formatDate, getTodayLocalDate } from "@/lib/utils";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No se pudo calcular el flujo proyectado. Intenta nuevamente.";
}

function Amount({
  value,
  tone,
  strong = false,
}: {
  value: number;
  tone?: string;
  strong?: boolean;
}) {
  return (
    <span
      className={cn(
        "tabular-nums",
        strong ? "font-semibold" : "font-medium",
        tone
      )}
    >
      {formatCurrency(value)}
    </span>
  );
}

export function CashFlowProjection() {
  const [today] = useState(() => getTodayLocalDate());
  const [projection, setProjection] = useState<CashFlowProjection | null>(null);
  const [penUsdRate, setPenUsdRate] = useState<number | null>(null);
  const [accountCount, setAccountCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const [positions, receivables, payables, rate] = await Promise.all([
          listCashPositionsConsolidated(today),
          listOpenVouchers("INGRESO"),
          listOpenVouchers("EGRESO"),
          getPenUsdRate(),
        ]);

        if (!isMounted) {
          return;
        }

        // El disponible se consolida en soles antes de proyectar (SPEC 52).
        const currentBalance = positions.reduce(
          (sum, position) =>
            sum +
            toPen(position.balance, position.account.currency, rate),
          0
        );

        setProjection(
          buildCashFlowProjection({
            today,
            currentBalance,
            receivables,
            payables,
          })
        );
        setPenUsdRate(rate);
        setAccountCount(positions.length);
        setError(null);
      } catch (err) {
        if (isMounted) {
          setError(getErrorMessage(err));
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [today]);

  const unassignedTotal = useMemo(() => {
    if (!projection) {
      return 0;
    }

    return (
      projection.unassigned.collections - projection.unassigned.payments
    );
  }, [projection]);

  function handleExport() {
    if (!projection) {
      return;
    }

    const rows: (string | number | null)[][] = [
      ["Flujo de caja proyectado"],
      ["Disponible hoy", projection.currentBalance],
      ["Tipo de cambio PEN/USD", penUsdRate ?? "sin configurar"],
      ["Generado", today],
      [],
      ["Semana", "Desde", "Hasta", "Atrasado", "Cobranzas", "Pagos", "Queda"],
      ...projection.weeks.map((week) => [
        `Sem ${week.index + 1}`,
        week.start,
        week.end,
        week.overdueCollections - week.overduePayments,
        week.collections,
        week.payments,
        week.closingBalance,
      ]),
      [],
      ["Sin fecha (no considerado)", "", "", projection.unassigned.collections, projection.unassigned.payments, "", ""],
    ];

    downloadCsv(`flujo-proyectado-${today}.csv`, toCsv(rows));
  }

  if (error) {
    return (
      <Card className="bg-muted/30 ring-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Flujo de caja proyectado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!projection) {
    return (
      <Card className="bg-muted/30 ring-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Flujo de caja proyectado
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="flujo" className="bg-muted/30 ring-0">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Flujo de caja proyectado
          </CardTitle>
          <p className="mt-1 text-sm">
            Disponible hoy:{" "}
            <span className="font-semibold tabular-nums">
              {formatCurrency(projection.currentBalance)}
            </span>{" "}
            · {accountCount} {accountCount === 1 ? "cuenta" : "cuentas"} ·{" "}
            {penUsdRate !== null
              ? `TC S/ ${penUsdRate.toFixed(2)}`
              : "sin tipo de cambio"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download />
          Descargar CSV (se abre en Excel)
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-36">Semana</TableHead>
                {projection.weeks.map((week) => (
                  <TableHead key={week.start} className="text-right">
                    <span className="block">Sem {week.index + 1}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {formatDate(week.start)} → {formatDate(week.end)}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <span className="font-medium">Atrasado</span>
                  <span className="block text-xs text-muted-foreground">
                    ya cobrable / por pagar
                  </span>
                </TableCell>
                {projection.weeks.map((week) => (
                  <TableCell key={week.start} className="text-right">
                    {week.index === 0 ? (
                      <>
                        <Amount
                          value={
                            week.overdueCollections - week.overduePayments
                          }
                        />
                        <span className="block text-xs text-muted-foreground">
                          +{formatCurrency(week.overdueCollections)} · −
                          {formatCurrency(week.overduePayments)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Cobranzas</TableCell>
                {projection.weeks.map((week) => (
                  <TableCell key={week.start} className="text-right">
                    <Amount value={week.collections} />
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Pagos</TableCell>
                {projection.weeks.map((week) => (
                  <TableCell key={week.start} className="text-right">
                    <Amount value={week.payments} />
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Queda</TableCell>
                {projection.weeks.map((week) => (
                  <TableCell key={week.start} className="text-right">
                    <Amount
                      value={week.closingBalance}
                      strong
                      tone={
                        week.closingBalance < 0
                          ? "text-rose-600 dark:text-rose-400"
                          : undefined
                      }
                    />
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {projection.firstNegativeWeekIndex !== null ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">
            No te alcanza la semana del{" "}
            {formatDate(
              projection.weeks[projection.firstNegativeWeekIndex].start
            )}
            . Cobra lo atrasado o aplaza el pago.
          </p>
        ) : null}

        {unassignedTotal !== 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin fecha de cobro/pago:{" "}
            <span className="tabular-nums">
              {formatCurrency(projection.unassigned.collections)} por cobrar ·{" "}
              {formatCurrency(projection.unassigned.payments)} por pagar
            </span>{" "}
            (no está considerado en la proyección).
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          La proyección usa solo lo ya registrado (no incluye planilla ni
          tributos futuros).
        </p>
      </CardContent>
    </Card>
  );
}
