"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { ClientForm } from "@/components/clientes/client-form";
import type { Client } from "@/components/clientes/types";
import type { ClientFormValues } from "@/lib/schemas/client";

interface ClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  onSave: (values: ClientFormValues) => void;
}

export function ClientModal({
  open,
  onOpenChange,
  client,
  onSave,
}: ClientModalProps) {
  const isEditing = client !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar cliente" : "Registrar cliente"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modifica los datos del cliente"
              : "Completa los datos para registrar un nuevo cliente"}
          </DialogDescription>
        </DialogHeader>
        <ClientForm
          client={client}
          onSubmit={onSave}
          submitLabel={isEditing ? "Guardar cambios" : "Registrar cliente"}
        />
      </DialogContent>
    </Dialog>
  );
}
