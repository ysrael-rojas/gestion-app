"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  EntityAutocomplete,
  toEntityAutocompleteItems,
} from "@/components/shared/entity-autocomplete";
import type { Client } from "@/components/clientes/types";
import { useClientes } from "@/components/clientes/clientes-provider";
import { useCajasBancos } from "@/components/cajas-bancos/cajas-bancos-provider";
import { AllocationPicker } from "@/components/pagos/allocation-picker";
import type {
  AllocationInput,
  CashReceiptCategory,
  PaymentDirection,
  PaymentMethodRef,
} from "@/components/pagos/types";
import { listSuppliers } from "@/lib/clientes/entidades";
import {
  ensureCatalogsSeeded,
  ensureDefaultSettings,
  listCategories,
  listPaymentMethods,
} from "@/lib/caja/caja";
import { CASH_METHOD_CODE } from "@/lib/caja/defaults";
import {
  paymentSchema,
  type PaymentFormInput,
  type PaymentFormValues,
} from "@/lib/schemas/payment";
import { getTodayLocalDate } from "@/lib/utils";

interface PaymentFormProps {
  direction: PaymentDirection;
  onSubmit: (values: PaymentFormValues) => void;
  initialEntityId?: string;
  initialComprobanteId?: string;
}

export const PAYMENT_FORM_ID = "payment-form";

function createEmptyValues(
  direction: PaymentDirection,
  entityId?: string
): PaymentFormInput {
  return {
    entityId,
    direction,
    paymentDate: getTodayLocalDate(),
    amount: "",
    methodId: "",
    cashAccountId: "",
    categoryId: "",
    reference: "",
    notes: "",
    allocations: [],
  };
}

