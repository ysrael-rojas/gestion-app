"use client";

import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import type { Client } from "@/components/clientes/types";
import { useClientes } from "@/components/clientes/clientes-provider";
import type {
  PaymentType,
  Voucher,
  VoucherKind,
  VoucherType,
} from "@/components/comprobantes/types";
import {
  EntityAutocomplete,
  toEntityAutocompleteItems,
} from "@/components/shared/entity-autocomplete";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listSuppliers } from "@/lib/clientes/entidades";
import {
  DEFAULT_CREDIT_DAYS,
  DEFAULT_SALE_STATUS,
  PAYMENT_TYPES,
  SALE_STATUSES,
  VOUCHER_TYPES,
} from "@/lib/data/sale-options";
import {
  voucherFormSchema,
  type VoucherFormInput,
  type VoucherFormValues,
} from "@/lib/schemas/voucher";
import { formatCurrency, getTodayLocalDate } from "@/lib/utils";
import { calculateAmounts, calculateDueDate } from "@/lib/ventas/amounts";

interface VoucherFormProps {
  voucherKind: VoucherKind;
  voucher?: Voucher | null;
  onSubmit: (values: VoucherFormValues) => void;
}

export const VOUCHER_FORM_ID = "voucher-form";

function createEmptyValues(): VoucherFormInput {
  return {
    issueDate: getTodayLocalDate(),
    voucherType: "" as VoucherType,
    voucherNumber: "",
    entityId: "",
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

const statusItems = SALE_STATUSES.map((option) => ({
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

export function VoucherForm({
  voucherKind,
  voucher,
  onSubmit,
}: VoucherFormProps) {
  const isSale = voucherKind === "VENTA";
  const entityLabel = isSale ? "Cliente" : "Proveedor";
  const entityPlaceholder = isSale ? "Buscar cliente..." : "Buscar proveedor...";
  const entityErrorLabel = isSale ? "cliente" : "proveedor";

  const { clients, isLoading: isClientsLoading } = useClientes();
  const [suppliers, setSuppliers] = useState<Client[]>([]);
  const [isSuppliersLoading, setIsSuppliersLoading] = useState(true);

  useEffect(() => {
    if (isSale) {
      return;
    }

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
  }, [isSale]);

  const form = useForm<VoucherFormInput, unknown, VoucherFormValues>({
    resolver: zodResolver(voucherFormSchema),
    defaultValues: createEmptyValues(),
  });

  useEffect(() => {
    form.reset(
      voucher
        ? {
            issueDate: voucher.issueDate,
            voucherType: voucher.voucherType,
            voucherNumber: voucher.voucherNumber,
            entityId: voucher.entityId,
            total: voucher.total,
            paymentType: voucher.paymentType,
            creditDays: voucher.creditDays ?? "",
            status: voucher.status,
          }
        : createEmptyValues()
    );
  }, [voucher, form]);

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
    isCredit &&
    issueDate &&
    Number.isFinite(numericCreditDays) &&
    numericCreditDays >= 1
      ? calculateDueDate(issueDate, numericCreditDays)
      : "";

  const registrationDate = voucher?.registrationDate ?? getTodayLocalDate();
  const entities = isSale ? clients : suppliers;
  const entityItems = toEntityAutocompleteItems(entities);
  const isEntityLoading = isSale ? isClientsLoading : isSuppliersLoading;

  const entityId = useWatch({ control: form.control, name: "entityId" });
  const selectedEntity =
    entities.find((entity) => entity.id === entityId) ?? null;
  const canIssueFactura = selectedEntity?.documentType === "RUC";
  const isPaidLocked = (voucher?.paidAmount ?? 0) > 0;

  const errors = form.formState.errors;

  function handleSubmit(values: VoucherFormValues) {
    // En ventas una factura exige RUC; en compras el tipo queda libre.
    if (isSale && values.voucherType === "FACTURA" && !canIssueFactura) {
      form.setError("voucherType", {
        message: "No se puede emitir factura a un cliente sin RUC",
      });
      return;
    }

    onSubmit(values);
  }

  return (
    <form
      id={VOUCHER_FORM_ID}
      onSubmit={form.handleSubmit(handleSubmit)}
      className="flex flex-col gap-6"
    >
      {isPaidLocked ? (
        <p
          role="status"
          className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
        >
          Este comprobante tiene pagos registrados: importe, número,{" "}
          {entityErrorLabel} y fecha quedan bloqueados. Anula los pagos si
          necesitas corregirlo.
        </p>
      ) : null}

      <FormGroup title="Datos del comprobante">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="issueDate">Fecha de emisión</Label>
          <Input
            id="issueDate"
            type="date"
            disabled={isPaidLocked}
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
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      disabled={
                        isSale &&
                        option.value === "FACTURA" &&
                        !canIssueFactura
                      }
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isSale && !canIssueFactura ? (
                <p className="text-xs text-muted-foreground">
                  Para emitir factura, el cliente debe tener RUC.
                </p>
              ) : null}
              <FieldError message={errors.voucherType?.message} />
            </div>
          )}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="voucherNumber">Nro comprobante</Label>
          <Input
            id="voucherNumber"
            placeholder="F001-000001"
            disabled={isPaidLocked}
            aria-invalid={!!errors.voucherNumber}
            {...form.register("voucherNumber")}
          />
          <FieldError message={errors.voucherNumber?.message} />
        </div>

        <Controller
          control={form.control}
          name="entityId"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="entityId">{entityLabel}</Label>
              <EntityAutocomplete
                id="entityId"
                items={entityItems}
                value={field.value ? field.value : null}
                onValueChange={(value) => {
                  field.onChange(value);

                  const entity =
                    entities.find((item) => item.id === value) ?? null;

                  form.setValue(
                    "voucherType",
                    entity?.documentType === "RUC" ? "FACTURA" : "BOLETA"
                  );
                }}
                placeholder={entityPlaceholder}
                isLoading={isEntityLoading}
                isDisabled={isPaidLocked}
                aria-invalid={!!errors.entityId}
              />
              <FieldError message={errors.entityId?.message} />
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
            disabled={isPaidLocked}
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

      <FormGroup title="Condición de pago">
        <Controller
          control={form.control}
          name="paymentType"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paymentType">Condición</Label>
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
                items={statusItems}
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
