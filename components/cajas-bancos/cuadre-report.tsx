"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv, toCsv } from "@/lib/caja/csv";
import type { CashClose, Payment } from "@/components/pagos/types";
import { formatCurrency, formatDate } from "@/lib/utils";

interface CuadreReportProps {
  close: CashClose;
  statement: Payment[];
  accountName: string;
  currency: string;
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

interface CategoryTotal {
  direction: "INGRESO" | "EGRESO";
  category: string;
  total: number;
}

function groupByCategory(statement: Payment[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();

  for (const payment of statement) {
    const key = `${payment.direction}|${payment.categoryName}`;
    const current = map.get(key);
    if (current) {
      current.total += payment.amount;
    } else {
      map.set(key, {
        direction: payment.direction,
        category: payment.categoryName || "Sin categoría",
        total: payment.amount,
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.direction !== b.direction) {
      return a.direction === "INGRESO" ? -1 : 1;
    }
    return b.total - a.total;
  });
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={strong ? "font-medium" : "text-muted-foreground"}>
        {label}
      </span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

export function CuadreReport({
  close,
  statement,
  accountName,
  currency,
}: CuadreReportProps) {
  const categories = groupByCategory(statement);

  function handleExport() {
    const rows: (string | number | null)[][] = [
      ["Cuadre de caja"],
      ["Cuenta", accountName],
      ["Periodo", `${close.periodStart} a ${close.periodEnd}`],
      ["Periodicidad", close.periodicity],
      [],
      ["Saldo inicial", close.openingBalance],
      ["Ingresos", close.incomeTotal],
      ["Egresos", close.expenseTotal],
      ["Saldo esperado", close.expectedBalance],
      ["Conteo físico", close.countedBalance ?? ""],
      ["Diferencia", close.difference ?? ""],
      [],
      ["Resumen por categoría"],
      ["Dirección", "Categoría", "Total"],
      ...categories.map((item) => [item.direction, item.category, item.total]),
      [],
      ["Movimientos"],
      ["Fecha", "Recibo", "Dirección", "Categoría", "Método", "Importe"],
      ...statement.map((payment) => [
        payment.paymentDate,
        payment.receiptNumber,
        payment.direction,
        payment.categoryName,
        payment.methodName,
        payment.amount,
      ]),
    ];

    downloadCsv(`cuadre-${accountName}-${close.periodEnd}.csv`, toCsv(rows));
  }

  return (
    <Card className="bg-muted/30 ring-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>
          Cuadre {formatDate(close.periodStart)} — {formatDate(close.periodEnd)}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download />
          Exportar CSV
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1 rounded-md border bg-background p-4">
          <SummaryRow
            label="Saldo inicial"
            value={formatAmount(close.openingBalance, currency)}
          />
          <SummaryRow
            label="Ingresos"
            value={formatAmount(close.incomeTotal, currency)}
          />
          <SummaryRow
            label="Egresos"
            value={formatAmount(close.expenseTotal, currency)}
          />
          <SummaryRow
            label="Saldo esperado"
            value={formatAmount(close.expectedBalance, currency)}
            strong
          />
          {close.countedBalance !== null ? (
            <>
              <SummaryRow
                label="Conteo físico"
                value={formatAmount(close.countedBalance, currency)}
              />
              <SummaryRow
                label="Diferencia (sobrante/faltante)"
                value={formatAmount(close.difference ?? 0, currency)}
                strong
              />
            </>
          ) : null}
          {close.penUsdRate !== null ? (
            <SummaryRow
              label="Tipo de cambio usado"
              value={String(close.penUsdRate)}
            />
          ) : null}
          {close.notes ? <SummaryRow label="Notas" value={close.notes} /> : null}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Resumen por categoría</h3>
          <div className="overflow-hidden rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-sm text-muted-foreground"
                    >
                      Sin movimientos en el período.
                    </TableCell>
                  </TableRow>
                ) : (
                  categories.map((item) => (
                    <TableRow key={`${item.direction}-${item.category}`}>
                      <TableCell>
                        {item.direction === "INGRESO" ? "Ingreso" : "Egreso"}
                      </TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell className="text-right">
                        {formatAmount(item.total, currency)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Movimientos</h3>
          <div className="overflow-hidden rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Recibo</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statement.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-sm text-muted-foreground"
                    >
                      Sin movimientos en el período.
                    </TableCell>
                  </TableRow>
                ) : (
                  statement.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                      <TableCell>{payment.receiptNumber}</TableCell>
                      <TableCell>
                        {payment.direction === "INGRESO" ? "Ingreso" : "Egreso"}
                      </TableCell>
                      <TableCell>{payment.categoryName || "—"}</TableCell>
                      <TableCell>{payment.methodName || "—"}</TableCell>
                      <TableCell className="text-right">
                        {formatAmount(payment.amount, currency)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
