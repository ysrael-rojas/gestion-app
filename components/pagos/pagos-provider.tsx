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

import type {
  AllocationInput,
  Payment,
  PaymentDetail,
} from "@/components/pagos/types";
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
  addPayment: (values: PaymentFormValues) => Promise<PaymentDetail>;
  assignAllocations: (
    paymentId: string,
    items: AllocationInput[]
  ) => Promise<void>;
  annulPayment: (id: string, reason: string) => Promise<void>;
  refresh: () => Promise<void>;
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
  const isMounted = useRef(true);

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

  useEffect(() => {
    isMounted.current = true;

    void (async () => {
      await refresh();
    })();

    return () => {
      isMounted.current = false;
    };
  }, [refresh]);

  const addPayment = useCallback(
    async (values: PaymentFormValues) => {
      const detail = await createPayment(values);
      await refresh();
      return detail;
    },
    [refresh]
  );

  const assignAllocations = useCallback(
    async (paymentId: string, items: AllocationInput[]) => {
      await addAllocations(paymentId, items);
      await refresh();
    },
    [refresh]
  );

  const annulPayment = useCallback(
    async (id: string, reason: string) => {
      await voidPayment(id, reason);
      await refresh();
    },
    [refresh]
  );

  const value = useMemo(
    () => ({
      payments,
      isLoading,
      error,
      addPayment,
      assignAllocations,
      annulPayment,
      refresh,
    }),
    [
      payments,
      isLoading,
      error,
      addPayment,
      assignAllocations,
      annulPayment,
      refresh,
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
