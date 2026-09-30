"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CarteraBucket } from "@/components/cartera/types";
import { useClientes } from "@/components/clientes/clientes-provider";
import { usePagos } from "@/components/pagos/pagos-provider";
import type { VoucherBalance } from "@/components/pagos/types";
import { listOpenVouchers } from "@/lib/pagos/cartera";
import { isOverdue } from "@/lib/pagos/saldos";
import { formatCurrency, formatDate, getTodayLocalDate } from "@/lib/utils";

const OVERDUE_PREVIEW_LIMIT = 5;

type BucketKey =
  | "receivable"
  | "payable"
  | "unassignedReceipts"
  | "unassignedPayments";

interface CarteraCardConfig {
  key: BucketKey;
  title: string;
  href: string;
  linkLabel: string;
}

const CARDS: CarteraCardConfig[] = [
  {
    key: "receivable",
    title: "Por cobrar",
    href: "/pagos/ingresos?filtro=pendientes",
    linkLabel: "Ver pendientes",
  },
  {
    key: "payable",
    title: "Por pagar",
    href: "/pagos/egresos?filtro=pendientes",
    linkLabel: "Ver pendientes",
  },
  {
    key: "unassignedReceipts",
    title: "Recibos sin asignar",
    href: "/pagos/ingresos?filtro=sin-asignar",
    linkLabel: "Ver sin asignar",
  },
  {
    key: "unassignedPayments",
    title: "Pagos sin asignar",
    href: "/pagos/egresos?filtro=sin-asignar",
    linkLabel: "Ver sin asignar",
  },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No se pudo cargar los comprobantes vencidos. Intenta nuevamente.";
}

interface CarteraCardProps {
  config: CarteraCardConfig;
  bucket: CarteraBucket;
  isLoading: boolean;
}

function CarteraCard({ config, bucket, isLoading }: CarteraCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{config.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-4 w-24" />
          </>
        ) : (
          <>
            <p className="text-2xl font-semibold">
              {formatCurrency(bucket.amount)}
            </p>
            <p className="text-sm text-muted-foreground">
              {bucket.count} {bucket.count === 1 ? "documento" : "documentos"}
            </p>
            {bucket.overdueCount > 0 ? (
              <p className="text-sm text-destructive">
                Vencidas: {bucket.overdueCount} ·{" "}
                {formatCurrency(bucket.overdueAmount)}
              </p>
            ) : null}
            <Link
              href={config.href}
              className="text-sm font-medium text-primary hover:underline"
            >
              {config.linkLabel}
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface OverdueListProps {
  title: string;
  href: string;
  vouchers: VoucherBalance[];
  clients: { id: string; name: string }[];
  isLoading: boolean;
}

function OverdueList({
  title,
  href,
  vouchers,
  clients,
  isLoading,
}: OverdueListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : vouchers.length ? (
          <ul className="flex flex-col gap-2">
            {vouchers.map((voucher) => (
              <li
                key={voucher.comprobanteId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {voucher.voucherNumber}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {clients.find((client) => client.id === voucher.entityId)
                      ?.name ?? "Entidad no encontrada"}{" "}
                    · vence{" "}
                    {voucher.effectiveDueDate
                      ? formatDate(voucher.effectiveDueDate)
                      : "—"}
                  </p>
                </div>
                <span className="shrink-0 font-medium">
                  {formatCurrency(voucher.balance)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sin comprobantes vencidos
          </p>
        )}
        <Link
          href={href}
          className="text-sm font-medium text-primary hover:underline"
        >
          Ver vencidas
        </Link>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { summary, isSummaryLoading } = usePagos();
  const { clients } = useClientes();
  const [today] = useState(() => getTodayLocalDate());
  const [vouchers, setVouchers] = useState<{
    receivable: VoucherBalance[];
    payable: VoucherBalance[];
  } | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([listOpenVouchers("INGRESO"), listOpenVouchers("EGRESO")])
      .then(([receivable, payable]) => {
        if (active) {
          setVouchers({ receivable, payable });
        }
      })
      .catch((error) => {
        if (active) {
          toast.error(getErrorMessage(error));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const overdueReceivable = useMemo(
    () =>
      (vouchers?.receivable ?? [])
        .filter((voucher) =>
          isOverdue(voucher.effectiveDueDate, voucher.balance, today)
        )
        .slice(0, OVERDUE_PREVIEW_LIMIT),
    [vouchers, today]
  );

  const overduePayable = useMemo(
    () =>
      (vouchers?.payable ?? [])
        .filter((voucher) =>
          isOverdue(voucher.effectiveDueDate, voucher.balance, today)
        )
        .slice(0, OVERDUE_PREVIEW_LIMIT),
    [vouchers, today]
  );

  const emptyBucket: CarteraBucket = {
    count: 0,
    amount: 0,
    overdueCount: 0,
    overdueAmount: 0,
  };

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Resumen de cartera</h1>
        <p className="text-sm text-muted-foreground">
          Estado de cuentas por cobrar y por pagar
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((config) => (
          <CarteraCard
            key={config.key}
            config={config}
            bucket={summary?.[config.key] ?? emptyBucket}
            isLoading={isSummaryLoading}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OverdueList
          title="Comprobantes vencidos por cobrar"
          href="/pagos/ingresos?filtro=vencidas"
          vouchers={overdueReceivable}
          clients={clients}
          isLoading={vouchers === null}
        />
        <OverdueList
          title="Comprobantes vencidos por pagar"
          href="/pagos/egresos?filtro=vencidas"
          vouchers={overduePayable}
          clients={clients}
          isLoading={vouchers === null}
        />
      </div>
    </main>
  );
}
