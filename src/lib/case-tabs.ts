export const CASE_DETAIL_TABS = [
  "Overview",
  "Tasks",
  "Workflow",
  "Communication",
  "Files",
  "History",
] as const;

export function normalizeCaseTab(requestedTab?: string) {
  if (requestedTab === "Checklist") return "Tasks";
  return CASE_DETAIL_TABS.includes(requestedTab as (typeof CASE_DETAIL_TABS)[number])
    ? requestedTab!
    : "Overview";
}
