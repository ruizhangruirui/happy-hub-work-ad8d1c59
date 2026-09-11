import type { OperationsTaskReportDto } from "@/lib/types";

const ARCHIVED_STATUSES = new Set(["Completed", "Not Applicable"]);

export function tasksForOperationalTeams(
  tasks: OperationsTaskReportDto[],
  operationalTeams: Array<"HR" | "IT" | "Admin">,
) {
  const allowed = new Set(operationalTeams);
  return tasks.filter((task) => allowed.has(task.ownerTeam));
}

export function isArchivedOperationalTask(status: string) {
  return ARCHIVED_STATUSES.has(status);
}
