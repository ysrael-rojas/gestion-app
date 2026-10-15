"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calculator,
  Landmark,
  Settings,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CarteraBucket } from "@/components/cartera/types";
import {
  getMonthlyCashFlow,
  listCashPositionsConsolidated,
  type CashAccountPosition,
} from "@/lib/caja/caja";
import {
  getMonthRange,
  summarizePositions,
  type CashFlowTotals,
} from "@/lib/caja/dashboard";
import { getCarteraResumen } from "@/lib/pagos/cartera";
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

const QUICK_LINKS = [
  {
    href: "/cajas-bancos/cuadres",
    label: "Cuadres y conciliación",
    icon: Calculator,
  },
  { href: "/cajas-bancos/cuentas", label: "Detalle de cuentas", icon: Wallet },
  {
    href: "/cajas-bancos/configuracion",
    label: "Configuración",
    icon: Settings,
  },
];

function MetricCard({
  title,
  icon: Icon,
  value,
  detail,
  isLoading,
}: {
  title: string;
  icon: typeof Wallet;
  value: string;
  detail?: string;
  isLoading: boolean;
}) {
  return (
    <Card className="bg-muted/30 ring-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon className="size-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-7 w-32" />
        ) : (
          <>
            <p className="text-2xl font-semibold">{value}</p>
            {detail ? (
              <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardView() {
  const [today] = useState(() => getTodayLocalDate());
  const [positions, setPositions] = useState<CashAccountPosition[] | null>(
    null
  );
  const [flow, setFlow] = useState<CashFlowTotals | null>(null);
  const [receivable, setReceivable] = useState<CarteraBucket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const { start, end } = getMonthRange(today);

    void (async () => {
      try {
        const [nextPositions, nextFlow, cartera] = await Promise.all([
          listCashPositionsConsolidated(today),
          getMonthlyCashFlow(start, end),
          getCarteraResumen(),
        ]);

        if (isMounted) {
          setPositions(nextPositions);
          setFlow(nextFlow);
          setReceivable(cartera.receivable);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar el dashboard de tesorería."
          );
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [today]);

  const isLoading = positions === null;
  const summary = summarizePositions(
    (positions ?? []).map((position) => ({
      type: position.account.type,
      balance: position.balance,
    }))
  );

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Tesorería</h1>
        <p className="text-sm text-muted-foreground">
          Disponible consolidado, resultado del mes y cartera breve.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          title="Disponible total"
          icon={Wallet}
          value={formatCurrency(summary.total)}
          detail={`${summary.count} ${
            summary.count === 1 ? "cuenta activa" : "cuentas activas"
          }`}
          isLoading={isLoading}
        />
        <MetricCard
          title="En cajas"
          icon={Calculator}
          value={formatCurrency(summary.cashTotal)}
          isLoading={isLoading}
        />
        <MetricCard
          title="En bancos"
          icon={Landmark}
          value={formatCurrency(summary.bankTotal)}
          isLoading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="bg-muted/30 ring-0">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Resultado del mes
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {isLoading || flow === null ? (
              <Skeleton className="h-7 w-32" />
            ) : (
              <>
                <p className="text-2xl font-semibold">
                  {formatCurrency(flow.net)}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ArrowDownCircle className="size-3.5 text-emerald-600" />
                    Ingresos {formatCurrency(flow.income)}
                  </span>
                  <span className="flex items-center gap-1">
                    <ArrowUpCircle className="size-3.5 text-destructive" />
                    Egresos {formatCurrency(flow.expense)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted/30 ring-0">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cartera por cobrar
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {isLoading || receivable === null ? (
              <Skeleton className="h-7 w-32" />
            ) : (
              <>
                <p className="text-2xl font-semibold">
                  {formatCurrency(receivable.amount)}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {receivable.count}{" "}
                    {receivable.count === 1 ? "documento" : "documentos"}
                  </span>
                  <span className="text-destructive">
                    Vencido {formatCurrency(receivable.overdueAmount)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Desglose por cuenta</h2>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={`skeleton-${index}`}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : positions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No hay cajas ni bancos activos. Regístralos en Configuración.
                  </TableCell>
                </TableRow>
              ) : (
                positions.map(({ account, balance }) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell>
                      {account.type === "BANK_ACCOUNT" ? (
                        <Badge variant="default">Banco</Badge>
                      ) : (
                        <Badge variant="secondary">Caja</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {account.currency}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatAmount(balance, account.currency)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {!isLoading && positions.length > 0 ? (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Total disponible</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(summary.total)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Accesos rápidos</h2>
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((link) => (
            <Button
              key={link.href}
              variant="outline"
              render={<Link href={link.href} />}
            >
              <link.icon />
              {link.label}
            </Button>
          ))}
        </div>
      </section>
    </main>
  );
}
