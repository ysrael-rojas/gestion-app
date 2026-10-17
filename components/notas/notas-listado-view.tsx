"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useClientes } from "@/components/clientes/clientes-provider";
import type { Client } from "@/components/clientes/types";
import { useCompras } from "@/components/compras/compras-provider";
import { NotaModal } from "@/components/notas/nota-modal";
import { NotasDataTable } from "@/components/notas/notas-data-table";
import { ReferablePickerModal } from "@/components/notas/referable-picker-modal";
import type { Nota, ReferableComprobante } from "@/components/notas/types";
import { useVentas } from "@/components/ventas/ventas-provider";
import { listSuppliers } from "@/lib/clientes/entidades";
import {
  createNotaRecord,
  listNotas,
  listReferableComprobantes,
  updateNotaRecord,
} from "@/lib/comprobantes/notas";
import type { AdjustmentVoucherType } from "@/lib/data/nota-options";
import type { NotaFormValues } from "@/lib/schemas/nota";

interface NotasListadoViewProps {
  voucherType: AdjustmentVoucherType;
}

interface NotasViewTexts {
  title: string;
  subtitle: string;
  register: string;
}

const VIEW_TEXTS: Record<AdjustmentVoucherType, NotasViewTexts> = {
  NOTA_CREDITO: {
    title: "Notas de crédito",
    subtitle: "Registra y administra tus notas de crédito emitidas y recibidas",
    register: "Registrar nota de crédito",
  },
  NOTA_DEBITO: {
    title: "Notas de débito",
    subtitle: "Registra y administra tus notas de débito emitidas y recibidas",
    register: "Registrar nota de débito",
  },
  COMPROBANTE_RETENCION: {
    title: "Retenciones",
    subtitle:
      "Registra los comprobantes de retención que emiten tus clientes",
    register: "Registrar retención",
  },
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

export function NotasListadoView({ voucherType }: NotasListadoViewProps) {
  const { clients } = useClientes();
  const { refresh: refreshVentas } = useVentas();
  const { refresh: refreshCompras } = useCompras();

  const [notas, setNotas] = useState<Nota[]>([]);
  const [referables, setReferables] = useState<ReferableComprobante[]>([]);
  const [suppliers, setSuppliers] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingNota, setEditingNota] = useState<Nota | null>(null);
  const [selectedReferable, setSelectedReferable] =
    useState<ReferableComprobante | null>(null);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const [notasData, ventaReferables, compraReferables, suppliersData] =
          await Promise.all([
            listNotas(voucherType),
            listReferableComprobantes("VENTA"),
            listReferableComprobantes("COMPRA"),
            listSuppliers(),
          ]);

        if (!isMounted) {
          return;
        }

        setNotas(notasData);
        setReferables([...ventaReferables, ...compraReferables]);
        setSuppliers(suppliersData);
        setError(null);
      } catch (err) {
        if (!isMounted) {
          return;
        }

        setError(getErrorMessage(err));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [voucherType]);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const refreshNotas = useCallback(async () => {
    const [notasData, ventaReferables, compraReferables] = await Promise.all([
      listNotas(voucherType),
      listReferableComprobantes("VENTA"),
      listReferableComprobantes("COMPRA"),
    ]);

    setNotas(notasData);
    setReferables([...ventaReferables, ...compraReferables]);
  }, [voucherType]);

  const entityNames = useMemo(() => {
    const names = new Map<string, string>();

    for (const entity of [...clients, ...suppliers]) {
      names.set(entity.id, entity.name);
    }

    return names;
  }, [clients, suppliers]);

  const resolveEntityName = useCallback(
    (entityId: string) =>
      entityNames.get(entityId) ?? "Cliente / proveedor no encontrado",
    [entityNames]
  );

  function openCreate() {
    setEditingNota(null);
    setSelectedReferable(null);
    setPickerOpen(true);
  }

  const openEdit = useCallback((nota: Nota) => {
    setEditingNota(nota);
    setSelectedReferable(null);
    setModalOpen(true);
  }, []);

  const handleSelectReferable = useCallback(
    (referable: ReferableComprobante) => {
      setSelectedReferable(referable);
      setPickerOpen(false);
      setModalOpen(true);
    },
    []
  );

  // Al editar, el referenciado se busca en la lista; si ya no está, la ficha
  // se arma con los datos guardados en la nota.
  const editingReferable = editingNota
    ? referables.find(
        (referable) => referable.id === editingNota.referencedId
      ) ?? null
    : null;
  const activeReferable = editingNota ? editingReferable : selectedReferable;

  async function handleSave(values: NotaFormValues) {
    try {
      const saved = editingNota
        ? await updateNotaRecord(editingNota.id, values)
        : await createNotaRecord(values);

      toast.success(
        editingNota ? "Documento actualizado" : "Documento registrado"
      );
      setModalOpen(false);
      setEditingNota(null);
      setSelectedReferable(null);
      await refreshNotas();

      if (saved.voucherKind === "VENTA") {
        await refreshVentas();
      } else {
        await refreshCompras();
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  const texts = VIEW_TEXTS[voucherType];

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{texts.title}</h1>
          <p className="text-sm text-muted-foreground">{texts.subtitle}</p>
        </div>
        <Button onClick={openCreate}>{texts.register}</Button>
      </div>

      <NotasDataTable
        voucherType={voucherType}
        notas={notas}
        resolveEntityName={resolveEntityName}
        isLoading={isLoading}
        onEdit={openEdit}
      />

      <NotaModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setEditingNota(null);
            setSelectedReferable(null);
          }
        }}
        voucherType={voucherType}
        nota={editingNota}
        referable={activeReferable}
        resolveEntityName={resolveEntityName}
        onSave={handleSave}
      />

      <ReferablePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        voucherType={voucherType}
        referables={referables}
        resolveEntityName={resolveEntityName}
        onSelect={handleSelectReferable}
      />
    </main>
  );
}
