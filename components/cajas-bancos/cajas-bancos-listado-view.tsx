"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCajasBancos } from "@/components/cajas-bancos/cajas-bancos-provider";
import { CashAccountModal } from "@/components/cajas-bancos/cash-account-modal";
import { CashAccountsDataTable } from "@/components/cajas-bancos/cash-accounts-data-table";
import type { CashAccount } from "@/lib/cuentas/entidades";
import type { CashAccountFormValues, CashAccountType } from "@/lib/schemas/cash-account";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

type AccountFilterValue = "ALL" | CashAccountType;

// Combobox de filtro de tipo (reemplaza a los toggles Todos/Cajas/Bancos).
const ACCOUNT_FILTER_ITEMS: { value: AccountFilterValue; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "CASH_BOX", label: "Caja" },
  { value: "BANK_ACCOUNT", label: "Banco" },
];

interface CajasBancosListadoViewProps {
  defaultType?: CashAccountType;
}

export function CajasBancosListadoView({ defaultType }: CajasBancosListadoViewProps) {
  const { accounts, isLoading, addAccount, updateAccount, removeAccount } =
    useCajasBancos();

  const [modalOpen, setModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editing, setEditing] = useState<CashAccount | null>(null);
  const [toDelete, setToDelete] = useState<CashAccount | null>(null);
  const [filterType, setFilterType] = useState<AccountFilterValue>("ALL");

  const filtered = accounts.filter((a) =>
    filterType === "ALL" ? true : a.type === filterType
  );

  const heading = defaultType
    ? defaultType === "BANK_ACCOUNT"
      ? "Bancos"
      : "Cajas"
    : "Cajas y Bancos";
  const subtitle = defaultType
    ? `Administra tus ${defaultType === "BANK_ACCOUNT" ? "cuentas bancarias" : "cajas de efectivo"}.`
    : "Administra las cajas de efectivo y las cuentas bancarias de tu negocio.";

  // Abre el modal de registro sin tipo preseleccionado ("Seleccionar") y
  // sin tocar el filtro del listado.
  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(account: CashAccount) {
    setEditing(account);
    setModalOpen(true);
  }

  async function handleSave(values: CashAccountFormValues) {
    setIsSaving(true);
    try {
      if (editing) {
        await updateAccount(editing.id, values);
        toast.success("Cuenta actualizada");
      } else {
        await addAccount(values);
        toast.success("Cuenta registrada");
      }
      setModalOpen(false);
      setEditing(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(account: CashAccount) {
    try {
      await removeAccount(account.id);
      toast.success("Cuenta eliminada");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{heading}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {/* Línea 1: filtro de tipo + registro, fuera y encima del datatable. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select
          value={filterType}
          items={ACCOUNT_FILTER_ITEMS}
          onValueChange={(value) => {
            if (value === null) return;
            setFilterType(value);
          }}
        >
          <SelectTrigger aria-label="Filtrar por tipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_FILTER_ITEMS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={openCreate}>Registrar cuenta</Button>
      </div>

      <CashAccountsDataTable
        accounts={filtered}
        isLoading={isLoading}
        onView={(a) => openEdit(a)}
        onEdit={openEdit}
        onDelete={(a) => setToDelete(a)}
      />

      <CashAccountModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setEditing(null);
        }}
        account={editing}
        onSave={handleSave}
        isSaving={isSaving}
      />

      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cuenta</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que quieres eliminar esta cuenta? Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (toDelete) {
                  void handleDelete(toDelete);
                }
                setToDelete(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}