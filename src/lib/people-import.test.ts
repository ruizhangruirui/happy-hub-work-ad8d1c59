import { describe, expect, it } from "vitest";
import { normalizePeopleImportRows } from "./people-import";

describe("People import normalization", () => {
  it("accepts English and Chinese headers", () => {
    expect(
      normalizePeopleImportRows([
        { 名: "Rui", 姓: "Zhang", 用工类型: "Employee", 入职日期: "2026/09/01", 工号: "E-1" },
      ]),
    ).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        givenName: "Rui",
        familyName: "Zhang",
        employmentType: "Employee",
        startDate: "2026-09-01",
        employeeId: "E-1",
      }),
    ]);
  });

  it("rejects incomplete rows before upload", () => {
    expect(() => normalizePeopleImportRows([{ "First Name": "Rui" }])).toThrow(/required/);
  });
});
