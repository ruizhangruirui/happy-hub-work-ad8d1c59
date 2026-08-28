import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getOperationsOverviewFn,
  getWorkbenchDataFn,
  toggleTaskFn,
} from "@/lib/workbench.functions";
import type { OperationsOverviewDto, OperationsTaskReportDto } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { businessDate } from "@/lib/domain";
import { exportRows } from "@/lib/export-service";
import { opErrorMessage } from "@/lib/errors";
import { Badge, Empty, Icon, Loading } from "@/components/workbench/ui";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/work")({
  head: () => ({
    meta: [
      { title: "Operations Overview · Team Workbench" },
      { name: "description", content: "Scope-safe people, Case and Task operations overview." },
    ],
  }),
  component: WorkPage,
});

type TaskSort = "dueDate" | "status" | "ownerTeam" | "assignee";
const emptyFilters = {
  team: "",
  employmentType: "",
  caseType: "",
  status: "",
  dateFrom: "",
  dateTo: "",
};

export function WorkPage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getOperationsOverviewFn);
  const fetchWorkbench = useServerFn(getWorkbenchDataFn);
  const toggleTask = useServerFn(toggleTaskFn);
  const [filters, setFilters] = useState(emptyFilters);
  const [taskSort, setTaskSort] = useState<TaskSort>("dueDate");
  const [taskAscending, setTaskAscending] = useState(true);
  const [taskView, setTaskView] = useState<"all" | "mandatory" | "overdue-mandatory">("all");

  const { data: overviewData, isLoading } = useQuery({
    queryKey: ["operations-overview", filters],
    queryFn: () => fetchOverview({ data: filters }),
  });
  const { data: workbenchData } = useQuery({
    queryKey: ["workbench"],
    queryFn: () => fetchWorkbench(),
  });
  const overview = overviewData && !("error" in overviewData) ? overviewData : null;
  const workbench = workbenchData && !("error" in workbenchData) ? workbenchData : null;

  const sortedTasks = useMemo(() => {
    if (!overview) return [];
    return overview.tasks
      .filter(
        (task) =>
          taskView === "all" ||
          (task.mandatory &&
            ["Not Started", "Open", "In Progress", "Waiting", "Blocked"].includes(task.status) &&
            (taskView === "mandatory" ||
              Boolean(task.dueDate && task.dueDate < overview.businessDate))),
      )
      .sort(
        (a, b) =>
          String(a[taskSort] ?? "9999").localeCompare(String(b[taskSort] ?? "9999")) *
          (taskAscending ? 1 : -1),
      );
  }, [overview, taskAscending, taskSort, taskView]);

  if (isLoading) return <Loading />;
  if (!overview) return <Empty icon="alert" title={t("Something went wrong. Please try again.")} />;

  const teams = workbench?.teams.map((team) => team.name).sort() ?? [];
  const statuses = [...new Set(workbench?.cases.map((item) => item.status) ?? [])].sort();
  const updateFilter = (key: keyof typeof filters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const openCase = (caseId: string) =>
    navigate({ to: "/cases/$caseId", params: { caseId }, search: {} });
  const setTaskSortKey = (key: TaskSort) => {
    if (taskSort === key) setTaskAscending((value) => !value);
    else {
      setTaskSort(key);
      setTaskAscending(true);
    }
  };
  const taskExportRows = (rows: OperationsTaskReportDto[]) =>
    rows.map((task) => ({
      Task: task.title,
      Person: task.person,
      "Case Type": task.caseType,
      "Owner Team": task.ownerTeam,
      Assignee: task.assignee,
      Mandatory: task.mandatory ? "Yes" : "No",
      Status: task.status,
      "Due Date": task.dueDate,
      "Completed By": task.completedBy,
      "Completed At": task.completedAt,
    }));
  const exportTasks = async (scope: "current-view" | "all", format: "csv" | "xlsx") => {
    const source =
      scope === "current-view"
        ? sortedTasks
        : await fetchOverview({ data: emptyFilters }).then((result) =>
            "error" in result ? [] : result.tasks,
          );
    const result = exportRows(taskExportRows(source), `tasks-${scope}-${businessDate()}`, format, {
      sheetName: "Operational Tasks",
      columns: [
        "Task",
        "Person",
        "Case Type",
        "Owner Team",
        "Assignee",
        "Mandatory",
        "Status",
        "Due Date",
        "Completed By",
        "Completed At",
      ],
    });
    if (!result.exported) toast.info(t("No records to export."));
  };
  const completeTask = async (id: string) => {
    const result = await toggleTask({ data: { taskId: id, complete: true } });
    if ("error" in result) toast.error(opErrorMessage(t, result.error));
    else {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["operations-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["workbench"] }),
      ]);
    }
  };

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="eyebrow">
            {t(overview.reportingMode === "hr" ? "OPERATIONS OVERVIEW" : "OPERATIONAL WORK")}
          </p>
          <h1>
            {t(
              overview.reportingMode === "hr"
                ? "What needs attention and what is coming next"
                : "Your authorized team tasks",
            )}
          </h1>
          <p>
            {t("Business date")}: {fmtDate(overview.businessDate, lang)}
          </p>
        </div>
        {overview.reportingMode === "hr" ? (
          <div className="actions">
            <button
              className="primary"
              onClick={() => navigate({ to: "/onboarding", search: { q: "", new: "1" } })}
            >
              <Icon name="plus" /> {t("New Onboarding")}
            </button>
            <button
              className="secondary"
              onClick={() =>
                navigate({ to: "/email", search: { caseId: "", taskId: "", templateId: "" } })
              }
            >
              <Icon name="mail" /> {t("Compose Email")}
            </button>
          </div>
        ) : null}
      </div>

      <div className="filterbar">
        <select value={filters.team} onChange={(event) => updateFilter("team", event.target.value)}>
          <option value="">{t("All Teams")}</option>
          {teams.map((team) => (
            <option key={team}>{team}</option>
          ))}
        </select>
        <select
          value={filters.employmentType}
          onChange={(event) => updateFilter("employmentType", event.target.value)}
        >
          <option value="">{t("All Types")}</option>
          {["Employee", "Intern", "Leased Labour"].map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
        <select
          value={filters.caseType}
          onChange={(event) => updateFilter("caseType", event.target.value)}
        >
          <option value="">{t("All Case Types")}</option>
          <option value="Onboarding">{t("Onboarding")}</option>
          <option value="Offboarding">{t("Offboarding")}</option>
        </select>
        <select
          value={filters.status}
          onChange={(event) => updateFilter("status", event.target.value)}
        >
          <option value="">{t("All Status")}</option>
          {statuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
        <label>
          <span>
            {t(
              filters.caseType === "Onboarding"
                ? "Start Date From"
                : filters.caseType === "Offboarding"
                  ? "Leaving Date From"
                  : "Operational Date From",
            )}
          </span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => updateFilter("dateFrom", event.target.value)}
          />
        </label>
        <label>
          <span>
            {t(
              filters.caseType === "Onboarding"
                ? "Start Date To"
                : filters.caseType === "Offboarding"
                  ? "Leaving Date To"
                  : "Operational Date To",
            )}
          </span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => updateFilter("dateTo", event.target.value)}
          />
        </label>
        {Object.values(filters).some(Boolean) ? (
          <button className="clear" onClick={() => setFilters(emptyFilters)}>
            <Icon name="x" /> {t("Clear")}
          </button>
        ) : null}
      </div>

      <div className="rosterstats">
        {(overview.reportingMode === "hr"
          ? ([
              ["Active People", overview.metrics.activePeople],
              ["Pre-boarding", overview.metrics.preboarding],
              ["Leaving", overview.metrics.leaving],
              ["Joined YTD", overview.metrics.joinedYtd],
              ["Left YTD", overview.metrics.leftYtd],
              ["Open Mandatory Tasks", overview.metrics.openMandatoryTasks],
              ["Overdue Mandatory Tasks", overview.metrics.overdueMandatoryTasks],
            ] as const)
          : ([
              ["Open Mandatory Tasks", overview.metrics.openMandatoryTasks],
              ["Overdue Mandatory Tasks", overview.metrics.overdueMandatoryTasks],
            ] as const)
        ).map(([label, value]) => (
          <button
            className="statcard"
            key={label}
            onClick={() => {
              if (label === "Open Mandatory Tasks") setTaskView("mandatory");
              if (label === "Overdue Mandatory Tasks") setTaskView("overdue-mandatory");
              if (label.includes("Mandatory"))
                document
                  .getElementById("operational-tasks")
                  ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <span>{t(label)}</span>
            <strong>{value}</strong>
          </button>
        ))}
      </div>

      {overview.reportingMode === "hr" ? (
        <div className="dashboard threecol">
          <OverviewPanel
            title={t("Cases Requiring Attention")}
            count={overview.attentionCases.length}
          >
            {overview.attentionCases.length ? (
              overview.attentionCases.map((item) => (
                <button
                  className="event"
                  key={item.caseId}
                  onClick={() =>
                    navigate({
                      to: "/cases/$caseId",
                      params: { caseId: item.caseId },
                      search: {
                        tab: item.taskId ? "Tasks" : "Overview",
                        taskId: item.taskId ?? "",
                      },
                    })
                  }
                >
                  <span>
                    <b>{item.name}</b>
                    <small>{t(item.reason)}</small>
                  </span>
                  <Badge>{t(item.severity)}</Badge>
                </button>
              ))
            ) : (
              <div className="inlineempty">{t("No cases require attention.")}</div>
            )}
          </OverviewPanel>
          <OverviewPanel
            title={t("Upcoming Joiners")}
            count={overview.upcomingJoiners.length}
            action={() => navigate({ to: "/onboarding", search: { q: "", new: "" } })}
          >
            {overview.upcomingJoiners.map((item) => (
              <button className="event" key={item.caseId} onClick={() => openCase(item.caseId)}>
                <span>
                  <b>{item.name}</b>
                  <small>
                    {item.team} · {fmtDate(item.startDate, lang)} · {item.mandatoryCompleted}/
                    {item.mandatoryTotal}
                  </small>
                </span>
                {item.overdueTasks ? <Badge>{`${item.overdueTasks} overdue`}</Badge> : null}
              </button>
            ))}
          </OverviewPanel>
          <OverviewPanel
            title={t("Upcoming Leavers")}
            count={overview.upcomingLeavers.length}
            action={() =>
              navigate({
                to: "/offboarding",
                search: { q: "", new: "", personId: "", employmentId: "" },
              })
            }
          >
            {overview.upcomingLeavers.map((item) => (
              <button className="event" key={item.caseId} onClick={() => openCase(item.caseId)}>
                <span>
                  <b>{item.name}</b>
                  <small>
                    LWD:{" "}
                    {item.lastWorkingDay ? fmtDate(item.lastWorkingDay, lang) : t("Not confirmed")}{" "}
                    · {t("Contract End")}: {fmtDate(item.contractEndDate, lang)}
                  </small>
                </span>
                <Badge>{item.status}</Badge>
              </button>
            ))}
          </OverviewPanel>
        </div>
      ) : null}

      <section id="operational-tasks" className="panel" style={{ marginTop: 22 }}>
        <div className="panelhead">
          <b>{t("HR / IT / Admin Workload")}</b>
          <small>{t("Due Soon means due within 14 days")}</small>
        </div>
        <div className="casetable">
          <div className="row head">
            <span>{t("Owner Team")}</span>
            <span>{t("Open")}</span>
            <span>{t("Overdue")}</span>
            <span>{t("Due Soon")}</span>
            <span>{t("Unassigned")}</span>
            <span />
            <span />
            <span />
          </div>
          {overview.taskWorkload.map((row) => (
            <div className="row" key={row.ownerTeam}>
              <b>{row.ownerTeam}</b>
              <span>{row.open}</span>
              <span>{row.overdue}</span>
              <span>{row.dueSoon}</span>
              <span>{row.unassigned}</span>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      </section>

      {overview.reportingMode === "hr" ? (
        <div className="dashboard analyticsgrid">
          <DistributionChart
            title={t("Active People by Employment Type")}
            data={overview.activeByEmploymentType}
            color="#4968db"
          />
          <DistributionChart
            title={t("Active People by Team")}
            data={overview.activeByTeam}
            color="#4f9b78"
          />
        </div>
      ) : null}
      {overview.reportingMode === "hr" ? (
        <section className="panel" style={{ marginTop: 22 }}>
          <div className="panelhead">
            <b>{t("Join / Leave Trend")}</b>
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={overview.monthlyLifecycleTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line dataKey="joined" stroke="#4968db" />
                <Line dataKey="left" stroke="#d56a63" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      <section className="panel" style={{ marginTop: 22 }}>
        <div className="panelhead">
          <b>{t("Operational Tasks")}</b>
          {taskView !== "all" ? (
            <button className="clear" onClick={() => setTaskView("all")}>
              <Icon name="x" /> {t("Clear Task View")}
            </button>
          ) : null}
          <div className="actions">
            <button className="secondary" onClick={() => void exportTasks("current-view", "csv")}>
              {t("Export Current View")} CSV
            </button>
            <button className="secondary" onClick={() => void exportTasks("current-view", "xlsx")}>
              {t("Export Current View")} XLSX
            </button>
            <button className="secondary" onClick={() => void exportTasks("all", "xlsx")}>
              {t("Export All")} XLSX
            </button>
          </div>
        </div>
        {sortedTasks.length ? (
          <div className="rosterpanel">
            <table className="rostertable">
              <thead>
                <tr>
                  <th>{t("Task")}</th>
                  <th>{t("Person")}</th>
                  <SortHeader
                    label={t("Owner Team")}
                    field="ownerTeam"
                    current={taskSort}
                    ascending={taskAscending}
                    select={setTaskSortKey}
                  />
                  <SortHeader
                    label={t("Assignee")}
                    field="assignee"
                    current={taskSort}
                    ascending={taskAscending}
                    select={setTaskSortKey}
                  />
                  <SortHeader
                    label={t("Status")}
                    field="status"
                    current={taskSort}
                    ascending={taskAscending}
                    select={setTaskSortKey}
                  />
                  <SortHeader
                    label={t("Due Date")}
                    field="dueDate"
                    current={taskSort}
                    ascending={taskAscending}
                    select={setTaskSortKey}
                  />
                  <th />
                </tr>
              </thead>
              <tbody>
                {sortedTasks.map((task) => {
                  const operationalTask = workbench?.tasks.find((item) => item.id === task.id);
                  return (
                    <tr key={task.id} onClick={() => openCase(task.caseId)}>
                      <td>
                        <b>{task.title}</b>
                        <br />
                        <small>{task.caseType}</small>
                      </td>
                      <td>{task.person}</td>
                      <td>{task.ownerTeam}</td>
                      <td>{task.assignee || t("Unassigned")}</td>
                      <td>
                        <Badge>{task.status}</Badge>
                      </td>
                      <td>{fmtDate(task.dueDate, lang)}</td>
                      <td>
                        {operationalTask?.canEdit &&
                        !["Completed", "Not Applicable"].includes(task.status) ? (
                          <button
                            className="secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              void completeTask(task.id);
                            }}
                          >
                            {t("Mark Done")}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="inlineempty">{t("No tasks match the current filters.")}</div>
        )}
      </section>
    </div>
  );
}

function OverviewPanel({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action?: () => void;
  children: React.ReactNode;
}) {
  const { t } = useLang();
  return (
    <section className="panel">
      <div className="panelhead">
        <b>{title}</b>
        <Badge>{String(count)}</Badge>
        {action ? (
          <button className="clear" onClick={action}>
            {t("View All")}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function DistributionChart({
  title,
  data,
  color,
}: {
  title: string;
  data: Array<{ name: string; value: number }>;
  color: string;
}) {
  return (
    <section className="panel">
      <div className="panelhead">
        <b>{title}</b>
      </div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" fill={color} radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function SortHeader({
  label,
  field,
  current,
  ascending,
  select,
}: {
  label: string;
  field: TaskSort;
  current: TaskSort;
  ascending: boolean;
  select: (field: TaskSort) => void;
}) {
  return (
    <th>
      <button className="textbutton" onClick={() => select(field)}>
        {label} {current === field ? (ascending ? "↑" : "↓") : ""}
      </button>
    </th>
  );
}
