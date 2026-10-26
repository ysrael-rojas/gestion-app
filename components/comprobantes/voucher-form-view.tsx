"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useCompras } from "@/components/compras/compras-provider";
import type { VoucherKind } from "@/components/comprobantes/types";
import {
  VOUCHER_FORM_ID,
  VoucherForm,
} from "@/components/comprobantes/voucher-form";
import { useVoucher } from "@/components/comprobantes/use-voucher";
import { BackLink } from "@/components/shared/back-link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useVentas } from "@/components/ventas/ventas-provider";
import { advanceSeriesNumber } from "@/lib/comprobantes/series";
import type { PurchaseFormValues } from "@/lib/schemas/purchase";
import type { SaleFormValues } from "@/lib/schemas/sale";
import type { VoucherFormValues } from "@/lib/schemas/voucher";
import { cn } from "@/lib/utils";

interface VoucherFormViewProps {
  voucherKind: VoucherKind;
  voucherId?: string;
}

function toSaleValues(values: VoucherFormValues): SaleFormValues {
  return {
    issueDate: values.issueDate,
    voucherType: values.voucherType,
    voucherNumber: values.voucherNumber,
    entityId: values.entityId,
    total: values.total,
    paymentType: values.paymentType,
    creditDays: values.creditDays,
    status: values.status,
  };
}

function toPurchaseValues(values: VoucherFormValues): PurchaseFormValues {
  return {
    issueDate: values.issueDate,
    voucherType: values.voucherType,
    voucherNumber: values.voucherNumber,
    supplierId: values.entityId,
    total: values.total,
    paymentType: values.paymentType,
    creditDays: values.creditDays,
    status: values.status,
  };
}

export function VoucherFormView({
  voucherKind,
  voucherId,
}: VoucherFormViewProps) {
  const router = useRouter();
  const isSale = voucherKind === "VENTA";
  const isEditing = voucherId !== undefined;
  const basePath = isSale ? "/ventas" : "/compras";
  const entityNoun = isSale ? "venta" : "compra";
  const { addSale, updateSale } = useVentas();
  const { addPurchase, updatePurchase } = useCompras();
  const { voucher, isLoading, error } = useVoucher(voucherId, voucherKind);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(values: VoucherFormValues) {
    setIsSaving(true);

    try {
      if (isSale) {
        const sale = voucherId
          ? await updateSale(voucherId, toSaleValues(values))
          : await addSale(toSaleValues(values));

        try {
          // Avance del correlativo de la serie (solo si el prefijo está
          // registrado). Un fallo aquí no revierte la venta ya guardada.
          await advanceSeriesNumber(values.voucherType, values.voucherNumber);
        } catch {
          toast.error(
            "La venta se guardó, pero no se pudo actualizar el correlativo de la serie."
          );
        }

        toast.success(voucherId ? "Venta actualizada" : "Venta registrada");
        router.push(`/ventas/${sale.id}`);
      } else {
        const purchase = voucherId
          ? await updatePurchase(voucherId, toPurchaseValues(values))
          : await addPurchase(toPurchaseValues(values));

        toast.success(
          voucherId ? "Compra actualizada" : "Compra registrada"
        );
        router.push(`/compras/${purchase.id}`);
      }
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar el comprobante. Intenta nuevamente."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isEditing && isLoading) {
    return (
      <main className="container mx-auto flex flex-col gap-6 p-6">
        <BackLink href={basePath} />
        <p className="text-sm text-muted-foreground">Cargando comprobante…</p>
      </main>
    );
  }

  if (isEditing && (error || !voucher)) {
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
      <div className="flex flex-col gap-2">
        <BackLink href={basePath} />
        <h1 className="text-2xl font-semibold">
          {isEditing ? `Editar ${entityNoun}` : `Registrar ${entityNoun}`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEditing
            ? "Modifica los datos del comprobante"
            : isSale
              ? "Completa los datos para registrar una nueva venta"
              : "Completa los datos para registrar una nueva compra"}
        </p>
      </div>

      <VoucherForm
        voucherKind={voucherKind}
        voucher={voucher}
        onSubmit={handleSubmit}
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Un enlace no se renderiza con `Button` (Base UI): se estiliza el <a>. */}
        <Link
          href={basePath}
          className={cn(
            buttonVariants({ variant: "outline" }),
            isSaving && "pointer-events-none opacity-50"
          )}
        >
          Cancelar
        </Link>
        <Button type="submit" form={VOUCHER_FORM_ID} disabled={isSaving}>
          {isSaving
            ? "Guardando…"
            : isEditing
              ? "Guardar cambios"
              : "Registrar"}
        </Button>
      </div>
    </main>
  );
}
