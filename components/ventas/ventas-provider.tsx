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

import type { Sale } from "@/components/ventas/types";
import {
  createSaleRecord,
  listSales,
  updateSaleRecord,
} from "@/lib/comprobantes/comprobantes";
import type { SaleFormValues } from "@/lib/schemas/sale";

interface VentasContextValue {
  sales: Sale[];
  isLoading: boolean;
  error: string | null;
  addSale: (values: SaleFormValues) => Promise<void>;
  updateSale: (id: string, values: SaleFormValues) => Promise<void>;
  refresh: () => Promise<void>;
}

const VentasContext = createContext<VentasContextValue | null>(null);

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

export function VentasProvider({ children }: { children: React.ReactNode }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await listSales();

      if (!isMounted.current) {
        return;
      }

      setSales(data);
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

  const addSale = useCallback(
    async (values: SaleFormValues) => {
      await createSaleRecord(values);
      await refresh();
    },
    [refresh]
  );

  const updateSale = useCallback(
    async (id: string, values: SaleFormValues) => {
      await updateSaleRecord(id, values);
      await refresh();
    },
    [refresh]
  );

  const value = useMemo(
    () => ({
      sales,
      isLoading,
      error,
      addSale,
      updateSale,
      refresh,
    }),
    [sales, isLoading, error, addSale, updateSale, refresh]
  );

  return (
    <VentasContext.Provider value={value}>{children}</VentasContext.Provider>
  );
}

export function useVentas() {
  const context = useContext(VentasContext);

  if (!context) {
    throw new Error("useVentas debe usarse dentro de un VentasProvider");
  }

  return context;
}
