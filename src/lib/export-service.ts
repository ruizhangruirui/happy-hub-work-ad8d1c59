import * as XLSX from "xlsx";

export type ExportCell = string | number | boolean | null | undefined;
export type ExportRow = Record<string, ExportCell>;
export interface ExportOptions {
  columns?: string[];
  sheetName?: string;
}
export type ExportResult = { exported: true } | { exported: false; reason: "empty" };

function safeName(value: string) {
  return (
    value
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "export"
  );
}

export function safeSpreadsheetCell(value: ExportCell): ExportCell {
  if (typeof value !== "string") return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function safeExportRows(rows: ExportRow[]): ExportRow[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, safeSpreadsheetCell(value)]),
    ),
  );
}

export function createCsv(rows: ExportRow[], columns?: string[]): string {
  const safeRows = safeExportRows(rows);
  const headers = columns ?? (safeRows.length ? Object.keys(safeRows[0]!) : []);
  return [headers, ...safeRows.map((row) => headers.map((key) => row[key] ?? ""))]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportRows(
  rows: ExportRow[],
  name: string,
  format: "csv" | "xlsx",
  options: ExportOptions = {},
): ExportResult {
  if (!rows.length) return { exported: false, reason: "empty" };
  const filename = safeName(name);
  if (format === "csv") {
    download(
      new Blob(["\uFEFF", createCsv(rows, options.columns)], { type: "text/csv;charset=utf-8" }),
      `${filename}.csv`,
    );
    return { exported: true };
  }
  const safeRows = safeExportRows(rows);
  const sheet = safeRows.length
    ? XLSX.utils.json_to_sheet(safeRows, options.columns ? { header: options.columns } : undefined)
    : XLSX.utils.aoa_to_sheet(options.columns ? [options.columns] : []);
  const headers = options.columns ?? (safeRows.length ? Object.keys(safeRows[0]!) : []);
  sheet["!cols"] = headers.map((header) => ({
    wch: Math.min(
      40,
      Math.max(header.length + 2, ...safeRows.map((row) => String(row[header] ?? "").length + 2)),
    ),
  }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, (options.sheetName || "Team Workbench").slice(0, 31));
  XLSX.writeFile(book, `${filename}.xlsx`, { compression: true });
  return { exported: true };
}
