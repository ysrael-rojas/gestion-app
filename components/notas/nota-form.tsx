"use client";

import { useState } from "react";
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
import type {
  AdjustmentVoucherType,
  NotaRelation,
} from "@/lib/data/nota-options";
import {
  NOTE_MOTIVES,
  NOTA_RELATIONS,
} from "@/lib/data/nota-options";
import { VOUCHER_TYPES, getOptionLabel } from "@/lib/data/sale-options";
import {
  notaSchema,
  type NotaFormInput,
  type NotaFormValues,
} from "@/lib/schemas/nota";
import { formatCurrency, getTodayLocalDate } from "@/lib/utils";
import { calculateAmounts } from "@/lib/ventas/amounts";

interface NotaFormProps {
  voucherType: AdjustmentVoucherType;
  nota?: Nota | null;
  referables: ReferableComprobante[];
  resolveEntityName: (entityId: string) => string;
  onSubmit: (values: NotaFormValues) => void;
}

export const NOTA_FORM_ID = "nota-form";

const VOUCHER_NUMBER_PLACEHOLDERS: Record<AdjustmentVoucherType, string> = {
  NOTA_CREDITO: "FC01-000001",
  NOTA_DEBITO: "FD01-000001",
  COMPROBANTE_RETENCION: "R001-000001",
};

const relationItems = NOTA_RELATIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));

function createEmptyValues(
  voucherType: AdjustmentVoucherType
): NotaFormInput {
  return {
    issueDate: getTodayLocalDate(),
    voucherType,
    voucherNumber: "",
    total: "",
    motiveCode: "",
    referencedComprobanteId: "",
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

function initialRelation(
  voucherType: AdjustmentVoucherType,
  nota: Nota | null
): NotaRelation {
  if (nota) {
    return nota.voucherKind === "VENTA" ? "EMITIDA" : "RECIBIDA";
  }

  return voucherType === "COMPROBANTE_RETENCION" ? "RECIBIDA" : "EMITIDA";
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
  referables,
  resolveEntityName,
  onSubmit,
}: NotaFormProps) {
  const isRetencion = voucherType === "COMPROBANTE_RETENCION";
  const isEditing = nota !== null;

  // El contenido del modal se remonta por apertura, así que los valores
  // iniciales (vacíos o de la nota editada) se resuelven una sola vez aquí.
  const form = useForm<NotaFormInput, unknown, NotaFormValues>({
    resolver: zodResolver(notaSchema),
    defaultValues: nota
      ? valuesFromNota(voucherType, nota)
      : createEmptyValues(voucherType),
  });

  const [relation, setRelation] = useState<NotaRelation>(() =>
    initialRelation(voucherType, nota)
  );

  const relationKind = relation === "EMITIDA" ? "VENTA" : "COMPRA";
  const relationReferables = referables.filter(
    (referable) => referable.voucherKind === relationKind
  );
  const referableItems = relationReferables.map((referable) => ({
    value: referable.id,
    label: `${referable.voucherNumber} — ${resolveEntityName(referable.entityId)}`,
  }));

  const total = useWatch({ control: form.control, name: "total" });
  const numericTotal = Number(total);
  const { subtotal, igv } = calculateAmounts(
    Number.isFinite(numericTotal) ? numericTotal : 0
  );

  const referencedId = useWatch({
    control: form.control,
    name: "referencedComprobanteId",
  });
  const selectedReferable =
    referables.find((referable) => referable.id === referencedId) ?? null;

  // El tope de créditos ya incluye la nota que se edita: se excluye para que el
  // disponible refleje lo que queda sin ella.
  const ownCredit =
    nota && nota.voucherType !== "NOTA_DEBITO" ? nota.total : 0;
  const appliedCredit = selectedReferable
    ? Math.max(0, selectedReferable.creditAmount - ownCredit)
    : 0;
  const availableTop = selectedReferable
    ? Math.max(0, selectedReferable.total - appliedCredit)
    : 0;

  const registrationDate = nota?.registrationDate ?? getTodayLocalDate();
  const errors = form.formState.errors;
  const motiveOptions = !isRetencion ? NOTE_MOTIVES[voucherType] : null;
  const consumesCreditTop = voucherType !== "NOTA_DEBITO";

  return (
    <form
      id={NOTA_FORM_ID}
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

        <input type="hidden" {...form.register("voucherType")} />

        {!isRetencion ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="relation">Relación</Label>
            <Select
              value={relation}
              items={relationItems}
              disabled={isEditing}
              onValueChange={(value) => {
                setRelation((value ?? "EMITIDA") as NotaRelation);
                form.setValue("referencedComprobanteId", "");
              }}
            >
              <SelectTrigger id="relation" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTA_RELATIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEditing ? (
              <p className="text-xs text-muted-foreground">
                La referencia y el tipo de una nota no se pueden cambiar.
              </p>
            ) : null}
          </div>
        ) : null}

        <Controller
          control={form.control}
          name="referencedComprobanteId"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="referencedComprobanteId">
                Comprobante referenciado
              </Label>
              <Select
                value={field.value ? field.value : null}
                items={referableItems}
                onValueChange={(value) => field.onChange(value ?? "")}
              >
                <SelectTrigger
                  id="referencedComprobanteId"
                  className="w-full"
                  aria-invalid={!!errors.referencedComprobanteId}
                >
                  <SelectValue placeholder="Selecciona el comprobante" />
                </SelectTrigger>
                <SelectContent>
                  {relationReferables.map((referable) => (
                    <SelectItem key={referable.id} value={referable.id}>
                      {`${referable.voucherNumber} — ${resolveEntityName(
                        referable.entityId
                      )}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.referencedComprobanteId?.message} />
            </div>
          )}
        />

        {selectedReferable ? (
          <div
            role="status"
            className="flex flex-col gap-1 rounded-lg bg-muted px-3 py-2 text-sm sm:col-span-2"
          >
            <p className="font-medium">
              {resolveEntityName(selectedReferable.entityId)} —{" "}
              {getOptionLabel(VOUCHER_TYPES, selectedReferable.voucherType)}{" "}
              {selectedReferable.voucherNumber}
            </p>
            <p className="text-muted-foreground">
              Total del comprobante: {formatCurrency(selectedReferable.total)}
            </p>
            <p className="text-muted-foreground">
              Créditos y retenciones aplicados:{" "}
              {formatCurrency(appliedCredit)}
            </p>
            {consumesCreditTop ? (
              <p className="text-muted-foreground">
                Tope disponible para este documento:{" "}
                {formatCurrency(availableTop)}
              </p>
            ) : (
              <p className="text-muted-foreground">
                Una nota de débito aumenta el saldo del comprobante.
              </p>
            )}
          </div>
        ) : null}

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
