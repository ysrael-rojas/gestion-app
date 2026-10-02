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

import {
  createCashAccount,
  listCashAccounts,
  softDeleteCashAccount,
  updateCashAccount,
  type CashAccount,
  type CashAccountFormMutation,
} from "@/lib/cuentas/entidades";

interface CajasBancosContextValue {
  accounts: CashAccount[];
  isLoading: boolean;
  error: string | null;
  addAccount: (values: CashAccountFormMutation) => Promise<void>;
  updateAccount: (
    id: string,
    values: CashAccountFormMutation
  ) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const CajasBancosContext = createContext<CajasBancosContextValue | null>(null);

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

export function CajasBancosProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await listCashAccounts();
      if (!isMounted.current) {
        return;
      }
      setAccounts(data);
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

  const addAccount = useCallback(
    async (values: CashAccountFormMutation) => {
      await createCashAccount(values);
      await refresh();
    },
    [refresh]
  );

  const updateAccount = useCallback(
    async (id: string, values: CashAccountFormMutation) => {
      await updateCashAccount(id, values);
      await refresh();
    },
    [refresh]
  );

  const removeAccount = useCallback(
    async (id: string) => {
      await softDeleteCashAccount(id);
      await refresh();
    },
    [refresh]
  );

  const value = useMemo(
    () => ({
      accounts,
      isLoading,
      error,
      addAccount,
      updateAccount,
      removeAccount,
      refresh,
    }),
    [accounts, isLoading, error, addAccount, updateAccount, removeAccount, refresh]
  );

  return (
    <CajasBancosContext.Provider value={value}>
      {children}
    </CajasBancosContext.Provider>
  );
}

export function useCajasBancos() {
  const context = useContext(CajasBancosContext);
  if (!context) {
    throw new Error("useCajasBancos debe usarse dentro de un CajasBancosProvider");
  }
  return context;
}