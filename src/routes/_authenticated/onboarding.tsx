import { createFileRoute } from "@tanstack/react-router";
import { CaseList } from "@/components/workbench/CaseList";

export const Route = createFileRoute("/_authenticated/onboarding")({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s["q"] === "string" ? s["q"] : "",
    new: typeof s["new"] === "string" ? s["new"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Onboarding · Team Workbench" },
      { name: "description", content: "Active onboarding cases across your scope." },
    ],
  }),
  component: () => <CaseList caseType="onboarding" />,
});
