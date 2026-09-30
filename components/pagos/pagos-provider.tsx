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
import { toast } from "sonner";

import type { CarteraResumen } from "@/components/cartera/types";
import { useCompras } from "@/components/compras/compras-provider";
import type {
  AllocationInput,
  Payment,
  PaymentDetail,
} from "@/components/pagos/types";
import { useVentas } from "@/components/ventas/ventas-provider";
import { getCarteraResumen } from "@/lib/pagos/cartera";
import {
  addAllocations,
  createPayment,
  listPayments,
  voidPayment,
} from "@/lib/pagos/pagos";
import type { PaymentFormValues } from "@/lib/schemas/payment";

interface PagosContextValue {
  payments: Payment[];
  isLoading: boolean;
  error: string | null;
  summary: CarteraResumen | null;
  isSummaryLoading: boolean;
  addPayment: (values: PaymentFormValues) => Promise<PaymentDetail>;
  assignAllocations: (
    paymentId: string,
    items: AllocationInput[]
  ) => Promise<void>;
  annulPayment: (id: string, reason: string) => Promise<void>;
  refresh: () => Promise<void>;
  refreshSummary: () => Promise<void>;
}

const PagosContext = createContext<PagosContextValue | null>(null);

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

export function PagosProvider({ children }: { children: React.ReactNode }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CarteraResumen | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const isMounted = useRef(true);
  const { refresh: refreshSales } = useVentas();
  const { refresh: refreshPurchases } = useCompras();

  const refresh = useCallback(async () => {
    try {
      const [incomes, expenses] = await Promise.all([
        listPayments("INGRESO"),
        listPayments("EGRESO"),
      ]);

      if (!isMounted.current) {
        return;
      }

      setPayments([...incomes, ...expenses]);
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

  const refreshSummary = useCallback(async () => {
    try {
      const resumen = await getCarteraResumen();

      if (!isMounted.current) {
        return;
      }

      setSummary(resumen);
    } catch (err) {
      if (isMounted.current) {
        toast.error(getErrorMessage(err));
      }
    } finally {
      if (isMounted.current) {
        setIsSummaryLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;

    void (async () => {
      await Promise.all([refresh(), refreshSummary()]);
    })();

    return () => {
      isMounted.current = false;
    };
  }, [refresh, refreshSummary]);

  const addPayment = useCallback(
    async (values: PaymentFormValues) => {
      const detail = await createPayment(values);
      await Promise.all([
        refresh(),
        refreshSummary(),
        refreshSales(),
        refreshPurchases(),
      ]);
      return detail;
    },
    [refresh, refreshSummary, refreshSales, refreshPurchases]
  );

  const assignAllocations = useCallback(
    async (paymentId: string, items: AllocationInput[]) => {
      await addAllocations(paymentId, items);
      await Promise.all([
        refresh(),
        refreshSummary(),
        refreshSales(),
        refreshPurchases(),
      ]);
    },
    [refresh, refreshSummary, refreshSales, refreshPurchases]
  );

  const annulPayment = useCallback(
    async (id: string, reason: string) => {
      await voidPayment(id, reason);
      await Promise.all([
        refresh(),
        refreshSummary(),
        refreshSales(),
        refreshPurchases(),
      ]);
    },
    [refresh, refreshSummary, refreshSales, refreshPurchases]
  );

  const value = useMemo(
    () => ({
      payments,
      isLoading,
      error,
      summary,
      isSummaryLoading,
      addPayment,
      assignAllocations,
      annulPayment,
      refresh,
      refreshSummary,
    }),
    [
      payments,
      isLoading,
      error,
      summary,
      isSummaryLoading,
      addPayment,
      assignAllocations,
      annulPayment,
      refresh,
      refreshSummary,
    ]
  );

  return (
    <PagosContext.Provider value={value}>{children}</PagosContext.Provider>
  );
}

export function usePagos() {
  const context = useContext(PagosContext);

  if (!context) {
    throw new Error("usePagos debe usarse dentro de un PagosProvider");
  }

  return context;
}
