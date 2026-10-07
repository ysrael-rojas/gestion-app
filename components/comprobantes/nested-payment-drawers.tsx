"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { PaymentDirection } from "@/components/pagos/types";
import type { PaymentType, VoucherType } from "@/components/ventas/types";
import {
  getOptionLabel,
  PAYMENT_TYPES,
  VOUCHER_TYPES,
} from "@/lib/data/sale-options";
import { formatDate, getTodayLocalDate } from "@/lib/utils";

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
  balance,
}: NestedPaymentDrawersProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [draft, setDraft] = useState<PaymentWizardState>(() =>
    createInitialDraft({ entityId, comprobanteId, direction, balance })
  );

  const updateDraft = (patch: Partial<PaymentWizardState>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

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
              <p className="text-sm text-muted-foreground">
                Panel 2 — método, caja/banco y categoría (paso 4).
              </p>
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
                  <p className="text-sm text-muted-foreground">
                    Panel 3 — montos e importe a amortizar (paso 5).
                  </p>
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
