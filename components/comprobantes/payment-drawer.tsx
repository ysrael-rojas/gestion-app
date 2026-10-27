"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { useCajasBancos } from "@/components/cajas-bancos/cajas-bancos-provider";
import { VoucherAmountsBand } from "@/components/comprobantes/voucher-amounts-band";
import { usePagos } from "@/components/pagos/pagos-provider";
import type {
  CashReceiptCategory,
  PaymentDirection,
  PaymentMethodRef,
} from "@/components/pagos/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
import type { PaymentType, VoucherType } from "@/components/ventas/types";
import { CASH_METHOD_CODE, DEFAULT_CATEGORIES } from "@/lib/caja/defaults";
import {
  ensureCatalogsSeeded,
  ensureDefaultSettings,
  listCategories,
  listPaymentMethods,
} from "@/lib/caja/caja";
import {
  getOptionLabel,
  PAYMENT_TYPES,
  VOUCHER_TYPES,
} from "@/lib/data/sale-options";
import {
  formatDate,
  formatCurrency,
  getTodayLocalDate,
  type Currency,
} from "@/lib/utils";
import { cn } from "cn";

interface PaymentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  direction: PaymentDirection;
  entityName: string;
  voucherType: VoucherType;
  voucherNumber: string;
  issueDate: string;
  condition: PaymentType;
  dueDate: string | null;
  entityId: string;
  comprobanteId: string;
  total: number;
  paidAmount: number;
  balance: number;
  onRegistered: () => void | Promise<void>;
}

interface PaymentDraft {
  paymentDate: string;
  methodId: string;
  cashAccountId: string;
  categoryId: string;
  amount: string;
  reference: string;
  notes: string;
}

interface PaymentFieldErrors {
  paymentDate?: string;
  methodId?: string;
  cashAccountId?: string;
  amount?: string;
  categoryId?: string;
}

const ENTITY_LABELS: Record<PaymentDirection, string> = {
  INGRESO: "Cliente",
  EGRESO: "Proveedor",
};

const SELECT_PLACEHOLDER = "Seleccionar";

function createInitialDraft(balance: number): PaymentDraft {
  return {
    paymentDate: getTodayLocalDate(),
    methodId: "",
    cashAccountId: "",
    categoryId: "",
    amount: String(balance),
    reference: "",
    notes: "",
  };
}

function RequiredBadge() {
  return (
    <Badge
      variant="outline"
      className="border-destructive/40 font-normal text-destructive"
    >
      Requerido
    </Badge>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p role="alert" tabIndex={-1} className="text-sm text-destructive">
      {message}
    </p>
  );
}

/**
 * Registro de pago de un comprobante en un único drawer: resumen y montos
 * arriba, campos en grid de 2 columnas y validación al enviar.
 */
