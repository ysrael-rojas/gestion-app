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

import type { Purchase } from "@/components/compras/types";
import {
  createPurchaseRecord,
  listPurchases,
  updatePurchaseRecord,
} from "@/lib/comprobantes/compras";
import type { PurchaseFormValues } from "@/lib/schemas/purchase";

interface ComprasContextValue {
  purchases: Purchase[];
  isLoading: boolean;
  error: string | null;
  addPurchase: (values: PurchaseFormValues) => Promise<void>;
  updatePurchase: (id: string, values: PurchaseFormValues) => Promise<void>;
  refresh: () => Promise<void>;
}

const ComprasContext = createContext<ComprasContextValue | null>(null);

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

export function ComprasProvider({ children }: { children: React.ReactNode }) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await listPurchases();

      if (!isMounted.current) {
        return;
      }

      setPurchases(data);
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
    isMounted.current = true;

    void (async () => {
      await refresh();
    })();

    return () => {
      isMounted.current = false;
    };
  }, [refresh]);

  const addPurchase = useCallback(
    async (values: PurchaseFormValues) => {
      await createPurchaseRecord(values);
      await refresh();
    },
    [refresh]
  );

  const updatePurchase = useCallback(
    async (id: string, values: PurchaseFormValues) => {
      await updatePurchaseRecord(id, values);
      await refresh();
    },
    [refresh]
  );

  const value = useMemo(
    () => ({
      purchases,
      isLoading,
      error,
      addPurchase,
      updatePurchase,
      refresh,
    }),
    [purchases, isLoading, error, addPurchase, updatePurchase, refresh]
  );

  return (
    <ComprasContext.Provider value={value}>{children}</ComprasContext.Provider>
  );
}

export function useCompras() {
  const context = useContext(ComprasContext);

  if (!context) {
    throw new Error("useCompras debe usarse dentro de un ComprasProvider");
  }

  return context;
}