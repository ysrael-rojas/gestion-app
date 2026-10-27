"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Hand,
  HandCoins,
  NotebookPen,
  Percent,
  Wallet,
} from "lucide-react";

import { useClientes } from "@/components/clientes/clientes-provider";
import { useCompras } from "@/components/compras/compras-provider";
import { PaymentDrawer } from "@/components/comprobantes/payment-drawer";
import { PaymentHistorySection } from "@/components/comprobantes/payment-history-section";
import type { VoucherKind } from "@/components/comprobantes/types";
import { useVoucher } from "@/components/comprobantes/use-voucher";
import { VoucherAdjustmentsSection } from "@/components/comprobantes/voucher-adjustments-section";
import { VoucherAmountsBand } from "@/components/comprobantes/voucher-amounts-band";
import { ReceiptDialog } from "@/components/pagos/receipt-dialog";
import { BackLink } from "@/components/shared/back-link";
import { PaymentStatusBadge } from "@/components/shared/payment-status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useVentas } from "@/components/ventas/ventas-provider";
import type { PaymentHistoryEntry } from "@/components/pagos/types";
import {
  listVoucherAdjustments,
  type VoucherAdjustment,
} from "@/lib/comprobantes/notas";
import { getPaymentHistory } from "@/lib/pagos/pagos";
import { toast } from "sonner";
import {
  getOptionLabel,
  PAYMENT_TYPES,
  SALE_STATUSES,
  VOUCHER_TYPES,
} from "@/lib/data/sale-options";
import { cn, formatDate } from "@/lib/utils";

interface VoucherDetalleViewProps {
  voucherKind: VoucherKind;
  voucherId: string;
}

type DetailTab = "datos" | "pagos" | "notas" | "retenciones";

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

function TabHand({ solid }: { solid: boolean }) {
  return (
    <Hand
      className={cn(
        "size-4",
        solid ? "text-white" : "text-amber-600 dark:text-amber-400"
      )}
      aria-hidden
    />
  );
}

