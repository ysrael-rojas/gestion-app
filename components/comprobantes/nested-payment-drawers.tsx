"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useCajasBancos } from "@/components/cajas-bancos/cajas-bancos-provider";
import { VoucherAmountsBand } from "@/components/comprobantes/voucher-amounts-band";
import type {
  CashReceiptCategory,
  PaymentDirection,
  PaymentMethodRef,
} from "@/components/pagos/types";
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
import { formatDate, formatCurrency, getTodayLocalDate } from "@/lib/utils";
import { cn } from "cn";

type WizardStep = 1 | 2 | 3 | 4;

/**
 * Estado compartido por los 4 paneles. Se conserva al ir y volver con "Atrás":
 * los Drawer anidados solo cambian qué panel está abierto, no desmontan el estado.
 */
interface PaymentWizardState {
  entityId: string;
  comprobanteId: string;
  direction: PaymentDirection;
  paymentDate: string;
  methodId: string;
  cashAccountId: string;
  categoryId: string;
  amount: string;
  reference: string;
  notes: string;
}

interface NestedPaymentDrawersProps {
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

const STEP_COPY: Record<WizardStep, { title: string; description: string }> = {
  1: {
    title: "Registrar pago",
    description: "Confirma el comprobante y la fecha del pago.",
  },
  2: {
    title: "Método y cuenta",
    description: "Elige cómo y desde dónde se realiza el pago.",
  },
  3: {
    title: "Importe",
    description: "Define cuánto vas a amortizar del saldo.",
  },
  4: {
    title: "Detalles finales",
    description: "Agrega una referencia o notas si lo necesitas.",
  },
};

function createInitialDraft({
  entityId,
  comprobanteId,
  direction,
  balance,
}: {
  entityId: string;
  comprobanteId: string;
  direction: PaymentDirection;
  balance: number;
}): PaymentWizardState {
  return {
    entityId,
    comprobanteId,
    direction,
    paymentDate: getTodayLocalDate(),
    methodId: "",
    cashAccountId: "",
    categoryId: "",
    amount: String(balance),
    reference: "",
    notes: "",
  };
}

const ENTITY_LABELS: Record<PaymentDirection, string> = {
  INGRESO: "Cliente",
  EGRESO: "Proveedor",
};

interface VoucherSummaryProps {
  voucherType: VoucherType;
  voucherNumber: string;
  issueDate: string;
  condition: PaymentType;
  dueDate: string | null;
}

/** Cabecera del comprobante: tipo + número destacados y contexto de emisión. */
function VoucherSummary({
  voucherType,
  voucherNumber,
  issueDate,
  condition,
  dueDate,
}: VoucherSummaryProps) {
  const items = [
    { label: "Emisión", value: formatDate(issueDate) },
    { label: "Condición", value: getOptionLabel(PAYMENT_TYPES, condition) },
    {
      label: "Vencimiento",
      value: dueDate ? formatDate(dueDate) : "—",
    },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <Badge variant="secondary">
          {getOptionLabel(VOUCHER_TYPES, voucherType)}
        </Badge>
        <span className="text-lg font-semibold tabular-nums">
          {voucherNumber}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {item.label}
            </dt>
            <dd className="text-sm font-medium tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

interface PanelBodyProps {
  step: WizardStep;
  children?: React.ReactNode;
  onCancel?: () => void;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  isSubmitting?: boolean;
}

function PanelBody({
  step,
  children,
  onCancel,
  onBack,
  onNext,
  nextLabel = "Continuar",
  isSubmitting = false,
}: PanelBodyProps) {
  const { title, description } = STEP_COPY[step];

  return (
    <>
      <DrawerHeader>
        <DrawerTitle>{title}</DrawerTitle>
        <DrawerDescription>{description}</DrawerDescription>
      </DrawerHeader>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
      <div className="mt-auto flex shrink-0 flex-row justify-end gap-2 p-4 pt-0">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        {onBack ? (
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft />
            Atrás
          </Button>
        ) : null}
        {onNext ? (
          <Button
            type="button"
            onClick={onNext}
            disabled={isSubmitting}
          >
            {nextLabel}
          </Button>
        ) : null}
      </div>
    </>
  );
}

/**
 * Registro de pago dirigido a un comprobante: 4 drawers anidados (uno por paso)
 * apilados con Base UI. Solo se usa desde los listados de ventas y compras.
 */
export function NestedPaymentDrawers({
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
}: NestedPaymentDrawersProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [draft, setDraft] = useState<PaymentWizardState>(() =>
    createInitialDraft({ entityId, comprobanteId, direction, balance })
  );

  const updateDraft = (patch: Partial<PaymentWizardState>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const { accounts } = useCajasBancos();
  const [methods, setMethods] = useState<PaymentMethodRef[]>([]);
  const [categories, setCategories] = useState<CashReceiptCategory[]>([]);

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
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [direction]);

  // Categoría fijada por dirección: "Cobranza de venta" / "Pago a proveedor"
  // (fallback: la primera categoría cargada para esa dirección).
  const defaultCategoryName = DEFAULT_CATEGORIES[direction][0];
  const defaultCategory =
    categories.find((category) => category.name === defaultCategoryName) ??
    categories[0];
  const categoryId = draft.categoryId || defaultCategory?.id || "";

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

  const handleMethodChange = (value: string) => {
    const method = methods.find((item) => item.id === value);
    const allowedType =
      method && method.code !== CASH_METHOD_CODE
        ? "BANK_ACCOUNT"
        : "CASH_BOX";
    const current = activeAccounts.find(
      (account) => account.id === draft.cashAccountId
    );

    updateDraft({
      methodId: value,
      cashAccountId:
        current && current.type !== allowedType ? "" : draft.cashAccountId,
    });
  };

  const parsedAmount = Number(draft.amount);
  const amountValue = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const newBalance = Math.max(balance - amountValue, 0);

  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setStep(1);
      setDraft(
        createInitialDraft({ entityId, comprobanteId, direction, balance })
      );
    }
    wasOpen.current = open;
  }, [open, entityId, comprobanteId, direction, balance]);

