"use client";

import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  cashAccountFormSchema,
  type CashAccountFormInput,
  type CashAccountFormValues,
  type CashAccountType,
} from "@/lib/schemas/cash-account";
import { getTodayLocalDate } from "@/lib/utils";
import { CLOSING_PERIODICITY_OPTIONS } from "@/lib/data/cash-options";
import type { CashAccount } from "@/lib/cuentas/entidades";

interface CashAccountFormProps {
  account?: CashAccount | null;
  defaultType?: CashAccountType;
  /**
   * Instancia externa (p. ej. creada por `CashAccountModal` para conocer el
   * tipo elegido). Si no se pasa, el componente gestiona su propio formulario.
   */
  form?: CashAccountFormInstance;
  onSubmit: (values: CashAccountFormValues) => void;
}

export const CASH_ACCOUNT_FORM_ID = "cash-account-form";

const TYPE_OPTIONS: { value: CashAccountType; label: string }[] = [
  { value: "CASH_BOX", label: "Caja (efectivo)" },
  { value: "BANK_ACCOUNT", label: "Banco (cuenta)" },
];

function createEmptyValues(defaultType?: CashAccountType): CashAccountFormInput {
  return {
    // Sin tipo preseleccionado: el select inicia en "Seleccionar".
    type: defaultType,
    name: "",
    currency: "PEN",
    bankName: "",
    accountNumber: "",
    cci: "",
    closingPeriodicity: "",
    openingBalance: 0,
    openingBalanceDate: getTodayLocalDate(),
    notes: "",
    isActive: true,
  };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
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

interface UseCashAccountFormOptions {
  /**
   * Visibilidad del modal: el formulario se resetea cada vez que se abre,
   * para no arrastrar valores de una sesión anterior.
   */
  open?: boolean;
  account?: CashAccount | null;
  defaultType?: CashAccountType;
}

export function useCashAccountForm({
  open = true,
  account,
  defaultType,
}: UseCashAccountFormOptions = {}) {
  const form = useForm<CashAccountFormInput, unknown, CashAccountFormValues>({
    resolver: zodResolver(cashAccountFormSchema),
    defaultValues: createEmptyValues(defaultType),
  });

  useEffect(() => {
    if (!open) return;
    if (account) {
      form.reset({
        type: account.type,
        name: account.name,
        currency: account.currency,
        bankName: account.bankName ?? "",
        accountNumber: account.accountNumber ?? "",
        cci: account.cci ?? "",
        closingPeriodicity: account.closingPeriodicity ?? "",
        openingBalance: account.openingBalance,
        openingBalanceDate: account.openingBalanceDate,
        notes: account.notes ?? "",
        isActive: account.isActive,
      });
    } else {
      form.reset(createEmptyValues(defaultType));
    }
  }, [open, account, defaultType, form]);

  return form;
}

export type CashAccountFormInstance = ReturnType<typeof useCashAccountForm>;

interface CashAccountFormFieldsProps {
  form: CashAccountFormInstance;
  onSubmit: (values: CashAccountFormValues) => void;
}

function CashAccountFormFields({ form, onSubmit }: CashAccountFormFieldsProps) {
  const type = useWatch({ control: form.control, name: "type" });
  const isBank = type === "BANK_ACCOUNT";
  const errors = form.formState.errors;

  return (
    <form
      id={CASH_ACCOUNT_FORM_ID}
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
    >
      <FormGroup title="Datos básicos">
        <Controller
          control={form.control}
          name="type"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="type">Tipo de cuenta</Label>
              <Select
                value={field.value ?? null}
                items={TYPE_OPTIONS}
                onValueChange={(value) => {
                  if (value === null) return;
                  field.onChange(value as CashAccountType);
                  if (value === "CASH_BOX") {
                    form.setValue("bankName", "");
                    form.setValue("accountNumber", "");
                    form.setValue("cci", "");
                  }
                }}
              >
                <SelectTrigger id="type" className="w-full">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.type?.message} />
            </div>
          )}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currency">Moneda</Label>
          <Input
            id="currency"
            placeholder="PEN"
            maxLength={8}
            aria-invalid={!!errors.currency}
            {...form.register("currency")}
          />
          <FieldError message={errors.currency?.message} />
        </div>

        <Controller
          control={form.control}
          name="closingPeriodicity"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="closingPeriodicity">Periodicidad de cierre</Label>
              <Select
                value={field.value ? field.value : "DEFAULT"}
                items={CLOSING_PERIODICITY_OPTIONS}
                onValueChange={(value) =>
                  field.onChange(value === "DEFAULT" ? "" : (value ?? ""))
                }
              >
                <SelectTrigger id="closingPeriodicity" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLOSING_PERIODICITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.closingPeriodicity?.message} />
            </div>
          )}
        />

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="name">Nombre</Label>
          <Input
            id="name"
            placeholder="Ej. Caja principal, Cuenta BCP soles"
            aria-invalid={!!errors.name}
            {...form.register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>
      </FormGroup>

      {isBank ? (
        <FormGroup title="Datos bancarios">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="bankName">Banco</Label>
            <Input
              id="bankName"
              placeholder="Ej. BCP, Interbank, BBVA"
              aria-invalid={!!errors.bankName}
              {...form.register("bankName")}
            />
            <FieldError message={errors.bankName?.message} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountNumber">Nro de cuenta</Label>
            <Input
              id="accountNumber"
              placeholder="000-1234567-89"
              aria-invalid={!!errors.accountNumber}
              {...form.register("accountNumber")}
            />
            <FieldError message={errors.accountNumber?.message} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cci">CCI</Label>
            <Input
              id="cci"
              placeholder="20 dígitos"
              maxLength={20}
              aria-invalid={!!errors.cci}
              {...form.register("cci")}
            />
            <FieldError message={errors.cci?.message} />
          </div>
        </FormGroup>
      ) : null}

      <FormGroup title="Saldo inicial y notas">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="openingBalance">Saldo inicial</Label>
          <Input
            id="openingBalance"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            aria-invalid={!!errors.openingBalance}
            {...form.register("openingBalance", { valueAsNumber: true })}
          />
          <FieldError message={errors.openingBalance?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="openingBalanceDate">Fecha de apertura</Label>
          <Input
            id="openingBalanceDate"
            type="date"
            aria-invalid={!!errors.openingBalanceDate}
            {...form.register("openingBalanceDate")}
          />
          <FieldError message={errors.openingBalanceDate?.message} />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Textarea
            id="notes"
            placeholder="Observaciones (opcional)"
            aria-invalid={!!errors.notes}
            {...form.register("notes")}
          />
          <FieldError message={errors.notes?.message} />
        </div>

        <Controller
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox
                id="isActive"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label htmlFor="isActive">Cuenta activa</Label>
            </div>
          )}
        />
      </FormGroup>
    </form>
  );
}

/**
 * Variante auto-gestionada: crea y resetea su propio formulario. Se usa
 * cuando nadie pasa una instancia externa (p. ej. tests o uso aislado).
 */
function SelfManagedCashAccountForm({
  account,
  defaultType,
  onSubmit,
}: Omit<CashAccountFormProps, "form">) {
  const form = useCashAccountForm({ account, defaultType });
  return <CashAccountFormFields form={form} onSubmit={onSubmit} />;
}

export function CashAccountForm({
  account,
  defaultType,
  form,
  onSubmit,
}: CashAccountFormProps) {
  if (form) {
    return <CashAccountFormFields form={form} onSubmit={onSubmit} />;
  }
  return (
    <SelfManagedCashAccountForm
      account={account}
      defaultType={defaultType}
      onSubmit={onSubmit}
    />
  );
}
