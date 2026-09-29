"use client";

import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Client } from "@/components/clientes/types";
import type {
  PaymentType,
  Purchase,
  VoucherType,
} from "@/components/compras/types";
import {
  DEFAULT_CREDIT_DAYS,
  DEFAULT_SALE_STATUS,
  PAYMENT_TYPES,
  SALE_STATUSES,
  VOUCHER_TYPES,
} from "@/lib/data/sale-options";
import { listSuppliers } from "@/lib/clientes/entidades";
import {
  purchaseSchema,
  type PurchaseFormInput,
  type PurchaseFormValues,
} from "@/lib/schemas/purchase";
import { formatCurrency, getTodayLocalDate } from "@/lib/utils";
import { calculateAmounts, calculateDueDate } from "@/lib/ventas/amounts";

interface PurchaseFormProps {
  purchase?: Purchase | null;
  onSubmit: (values: PurchaseFormValues) => void;
}

export const PURCHASE_FORM_ID = "purchase-form";

function createEmptyValues(): PurchaseFormInput {
  return {
    issueDate: getTodayLocalDate(),
    voucherType: "" as VoucherType,
    voucherNumber: "",
    supplierId: "",
    total: "",
    paymentType: "" as PaymentType,
    creditDays: "",
    status: DEFAULT_SALE_STATUS,
  };
}

const voucherTypeItems = VOUCHER_TYPES.map((option) => ({
  value: option.value,
  label: option.label,
}));

const paymentTypeItems = PAYMENT_TYPES.map((option) => ({
  value: option.value,
  label: option.label,
}));

const purchaseStatusItems = SALE_STATUSES.map((option) => ({
  value: option.value,
  label: option.label,
}));

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

function FormGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-muted/30 ring-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
      </CardContent>
    </Card>
  );
}

export function PurchaseForm({ purchase, onSubmit }: PurchaseFormProps) {
  const [suppliers, setSuppliers] = useState<Client[]>([]);
  const [isSuppliersLoading, setIsSuppliersLoading] = useState(true);

  const form = useForm<PurchaseFormInput, unknown, PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: createEmptyValues(),
  });

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const data = await listSuppliers();

        if (isMounted) {
          setSuppliers(data);
        }
      } catch {
        if (isMounted) {
          setSuppliers([]);
        }
      } finally {
        if (isMounted) {
          setIsSuppliersLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    form.reset(
      purchase
        ? {
            issueDate: purchase.issueDate,
            voucherType: purchase.voucherType,
            voucherNumber: purchase.voucherNumber,
            supplierId: purchase.supplierId,
            total: purchase.total,
            paymentType: purchase.paymentType,
            creditDays: purchase.creditDays ?? "",
            status: purchase.status,
          }
        : createEmptyValues()
    );
  }, [purchase, form]);

  const total = useWatch({ control: form.control, name: "total" });
  const numericTotal = Number(total);
  const { subtotal, igv } = calculateAmounts(
    Number.isFinite(numericTotal) ? numericTotal : 0
  );

  const paymentType = useWatch({ control: form.control, name: "paymentType" });
  const issueDate = useWatch({ control: form.control, name: "issueDate" });
  const creditDays = useWatch({ control: form.control, name: "creditDays" });

  const isCredit = paymentType === "CREDITO";
  const numericCreditDays = Number(creditDays);
  const dueDate =
    isCredit && issueDate && Number.isFinite(numericCreditDays) && numericCreditDays >= 1
      ? calculateDueDate(issueDate, numericCreditDays)
      : "";

  const registrationDate = purchase?.registrationDate ?? getTodayLocalDate();
  const supplierItems = suppliers.map((supplier) => ({
    value: supplier.id,
    label: supplier.name,
  }));

  const errors = form.formState.errors;

  return (
    <form
      id={PURCHASE_FORM_ID}
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
    >
      <FormGroup title="Datos del comprobante">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="issueDate">Fecha de emisión</Label>
          <Input
            id="issueDate"
            type="date"
            aria-invalid={!!errors.issueDate}
            {...form.register("issueDate")}
          />
          <FieldError message={errors.issueDate?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="registrationDate">Fecha de registro</Label>
          <Input
            id="registrationDate"
            type="date"
            value={registrationDate}
            readOnly
            disabled
          />
        </div>

        <Controller
          control={form.control}
          name="voucherType"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="voucherType">Tipo de comprobante</Label>
              <Select
                value={field.value ? field.value : null}
                items={voucherTypeItems}
                onValueChange={(value) =>
                  field.onChange(value ?? ("" as VoucherType))
                }
              >
                <SelectTrigger id="voucherType" className="w-full">
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  {VOUCHER_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.voucherType?.message} />
            </div>
          )}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="voucherNumber">Nro comprobante</Label>
          <Input
            id="voucherNumber"
            placeholder="F001-000001"
            aria-invalid={!!errors.voucherNumber}
            {...form.register("voucherNumber")}
          />
          <FieldError message={errors.voucherNumber?.message} />
        </div>

        <Controller
          control={form.control}
          name="supplierId"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="supplierId">Proveedor</Label>
              <Select
                value={field.value ? field.value : null}
                items={supplierItems}
                onValueChange={(value) => field.onChange(value ?? "")}
              >
                <SelectTrigger id="supplierId" className="w-full">
                  <SelectValue
                    placeholder={
                      isSuppliersLoading
                        ? "Cargando..."
                        : suppliers.length
                          ? "Selecciona un proveedor"
                          : "No hay proveedores"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {supplierItems.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.supplierId?.message} />
            </div>
          )}
        />
      </FormGroup>

      <FormGroup title="Montos">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="total">Total</Label>
          <Input
            id="total"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            aria-invalid={!!errors.total}
            {...form.register("total")}
          />
          <FieldError message={errors.total?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="subtotal">Subtotal (solo lectura)</Label>
          <Input
            id="subtotal"
            value={formatCurrency(subtotal)}
            readOnly
            disabled
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="igv">IGV 18 % (solo lectura)</Label>
          <Input id="igv" value={formatCurrency(igv)} readOnly disabled />
        </div>
      </FormGroup>

      <FormGroup title="Pago y estado">
        <Controller
          control={form.control}
          name="paymentType"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paymentType">Tipo de pago</Label>
              <Select
                value={field.value ? field.value : null}
                items={paymentTypeItems}
                onValueChange={(value) => {
                  const next = value ?? ("" as PaymentType);
                  field.onChange(next);
                  form.setValue(
                    "creditDays",
                    next === "CREDITO" ? DEFAULT_CREDIT_DAYS : ""
                  );
                }}
              >
                <SelectTrigger id="paymentType" className="w-full">
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.paymentType?.message} />
            </div>
          )}
        />

        {isCredit ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="creditDays">Días de crédito</Label>
              <Input
                id="creditDays"
                type="number"
                step="1"
                min="1"
                placeholder="30"
                aria-invalid={!!errors.creditDays}
                {...form.register("creditDays")}
              />
              <FieldError message={errors.creditDays?.message} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dueDate">Fecha de vencimiento</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                readOnly
                disabled
              />
            </div>
          </>
        ) : null}

        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={field.value ? field.value : null}
                items={purchaseStatusItems}
                onValueChange={(value) => field.onChange(value ?? undefined)}
              >
                <SelectTrigger id="status" className="w-full">
                  <SelectValue placeholder="Selecciona un estado" />
                </SelectTrigger>
                <SelectContent>
                  {SALE_STATUSES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.status?.message} />
            </div>
          )}
        />
      </FormGroup>
    </form>
  );
}