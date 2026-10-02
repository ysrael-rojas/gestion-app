import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTablePagination } from "@/components/shared/data-table-pagination";

function makeTable(overrides: Partial<{
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  rowCount: number;
}> = {}) {
  const pageIndex = overrides.pageIndex ?? 0;
  const pageSize = overrides.pageSize ?? 10;
  const pageCount = overrides.pageCount ?? 5;
  const rowCount = overrides.rowCount ?? pageSize * pageCount;
  const canPrev = pageIndex > 0;
  const canNext = pageIndex < pageCount - 1;

  return {
    state: { pagination: { pageIndex, pageSize } },
    getPageCount: () => pageCount,
    getRowCount: () => rowCount,
    getCanPreviousPage: () => canPrev,
    getCanNextPage: () => canNext,
    previousPage: vi.fn(),
    nextPage: vi.fn(),
    setPageIndex: vi.fn(),
    setPageSize: vi.fn(),
  };
}

describe("DataTablePagination", () => {
  it("muestra el rango de filas y los totales correctamente", () => {
    const table = makeTable({ pageIndex: 0, pageSize: 10, rowCount: 53 });

    render(<DataTablePagination table={table as never} />);

    expect(screen.getByText(/Mostrando 1–10 de 53/)).toBeInTheDocument();
  });

  it("renderiza 0 cuando no hay filas", () => {
    const table = makeTable({ pageIndex: 0, pageSize: 10, rowCount: 0 });

    render(<DataTablePagination table={table as never} />);

    expect(screen.getByText(/Mostrando 0–0 de 0/)).toBeInTheDocument();
  });

  it("deshabilita Anterior en la primera página y Siguiente en la última", () => {
    const tableFirst = makeTable({ pageIndex: 0, pageCount: 3 });
    const { rerender } = render(<DataTablePagination table={tableFirst as never} />);
    expect(screen.getByRole("button", { name: /anterior/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /siguiente/i })).not.toBeDisabled();

    const tableLast = makeTable({ pageIndex: 2, pageCount: 3 });
    rerender(<DataTablePagination table={tableLast as never} />);
    expect(screen.getByRole("button", { name: /anterior/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /siguiente/i })).toBeDisabled();
  });

  it("llama a nextPage al pulsar Siguiente", async () => {
    const user = userEvent.setup();
    const table = makeTable({ pageIndex: 0, pageCount: 3 });

    render(<DataTablePagination table={table as never} />);
    await user.click(screen.getByRole("button", { name: /siguiente/i }));

    expect(table.nextPage).toHaveBeenCalledTimes(1);
  });

  it("llama a previousPage al pulsar Anterior", async () => {
    const user = userEvent.setup();
    const table = makeTable({ pageIndex: 1, pageCount: 3 });

    render(<DataTablePagination table={table as never} />);
    await user.click(screen.getByRole("button", { name: /anterior/i }));

    expect(table.previousPage).toHaveBeenCalledTimes(1);
  });

  it("renderiza un botón por cada página cuando hay 5 o menos", () => {
    const table = makeTable({ pageIndex: 0, pageCount: 4 });

    render(<DataTablePagination table={table as never} />);

    for (let i = 1; i <= 4; i++) {
      expect(screen.getByRole("button", { name: String(i) })).toBeInTheDocument();
    }
  });

  it("renderiza elipsis cuando hay más de 5 páginas", () => {
    const table = makeTable({ pageIndex: 5, pageCount: 10 });

    render(<DataTablePagination table={table as never} />);

    expect(screen.getAllByText("…").length).toBeGreaterThanOrEqual(1);
  });
});
