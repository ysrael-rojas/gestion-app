"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { Client } from "@/components/clientes/types";
import {
  createClientRecord,
  listClients,
  softDeleteClient,
  updateClientRecord,
} from "@/lib/clientes/entidades";
import type { ClientFormValues } from "@/lib/schemas/client";

interface ClientesContextValue {
  clients: Client[];
  isLoading: boolean;
  error: string | null;
  addClient: (values: ClientFormValues) => Promise<void>;
  updateClient: (id: string, values: ClientFormValues) => Promise<void>;
  removeClient: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const ClientesContext = createContext<ClientesContextValue | null>(null);

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

export function ClientesProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await listClients();

      if (!isMounted.current) {
        return;
      }

      setClients(data);
      setError(null);
    } catch (err) {
      if (!isMounted.current) {
        return;
      }

      setError(getErrorMessage(err));
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addClient = useCallback(
    async (values: ClientFormValues) => {
      await createClientRecord(values);
      await refresh();
    },
    [refresh]
  );

  const updateClient = useCallback(
    async (id: string, values: ClientFormValues) => {
      await updateClientRecord(id, values);
      await refresh();
    },
    [refresh]
  );

  const removeClient = useCallback(
    async (id: string) => {
      await softDeleteClient(id);
      await refresh();
    },
    [refresh]
  );

  const value = useMemo(
    () => ({
      clients,
      isLoading,
      error,
      addClient,
      updateClient,
      removeClient,
      refresh,
    }),
    [clients, isLoading, error, addClient, updateClient, removeClient, refresh]
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