  const handleRootOpenChange = (next: boolean) => {
    if (!next) {
      setStep(1);
    }
    onOpenChange(next);
  };

  // Cerrar un drawer anidado (swipe, overlay o "Atrás") vuelve al panel previo.
  const handleNestedOpenChange = (previous: WizardStep) => (next: boolean) => {
    if (!next) {
      setStep(previous);
    }
  };

  return (
    <Drawer open={open} onOpenChange={handleRootOpenChange}>
      <DrawerContent className="sm:mx-auto sm:max-w-xl">
        <PanelBody
          step={1}
          onCancel={() => handleRootOpenChange(false)}
          onNext={() => setStep(2)}
        >
          <div className="flex flex-col gap-5">
            <VoucherSummary
              voucherType={voucherType}
              voucherNumber={voucherNumber}
              issueDate={issueDate}
              condition={condition}
              dueDate={dueDate}
            />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-entity">
                {ENTITY_LABELS[direction]}
              </Label>
              <Input
                id="payment-entity"
                value={entityName}
                readOnly
                disabled
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-date">Fecha de pago</Label>
              <Input
                id="payment-date"
                type="date"
                value={draft.paymentDate}
                onChange={(event) =>
                  updateDraft({ paymentDate: event.target.value })
                }
              />
            </div>
          </div>
        </PanelBody>

        <Drawer
          open={step >= 2}
          onOpenChange={handleNestedOpenChange(1)}
        >
          <DrawerContent showOverlay={false} className="sm:mx-auto sm:max-w-xl">
            <PanelBody step={2} onBack={() => setStep(1)} onNext={() => setStep(3)}>
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="payment-method">Método</Label>
                  <Select
                    value={draft.methodId || null}
                    items={methodItems}
                    onValueChange={(value) => handleMethodChange(value ?? "")}
                  >
                    <SelectTrigger id="payment-method" className="w-full">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map((method) => (
                        <SelectItem key={method.id} value={method.id}>
                          {method.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="payment-account">
                    {requiredAccountType === "BANK_ACCOUNT"
                      ? "Banco"
                      : "Caja/Banco"}
                  </Label>
                  <Select
                    value={draft.cashAccountId || null}
                    items={accountItems}
                    onValueChange={(value) =>
                      updateDraft({ cashAccountId: value ?? "" })
                    }
                  >
                    <SelectTrigger id="payment-account" className="w-full">
                      <SelectValue placeholder="Seleccionar" />
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
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="payment-category">Categoría</Label>
                  <Select
                    value={categoryId || null}
                    items={categoryItems}
                    disabled
                  >
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
                </div>
              </div>
            </PanelBody>

            <Drawer
              open={step >= 3}
              onOpenChange={handleNestedOpenChange(2)}
            >
              <DrawerContent
                showOverlay={false}
                className="sm:mx-auto sm:max-w-xl"
              >
                <PanelBody
                  step={3}
                  onBack={() => setStep(2)}
                  onNext={() => setStep(4)}
                >
                  <div className="flex flex-col gap-5">
                    <VoucherAmountsBand
                      total={total}
                      paidAmount={paidAmount}
                      balance={balance}
                    />

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="payment-amount">Importe</Label>
                      <Input
                        id="payment-amount"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={draft.amount}
                        onChange={(event) =>
                          updateDraft({ amount: event.target.value })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Precargado con el saldo pendiente. Puedes amortizar todo
                        o una parte.
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
                      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        Nuevo saldo
                      </span>
                      <span
                        className={cn(
                          "text-lg font-semibold tabular-nums",
                          newBalance <= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        )}
                      >
                        {formatCurrency(newBalance)}
                      </span>
                    </div>
                  </div>
                </PanelBody>

                <Drawer
                  open={step >= 4}
                  onOpenChange={handleNestedOpenChange(3)}
                >
                  <DrawerContent
                    showOverlay={false}
                    className="sm:mx-auto sm:max-w-xl"
                  >
                    <PanelBody
                      step={4}
                      onBack={() => setStep(3)}
                      // TODO(paso 6): conectar con addPayment.
                      onNext={() => undefined}
                      nextLabel="Registrar pago"
                    >
                      <p className="text-sm text-muted-foreground">
                        Panel 4 — referencia y notas (paso 6).
                      </p>
                    </PanelBody>
                  </DrawerContent>
                </Drawer>
              </DrawerContent>
            </Drawer>
          </DrawerContent>
        </Drawer>
      </DrawerContent>
    </Drawer>
  );
}
