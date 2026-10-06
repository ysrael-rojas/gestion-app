// Utilidades mínimas de exportación CSV (SPEC 19). Sin dependencias externas.

export type CsvValue = string | number | null | undefined;

function escapeCell(value: CsvValue): string {
  const text = value === null || value === undefined ? "" : String(value);
  // Escapa comillas dobles y envuelve si el valor contiene separadores.
  if (/[",\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
