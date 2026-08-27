import * as XLSX from "xlsx";

export type ExportCell = string | number | boolean | null | undefined;
export type ExportRow = Record<string, ExportCell>;

function safeName(value: string) {
  return (
    value
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "export"
  );
}
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRows(rows: ExportRow[], name: string, format: "csv" | "xlsx") {
  const filename = safeName(name);
  if (format === "csv") {
    const headers = rows.length ? Object.keys(rows[0]!) : [];
    const csv = [headers, ...rows.map((row) => headers.map((key) => row[key] ?? ""))]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    download(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
    return;
  }
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Team Workbench");
  XLSX.writeFile(book, `${filename}.xlsx`, { compression: true });
}
