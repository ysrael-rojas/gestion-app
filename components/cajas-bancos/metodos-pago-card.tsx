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
  createPaymentMethod,
  listPaymentMethods,
  updatePaymentMethod,
} from "@/lib/caja/caja";
import { paymentMethodSchema } from "@/lib/schemas/payment-method";
import type { PaymentMethodRef } from "@/components/pagos/types";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

export function MetodosPagoCard() {
  const [methods, setMethods] = useState<PaymentMethodRef[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  async function reload() {
    const data = await listPaymentMethods(false);
    setMethods(data);
  }

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const data = await listPaymentMethods(false);
        if (isMounted) {
          setMethods(data);
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

  async function handleCreate() {
    const parsed = paymentMethodSchema.safeParse({ code, name, isActive: true });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    setIsSaving(true);
    try {
      await createPaymentMethod(parsed.data);
      await reload();
      setCode("");
      setName("");
      toast.success("Método agregado");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggle(method: PaymentMethodRef) {
    try {
      await updatePaymentMethod(method.id, { isActive: !method.isActive });
      await reload();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function handleRename(method: PaymentMethodRef) {
    if (!editingName.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }

    try {
      await updatePaymentMethod(method.id, { name: editingName.trim() });
      await reload();
      setEditingId(null);
      setEditingName("");
      toast.success("Método actualizado");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <Card className="bg-muted/30 ring-0">
      <CardHeader>
        <CardTitle>Métodos de pago</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="flex flex-col divide-y rounded-md border bg-background">
            {methods.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                No hay métodos registrados.
              </p>
            ) : (
              methods.map((method) => (
                <div
                  key={method.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={method.isActive ? "outline" : "destructive"}>
                      {method.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {method.code}
                    </span>
                  </div>

                  {editingId === method.id ? (
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
                        onClick={() => void handleRename(method)}
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
                      <span className="text-sm font-medium">{method.name}</span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Editar"
                        onClick={() => {
                          setEditingId(method.id);
                          setEditingName(method.name);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleToggle(method)}
                      >
                        {method.isActive ? "Desactivar" : "Activar"}
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
            <label className="text-xs text-muted-foreground" htmlFor="methodCode">
              Código
            </label>
            <Input
              id="methodCode"
              value={code}
              placeholder="EFECTIVO"
              className="w-40"
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="methodName">
              Nombre
            </label>
            <Input
              id="methodName"
              value={name}
              placeholder="Efectivo"
              className="w-48"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button onClick={() => void handleCreate()} disabled={isSaving}>
            <Plus />
            Agregar método
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
