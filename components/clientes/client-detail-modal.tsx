"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <Card className="ring-0">
          <CardHeader>
            <DialogTitle>Detalle del cliente</DialogTitle>
            <DialogDescription>
              Información registrada del cliente
            </DialogDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Card className="bg-muted/30 ring-0">
              <CardHeader>
                <CardTitle>Datos del documento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DetailField
                    label="Tipo de documento"
                    value={getDocumentLabel(client)}
                  />
                  <DetailField
                    label="Número de documento"
                    value={
                      client.documentType === "SIN_DOCUMENTO"
                        ? ""
                        : client.documentNumber
                    }
                  />
                  <div className="sm:col-span-2">
                    <DetailField label="Nombre / Empresa" value={client.name} />
                  </div>
                  <div className="sm:col-span-2">
                    <DetailField label="Dirección" value={client.address} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted/30 ring-0">
              <CardHeader>
                <CardTitle>Datos de contacto</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DetailField label="Teléfono" value={client.phone} />
                  <DetailField label="Contacto" value={client.contactName} />
                  <div className="sm:col-span-2">
                    <DetailField
                      label="Correo de facturación"
                      value={client.billingEmail}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <DetailField
                      label="Correo de gestión"
                      value={client.managementEmail}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </CardContent>
          <CardFooter className="justify-end">
            <DialogClose render={<Button variant="outline" />}>
              Cerrar
            </DialogClose>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
