"use client";

import { useEffect, useState } from "react";
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
import type { Client } from "@/components/clientes/types";
import { useClientes } from "@/components/clientes/clientes-provider";
import { AllocationPicker } from "@/components/pagos/allocation-picker";
import type {
  AllocationInput,
  PaymentDirection,
  PaymentMethod,
} from "@/components/pagos/types";
import { listSuppliers } from "@/lib/clientes/entidades";
import {
  DEFAULT_PAYMENT_METHOD,
  PAYMENT_METHODS,
} from "@/lib/data/payment-options";
import {
  paymentSchema,
  type PaymentFormInput,
  type PaymentFormValues,
} from "@/lib/schemas/payment";
import { getTodayLocalDate } from "@/lib/utils";

interface PaymentFormProps {
  direction: PaymentDirection;
  onSubmit: (values: PaymentFormValues) => void;
}

export const PAYMENT_FORM_ID = "payment-form";

const methodItems = PAYMENT_METHODS.map((option) => ({
  value: option.value,
  label: option.label,
}));

function createEmptyValues(direction: PaymentDirection): PaymentFormInput {
  return {
    entityId: "",
    direction,
    paymentDate: getTodayLocalDate(),
    amount: "",
    method: DEFAULT_PAYMENT_METHOD,
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

export function PaymentForm({ direction, onSubmit }: PaymentFormProps) {
  const { clients, isLoading: isClientsLoading } = useClientes();
  const [suppliers, setSuppliers] = useState<Client[]>([]);
  const [isSuppliersLoading, setIsSuppliersLoading] = useState(true);

  const form = useForm<PaymentFormInput, unknown, PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: createEmptyValues(direction),
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

  const entities = direction === "INGRESO" ? clients : suppliers;
  const isEntitiesLoading =
    direction === "INGRESO" ? isClientsLoading : isSuppliersLoading;

  const entityId = useWatch({ control: form.control, name: "entityId" });
  const amountValue = useWatch({ control: form.control, name: "amount" });
  const numericAmount = Number(amountValue);
  const amount = Number.isFinite(numericAmount) ? numericAmount : 0;

  const entityItems = entities.map((entity) => ({
    value: entity.id,
    label: entity.name,
  }));

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
              <Label htmlFor="entityId">Entidad</Label>
              <Select
                value={field.value ? field.value : null}
                items={entityItems}
                onValueChange={(value) => field.onChange(value ?? "")}
              >
                <SelectTrigger id="entityId" className="w-full">
                  <SelectValue
                    placeholder={
                      isEntitiesLoading
                        ? "Cargando..."
                        : entities.length
                          ? "Selecciona una entidad"
                          : "No hay entidades disponibles"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {entityItems.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.entityId?.message} />
            </div>
          )}
        />

        <Controller
          control={form.control}
          name="method"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="method">Método</Label>
              <Select
                value={field.value ? field.value : null}
                items={methodItems}
                onValueChange={(value) =>
                  field.onChange(value ?? ("" as PaymentMethod))
                }
              >
                <SelectTrigger id="method" className="w-full">
                  <SelectValue placeholder="Selecciona un método" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.method?.message} />
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
              />
            )}
          />
          <FieldError message={errors.allocations?.message} />
        </div>
      </FormGroup>
    </form>
  );
}