export function PaymentDrawer({
  open,
  onOpenChange,
  direction,
  entityName,
  voucherType,
  voucherNumber,
  issueDate,
  condition,
  dueDate,
  entityId,
  comprobanteId,
  total,
  paidAmount,
  balance,
  onRegistered,
}: PaymentDrawerProps) {
  const [draft, setDraft] = useState<PaymentDraft>(() =>
    createInitialDraft(balance)
  );
  const [errors, setErrors] = useState<PaymentFieldErrors>({});
  const [methods, setMethods] = useState<PaymentMethodRef[]>([]);
  const [categories, setCategories] = useState<CashReceiptCategory[]>([]);
  const [isCatalogsLoading, setIsCatalogsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const wasOpen = useRef(open);

  const { accounts } = useCajasBancos();
  const { addPayment } = usePagos();

  const updateDraft = (patch: Partial<PaymentDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  // Catálogos: siembra perezosa + métodos y categorías de la dirección
  // (mismo patrón que payment-form.tsx).
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
      } finally {
        if (isMounted) {
          setIsCatalogsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [direction]);

  // Categoría fijada por dirección vía código estable (SPEC 37): "Cobranza de
  // venta" / "Pago a proveedor". Sin fallback silencioso: si falta la categoría
  // con ese código, se avisa y no se registra el pago.
  const defaultSeed = DEFAULT_CATEGORIES[direction][0];
  const defaultCategory = categories.find(
    (category) => category.code === defaultSeed.code
  );
  const categoryId = draft.categoryId || defaultCategory?.id || "";
  const missingCategoryMessage = `No existe la categoría «${defaultSeed.name}» (código ${defaultSeed.code}). Créala en Configuración → Caja.`;
  const categoryError =
    !isCatalogsLoading && !categoryId ? missingCategoryMessage : undefined;

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.isActive),
    [accounts]
  );

  const selectedMethod = methods.find(
    (method) => method.id === draft.methodId
  );
  const requiredAccountType =
    selectedMethod === undefined
      ? null
      : selectedMethod.code === CASH_METHOD_CODE
        ? "CASH_BOX"
        : "BANK_ACCOUNT";

  const availableAccounts = requiredAccountType
    ? activeAccounts.filter((account) => account.type === requiredAccountType)
    : activeAccounts;

  const methodItems = [
    { value: null, label: SELECT_PLACEHOLDER },
    ...methods.map((method) => ({
      value: method.id,
      label: method.name,
    })),
  ];
  const accountItems = [
    { value: null, label: SELECT_PLACEHOLDER },
    ...availableAccounts.map((account) => ({
      value: account.id,
      label: `${account.name} · ${account.currency}`,
    })),
  ];
  const categoryItems = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  const handleMethodChange = (value: string) => {
    const method = methods.find((item) => item.id === value);
    const allowedType =
      method && method.code !== CASH_METHOD_CODE
        ? "BANK_ACCOUNT"
        : "CASH_BOX";
    const current = activeAccounts.find(
      (account) => account.id === draft.cashAccountId
    );
    const clearsAccount = Boolean(current && current.type !== allowedType);

    updateDraft({
      methodId: value,
      cashAccountId: clearsAccount ? "" : draft.cashAccountId,
    });
    setErrors((currentErrors) => ({
      ...currentErrors,
      methodId: undefined,
      cashAccountId: clearsAccount ? undefined : currentErrors.cashAccountId,
    }));
  };

  const parsedAmount = Number(draft.amount);
  const amountValue = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const newBalance = Math.max(balance - amountValue, 0);

  // La moneda del pago es la de la cuenta elegida (SPEC 37).
  const selectedAccount = activeAccounts.find(
    (account) => account.id === draft.cashAccountId
  );
  const paymentCurrency: Currency =
    selectedAccount?.currency === "USD" ? "USD" : "PEN";

  function focusFirstError() {
    requestAnimationFrame(() => {
      const firstAlert = formRef.current?.querySelector<HTMLElement>(
        '[role="alert"]'
      );

      if (!firstAlert) {
        return;
      }

      if (typeof firstAlert.scrollIntoView === "function") {
        firstAlert.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      firstAlert.focus({ preventScroll: true });
    });
  }

  function validate(): PaymentFieldErrors {
    const nextErrors: PaymentFieldErrors = {};

    if (!draft.paymentDate) {
      nextErrors.paymentDate = "La fecha de pago es obligatoria.";
    }

    if (!draft.methodId) {
      nextErrors.methodId = "Selecciona un método de pago.";
    }

    if (!draft.cashAccountId) {
      nextErrors.cashAccountId = "Selecciona una caja o banco.";
    }

    if (amountValue <= 0) {
      nextErrors.amount = "El importe debe ser mayor a 0.";
    } else if (amountValue > balance) {
      nextErrors.amount = "El importe supera el saldo del comprobante.";
    }

    if (!categoryId) {
      nextErrors.categoryId = missingCategoryMessage;
    }

    return nextErrors;
  }

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      focusFirstError();
      return;
    }

    setIsSubmitting(true);

    try {
      await addPayment({
        entityId,
        direction,
        paymentDate: draft.paymentDate,
        amount: amountValue,
        methodId: draft.methodId,
        cashAccountId: draft.cashAccountId,
        categoryId,
        reference: draft.reference.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        allocations: [{ comprobanteId, amount: amountValue }],
      });
      toast.success("Pago registrado");
      handleOpenChange(false);
      await onRegistered();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo registrar el pago. Intenta nuevamente."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(createInitialDraft(balance));
      setErrors({});
    }
    wasOpen.current = open;
  }, [open, balance]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setErrors({});
    }
    onOpenChange(next);
  }

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleSubmit();
  }

  return (
    <Drawer
      open={open}
      onOpenChange={handleOpenChange}
      swipeDirection="right"
    >
      <DrawerContent className="[--drawer-inset:0.75rem] [--bleed:0rem] rounded-xl [--drawer-content-width:calc(100vw-1.5rem)]! sm:[--drawer-content-width:50vw]! xl:[--drawer-content-width:40rem]!">
        <DrawerHeader className="gap-3 border-b px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <DrawerTitle className="text-lg">Registrar pago</DrawerTitle>
              <DrawerDescription>
                {direction === "INGRESO"
                  ? "Registra el cobro de este comprobante."
                  : "Registra el pago de este comprobante."}
              </DrawerDescription>
            </div>
            <DrawerClose
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Cerrar" />
              }
            >
              <X />
            </DrawerClose>
          </div>

          <div
            data-testid="payment-drawer-identity"
            className="flex flex-col gap-1 text-sm"
          >
            <p>
              <span className="text-muted-foreground uppercase">
                {getOptionLabel(VOUCHER_TYPES, voucherType)}:
              </span>{" "}
              <span className="tabular-nums">{voucherNumber}</span>
            </p>
            <p>
              <span className="text-muted-foreground uppercase">
                {ENTITY_LABELS[direction]}:
              </span>{" "}
              <span>{entityName}</span>
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                <span className="text-muted-foreground uppercase">
                  Fecha emisión:
                </span>{" "}
                <span>{formatDate(issueDate)}</span>
              </span>
              <span>
                <span className="text-muted-foreground uppercase">
                  Condición:
                </span>{" "}
                <span>{getOptionLabel(PAYMENT_TYPES, condition)}</span>
              </span>
              {condition === "CREDITO" ? (
                <span>
                  <span className="text-muted-foreground uppercase">
                    Vencimiento:
                  </span>{" "}
                  <span>{dueDate ? formatDate(dueDate) : "—"}</span>
                </span>
              ) : null}
            </div>
          </div>
        </DrawerHeader>

        <form
          ref={formRef}
          onSubmit={handleFormSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-5 p-5">
              <VoucherAmountsBand
                total={total}
                paidAmount={paidAmount}
                balance={balance}
                currency={paymentCurrency}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Label htmlFor="payment-date">Fecha de pago</Label>
                    <RequiredBadge />
                  </div>
                  <Input
                    id="payment-date"
                    type="date"
                    value={draft.paymentDate}
                    aria-invalid={!!errors.paymentDate}
                    onChange={(event) => {
                      updateDraft({ paymentDate: event.target.value });
                      setErrors((current) => ({
                        ...current,
                        paymentDate: undefined,
                      }));
                    }}
                  />
                  <FieldError message={errors.paymentDate} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Label htmlFor="payment-amount">Importe</Label>
                    <RequiredBadge />
                  </div>
                  <Input
                    id="payment-amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={draft.amount}
                    aria-invalid={!!errors.amount}
                    onChange={(event) => {
                      updateDraft({ amount: event.target.value });
                      setErrors((current) => ({
                        ...current,
                        amount: undefined,
                      }));
                    }}
                  />
                  <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-1.5">
                    <span className="text-xs text-muted-foreground">
                      Nuevo saldo
                    </span>
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        newBalance <= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400"
                      )}
                    >
                      {formatCurrency(newBalance, paymentCurrency)}
                    </span>
                  </div>
                  <FieldError message={errors.amount} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Label htmlFor="payment-method">Método</Label>
                    <RequiredBadge />
                  </div>
                  <Select
                    value={draft.methodId || null}
                    items={methodItems}
                    onValueChange={(value) => handleMethodChange(value ?? "")}
                  >
                    <SelectTrigger
                      id="payment-method"
                      className="w-full"
                      aria-invalid={!!errors.methodId}
                    >
                      <SelectValue placeholder={SELECT_PLACEHOLDER} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>{SELECT_PLACEHOLDER}</SelectItem>
                      {methods.map((method) => (
                        <SelectItem key={method.id} value={method.id}>
                          {method.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={errors.methodId} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Label htmlFor="payment-account">
                      {requiredAccountType === "BANK_ACCOUNT"
                        ? "Banco"
                        : "Caja/Banco"}
                    </Label>
                    <RequiredBadge />
                  </div>
                  <Select
                    value={draft.cashAccountId || null}
                    items={accountItems}
                    onValueChange={(value) => {
                      updateDraft({ cashAccountId: value ?? "" });
                      setErrors((current) => ({
                        ...current,
                        cashAccountId: undefined,
                      }));
                    }}
                  >
                    <SelectTrigger
                      id="payment-account"
                      className="w-full"
                      aria-invalid={!!errors.cashAccountId}
                    >
                      <SelectValue placeholder={SELECT_PLACEHOLDER} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>{SELECT_PLACEHOLDER}</SelectItem>
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
                  <FieldError message={errors.cashAccountId} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="payment-category">Categoría</Label>
                  <Select value={categoryId || null} items={categoryItems} disabled>
                    <SelectTrigger id="payment-category" className="w-full">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError
                    message={categoryError ?? errors.categoryId}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="payment-reference">
                    Referencia (opcional)
                  </Label>
                  <Input
                    id="payment-reference"
                    maxLength={60}
                    placeholder="Nro de operación / autorización"
                    value={draft.reference}
                    onChange={(event) =>
                      updateDraft({ reference: event.target.value })
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="payment-notes">Notas (opcional)</Label>
                  <Textarea
                    id="payment-notes"
                    maxLength={200}
                    placeholder="Observaciones del pago"
                    value={draft.notes}
                    onChange={(event) =>
                      updateDraft({ notes: event.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <DrawerFooter className="flex-row justify-end gap-2 border-t p-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando…" : "Registrar pago"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
