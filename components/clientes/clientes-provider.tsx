"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { Client } from "@/components/clientes/types";
import type { ClientFormValues } from "@/lib/schemas/client";

interface ClientesContextValue {
  clients: Client[];
  addClient: (values: ClientFormValues) => void;
  updateClient: (id: string, values: ClientFormValues) => void;
  removeClient: (id: string) => void;
}

const ClientesContext = createContext<ClientesContextValue | null>(null);

function toClient(values: ClientFormValues): Omit<Client, "id"> {
  return {
    ...values,
    documentNumber:
      values.documentType === "SIN_DOCUMENTO" ? "" : values.documentNumber,
  };
}

export function ClientesProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);

  const addClient = useCallback((values: ClientFormValues) => {
    setClients((prev) => [
      ...prev,
      { id: crypto.randomUUID(), ...toClient(values) },
    ]);
  }, []);

  const updateClient = useCallback((id: string, values: ClientFormValues) => {
    setClients((prev) =>
      prev.map((client) =>
        client.id === id ? { ...client, ...toClient(values) } : client
      )
    );
  }, []);

  const removeClient = useCallback((id: string) => {
    setClients((prev) => prev.filter((client) => client.id !== id));
  }, []);

  const value = useMemo(
    () => ({ clients, addClient, updateClient, removeClient }),
    [clients, addClient, updateClient, removeClient]
  );

  return (
    <ClientesContext.Provider value={value}>
      {children}
    </ClientesContext.Provider>
  );
}

export function useClientes() {
  const context = useContext(ClientesContext);

  if (!context) {
    throw new Error("useClientes debe usarse dentro de un ClientesProvider");
  }

  return context;
}
