"use client";

import { useCallback, useEffect, useState } from "react";

import type { Voucher, VoucherKind } from "@/components/comprobantes/types";
import { getVoucherById } from "@/lib/comprobantes/vouchers";

interface UseVoucherResult {
  voucher: Voucher | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Carga un comprobante por id para las vistas client de detalle y edición.
 * Con `voucherId` undefined (página de registro) no dispara ninguna consulta.
 */
export function useVoucher(
  voucherId: string | undefined,
  voucherKind: VoucherKind
): UseVoucherResult {
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(voucherId));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!voucherId) {
      return;
    }

    try {
      const result = await getVoucherById(voucherId, voucherKind);
      setVoucher(result);
      setError(null);
    } catch (loadError) {
      setVoucher(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar el comprobante. Intenta nuevamente."
      );
    } finally {
      setIsLoading(false);
    }
  }, [voucherId, voucherKind]);

  useEffect(() => {
    if (!voucherId) {
      return;
    }

    let isMounted = true;

    void (async () => {
      try {
        const result = await getVoucherById(voucherId, voucherKind);

        if (!isMounted) {
          return;
        }

        setVoucher(result);
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setVoucher(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudo cargar el comprobante. Intenta nuevamente."
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [voucherId, voucherKind]);

  return { voucher, isLoading, error, reload };
}
