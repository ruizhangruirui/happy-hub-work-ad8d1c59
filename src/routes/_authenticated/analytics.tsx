import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense } from "react";
import { Empty, Loading } from "@/components/workbench/ui";
import { getOperationsOverviewFn } from "@/lib/workbench.functions";
import { useLang } from "@/lib/i18n";

const OperationsCharts = lazy(() => import("@/components/workbench/OperationsCharts"));

const analyticsScope = {
  team: "",
  employmentType: "",
  caseType: "",
  status: "",
  dateFrom: "",
  dateTo: "",
};

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "People Analytics · Team Workbench" },
      {
        name: "description",
        content: "Workforce composition and join / leave trends.",
      },
    ],
  }),
  component: PeopleAnalyticsPage,
});

function PeopleAnalyticsPage() {
  const { t } = useLang();
  const fetchOverview = useServerFn(getOperationsOverviewFn);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["people-analytics"],
    queryFn: () => fetchOverview({ data: analyticsScope }),
  });

  if (isLoading) return <Loading />;
  if (isError)
    return (
      <Empty
        icon="alert"
        title={t("People analytics could not be loaded.")}
        action={t("Try again")}
        onAction={() => void refetch()}
      />
    );
  if (!data || "error" in data)
    return <Empty icon="lock" title={t("People analytics could not be loaded.")} />;
  if (data.reportingMode !== "hr")
    return <Empty icon="lock" title={t("People analytics is available to HR operations only.")} />;

  return (
    <div className="analyticspage">
      <div className="pagehead">
        <div>
          <p className="eyebrow">{t("WORKFORCE ANALYTICS")}</p>
          <h1>{t("People Analytics")}</h1>
          <p>{t("Workforce composition and join / leave trends")}</p>
        </div>
      </div>

      <Suspense fallback={<div className="inlineempty">{t("Loading analytics…")}</div>}>
        <OperationsCharts
          employmentTitle={t("Active People by Employment Type")}
          teamTitle={t("Active People by Team")}
          trendTitle={t("Join / Leave Trend")}
          employment={data.activeByEmploymentType}
          teams={data.activeByTeam}
          trend={data.monthlyLifecycleTrend}
        />
      </Suspense>
    </div>
  );
}
