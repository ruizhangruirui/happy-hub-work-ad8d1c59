import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Team Workbench · Onboarding & Offboarding Operations" },
      {
        name: "description",
        content:
          "Team Workbench — internal operations console for onboarding/offboarding cases, tasks, email templates and access control.",
      },
      { property: "og:title", content: "Team Workbench" },
      {
        property: "og:description",
        content: "Internal operations console for onboarding & offboarding case management.",
      },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/work" });
  },
});
