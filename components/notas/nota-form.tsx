"use client";

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
import type { Nota, ReferableComprobante } from "@/components/notas/types";
import type { AdjustmentVoucherType } from "@/lib/data/nota-options";
import { NOTE_MOTIVES } from "@/lib/data/nota-options";
import { VOUCHER_TYPES, getOptionLabel } from "@/lib/data/sale-options";
import {
  notaSchema,
  type NotaFormInput,
  type NotaFormValues,
} from "@/lib/schemas/nota";
import { formatCurrency, formatDate, getTodayLocalDate } from "@/lib/utils";
import { calculateAmounts } from "@/lib/ventas/amounts";

interface NotaFormProps {
  voucherType: AdjustmentVoucherType;
  nota?: Nota | null;
  referable: ReferableComprobante | null;
  resolveEntityName: (entityId: string) => string;
  onSubmit: (values: NotaFormValues) => void;
}

export const NOTA_FORM_ID = "nota-form";

const VOUCHER_NUMBER_PLACEHOLDERS: Record<AdjustmentVoucherType, string> = {
  NOTA_CREDITO: "FC01-000001",
  NOTA_DEBITO: "FD01-000001",
  COMPROBANTE_RETENCION: "R001-000001",
};

function createEmptyValues(
  voucherType: AdjustmentVoucherType,
  referable: ReferableComprobante | null
): NotaFormInput {
  return {
    issueDate: getTodayLocalDate(),
    voucherType,
    voucherNumber: "",
    total: "",
    motiveCode: "",
    referencedComprobanteId: referable?.id ?? "",
  };
}

function valuesFromNota(
  voucherType: AdjustmentVoucherType,
  nota: Nota
): NotaFormInput {
  return {
    issueDate: nota.issueDate,
    voucherType,
    voucherNumber: nota.voucherNumber,
    total: nota.total,
    motiveCode: nota.motiveCode ?? "",
    referencedComprobanteId: nota.referencedId,
  };
}

/**
 * Datos de la ficha del referenciado: completos cuando está en la lista de
 * referenciables; mínimos (los guardados en la nota) cuando ya no está.
 */
interface ReferencedFicha {
  entityName: string;
  typeLabel: string | null;
  number: string | null;
  issueDate: string | null;
  total: number | null;
  balance: number | null;
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

export function NotaForm({
  voucherType,
  nota = null,
  referable,
  resolveEntityName,
  onSubmit,
}: NotaFormProps) {
  const isRetencion = voucherType === "COMPROBANTE_RETENCION";

  // El contenido del modal se remonta por apertura, así que los valores
  // iniciales (vacíos, del referable elegido o de la nota editada) se
  // resuelven una sola vez aquí.
  const form = useForm<NotaFormInput, unknown, NotaFormValues>({
    resolver: zodResolver(notaSchema),
    defaultValues: nota
      ? valuesFromNota(voucherType, nota)
      : createEmptyValues(voucherType, referable),
  });

  const total = useWatch({ control: form.control, name: "total" });
  const numericTotal = Number(total);
  const { subtotal, igv } = calculateAmounts(
    Number.isFinite(numericTotal) ? numericTotal : 0
  );

  // El tope de créditos ya incluye la nota que se edita: se excluye para que el
  // disponible refleje lo que queda sin ella.
  const ownCredit = nota && nota.voucherType !== "NOTA_DEBITO" ? nota.total : 0;
  const appliedCredit = referable
    ? Math.max(0, referable.creditAmount - ownCredit)
    : 0;
  const availableTop = referable
    ? Math.max(0, referable.total - appliedCredit)
    : 0;

  const registrationDate = nota?.registrationDate ?? getTodayLocalDate();
  const errors = form.formState.errors;
  const motiveOptions = !isRetencion ? NOTE_MOTIVES[voucherType] : null;
  const consumesCreditTop = voucherType !== "NOTA_DEBITO";

  const ficha: ReferencedFicha | null = referable
    ? {
        entityName: resolveEntityName(referable.entityId),
        typeLabel: getOptionLabel(VOUCHER_TYPES, referable.voucherType),
        number: referable.voucherNumber,
        issueDate: referable.issueDate,
        total: referable.total,
        balance: referable.balance,
      }
    : nota
      ? {
          entityName: resolveEntityName(nota.entityId),
          typeLabel: nota.referencedType
            ? getOptionLabel(VOUCHER_TYPES, nota.referencedType)
            : null,
          number: nota.referencedNumber,
          issueDate: null,
          total: null,
          balance: null,
        }
      : null;

  return (
    <form
      id={NOTA_FORM_ID}
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
    >
      {ficha ? (
        <div className="flex flex-col gap-1 rounded-lg bg-muted px-3 py-2 text-sm">
          <p className="font-medium">
            {ficha.entityName} — {ficha.typeLabel ? `${ficha.typeLabel} ` : ""}
            {ficha.number ?? "—"}
          </p>
          {ficha.issueDate ? (
            <p className="text-muted-foreground">
              Fecha de emisión: {formatDate(ficha.issueDate)}
            </p>
          ) : null}
          {ficha.total !== null ? (
            <p className="text-muted-foreground">
              Total del comprobante: {formatCurrency(ficha.total)}
            </p>
          ) : null}
          {ficha.balance !== null ? (
            <p className="text-muted-foreground">
              Saldo: {formatCurrency(ficha.balance)}
            </p>
          ) : null}
          {referable ? (
            consumesCreditTop ? (
              <p className="text-muted-foreground">
                Tope disponible para este documento:{" "}
                {formatCurrency(availableTop)}
              </p>
            ) : (
              <p className="text-muted-foreground">
                Una nota de débito aumenta el saldo del comprobante.
              </p>
            )
          ) : null}
        </div>
      ) : (
        <FieldError message={errors.referencedComprobanteId?.message} />
      )}

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

        <input type="hidden" {...form.register("voucherType")} />
        <input type="hidden" {...form.register("referencedComprobanteId")} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="voucherNumber">Nro comprobante</Label>
          <Input
            id="voucherNumber"
            placeholder={VOUCHER_NUMBER_PLACEHOLDERS[voucherType]}
            aria-invalid={!!errors.voucherNumber}
            {...form.register("voucherNumber")}
          />
          <FieldError message={errors.voucherNumber?.message} />
        </div>

        {motiveOptions ? (
          <Controller
            control={form.control}
            name="motiveCode"
            render={({ field }) => {
              const motiveItems = motiveOptions.map((option) => ({
                value: option.value,
                label: option.label,
              }));

              return (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="motiveCode">Motivo</Label>
                  <Select
                    value={field.value ? field.value : null}
                    items={motiveItems}
                    onValueChange={(value) => field.onChange(value ?? "")}
                  >
                    <SelectTrigger
                      id="motiveCode"
                      className="w-full"
                      aria-invalid={!!errors.motiveCode}
                    >
                      <SelectValue placeholder="Selecciona el motivo" />
                    </SelectTrigger>
                    <SelectContent>
                      {motiveOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={errors.motiveCode?.message} />
                </div>
              );
            }}
          />
        ) : null}
      </FormGroup>

      <FormGroup title="Montos">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="total">
            {isRetencion ? "Monto retenido" : "Total"}
          </Label>
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

        {!isRetencion ? (
          <>
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
          </>
        ) : null}
      </FormGroup>
    </form>
  );
}
