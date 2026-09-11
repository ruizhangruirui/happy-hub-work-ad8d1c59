import { describe, expect, it } from "vitest";
import { CASE_DETAIL_TABS, normalizeCaseTab } from "./case-tabs";

describe("Case detail navigation", () => {
  it("keeps Tasks and Workflow as the two process views", () => {
    expect(CASE_DETAIL_TABS).not.toContain("Checklist");
    expect(normalizeCaseTab("Tasks")).toBe("Tasks");
    expect(normalizeCaseTab("Workflow")).toBe("Workflow");
  });

  it("sends legacy Checklist links to the unified Tasks view", () => {
    expect(normalizeCaseTab("Checklist")).toBe("Tasks");
  });

  it("falls back safely for unknown tabs", () => {
    expect(normalizeCaseTab("Unknown")).toBe("Overview");
  });
});
