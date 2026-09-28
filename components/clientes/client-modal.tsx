"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

import { CLIENT_FORM_ID, ClientForm } from "@/components/clientes/client-form";
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
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <Card className="ring-0">
          <CardHeader>
            <DialogTitle>
              {isEditing ? "Editar cliente" : "Registrar cliente"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Modifica los datos del cliente"
                : "Completa los datos para registrar un nuevo cliente"}
            </DialogDescription>
          </CardHeader>
          <CardContent>
            <ClientForm client={client} onSubmit={onSave} />
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" form={CLIENT_FORM_ID}>
              {isEditing ? "Guardar cambios" : "Registrar"}
            </Button>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
