import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { createCsv, exportRows, safeExportRows, safeSpreadsheetCell } from "./export-service";

describe("safe operational exports", () => {
  it.each(["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\tformula"])(
    "neutralizes spreadsheet formula input %s",
    (value) => expect(safeSpreadsheetCell(value)).toBe(`'${value}`),
  );

  it("preserves UTF-8 and escapes CSV quotes", () => {
    expect(createCsv([{ Name: '张 "Rui"', Team: "Network" }])).toBe(
      '"Name","Team"\n"张 ""Rui""","Network"',
    );
  });

  it("creates stable XLSX columns and supports an empty dataset", () => {
    const rows = safeExportRows([{ Name: "Peter", Status: "Active" }]);
    const sheet = XLSX.utils.json_to_sheet(rows, { header: ["Name", "Status"] });
    expect(XLSX.utils.sheet_to_json(sheet)).toEqual(rows);
    expect(createCsv([], ["Name", "Status"])).toBe('"Name","Status"');
  });

  it.each(["csv", "xlsx"] as const)(
    "does not download an empty %s product export",
    async (format) => {
      await expect(exportRows([], "empty", format, { columns: ["Name"] })).resolves.toEqual({
        exported: false,
        reason: "empty",
      });
    },
  );
});
