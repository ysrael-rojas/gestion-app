"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
import { useVoucherSeries } from "@/components/comprobantes/use-voucher-series";
import {
  EntityAutocomplete,
  toEntityAutocompleteItems,
} from "@/components/shared/entity-autocomplete";
import { Badge } from "@/components/ui/badge";
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
  suggestVoucherNumber,
  type VoucherSeries,
} from "@/lib/comprobantes/series";
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
import { cn, formatCurrency, getTodayLocalDate } from "@/lib/utils";
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

const SELECT_TYPE_PLACEHOLDER = "Selecciona un tipo";

type VoucherTypeSelectItem = { value: VoucherType | null; label: string };

const voucherTypeSelectItems: VoucherTypeSelectItem[] = [
  { value: null, label: SELECT_TYPE_PLACEHOLDER },
  ...voucherTypeItems,
];

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }

  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}

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

function RequiredLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Label htmlFor={htmlFor}>{children}</Label>
      <Badge
        variant="outline"
        className="border-destructive/40 font-normal text-destructive"
      >
        Requerido
      </Badge>
    </div>
  );
}

function FormGroup({
  title,
  children,
  className,
  contentClassName,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("bg-muted/30 ring-0", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "grid grid-cols-1 gap-4 sm:grid-cols-2",
            contentClassName
          )}
        >
          {children}
        </div>
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

  const {
    series,
    isLoading: isSeriesLoading,
    error: seriesError,
  } = useVoucherSeries();

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
  const voucherType = useWatch({ control: form.control, name: "voucherType" });

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

  const defaultSeriesByType = useMemo(() => {
    const map = new Map<VoucherType, VoucherSeries>();

    for (const item of series) {
      if (item.isDefault) {
        map.set(item.voucherType, item);
      }
    }

    return map;
  }, [series]);

  const hasAnySaleSeries = useMemo(
    () =>
      VOUCHER_TYPES.some((option) =>
        defaultSeriesByType.has(option.value)
      ),
    [defaultSeriesByType]
  );

  const missingSaleSeries = useMemo(
    () =>
      isSale
        ? VOUCHER_TYPES.filter(
            (option) => !defaultSeriesByType.has(option.value)
          ).map((option) => option.label)
        : [],
    [defaultSeriesByType, isSale]
  );

  const defaultSeries = voucherType
    ? defaultSeriesByType.get(voucherType) ?? null
    : null;

  const previousTypeRef = useRef<VoucherType | "">("");
  const suggestionRef = useRef("");

  // Sugerencia de numeración (solo ventas nuevas). Si cambia el tipo se
  // recalcula; si el usuario editó el número a mano, se respeta.
  useEffect(() => {
    if (!isSale || voucher) {
      previousTypeRef.current = "";
      suggestionRef.current = "";
      return;
    }

    const typeChanged = previousTypeRef.current !== voucherType;
    previousTypeRef.current = voucherType;

    if (!defaultSeries) {
      suggestionRef.current = "";
      return;
    }

    const nextSuggestion = suggestVoucherNumber(defaultSeries);
    const currentNumber = form.getValues("voucherNumber");

    if (
      typeChanged ||
      !currentNumber ||
      currentNumber === suggestionRef.current
    ) {
      form.setValue("voucherNumber", nextSuggestion, {
        shouldValidate: false,
      });
    }

    suggestionRef.current = nextSuggestion;
  }, [defaultSeries, form, isSale, voucher, voucherType]);

  function isVoucherTypeDisabled(value: VoucherType): boolean {
    if (!isSale) {
      return false;
    }

    if (!defaultSeriesByType.has(value)) {
      return true;
    }

    return value === "FACTURA" && !canIssueFactura;
  }

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

  const isTypeSelectDisabled = isSale && isSeriesLoading;

  return (
    <form
      id={VOUCHER_FORM_ID}
      onSubmit={form.handleSubmit(handleSubmit)}
      className="flex flex-col gap-4"
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

      {isSale && !voucher && !isSeriesLoading && !hasAnySaleSeries ? (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
        >
          <p className="font-medium">
            Aún no tienes series de venta configuradas.
          </p>
          <p className="text-muted-foreground">
            Sin una serie por defecto no podrás elegir el tipo de comprobante
            ni registrar la venta.
          </p>
          <Link
            href="/configuracion"
            className="font-medium text-brand-strong hover:underline"
          >
            Configurar series
          </Link>
        </div>
      ) : null}

      {isSale && seriesError ? (
        <p role="alert" className="text-sm text-destructive">
          {seriesError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <FormGroup
          title="Datos del comprobante"
          className="lg:col-span-3"
        >
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
                <RequiredLabel htmlFor="voucherType">
                  Tipo de comprobante
                </RequiredLabel>
                <Select
                  value={field.value ? field.value : null}
                  items={voucherTypeSelectItems}
                  onValueChange={(value) =>
                    field.onChange(value ?? ("" as VoucherType))
                  }
                  disabled={isTypeSelectDisabled}
                >
                  <SelectTrigger
                    id="voucherType"
                    className="w-full"
                    aria-invalid={!!errors.voucherType}
                  >
                    <SelectValue placeholder="Selecciona un tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Selecciona un tipo</SelectItem>
                    {VOUCHER_TYPES.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        disabled={isVoucherTypeDisabled(option.value)}
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
                {isSale && missingSaleSeries.length ? (
                  <p className="text-xs text-muted-foreground">
                    Configura una serie por defecto para{" "}
                    {joinLabels(missingSaleSeries)} en Configuración → Series.
                  </p>
                ) : null}
                <FieldError message={errors.voucherType?.message} />
              </div>
            )}
          />

          <div className="flex flex-col gap-1.5">
            <RequiredLabel htmlFor="voucherNumber">
              Nro comprobante
            </RequiredLabel>
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
                <RequiredLabel htmlFor="entityId">{entityLabel}</RequiredLabel>
                <EntityAutocomplete
                  id="entityId"
                  items={entityItems}
                  value={field.value ? field.value : null}
                  onValueChange={(value) => {
                    field.onChange(value);

                    const entity =
                      entities.find((item) => item.id === value) ?? null;
                    const suggestedType: VoucherType =
                      entity?.documentType === "RUC" ? "FACTURA" : "BOLETA";

                    // En ventas solo se autoselecciona si el tipo tiene serie
                    // por defecto configurada (SPEC 44).
                    if (!isSale || defaultSeriesByType.has(suggestedType)) {
                      form.setValue("voucherType", suggestedType);
                    }
                  }}
                  placeholder={entityPlaceholder}
                  isLoading={isEntityLoading}
                  isDisabled={isPaidLocked}
                  aria-invalid={!!errors.entityId}
                />
                {selectedEntity ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="entityAddress">Dirección</Label>
                    <Input
                      id="entityAddress"
                      value={
                        selectedEntity.address.trim() ||
                        "Sin dirección registrada"
                      }
                      readOnly
                    />
                  </div>
                ) : null}
                <FieldError message={errors.entityId?.message} />
              </div>
            )}
          />
        </FormGroup>

        <FormGroup
          title="Condición de pago"
          className="lg:col-span-1"
          contentClassName="sm:grid-cols-1"
        >
          <Controller
            control={form.control}
            name="paymentType"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <RequiredLabel htmlFor="paymentType">Condición</RequiredLabel>
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
                  <SelectTrigger
                    id="paymentType"
                    className="w-full"
                    aria-invalid={!!errors.paymentType}
                  >
                    <SelectValue placeholder={SELECT_TYPE_PLACEHOLDER} />
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
                <RequiredLabel htmlFor="creditDays">
                  Días de crédito
                </RequiredLabel>
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

        <FormGroup
          title="Montos"
          className="lg:col-span-4"
          contentClassName="sm:grid-cols-3"
        >
          <div className="flex flex-col gap-1.5">
            <RequiredLabel htmlFor="total">Total</RequiredLabel>
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
      </div>
    </form>
  );
}
