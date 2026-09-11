import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260911170000_update_case_details.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../routes/_authenticated/cases.$caseId.tsx", import.meta.url),
  "utf8",
);

describe("editable lifecycle Case information", () => {
  it("updates Person, Employment and Case in one authorized transaction", () => {
    expect(migration).toContain("public.can_manage_case(auth.uid(),c.id)");
    expect(migration).toContain("update public.persons");
    expect(migration).toContain("update public.employments");
    expect(migration).toContain("update public.cases");
    expect(migration).toContain("Updated Case details");
  });
  it("offers one complete editor for onboarding and offboarding", () => {
    for (const field of [
      "personalEmail",
      "supervisorName",
      "startDate",
      "contractEndDate",
      "lastWorkingDay",
    ])
      expect(route).toContain(field);
  });
});
