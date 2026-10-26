"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VoucherType } from "@/components/comprobantes/types";
import {
  createSeries,
  updateSeries,
  type VoucherSeries,
} from "@/lib/comprobantes/series";
import { SERIES_VOUCHER_TYPES } from "@/lib/data/series-options";
import {
  serieFormSchema,
  type SerieFormInput,
  type SerieFormValues,
} from "@/lib/schemas/serie";

interface SerieModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serie: VoucherSeries | null;
  onSaved: () => Promise<void>;
}

const SERIE_FORM_ID = "serie-form";

const typeItems = SERIES_VOUCHER_TYPES.map((option) => ({
  value: option.value,
  label: option.label,
}));

function createEmptyValues(): SerieFormInput {
  return {
    voucherType: "" as VoucherType,
    code: "",
    isDefault: false,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
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

export function SerieModal({
  open,
  onOpenChange,
  serie,
  onSaved,
}: SerieModalProps) {
  const isEditing = serie !== null;
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<SerieFormInput, unknown, SerieFormValues>({
    resolver: zodResolver(serieFormSchema),
    defaultValues: createEmptyValues(),
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset(
      serie
        ? {
            voucherType: serie.voucherType,
            code: serie.code,
            isDefault: serie.isDefault,
          }
        : createEmptyValues()
    );
  }, [form, open, serie]);

  async function handleSubmit(values: SerieFormValues) {
    setIsSaving(true);

    try {
      if (serie) {
        await updateSeries(serie.id, values);
        toast.success("Serie actualizada");
      } else {
        await createSeries(values);
        toast.success("Serie agregada");
      }

      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    void form.handleSubmit(handleSubmit)(event);
  }

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar serie" : "Agregar serie"}
          </DialogTitle>
          <DialogDescription>
            Define el código de serie y si es la que se sugiere por defecto para
            ese tipo de comprobante.
          </DialogDescription>
        </DialogHeader>

        <form id={SERIE_FORM_ID} onSubmit={handleFormSubmit}>
          <div className="flex flex-col gap-4">
            <Controller
              control={form.control}
              name="voucherType"
              render={({ field }) => (
                <div className="flex flex-col gap-2">
                  <RequiredLabel htmlFor="serie-voucher-type">
                    Tipo de comprobante
                  </RequiredLabel>
                  <Select
                    value={field.value ? field.value : null}
                    items={typeItems}
                    onValueChange={(value) =>
                      field.onChange(value ?? ("" as VoucherType))
                    }
                  >
                    <SelectTrigger
                      id="serie-voucher-type"
                      className="w-full"
                      aria-invalid={!!errors.voucherType}
                    >
                      <SelectValue placeholder="Selecciona un tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERIES_VOUCHER_TYPES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={errors.voucherType?.message} />
                </div>
              )}
            />

            <div className="flex flex-col gap-2">
              <RequiredLabel htmlFor="serie-code">Serie</RequiredLabel>
              <Controller
                control={form.control}
                name="code"
                render={({ field }) => (
                  <Input
                    id="serie-code"
                    value={field.value}
                    placeholder="F001"
                    maxLength={4}
                    autoFocus
                    aria-invalid={!!errors.code}
                    onChange={(event) =>
                      field.onChange(event.target.value.toUpperCase())
                    }
                  />
                )}
              />
              {errors.code ? (
                <FieldError message={errors.code.message} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  De 1 a 4 caracteres alfanuméricos. El correlativo se sugiere
                  automáticamente al registrar ventas.
                </p>
              )}
            </div>

            <Controller
              control={form.control}
              name="isDefault"
              render={({ field }) => (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="serie-is-default"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked)}
                  />
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="serie-is-default">
                      Usar como serie por defecto para este tipo
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Solo puede haber una serie por defecto por tipo de
                      comprobante.
                    </p>
                  </div>
                </div>
              )}
            />
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form={SERIE_FORM_ID} disabled={isSaving}>
            {isSaving
              ? "Guardando…"
              : isEditing
                ? "Guardar cambios"
                : "Agregar serie"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