export function VoucherDetalleView({
  voucherKind,
  voucherId,
}: VoucherDetalleViewProps) {
  const { clients } = useClientes();
  const { refresh: refreshSales } = useVentas();
  const { refresh: refreshPurchases } = useCompras();
  const { voucher, isLoading, error, reload } = useVoucher(
    voucherId,
    voucherKind
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [printingPaymentId, setPrintingPaymentId] = useState<string | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<DetailTab>("datos");
  const [adjustments, setAdjustments] = useState<VoucherAdjustment[] | null>(
    null
  );
  const [adjustmentsError, setAdjustmentsError] = useState<string | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<
    PaymentHistoryEntry[] | null
  >(null);
  const [paymentHistoryError, setPaymentHistoryError] = useState<string | null>(
    null
  );

  const loadPaymentHistory = useCallback(async () => {
    try {
      setPaymentHistory(await getPaymentHistory(voucherId));
      setPaymentHistoryError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar el historial de pagos. Intenta nuevamente.";
      setPaymentHistory([]);
      setPaymentHistoryError(message);
      toast.error(message);
    }
  }, [voucherId]);

  const loadAdjustments = useCallback(async () => {
    try {
      setAdjustments(await listVoucherAdjustments(voucherId));
      setAdjustmentsError(null);
    } catch (loadError) {
      setAdjustments([]);
      setAdjustmentsError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar las notas ni las retenciones."
      );
    }
  }, [voucherId]);

  useEffect(() => {
    void (async () => {
      await loadAdjustments();
    })();
  }, [loadAdjustments]);

  useEffect(() => {
    void (async () => {
      await loadPaymentHistory();
    })();
  }, [loadPaymentHistory]);

  const isSale = voucherKind === "VENTA";
  const basePath = isSale ? "/ventas" : "/compras";
  const entityLabel = isSale ? "Cliente" : "Proveedor";

  const hasPayments = (paymentHistory ?? []).length > 0;
  const isUnsettled = voucher ? voucher.balance > 0 : false;
  const notasCount = (adjustments ?? []).filter(
    (adjustment) => adjustment.voucherType !== "COMPROBANTE_RETENCION"
  ).length;
  const retencionesCount = (adjustments ?? []).filter(
    (adjustment) => adjustment.voucherType === "COMPROBANTE_RETENCION"
  ).length;
  // Rose mientras queda saldo; emerald al quedar saldado (saldo negativo cuenta
  // como saldado, p. ej. cuando una ND deja el saldo por debajo de cero).
  const paymentsTone = isUnsettled
    ? "text-rose-600 dark:text-rose-400"
    : "text-emerald-600 dark:text-emerald-400";

  const entityName = voucher
    ? clients.find((client) => client.id === voucher.entityId)?.name ??
      (isSale ? "Cliente no encontrado" : "Proveedor no encontrado")
    : "";

  if (isLoading) {
    return (
      <main className="container mx-auto flex flex-col gap-6 p-6">
        <BackLink href={basePath} />
        <p className="text-sm text-muted-foreground">Cargando comprobante…</p>
      </main>
    );
  }

  if (error || !voucher) {
    return (
      <main className="container mx-auto flex flex-col gap-6 p-6">
        <BackLink href={basePath} />
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <h1 className="text-2xl font-semibold">
              Comprobante no encontrado
            </h1>
            <p className="text-sm text-muted-foreground">
              {error ??
                "No encontramos ese comprobante. Puede haber sido anulado o el enlace no es válido."}
            </p>
            <Link
              href={basePath}
              className="text-sm font-medium text-brand-strong hover:underline"
            >
              Volver al listado
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <BackLink href={basePath} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">
              {getOptionLabel(VOUCHER_TYPES, voucher.voucherType)}{" "}
              {voucher.voucherNumber}
            </h1>
            <p className="text-sm text-muted-foreground">
              {entityLabel}: {entityName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PaymentStatusBadge status={voucher.status} />
            {voucher.status === "PENDIENTE" ? (
              <Button onClick={() => setWizardOpen(true)}>
                <Wallet />
                Registrar pago
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <VoucherAmountsBand
        total={voucher.total}
        paidAmount={voucher.paidAmount}
        balance={voucher.balance}
      />

      <div
        role="group"
        aria-label="Secciones del comprobante"
        className="flex flex-wrap gap-1"
      >
        <Button
          variant={activeTab === "datos" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("datos")}
        >
          <FileText />
          Datos
        </Button>

        <Button
          variant={activeTab === "pagos" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("pagos")}
          className={cn(
            activeTab === "pagos"
              ? isUnsettled && "bg-rose-600! text-white! hover:bg-rose-600!"
              : paymentsTone
          )}
        >
          <HandCoins />
          Historial de pagos
          {hasPayments ? <TabHand solid={activeTab === "pagos"} /> : null}
        </Button>

        <Button
          variant={activeTab === "notas" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("notas")}
        >
          <NotebookPen />
          Notas de crédito/débito
          {notasCount > 0 ? <TabHand solid={activeTab === "notas"} /> : null}
        </Button>

        <Button
          variant={activeTab === "retenciones" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("retenciones")}
        >
          <Percent />
          Retenciones
          {retencionesCount > 0 ? (
            <TabHand solid={activeTab === "retenciones"} />
          ) : null}
        </Button>
      </div>

      {activeTab === "datos" ? (
        <Card className="bg-muted/30 ring-0">
          <CardHeader>
            <CardTitle>Datos del comprobante</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailField
                label="Fecha de emisión"
                value={formatDate(voucher.issueDate)}
              />
              <DetailField
                label="Fecha de registro"
                value={formatDate(voucher.registrationDate)}
              />
              <DetailField
                label="Tipo de comprobante"
                value={getOptionLabel(VOUCHER_TYPES, voucher.voucherType)}
              />
              <DetailField
                label="Nro comprobante"
                value={voucher.voucherNumber}
              />
              <div className="sm:col-span-2">
                <DetailField label={entityLabel} value={entityName} />
              </div>
              <DetailField
                label="Condición"
                value={getOptionLabel(PAYMENT_TYPES, voucher.paymentType)}
              />
              <DetailField
                label="Días de crédito"
                value={
                  voucher.creditDays != null ? String(voucher.creditDays) : ""
                }
              />
              <DetailField
                label="Fecha de vencimiento"
                value={voucher.dueDate ? formatDate(voucher.dueDate) : ""}
              />
              <DetailField
                label="Estado"
                value={getOptionLabel(SALE_STATUSES, voucher.status)}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "pagos" ? (
        <PaymentHistorySection
          entries={paymentHistory}
          error={paymentHistoryError}
          onPrint={setPrintingPaymentId}
        />
      ) : null}

      {activeTab === "notas" ? (
        <VoucherAdjustmentsSection
          group="notas"
          adjustments={adjustments}
          error={adjustmentsError}
          voucherKind={voucherKind}
        />
      ) : null}

      {activeTab === "retenciones" ? (
        <VoucherAdjustmentsSection
          group="retenciones"
          adjustments={adjustments}
          error={adjustmentsError}
          voucherKind={voucherKind}
        />
      ) : null}

      {wizardOpen ? (
        <PaymentDrawer
          open
          onOpenChange={(open) => {
            if (!open) {
              setWizardOpen(false);
            }
          }}
          direction={isSale ? "INGRESO" : "EGRESO"}
          entityName={entityName}
          voucherType={voucher.voucherType}
          voucherNumber={voucher.voucherNumber}
          issueDate={voucher.issueDate}
          condition={voucher.paymentType}
          dueDate={voucher.dueDate}
          entityId={voucher.entityId}
          comprobanteId={voucher.id}
          total={voucher.total}
          paidAmount={voucher.paidAmount}
          balance={voucher.balance}
          onRegistered={async () => {
            await reload();
            await loadAdjustments();
            await loadPaymentHistory();
            await (isSale ? refreshSales() : refreshPurchases());
          }}
        />
      ) : null}

      <ReceiptDialog
        open={printingPaymentId !== null}
        onOpenChange={(next) => {
          if (!next) {
            setPrintingPaymentId(null);
          }
        }}
        paymentId={printingPaymentId}
      />
    </main>
  );
}
