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
import type { OperationsOverviewDto, OperationsTaskReportDto, WorkbenchData } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { fmtDate, functionalTeamLabel } from "@/lib/format";
import { businessDate } from "@/lib/domain";
import { exportRows } from "@/lib/export-service";
import { opErrorMessage } from "@/lib/errors";
import { Badge, Empty, Icon, Loading } from "@/components/workbench/ui";
import { isArchivedOperationalTask, tasksForOperationalTeams } from "@/lib/work-task-view";

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
  const [taskSort, setTaskSort] = useState<TaskSort>("dueDate");
  const [taskAscending, setTaskAscending] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [locallyCompletedTaskIds, setLocallyCompletedTaskIds] = useState<string[]>([]);

  const {
    data: overviewData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["operations-overview", emptyFilters],
    queryFn: () => fetchOverview({ data: emptyFilters }),
  });
  const { data: workbenchData } = useQuery({
    queryKey: ["workbench"],
    queryFn: () => fetchWorkbench(),
  });
  const overview = overviewData && !("error" in overviewData) ? overviewData : null;
  const workbench =
    workbenchData && !("error" in workbenchData) ? (workbenchData as WorkbenchData) : null;

  const sortedTasks = useMemo(() => {
    if (!overview || !workbench) return [];
    return tasksForOperationalTeams(overview.tasks, workbench.currentUser.operationalTeams)
      .filter(
        (task) =>
          !isArchivedOperationalTask(task.status) && !locallyCompletedTaskIds.includes(task.id),
      )
      .sort(
        (a, b) =>
          String(a[taskSort] ?? "9999").localeCompare(String(b[taskSort] ?? "9999")) *
          (taskAscending ? 1 : -1),
      );
  }, [locallyCompletedTaskIds, overview, taskAscending, taskSort, workbench]);

  const archivedTasks = useMemo(() => {
    if (!overview || !workbench) return [];
    return tasksForOperationalTeams(overview.tasks, workbench.currentUser.operationalTeams)
      .filter(
        (task) =>
          isArchivedOperationalTask(task.status) || locallyCompletedTaskIds.includes(task.id),
      )
      .sort((a, b) => String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? "")));
  }, [locallyCompletedTaskIds, overview, workbench]);

  if (isLoading) return <Loading />;
  if (isError)
    return (
      <Empty
        icon="alert"
        title={t("Operations overview could not be loaded.")}
        action={t("Try again")}
        onAction={() => void refetch()}
      />
    );
  if (!overview) return <Empty icon="alert" title={t("Something went wrong. Please try again.")} />;

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
    const result = await exportRows(
      taskExportRows(source),
      `tasks-${scope}-${businessDate()}`,
      format,
      {
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
      },
    );
    if (!result.exported) toast.info(t("No records to export."));
  };
  const completeTask = async (id: string) => {
    if (busyTaskId) return;
    setBusyTaskId(id);
    setLocallyCompletedTaskIds((current) => [...new Set([...current, id])]);
    try {
      const result = await toggleTask({ data: { taskId: id, complete: true } });
      if ("error" in result) {
        setLocallyCompletedTaskIds((current) => current.filter((taskId) => taskId !== id));
        toast.error(opErrorMessage(t, result.error));
      } else {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["operations-overview"] }),
          queryClient.invalidateQueries({ queryKey: ["workbench"] }),
        ]);
        toast.success(t("Task completed"));
      }
    } catch {
      setLocallyCompletedTaskIds((current) => current.filter((taskId) => taskId !== id));
      toast.error(t("Something went wrong. Please try again."));
    } finally {
      setBusyTaskId(null);
    }
  };

  return (
    <div>
      <div className="pagehead">
        <div>
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

      {overview.reportingMode === "hr" ? (
        <div className="attentionoverview">
          <OverviewPanel
            title={t("Cases Requiring Attention")}
            count={overview.attentionCases.length}
          >
            <div className="attentionlist">
              {overview.attentionCases.length ? (
                overview.attentionCases.map((item) => (
                  <button
                    className="event attentionevent"
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
                    <span className="attentioncopy">
                      <b>{item.name}</b>
                      <small>{t(item.reason)}</small>
                    </span>
                    <Badge>{t(item.severity)}</Badge>
                  </button>
                ))
              ) : (
                <div className="inlineempty">{t("No cases require attention.")}</div>
              )}
            </div>
          </OverviewPanel>
        </div>
      ) : null}

      <section id="operational-tasks" className="panel" style={{ marginTop: 22 }}>
        <div className="panelhead">
          <div>
            <b>{t("My Operational Tasks")}</b>
            <small className="panelhint">
              {t("Only tasks for your functional team are shown.")}
            </small>
          </div>
          <details className="toolmenu">
            <summary>{t("Export")}</summary>
            <div>
              <button onClick={() => void exportTasks("current-view", "csv")}>
                {t("Export Current View")} · CSV
              </button>
              <button onClick={() => void exportTasks("current-view", "xlsx")}>
                {t("Export Current View")} · XLSX
              </button>
              <button onClick={() => void exportTasks("all", "xlsx")}>
                {t("Export All")} · XLSX
              </button>
            </div>
          </details>
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
                      <td>{t(functionalTeamLabel(task.ownerTeam))}</td>
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
                            disabled={busyTaskId !== null}
                            onClick={(event) => {
                              event.stopPropagation();
                              void completeTask(task.id);
                            }}
                          >
                            {busyTaskId === task.id ? t("Saving…") : t("Mark Done")}
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
          <div className="inlineempty">{t("No open tasks match the current filters.")}</div>
        )}
        {archivedTasks.length ? (
          <details className="taskarchive">
            <summary>
              {t("Completed & archived")} <Badge>{String(archivedTasks.length)}</Badge>
            </summary>
            <div className="taskarchivelist">
              {archivedTasks.map((task) => (
                <button key={task.id} type="button" onClick={() => openCase(task.caseId)}>
                  <span>
                    <b>{task.title}</b>
                    <small>
                      {task.person} · {t(functionalTeamLabel(task.ownerTeam))}
                    </small>
                  </span>
                  <span>
                    <Badge>{t(task.status)}</Badge>
                    <small>{fmtDate(task.completedAt, lang)}</small>
                  </span>
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </section>
    </div>
  );
}

function OverviewPanel({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panelhead">
        <b>{title}</b>
        <Badge>{String(count)}</Badge>
      </div>
      {children}
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
