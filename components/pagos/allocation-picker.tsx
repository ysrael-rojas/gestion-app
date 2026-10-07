"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AllocationInput,
  PaymentDirection,
  VoucherBalance,
} from "@/components/pagos/types";
import { getOptionLabel, VOUCHER_TYPES } from "@/lib/data/sale-options";
import { distributeOldestFirst } from "@/lib/pagos/auto-distribuir";
import { listOpenVouchers } from "@/lib/pagos/pagos";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

interface AllocationPickerProps {
  direction: PaymentDirection;
  entityId?: string;
  amount: number;
  value: AllocationInput[];
  onChange: (allocations: AllocationInput[]) => void;
  initialComprobanteId?: string;
  onSuggestAmount?: (amount: number) => void;
}

const SKELETON_ROWS = 3;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function AllocationPicker({
  direction,
  entityId,
  amount,
  value,
  onChange,
  initialComprobanteId,
  onSuggestAmount,
}: AllocationPickerProps) {
  const [vouchers, setVouchers] = useState<VoucherBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const preselectedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      if (!entityId) {
        if (isMounted) {
          setVouchers([]);
        }
        return;
      }

      if (isMounted) {
        setIsLoading(true);
      }

      try {
        const data = await listOpenVouchers(direction, entityId);

        if (isMounted) {
          setVouchers(data);
        }
      } catch {
        if (isMounted) {
          setVouchers([]);
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
  }, [direction, entityId]);

  useEffect(() => {
    if (preselectedRef.current || !initialComprobanteId || !entityId) {
      return;
    }

    const match = vouchers.find(
      (voucher) => voucher.comprobanteId === initialComprobanteId
    );

    if (!match) {
      return;
    }

    preselectedRef.current = true;
    onChange([{ comprobanteId: match.comprobanteId, amount: match.balance }]);
    onSuggestAmount?.(match.balance);
  }, [vouchers, entityId, initialComprobanteId, onChange, onSuggestAmount]);

  const assigned = useMemo(
    () => value.reduce((sum, item) => sum + item.amount, 0),
    [value]
  );
  const unassigned = Math.max(0, round2(amount - assigned));

  const hasOpenVouchers = vouchers.some((voucher) => voucher.balance > 0);
  const canAutoDistribute = amount > 0 && hasOpenVouchers;

  // Verde: el monto quedó completamente asignado; ámbar: queda saldo por
  // asignar; neutro: aún no hay monto que asignar.
  const unassignedTone =
    amount <= 0
      ? "text-muted-foreground"
      : unassigned > 0
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";

  function handleAutoDistribute() {
    const next: AllocationInput[] = [];

    for (const [comprobanteId, appliedAmount] of distributeOldestFirst(
      vouchers,
      amount
    )) {
      next.push({ comprobanteId, amount: appliedAmount });
    }

    onChange(next);
  }

  function getSelectedAmount(comprobanteId: string): number {
    return (
      value.find((item) => item.comprobanteId === comprobanteId)?.amount ?? 0
    );
  }

  function toggle(voucher: VoucherBalance, checked: boolean) {
    if (checked) {
      const defaultAmount =
        unassigned > 0 ? Math.min(voucher.balance, unassigned) : voucher.balance;

      onChange([
        ...value,
        { comprobanteId: voucher.comprobanteId, amount: round2(defaultAmount) },
      ]);
    } else {
      onChange(
        value.filter((item) => item.comprobanteId !== voucher.comprobanteId)
      );
    }
  }

  function updateAmount(voucher: VoucherBalance, raw: string) {
    const parsed = Number(raw);
    const next =
      Number.isFinite(parsed) && parsed > 0
        ? round2(Math.min(parsed, voucher.balance))
        : 0;

    onChange(
      value.map((item) =>
        item.comprobanteId === voucher.comprobanteId
          ? { ...item, amount: next }
          : item
      )
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label>Asignar a comprobantes</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAutoDistribute}
            disabled={!canAutoDistribute}
          >
            <WandSparkles />
            Auto-distribuir
          </Button>
        </div>
        <span className="text-sm text-muted-foreground">
          Monto a aplicar: {formatCurrency(amount)}
        </span>
      </div>

      {!entityId ? (
        <p className="text-sm text-muted-foreground">
          Debes ingresar el cliente/proveedor para listar los comprobantes
          pendientes.
        </p>
      ) : isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : vouchers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin facturas con saldo. El pago se registrará como anticipo.
        </p>
      ) : (
        <div className="flex flex-col divide-y rounded-md border">
          {vouchers.map((voucher) => {
            const selected = value.some(
              (item) => item.comprobanteId === voucher.comprobanteId
            );

            return (
              <div
                key={voucher.comprobanteId}
                className="flex items-center gap-3 p-3"
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={(checked) => toggle(voucher, checked)}
                />
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium">
                    {getOptionLabel(VOUCHER_TYPES, voucher.voucherType)}{" "}
                    {voucher.voucherNumber}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Vence:{" "}
                    {voucher.effectiveDueDate
                      ? formatDate(voucher.effectiveDueDate)
                      : "—"}{" "}
                    · Saldo: {formatCurrency(voucher.balance)}
                  </span>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={voucher.balance}
                  disabled={!selected}
                  value={selected ? getSelectedAmount(voucher.comprobanteId) : ""}
                  onChange={(event) => updateAmount(voucher, event.target.value)}
                  className="w-32"
                  aria-label={`Importe a asignar a ${voucher.voucherNumber}`}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end">
        <span
          className={cn("text-sm font-medium tabular-nums", unassignedTone)}
        >
          Saldo sin asignar: {formatCurrency(unassigned)}
        </span>
      </div>
    </div>
  );
}
