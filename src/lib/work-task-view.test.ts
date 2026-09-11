import { describe, expect, it } from "vitest";
import type { OperationsTaskReportDto } from "@/lib/types";
import { isArchivedOperationalTask, tasksForOperationalTeams } from "./work-task-view";

const task = (id: string, ownerTeam: "HR" | "IT" | "Admin", status = "Open") =>
  ({
    id,
    caseId: `case-${id}`,
    title: id,
    person: "Person",
    caseType: "Onboarding",
    ownerTeam,
    assignee: null,
    mandatory: true,
    status,
    dueDate: null,
    completedBy: null,
    completedAt: null,
  }) satisfies OperationsTaskReportDto;

describe("My Work operational task view", () => {
  it("shows only tasks belonging to the current user's operational teams", () => {
    const visible = tasksForOperationalTeams(
      [task("hr", "HR"), task("it", "IT"), task("admin", "Admin")],
      ["HR"],
    );

    expect(visible.map((item) => item.id)).toEqual(["hr"]);
  });

  it("treats completed and not-applicable tasks as archived", () => {
    expect(isArchivedOperationalTask("Completed")).toBe(true);
    expect(isArchivedOperationalTask("Not Applicable")).toBe(true);
    expect(isArchivedOperationalTask("In Progress")).toBe(false);
  });
});
