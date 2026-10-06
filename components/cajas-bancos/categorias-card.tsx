"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createCategory,
  listCategories,
  updateCategory,
} from "@/lib/caja/caja";
import { cashReceiptCategorySchema } from "@/lib/schemas/cash-receipt-category";
import type {
  CashReceiptCategory,
  PaymentDirection,
} from "@/components/pagos/types";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

export function CategoriasCard() {
  const [direction, setDirection] = useState<PaymentDirection>("INGRESO");
  const [categories, setCategories] = useState<CashReceiptCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  async function reload(current: PaymentDirection) {
    const data = await listCategories(current, false);
    setCategories(data);
  }

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      setIsLoading(true);
      try {
        const data = await listCategories(direction, false);
        if (isMounted) {
          setCategories(data);
        }
      } catch (error) {
        if (isMounted) {
          toast.error(getErrorMessage(error));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [direction]);

  async function handleCreate() {
    const parsed = cashReceiptCategorySchema.safeParse({
      direction,
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
      await reload(direction);
      setName("");
      toast.success("Categoría agregada");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggle(category: CashReceiptCategory) {
    try {
      await updateCategory(category.id, { isActive: !category.isActive });
      await reload(direction);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function handleRename(category: CashReceiptCategory) {
    if (!editingName.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }

    try {
      await updateCategory(category.id, { name: editingName.trim() });
      await reload(direction);
      setEditingId(null);
      setEditingName("");
      toast.success("Categoría actualizada");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <Card className="bg-muted/30 ring-0">
      <CardHeader>
        <CardTitle>Categorías de recibos</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-1">
          <Button
            variant={direction === "INGRESO" ? "default" : "ghost"}
            size="sm"
            onClick={() => setDirection("INGRESO")}
          >
            Ingresos
          </Button>
          <Button
            variant={direction === "EGRESO" ? "default" : "ghost"}
            size="sm"
            onClick={() => setDirection("EGRESO")}
          >
            Egresos
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="flex flex-col divide-y rounded-md border bg-background">
            {categories.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                No hay categorías registradas.
              </p>
            ) : (
              categories.map((category) => (
                <div
                  key={category.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3"
                >
                  <Badge
                    variant={category.isActive ? "outline" : "destructive"}
                  >
                    {category.isActive ? "Activa" : "Inactiva"}
                  </Badge>

                  {editingId === category.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        className="h-8 w-48"
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Guardar"
                        onClick={() => void handleRename(category)}
                      >
                        <Check />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Cancelar"
                        onClick={() => {
                          setEditingId(null);
                          setEditingName("");
                        }}
                      >
                        <X />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium">{category.name}</span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Editar"
                        onClick={() => {
                          setEditingId(category.id);
                          setEditingName(category.name);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleToggle(category)}
                      >
                        {category.isActive ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="categoryName">
              Nueva categoría
            </label>
            <Input
              id="categoryName"
              value={name}
              placeholder="Cobranza de venta"
              className="w-64"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button onClick={() => void handleCreate()} disabled={isSaving}>
            <Plus />
            Agregar categoría
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
