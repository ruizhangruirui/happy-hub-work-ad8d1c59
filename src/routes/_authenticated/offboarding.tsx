import { createFileRoute } from "@tanstack/react-router";
import { CaseList } from "@/components/workbench/CaseList";

export const Route = createFileRoute("/_authenticated/offboarding")({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s["q"] === "string" ? s["q"] : "",
    new: typeof s["new"] === "string" ? s["new"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Offboarding · Team Workbench" },
      { name: "description", content: "Active offboarding cases across your scope." },
    ],
  }),
  component: () => <CaseList caseType="offboarding" />,
});
