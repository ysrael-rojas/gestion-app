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
  filtersToSearchParams,
  parseListadoFilters,
  PAYMENT_STATUS_FILTER_OPTIONS,
  type ListadoFilters,
} from "@/lib/filters/listado-filters";

interface ListingsToolbarProps {
  children: ReactNode;
}

export function ListingsToolbar({ children }: ListingsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = parseListadoFilters({
    desde: searchParams.get("desde") ?? undefined,
    hasta: searchParams.get("hasta") ?? undefined,
    estado: searchParams.get("estado") ?? undefined,
  });

  const hasActiveFilters =
    filters.desde !== null ||
    filters.hasta !== null ||
    filters.estado !== DEFAULT_PAYMENT_STATUS_FILTER;

  function updateFilters(next: Partial<ListadoFilters>) {
    const merged: ListadoFilters = { ...filters, ...next };
    const query = filtersToSearchParams(merged).toString();

    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function clearFilters() {
    router.replace(pathname, { scroll: false });
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
            onChange={(event) =>
              updateFilters({ desde: event.target.value || null })
            }
          />
        </div>
        <div className="flex items-center gap-2">
          <Label>Hasta:</Label>
          <Input
            type="date"
            aria-label="Hasta"
            className="w-auto"
            value={filters.hasta ?? ""}
            onChange={(event) =>
              updateFilters({ hasta: event.target.value || null })
            }
          />
        </div>
        <div className="flex items-center gap-2">
          <Label>Estado pago:</Label>
          <Select
            value={filters.estado}
            items={PAYMENT_STATUS_FILTER_OPTIONS}
            onValueChange={(value) =>
              updateFilters({
                estado: value ?? DEFAULT_PAYMENT_STATUS_FILTER,
              })
            }
          >
            <SelectTrigger aria-label="Estado de pago">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_STATUS_FILTER_OPTIONS.map((option) => (
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
