import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260911143000_people_active_ending_only.sql",
    import.meta.url,
  ),
  "utf8",
);
const peoplePage = readFileSync(
  new URL("../routes/_authenticated/people.tsx", import.meta.url),
  "utf8",
);

describe("People current-workforce status contract", () => {
  it("returns only Active and Ending employments", () => {
    expect(migration).toContain("ee.effective_status in ('active', 'ending')");
    expect(peoplePage).toContain('["active", "ending"]');
    expect(peoplePage).not.toContain('["planned", "active", "ending", "ended"]');
  });

  it("keeps a contract visible on its end date and ends it the next day", () => {
    expect(migration).toContain("coalesce(offboarding.contract_end_date, e.end_date) < _as_of");
  });
});
