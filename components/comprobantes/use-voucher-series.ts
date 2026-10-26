"use client";

import { useCallback, useEffect, useState } from "react";

import { listSeries, type VoucherSeries } from "@/lib/comprobantes/series";

interface UseVoucherSeriesResult {
  series: VoucherSeries[];
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No se pudieron cargar las series. Intenta nuevamente.";
}

/**
 * Carga las series del owner para la configuración y para la sugerencia de
 * numeración del formulario de ventas (SPEC 44).
 */
export function useVoucherSeries(): UseVoucherSeriesResult {
  const [series, setSeries] = useState<VoucherSeries[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await listSeries();
      setSeries(data);
      setError(null);
    } catch (loadError) {
      setSeries([]);
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const data = await listSeries();

        if (!isMounted) {
          return;
        }

        setSeries(data);
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setSeries([]);
        setError(getErrorMessage(loadError));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return { series, isLoading, error, reload };
}
