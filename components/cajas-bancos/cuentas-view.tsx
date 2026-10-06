"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
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
  listCashPositions,
  type CashAccountPosition,
} from "@/lib/caja/caja";
import { getPeriodicityLabel } from "@/lib/data/cash-options";
import { formatCurrency, getTodayLocalDate } from "@/lib/utils";

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

export function CuentasView() {
  const today = getTodayLocalDate();
  const [positions, setPositions] = useState<CashAccountPosition[]>([]);
  const [penUsdRate, setPenUsdRate] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      setIsLoading(true);

      try {
        const [data, rate] = await Promise.all([
          listCashPositions(today),
          getPenUsdRate(),
        ]);

        if (isMounted) {
          setPositions(data);
          setPenUsdRate(rate);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudieron cargar las cuentas."
          );
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
  }, [today]);

  const hasForeignCurrency = positions.some(
    (position) => position.account.currency !== "PEN"
  );

  const consolidated = positions.reduce((total, position) => {
    if (position.account.currency === "PEN") {
      return total + position.balance;
    }
    if (penUsdRate === null) {
      return total;
    }
    return total + position.balance * penUsdRate;
  }, 0);

  return (
    <div className="flex flex-col gap-6">
      <Card className="bg-muted/30 ring-0">
        <CardHeader>
          <CardTitle>Total consolidado (PEN)</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">
          {formatCurrency(consolidated)}
          {hasForeignCurrency && penUsdRate === null ? (
            <p className="mt-1 text-xs font-normal text-destructive">
              Falta el tipo de cambio PEN/USD en Configuración: las cuentas en
              otra moneda no se suman al total.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Banco</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead>Cierre</TableHead>
              <TableHead className="text-right">Saldo a hoy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  {Array.from({ length: 6 }).map((_, cell) => (
                    <TableCell key={`skeleton-${index}-${cell}`}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : positions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  No hay cajas ni bancos registrados.
                </TableCell>
              </TableRow>
            ) : (
              positions.map(({ account, balance }) => (
                <TableRow key={account.id}>
                  <TableCell>
                    {account.type === "CASH_BOX" ? (
                      <Badge variant="secondary">Caja</Badge>
                    ) : (
                      <Badge variant="default">Banco</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>{account.bankName ?? "—"}</TableCell>
                  <TableCell>{account.currency}</TableCell>
                  <TableCell>
                    {account.closingPeriodicity
                      ? getPeriodicityLabel(account.closingPeriodicity)
                      : "Predeterminado"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatAmount(balance, account.currency)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
