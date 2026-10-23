"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { toast } from "sonner";

import { usePagos } from "@/components/pagos/pagos-provider";
import {
  PAYMENT_FORM_ID,
  PaymentAllocationSection,
  PaymentFieldsSection,
  PaymentForm,
  usePaymentFormContext,
} from "@/components/pagos/payment-form";
import type { PaymentDirection } from "@/components/pagos/types";
import { BackLink } from "@/components/shared/back-link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getOptionLabel, VOUCHER_TYPES } from "@/lib/data/sale-options";
import type { PaymentFormValues } from "@/lib/schemas/payment";
import { cn, formatCurrency } from "@/lib/utils";

interface PaymentsCreateViewProps {
  direction: PaymentDirection;
  initialEntityId?: string;
  initialComprobanteId?: string;
}

interface CreateViewLabels {
  title: string;
  subtitle: string;
  basePath: string;
}

const VIEW_LABELS: Record<PaymentDirection, CreateViewLabels> = {
  INGRESO: {
    title: "Registrar ingreso",
    subtitle:
      "Registra un cobro y reparte el importe entre las facturas pendientes del cliente.",
    basePath: "/pagos/ingresos",
  },
  EGRESO: {
    title: "Registrar egreso",
    subtitle:
      "Registra un pago a proveedor y reparte el importe entre las compras pendientes.",
    basePath: "/pagos/egresos",
  },
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Resumen en vivo del pago: importe, cuánto quedó asignado, cuánto falta y el
 * saldo resultante de cada comprobante marcado. Vive dentro del `PaymentForm`
 * para leer los valores observados del formulario.
 */
function PaymentSummaryPanel() {
  const { form, amount, vouchers } = usePaymentFormContext();
  const rawAllocations =
    useWatch({ control: form.control, name: "allocations" }) ?? [];

  const allocations = rawAllocations.map((item) => ({
    comprobanteId: item.comprobanteId,
    amount: Number(item.amount) || 0,
  }));
  const assigned = round2(
    allocations.reduce((sum, item) => sum + item.amount, 0)
  );
  const unassigned = round2(Math.max(0, amount - assigned));
  const hasAmount = amount > 0;

  const marked = allocations.flatMap((allocation) => {
    const voucher = vouchers.find(
      (item) => item.comprobanteId === allocation.comprobanteId
    );

    if (!voucher) {
      return [];
    }

    return [
      {
        comprobanteId: allocation.comprobanteId,
        label: `${getOptionLabel(VOUCHER_TYPES, voucher.voucherType)} ${voucher.voucherNumber}`,
        balance: voucher.balance,
        newBalance: round2(Math.max(0, voucher.balance - allocation.amount)),
      },
    ];
  });

  // Ámbar: falta repartir; verde: el importe quedó completamente asignado;
  // neutro: todavía no hay importe.
  const unassignedTone = !hasAmount
    ? "text-muted-foreground"
    : unassigned > 0
      ? "text-amber-600 dark:text-amber-400"
      : "text-emerald-600 dark:text-emerald-400";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Importe del pago</span>
          <span className="text-3xl font-semibold tabular-nums tracking-tight">
            {formatCurrency(amount)}
          </span>
        </div>

        <dl className="flex flex-col gap-2 border-t pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-muted-foreground">Asignado</dt>
            <dd className="font-medium tabular-nums transition-colors duration-200">
              {formatCurrency(assigned)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-muted-foreground">Sin asignar</dt>
            <dd
              className={cn(
                "font-medium tabular-nums transition-colors duration-200",
                unassignedTone
              )}
            >
              {formatCurrency(unassigned)}
            </dd>
          </div>
        </dl>

        <div className="border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Nuevo saldo por comprobante
          </p>
          {marked.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Marca comprobantes en la asignación para ver aquí cómo queda su
              saldo.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {marked.map((voucher) => (
                <li key={voucher.comprobanteId} className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{voucher.label}</span>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="flex flex-col">
                      <span className="text-muted-foreground">Saldo actual</span>
                      <span className="tabular-nums">
                        {formatCurrency(voucher.balance)}
                      </span>
                    </span>
                    <span className="flex flex-col">
                      <span className="text-muted-foreground">Nuevo saldo</span>
                      <span className="font-medium tabular-nums transition-colors duration-200">
                        {formatCurrency(voucher.newBalance)}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function PaymentsCreateView({
  direction,
  initialEntityId,
  initialComprobanteId,
}: PaymentsCreateViewProps) {
  const router = useRouter();
  const { addPayment } = usePagos();
  const [isSaving, setIsSaving] = useState(false);
  const labels = VIEW_LABELS[direction];

  async function handleSubmit(values: PaymentFormValues) {
    setIsSaving(true);

    try {
      await addPayment(values);
      toast.success("Pago registrado");
      router.replace(labels.basePath);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo registrar el pago. Intenta nuevamente."
      );
      setIsSaving(false);
    }
  }

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <BackLink href={labels.basePath} />
        <h1 className="text-2xl font-semibold">{labels.title}</h1>
        <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>

      <PaymentForm
        direction={direction}
        onSubmit={handleSubmit}
        initialEntityId={initialEntityId}
        initialComprobanteId={initialComprobanteId}
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
          <PaymentFieldsSection />
          <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
            <PaymentAllocationSection />
            <PaymentSummaryPanel />
          </aside>
        </div>
      </PaymentForm>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Un enlace no se renderiza con `Button` (Base UI): se estiliza el <a>. */}
        <Link
          href={labels.basePath}
          className={cn(
            buttonVariants({ variant: "outline" }),
            isSaving && "pointer-events-none opacity-50"
          )}
        >
          Cancelar
        </Link>
        <Button type="submit" form={PAYMENT_FORM_ID} disabled={isSaving}>
          {isSaving ? "Guardando…" : "Registrar"}
        </Button>
      </div>
    </main>
  );
}
