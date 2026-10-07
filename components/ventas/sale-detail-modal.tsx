"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { Client } from "@/components/clientes/types";
import { PaymentHistorySection } from "@/components/comprobantes/payment-history-section";
import { VoucherAmountsBand } from "@/components/comprobantes/voucher-amounts-band";
import { ReceiptDialog } from "@/components/pagos/receipt-dialog";
import type { Sale } from "@/components/ventas/types";
import {
  getOptionLabel,
  PAYMENT_TYPES,
  SALE_STATUSES,
  VOUCHER_TYPES,
} from "@/lib/data/sale-options";
import { formatDate } from "@/lib/utils";

interface SaleDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
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

function getClientName(clients: Client[], entityId: string): string {
  return (
    clients.find((client) => client.id === entityId)?.name ??
    "Cliente no encontrado"
  );
}

export function SaleDetailModal({
  open,
  onOpenChange,
  sale,
  clients,
}: SaleDetailModalProps) {
  const [printingPaymentId, setPrintingPaymentId] = useState<string | null>(
    null
  );

  if (!sale) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
          <Card className="ring-0">
            <CardHeader>
              <DialogTitle>Detalle de la venta</DialogTitle>
              <DialogDescription>
                Información registrada del comprobante
              </DialogDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <VoucherAmountsBand
                total={sale.total}
                paidAmount={sale.paidAmount}
                balance={sale.balance}
              />

              <Tabs defaultValue="datos">
                <TabsList>
                  <TabsTrigger value="datos">Datos del comprobante</TabsTrigger>
                  <TabsTrigger value="pagos">Historial de pagos</TabsTrigger>
                </TabsList>

                <TabsContent value="datos">
                  <Card className="bg-muted/30 ring-0">
                    <CardContent>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <DetailField
                          label="Fecha de emisión"
                          value={formatDate(sale.issueDate)}
                        />
                        <DetailField
                          label="Fecha de registro"
                          value={formatDate(sale.registrationDate)}
                        />
                        <DetailField
                          label="Tipo de comprobante"
                          value={getOptionLabel(
                            VOUCHER_TYPES,
                            sale.voucherType
                          )}
                        />
                        <DetailField
                          label="Nro comprobante"
                          value={sale.voucherNumber}
                        />
                        <div className="sm:col-span-2">
                          <DetailField
                            label="Cliente"
                            value={getClientName(clients, sale.entityId)}
                          />
                        </div>
                        <DetailField
                          label="Condición"
                          value={getOptionLabel(
                            PAYMENT_TYPES,
                            sale.paymentType
                          )}
                        />
                        <DetailField
                          label="Días de crédito"
                          value={
                            sale.creditDays != null
                              ? String(sale.creditDays)
                              : ""
                          }
                        />
                        <DetailField
                          label="Fecha de vencimiento"
                          value={sale.dueDate ? formatDate(sale.dueDate) : ""}
                        />
                        <DetailField
                          label="Estado"
                          value={getOptionLabel(SALE_STATUSES, sale.status)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="pagos">
                  <PaymentHistorySection
                    comprobanteId={sale.id}
                    direction="INGRESO"
                    onPrint={setPrintingPaymentId}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter className="justify-end gap-2">
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
      />
    </>
  );
}
