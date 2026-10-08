"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { CategoriasDataTable } from "@/components/cajas-bancos/categorias-data-table";
import { CategoriasModal } from "@/components/cajas-bancos/categorias-modal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CashReceiptCategory } from "@/components/pagos/types";
import { listCategories, updateCategory } from "@/lib/caja/caja";

type CategoryStatusFilter = "all" | "active" | "inactive";

const STATUS_FILTER_ITEMS = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activa" },
  { value: "inactive", label: "Inactiva" },
] as const;

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

export function CategoriasCard() {
  const [categories, setCategories] = useState<CashReceiptCategory[]>([]);
  const [statusFilter, setStatusFilter] =
    useState<CategoryStatusFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const reload = useCallback(async () => {
    const data = await listCategories(undefined, false);
    setCategories(data);
  }, []);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      setIsLoading(true);
      try {
        const data = await listCategories(undefined, false);
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
  }, []);

  const filteredCategories = useMemo(
    () =>
      categories.filter((category) => {
        if (statusFilter === "active") {
          return category.isActive;
        }
        if (statusFilter === "inactive") {
          return !category.isActive;
        }
        return true;
      }),
    [categories, statusFilter]
  );

  const handleRename = useCallback(
    async (category: CashReceiptCategory, name: string) => {
      if (!name.trim()) {
        toast.error("El nombre es obligatorio.");
        return;
      }

      try {
        await updateCategory(category.id, { name: name.trim() });
        await reload();
        toast.success("Categoría actualizada.");
      } catch (error) {
        toast.error(getErrorMessage(error));
      }
    },
    [reload]
  );

  const handleToggle = useCallback(
    async (category: CashReceiptCategory) => {
      try {
        await updateCategory(category.id, { isActive: !category.isActive });
        await reload();
      } catch (error) {
        toast.error(getErrorMessage(error));
      }
    },
    [reload]
  );

  return (
    <Card className="bg-muted/30 ring-0">
      <CardHeader>
        <CardTitle>Categorías de recibos</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Select
            value={statusFilter}
            items={STATUS_FILTER_ITEMS}
            onValueChange={(value) => {
              if (value === "all" || value === "active" || value === "inactive") {
                setStatusFilter(value);
              }
            }}
          >
            <SelectTrigger aria-label="Filtrar por estado" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_ITEMS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus />
            Agregar categoría
          </Button>
        </div>

        <CategoriasDataTable
          categories={filteredCategories}
          isLoading={isLoading}
          onRename={(category, name) => void handleRename(category, name)}
          onToggle={(category) => void handleToggle(category)}
        />

        <CategoriasModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          onCreated={reload}
        />
      </CardContent>
    </Card>
  );
}
