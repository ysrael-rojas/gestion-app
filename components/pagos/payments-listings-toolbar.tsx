"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_PAYMENT_STATUS_FILTER,
  parseListadoFilters,
  PAYMENT_RECEIPT_STATUSES,
} from "@/lib/filters/listado-filters";

const PAYMENT_RECEIPT_STATUS_OPTIONS = [
  { value: "TODOS", label: "Todos" },
  { value: "EN_REVISION", label: "En revisión" },
  { value: "PROCESADO", label: "Procesado" },
] as const;

interface PaymentsListingsToolbarProps {
  children: ReactNode;
}

export function PaymentsListingsToolbar({
  children,
}: PaymentsListingsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = parseListadoFilters(
    {
      desde: searchParams.get("desde") ?? undefined,
      hasta: searchParams.get("hasta") ?? undefined,
      estado: searchParams.get("estado") ?? undefined,
    },
    PAYMENT_RECEIPT_STATUSES
  );

  const hasActiveFilters =
    filters.desde !== null ||
    filters.hasta !== null ||
    filters.estado !== DEFAULT_PAYMENT_STATUS_FILTER;

  function updateFilter(name: "desde" | "hasta" | "estado", value: string) {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (!value || (name === "estado" && value === "TODOS")) {
      nextParams.delete(name);
    } else {
      nextParams.set(name, value);
    }

    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function clearFilters() {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("desde");
    nextParams.delete("hasta");
    nextParams.delete("estado");
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Label>Desde:</Label>
          <Input
            type="date"
            aria-label="Desde"
            className="w-auto"
            value={filters.desde ?? ""}
            onChange={(event) => updateFilter("desde", event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label>Hasta:</Label>
          <Input
            type="date"
            aria-label="Hasta"
            className="w-auto"
            value={filters.hasta ?? ""}
            onChange={(event) => updateFilter("hasta", event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label>Estado:</Label>
          <Select
            value={filters.estado}
            items={PAYMENT_RECEIPT_STATUS_OPTIONS}
            onValueChange={(value) => updateFilter("estado", value ?? "TODOS")}
          >
            <SelectTrigger aria-label="Estado del recibo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_RECEIPT_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasActiveFilters ? (
          <Button variant="ghost" onClick={clearFilters}>
            <X />
            Limpiar filtros
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
