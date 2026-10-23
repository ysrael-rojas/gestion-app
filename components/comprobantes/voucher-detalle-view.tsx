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
  type LucideIcon,
} from "lucide-react";

import { useClientes } from "@/components/clientes/clientes-provider";
import { useCompras } from "@/components/compras/compras-provider";
import { NestedPaymentDrawers } from "@/components/comprobantes/nested-payment-drawers";
import { PaymentHistorySection } from "@/components/comprobantes/payment-history-section";
import type { VoucherKind } from "@/components/comprobantes/types";
import { useVoucher } from "@/components/comprobantes/use-voucher";
import { VoucherAdjustmentsSection } from "@/components/comprobantes/voucher-adjustments-section";
import { VoucherAmountsBand } from "@/components/comprobantes/voucher-amounts-band";
import { ReceiptDialog } from "@/components/pagos/receipt-dialog";
import { BackLink } from "@/components/shared/back-link";
import { PaymentStatusBadge } from "@/components/shared/payment-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useVentas } from "@/components/ventas/ventas-provider";
import {
  listVoucherAdjustments,
  type VoucherAdjustment,
} from "@/lib/comprobantes/notas";
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

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

function TabLabel({
  icon: Icon,
  label,
  shortLabel,
  showHand = false,
  className,
}: {
  icon: LucideIcon;
  label: string;
  /** Etiqueta corta para pantallas angostas (el nombre accesible cambia con el breakpoint). */
  shortLabel?: string;
  showHand?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Icon className="size-4" aria-hidden />
      {shortLabel ? (
        <>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
      {/* Indicador decorativo: el nombre accesible del tab no cambia. */}
      {showHand ? (
        <Hand
          className="size-3.5 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
      ) : null}
    </span>
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
  const [adjustments, setAdjustments] = useState<VoucherAdjustment[] | null>(
    null
  );
  const [adjustmentsError, setAdjustmentsError] = useState<string | null>(null);

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

  const isSale = voucherKind === "VENTA";
  const basePath = isSale ? "/ventas" : "/compras";
  const entityLabel = isSale ? "Cliente" : "Proveedor";

  const hasPayments = voucher?.paidAmount ? voucher.paidAmount > 0 : false;
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

      <Card>
        <CardContent className="flex flex-col gap-4">
          <VoucherAmountsBand
            total={voucher.total}
            paidAmount={voucher.paidAmount}
            balance={voucher.balance}
          />

          <Tabs defaultValue="datos">
            <TabsList className="h-auto! w-fit max-w-full flex-wrap justify-start">
              <TabsTrigger value="datos">
                <TabLabel icon={FileText} label="Datos" />
              </TabsTrigger>
              <TabsTrigger value="pagos">
                <TabLabel
                  icon={HandCoins}
                  label="Historial de pagos"
                  shortLabel="Pagos"
                  showHand={hasPayments}
                  className={paymentsTone}
                />
              </TabsTrigger>
              <TabsTrigger value="notas">
                <TabLabel
                  icon={NotebookPen}
                  label="Notas de crédito/débito"
                  shortLabel="Notas"
                  showHand={notasCount > 0}
                />
              </TabsTrigger>
              <TabsTrigger value="retenciones">
                <TabLabel
                  icon={Percent}
                  label="Retenciones"
                  showHand={retencionesCount > 0}
                />
              </TabsTrigger>
            </TabsList>

            <TabsContent value="datos">
              <Card className="bg-muted/30 ring-0">
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
                      value={getOptionLabel(
                        VOUCHER_TYPES,
                        voucher.voucherType
                      )}
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
                      value={getOptionLabel(
                        PAYMENT_TYPES,
                        voucher.paymentType
                      )}
                    />
                    <DetailField
                      label="Días de crédito"
                      value={
                        voucher.creditDays != null
                          ? String(voucher.creditDays)
                          : ""
                      }
                    />
                    <DetailField
                      label="Fecha de vencimiento"
                      value={
                        voucher.dueDate ? formatDate(voucher.dueDate) : ""
                      }
                    />
                    <DetailField
                      label="Estado"
                      value={getOptionLabel(SALE_STATUSES, voucher.status)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pagos">
              <PaymentHistorySection
                comprobanteId={voucher.id}
                direction={isSale ? "INGRESO" : "EGRESO"}
                onPrint={setPrintingPaymentId}
              />
            </TabsContent>

            <TabsContent value="notas">
              <VoucherAdjustmentsSection
                group="notas"
                adjustments={adjustments}
                error={adjustmentsError}
                voucherKind={voucherKind}
              />
            </TabsContent>

            <TabsContent value="retenciones">
              <VoucherAdjustmentsSection
                group="retenciones"
                adjustments={adjustments}
                error={adjustmentsError}
                voucherKind={voucherKind}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {wizardOpen ? (
        <NestedPaymentDrawers
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
