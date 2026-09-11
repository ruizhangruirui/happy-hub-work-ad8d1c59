export const CASE_DETAIL_TABS = [
  "Overview",
  "Tasks",
  "Workflow",
  "Communication",
  "History",
] as const;

export function normalizeCaseTab(requestedTab?: string) {
  if (requestedTab === "Checklist") return "Tasks";
  if (requestedTab === "Files") return "Overview";
  return CASE_DETAIL_TABS.includes(requestedTab as (typeof CASE_DETAIL_TABS)[number])
    ? requestedTab!
    : "Overview";
}
