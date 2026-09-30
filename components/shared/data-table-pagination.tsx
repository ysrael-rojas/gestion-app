"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "cn";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const PAGE_SIZE_ITEMS = PAGE_SIZE_OPTIONS.map((size) => ({
  value: String(size),
  label: String(size),
}));

const MAX_PAGES_WITHOUT_ELLIPSIS = 5;

/**
 * Subconjunto de la instancia TanStack Table que necesita el paginador, para
 * que el componente sirva a tablas con distintos feature sets (ventas, compras).
 */
interface PaginatedTable {
  state: {
    pagination: {
      pageIndex: number;
      pageSize: number;
    };
  };
  getPageCount: () => number;
  getRowCount: () => number;
  getCanPreviousPage: () => boolean;
  getCanNextPage: () => boolean;
  previousPage: () => void;
  nextPage: () => void;
  setPageIndex: (index: number) => void;
  setPageSize: (size: number) => void;
}

interface DataTablePaginationProps {
  table: PaginatedTable;
}

function getPageItems(
  pageIndex: number,
  pageCount: number
): Array<number | "ellipsis"> {
  if (pageCount <= MAX_PAGES_WITHOUT_ELLIPSIS) {
    return Array.from({ length: pageCount }, (_, index) => index);
  }

  const pages = new Set<number>([
    0,
    pageCount - 1,
    pageIndex - 1,
    pageIndex,
    pageIndex + 1,
  ]);

  const visiblePages = Array.from(pages)
    .filter((page) => page >= 0 && page < pageCount)
    .sort((a, b) => a - b);

  const items: Array<number | "ellipsis"> = [];
  let previous = -1;

  for (const page of visiblePages) {
    if (previous !== -1 && page - previous > 1) {
      items.push("ellipsis");
    }

    items.push(page);
    previous = page;
  }

  return items;
}

export function DataTablePagination({ table }: DataTablePaginationProps) {
  const { pageIndex, pageSize } = table.state.pagination;
  const pageCount = table.getPageCount();
  const total = table.getRowCount();

  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, total);

  function handlePageSizeChange(value: string | null) {
    if (!value) {
      return;
    }

    table.setPageSize(Number(value));
    table.setPageIndex(0);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Filas por página</span>
        <Select
          value={String(pageSize)}
          items={PAGE_SIZE_ITEMS}
          onValueChange={handlePageSizeChange}
        >
          <SelectTrigger aria-label="Filas por página" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_ITEMS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>
          Mostrando {from}–{to} de {total}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Anterior
        </Button>

        {getPageItems(pageIndex, pageCount).map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="px-1 text-sm text-muted-foreground"
            >
              …
              <span className="sr-only">Más páginas</span>
            </span>
          ) : (
            <Button
              key={item}
              variant={item === pageIndex ? "outline" : "ghost"}
              size="icon-sm"
              aria-current={item === pageIndex ? "page" : undefined}
              className={cn(item === pageIndex && "font-semibold")}
              onClick={() => table.setPageIndex(item)}
            >
              {item + 1}
            </Button>
          )
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
