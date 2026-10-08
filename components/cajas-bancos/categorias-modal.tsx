"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import type { PaymentDirection } from "@/components/pagos/types";
import { createCategory } from "@/lib/caja/caja";
import { cashReceiptCategorySchema } from "@/lib/schemas/cash-receipt-category";

interface CategoriasModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

export function CategoriasModal({
  open,
  onOpenChange,
  onCreated,
}: CategoriasModalProps) {
  const [name, setName] = useState("");
  const [directionValue, setDirectionValue] = useState<
    "select" | PaymentDirection
  >("select");
  const [isSaving, setIsSaving] = useState(false);

  function resetForm() {
    setName("");
    setDirectionValue("select");
  }

  async function handleSave() {
    if (directionValue === "select") {
      return;
    }

    const parsed = cashReceiptCategorySchema.safeParse({
      direction: directionValue,
      name,
      isActive: true,
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    setIsSaving(true);
    try {
      await createCategory(parsed.data);
      await onCreated();
      toast.success("Categoría agregada.");
      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          resetForm();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar categoría</DialogTitle>
          <DialogDescription>
            Define el nombre y el tipo de movimiento de la categoría.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="category-name">Nombre</Label>
            <Input
              id="category-name"
              value={name}
              placeholder="Cobranza de venta"
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="category-direction">Tipo</Label>
            <Select
              value={directionValue}
              onValueChange={(value) => {
                if (value === "INGRESO" || value === "EGRESO" || value === "select") {
                  setDirectionValue(value);
                }
              }}
            >
              <SelectTrigger id="category-direction" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="select">Seleccionar</SelectItem>
                <SelectItem value="INGRESO">Ingresos</SelectItem>
                <SelectItem value="EGRESO">Egresos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              onOpenChange(false);
            }}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={isSaving || directionValue === "select"}
          >
            {isSaving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
