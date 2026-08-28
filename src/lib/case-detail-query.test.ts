import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync(new URL("./workbench.server.ts", import.meta.url), "utf8");

describe("Case Detail PostgREST relationship contract", () => {
  it("selects the Case employment through the canonical employment_id foreign key", () => {
    expect(server).toContain("employments!cases_employment_id_fkey(company_email,workload)");
    expect(server).not.toContain(")), employments(company_email,workload)");
  });
});
