"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Client } from "@/components/clientes/types";
import { getDocumentTypeOption } from "@/lib/data/document-types";

interface ClientDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

function getDocumentLabel(client: Client) {
  if (client.documentType === "SIN_DOCUMENTO") {
    return "Sin documento";
  }

  return getDocumentTypeOption(client.documentType).label;
}

export function ClientDetailModal({
  open,
  onOpenChange,
  client,
}: ClientDetailModalProps) {
  if (!client) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalle del cliente</DialogTitle>
          <DialogDescription>
            Información registrada del cliente
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailField label="Tipo de documento" value={getDocumentLabel(client)} />
          <DetailField
            label="Número de documento"
            value={client.documentType === "SIN_DOCUMENTO" ? "" : client.documentNumber}
          />
          <DetailField label="Nombre / Empresa" value={client.name} />
          <DetailField label="Dirección" value={client.address} />
          <DetailField label="Teléfono" value={client.phone} />
          <DetailField label="Contacto" value={client.contactName} />
          <DetailField
            label="Correo de facturación"
            value={client.billingEmail}
          />
          <DetailField label="Correo de gestión" value={client.managementEmail} />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cerrar
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
