import { describe, expect, it } from "vitest";
import { CASE_DETAIL_TABS, normalizeCaseTab } from "./case-tabs";

describe("Case detail navigation", () => {
  it("keeps Tasks and Workflow as the two process views", () => {
    expect(CASE_DETAIL_TABS).not.toContain("Checklist");
    expect(CASE_DETAIL_TABS).not.toContain("Files");
    expect(normalizeCaseTab("Tasks")).toBe("Tasks");
    expect(normalizeCaseTab("Workflow")).toBe("Workflow");
  });

  it("sends legacy Checklist links to the unified Tasks view", () => {
    expect(normalizeCaseTab("Checklist")).toBe("Tasks");
  });

  it("sends legacy Files links back to the Case overview", () => {
    expect(normalizeCaseTab("Files")).toBe("Overview");
  });

  it("falls back safely for unknown tabs", () => {
    expect(normalizeCaseTab("Unknown")).toBe("Overview");
  });
});
