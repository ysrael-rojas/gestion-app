"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CashCount } from "@/lib/caja/arqueos";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

interface CashCountsTableProps {
  counts: CashCount[];
  currency: "PEN" | "USD";
  isLoading: boolean;
}

export function CashCountsTable({
  counts,
  currency,
  isLoading,
}: CashCountsTableProps) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Contado por</TableHead>
            <TableHead className="text-right">Esperado</TableHead>
            <TableHead className="text-right">Contado</TableHead>
            <TableHead className="text-right">Diferencia</TableHead>
            <TableHead>Resultado</TableHead>
            <TableHead>Notas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm">
                Cargando arqueos…
              </TableCell>
            </TableRow>
          ) : counts.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center text-sm text-muted-foreground"
              >
                Aún no hay arqueos sorpresivos para esta cuenta.
              </TableCell>
            </TableRow>
          ) : (
            counts.map((count) => (
              <TableRow key={count.id}>
                <TableCell>{formatDate(count.countDate)}</TableCell>
                <TableCell>{count.countedBy || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(count.expectedBalance, currency)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(count.countedBalance, currency)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    count.difference === 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  )}
                >
                  {formatCurrency(count.difference, currency)}
                </TableCell>
                <TableCell>
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
                </TableCell>
                <TableCell className="max-w-56 truncate text-sm text-muted-foreground">
                  {count.notes || "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