function toAllocationInputs(
  allocations: PaymentFormInput["allocations"]
): AllocationInput[] {
  return (allocations ?? []).map((item) => ({
    comprobanteId: item.comprobanteId,
    amount: Number(item.amount),
  }));
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

export function PaymentForm({
  direction,
  onSubmit,
  initialEntityId,
  initialComprobanteId,
}: PaymentFormProps) {
  const { clients, isLoading: isClientsLoading } = useClientes();
  const { accounts } = useCajasBancos();
  const [suppliers, setSuppliers] = useState<Client[]>([]);
  const [isSuppliersLoading, setIsSuppliersLoading] = useState(true);
  const [methods, setMethods] = useState<PaymentMethodRef[]>([]);
  const [categories, setCategories] = useState<CashReceiptCategory[]>([]);

  const form = useForm<PaymentFormInput, unknown, PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: createEmptyValues(direction, initialEntityId),
  });

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      if (direction !== "EGRESO") {
        if (isMounted) {
          setIsSuppliersLoading(false);
        }
        return;
      }

      if (isMounted) {
        setIsSuppliersLoading(true);
      }

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
  }, [direction]);

  // Catálogos: siembra perezosa + métodos y categorías de la dirección.
  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        await ensureDefaultSettings();
        await ensureCatalogsSeeded();
        const [methodData, categoryData] = await Promise.all([
          listPaymentMethods(),
          listCategories(direction),
        ]);

        if (isMounted) {
          setMethods(methodData);
          setCategories(categoryData);
        }
      } catch {
        if (isMounted) {
          setMethods([]);
          setCategories([]);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [direction]);

  const entities = direction === "INGRESO" ? clients : suppliers;
  const isEntitiesLoading =
    direction === "INGRESO" ? isClientsLoading : isSuppliersLoading;

  const entityId = useWatch({ control: form.control, name: "entityId" });
  const amountValue = useWatch({ control: form.control, name: "amount" });
  const methodId = useWatch({ control: form.control, name: "methodId" });
  const numericAmount = Number(amountValue);
  const amount = Number.isFinite(numericAmount) ? numericAmount : 0;

  const selectedMethod = methods.find((method) => method.id === methodId);
  const requiredAccountType =
    selectedMethod === undefined
      ? null
      : selectedMethod.code === CASH_METHOD_CODE
        ? "CASH_BOX"
        : "BANK_ACCOUNT";

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.isActive),
    [accounts]
  );

  const availableAccounts = requiredAccountType
    ? activeAccounts.filter((account) => account.type === requiredAccountType)
    : activeAccounts;

  const methodItems = methods.map((method) => ({
    value: method.id,
    label: method.name,
  }));
  const accountItems = availableAccounts.map((account) => ({
    value: account.id,
    label: `${account.name} · ${account.currency}`,
  }));
  const categoryItems = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  const entityItems = toEntityAutocompleteItems(entities);

  // Precarga la primera opción disponible sin pisar una elección del usuario.
  const didInitCatalogs = useRef(false);
  useEffect(() => {
    if (didInitCatalogs.current || methods.length === 0) {
      return;
    }

    didInitCatalogs.current = true;

    if (!form.getValues("methodId")) {
      form.setValue("methodId", methods[0].id, { shouldValidate: false });
    }
  }, [methods, form]);

  useEffect(() => {
    if (!form.getValues("cashAccountId") && availableAccounts.length > 0) {
      form.setValue("cashAccountId", availableAccounts[0].id, {
        shouldValidate: false,
      });
    }
  }, [availableAccounts, form]);

  useEffect(() => {
    if (!form.getValues("categoryId") && categories.length > 0) {
      form.setValue("categoryId", categories[0].id, { shouldValidate: false });
    }
  }, [categories, form]);

  const handleSuggestAmount = useCallback(
    (value: number) => {
      const current = Number(form.getValues("amount"));

      if (!current) {
        form.setValue("amount", String(value));
      }
    },
    [form]
  );

  const errors = form.formState.errors;

  return (
    <form
      id={PAYMENT_FORM_ID}
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
    >
      <FormGroup title="Datos del pago">
        <Controller
          control={form.control}
          name="entityId"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="entityId">Cliente/Proveedor (opcional)</Label>
              <EntityAutocomplete
                id="entityId"
                items={entityItems}
                value={field.value ? field.value : null}
                onValueChange={(value) => field.onChange(value ? value : undefined)}
                placeholder={
                  direction === "INGRESO"
                    ? "Buscar cliente..."
                    : "Buscar proveedor..."
                }
                isLoading={isEntitiesLoading}
                aria-invalid={!!errors.entityId}
              />
              <p className="text-xs text-muted-foreground">
                Sin entidad, el pago queda como anticipo sin asignar.
              </p>
              <FieldError message={errors.entityId?.message} />
            </div>
          )}
        />

        <Controller
          control={form.control}
          name="methodId"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="methodId">Método</Label>
              <Select
                value={field.value ? field.value : null}
                items={methodItems}
                onValueChange={(value) => {
                  const next = value ?? "";
                  field.onChange(next);

                  const method = methods.find((item) => item.id === next);
                  const allowedType =
                    method && method.code !== CASH_METHOD_CODE
                      ? "BANK_ACCOUNT"
                      : "CASH_BOX";
                  const current = form.getValues("cashAccountId");

                  if (
                    current &&
                    !accounts.some(
                      (account) =>
                        account.id === current && account.type === allowedType
                    )
                  ) {
                    form.setValue("cashAccountId", "");
                  }
                }}
              >
                <SelectTrigger id="methodId" className="w-full">
                  <SelectValue placeholder="Selecciona un método" />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      {method.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.methodId?.message} />
            </div>
          )}
        />

        <Controller
          control={form.control}
          name="cashAccountId"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cashAccountId">
                {requiredAccountType === "BANK_ACCOUNT" ? "Banco" : "Caja/Banco"}
              </Label>
              <Select
                value={field.value ? field.value : null}
                items={accountItems}
                onValueChange={(value) => field.onChange(value ?? "")}
              >
                <SelectTrigger id="cashAccountId" className="w-full">
                  <SelectValue placeholder="Selecciona una cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {availableAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} · {account.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accounts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Registra una caja o banco en Configuración.
                </p>
              ) : null}
              <FieldError message={errors.cashAccountId?.message} />
            </div>
          )}
        />

        <Controller
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="categoryId">Categoría</Label>
              <Select
                value={field.value ? field.value : null}
                items={categoryItems}
                onValueChange={(value) => field.onChange(value ?? "")}
              >
                <SelectTrigger id="categoryId" className="w-full">
                  <SelectValue placeholder="Selecciona una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.categoryId?.message} />
            </div>
          )}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="paymentDate">Fecha de pago</Label>
          <Input
            id="paymentDate"
            type="date"
            aria-invalid={!!errors.paymentDate}
            {...form.register("paymentDate")}
          />
          <FieldError message={errors.paymentDate?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Importe</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            aria-invalid={!!errors.amount}
            {...form.register("amount")}
          />
          <FieldError message={errors.amount?.message} />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="reference">Referencia (opcional)</Label>
          <Input
            id="reference"
            placeholder="Nro de operación / autorización"
            aria-invalid={!!errors.reference}
            {...form.register("reference")}
          />
          <FieldError message={errors.reference?.message} />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea
            id="notes"
            placeholder="Observaciones del pago"
            aria-invalid={!!errors.notes}
            {...form.register("notes")}
          />
          <FieldError message={errors.notes?.message} />
        </div>
      </FormGroup>

      <FormGroup title="Asignación">
        <div className="sm:col-span-2">
          <Controller
            control={form.control}
            name="allocations"
            render={({ field }) => (
              <AllocationPicker
                direction={direction}
                entityId={entityId}
                amount={amount}
                value={toAllocationInputs(field.value)}
                onChange={field.onChange}
                initialComprobanteId={initialComprobanteId}
                onSuggestAmount={handleSuggestAmount}
              />
            )}
          />
          <FieldError message={errors.allocations?.message} />
        </div>
      </FormGroup>
    </form>
  );
}
