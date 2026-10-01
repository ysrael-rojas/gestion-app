"use client";

import { useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Client } from "@/components/clientes/types";
import { PaymentHistorySection } from "@/components/comprobantes/payment-history-section";
import type { Purchase } from "@/components/compras/types";
import { ReceiptDialog } from "@/components/pagos/receipt-dialog";
import {
  getOptionLabel,
  PAYMENT_TYPES,
  SALE_STATUSES,
  VOUCHER_TYPES,
} from "@/lib/data/sale-options";
import { formatCurrency, formatDate } from "@/lib/utils";

interface PurchaseDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: Purchase | null;
  clients: Client[];
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

function getSupplierName(clients: Client[], supplierId: string): string {
  return (
    clients.find((client) => client.id === supplierId)?.name ??
    "Proveedor no encontrado"
  );
}

export function PurchaseDetailModal({
  open,
  onOpenChange,
  purchase,
  clients,
}: PurchaseDetailModalProps) {
  const [printingPaymentId, setPrintingPaymentId] = useState<string | null>(
    null
  );

  if (!purchase) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
          <Card className="ring-0">
            <CardHeader>
              <DialogTitle>Detalle de la compra</DialogTitle>
              <DialogDescription>
                Información registrada del comprobante
              </DialogDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Card className="bg-muted/30 ring-0">
                <CardHeader>
                  <CardTitle>Datos del comprobante</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DetailField
                      label="Fecha de emisión"
                      value={formatDate(purchase.issueDate)}
                    />
                    <DetailField
                      label="Fecha de registro"
                      value={formatDate(purchase.registrationDate)}
                    />
                    <DetailField
                      label="Tipo de comprobante"
                      value={getOptionLabel(
                        VOUCHER_TYPES,
                        purchase.voucherType
                      )}
                    />
                    <DetailField
                      label="Nro comprobante"
                      value={purchase.voucherNumber}
                    />
                    <div className="sm:col-span-2">
                      <DetailField
                        label="Proveedor"
                        value={getSupplierName(clients, purchase.supplierId)}
                      />
                    </div>
                    <DetailField
                      label="Condición"
                      value={getOptionLabel(PAYMENT_TYPES, purchase.paymentType)}
                    />
                    <DetailField
                      label="Días de crédito"
                      value={
                        purchase.creditDays != null
                          ? String(purchase.creditDays)
                          : ""
                      }
                    />
                    <DetailField
                      label="Fecha de vencimiento"
                      value={
                        purchase.dueDate ? formatDate(purchase.dueDate) : ""
                      }
                    />
                    <DetailField
                      label="Estado"
                      value={getOptionLabel(SALE_STATUSES, purchase.status)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-muted/30 ring-0">
                <CardHeader>
                  <CardTitle>Montos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DetailField
                      label="Subtotal"
                      value={formatCurrency(purchase.subtotal)}
                    />
                    <DetailField
                      label="IGV 18 %"
                      value={formatCurrency(purchase.igv)}
                    />
                    <div className="sm:col-span-2">
                      <DetailField
                        label="Total"
                        value={formatCurrency(purchase.total)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <PaymentHistorySection
                comprobanteId={purchase.id}
                direction="EGRESO"
                onPrint={setPrintingPaymentId}
              />
            </CardContent>
            <CardFooter className="justify-end gap-2">
              {purchase.status === "PENDIENTE" ? (
                <Button
                  nativeButton={false}
                  render={
                    <Link
                      href={`/pagos/egresos?entityId=${purchase.supplierId}&comprobanteId=${purchase.id}`}
                    />
                  }
                >
                  <Wallet />
                  Registrar pago
                </Button>
              ) : null}
              <DialogClose render={<Button variant="outline" />}>
                Cerrar
              </DialogClose>
            </CardFooter>
          </Card>
        </DialogContent>
      </Dialog>

      <ReceiptDialog
        open={printingPaymentId !== null}
        onOpenChange={(next) => {
          if (!next) {
            setPrintingPaymentId(null);
          }
        }}
        paymentId={printingPaymentId}
        clients={clients}
      />
    </>
  );
}