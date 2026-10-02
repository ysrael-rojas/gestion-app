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
  const [filterType, setFilterType] = useState<"ALL" | CashAccountType>("ALL");

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

  function openCreate(type: CashAccountType = "CASH_BOX") {
    setEditing(null);
    setModalOpen(true);
    setFilterType(type);
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border">
            <Button
              variant={filterType === "ALL" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterType("ALL")}
            >
              Todos
            </Button>
            <Button
              variant={filterType === "CASH_BOX" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterType("CASH_BOX")}
            >
              Cajas
            </Button>
            <Button
              variant={filterType === "BANK_ACCOUNT" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterType("BANK_ACCOUNT")}
            >
              Bancos
            </Button>
          </div>
          {!defaultType || defaultType === "CASH_BOX" ? (
            <Button onClick={() => openCreate("CASH_BOX")}>
              Registrar caja
            </Button>
          ) : null}
          {!defaultType || defaultType === "BANK_ACCOUNT" ? (
            <Button onClick={() => openCreate("BANK_ACCOUNT")}>
              Registrar banco
            </Button>
          ) : null}
        </div>
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
        defaultType={editing ? editing.type : filterType === "ALL" ? (defaultType ?? "CASH_BOX") : filterType}
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