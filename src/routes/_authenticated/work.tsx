import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getWorkbenchDataFn, toggleTaskFn } from "@/lib/workbench.functions";
import type { WorkbenchData } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { opErrorMessage } from "@/lib/errors";
import { fmtDate, greetingFor, initialsOf } from "@/lib/format";
import { businessDate } from "@/lib/domain";
import { Badge, Empty, Icon, Loading } from "@/components/workbench/ui";

export const Route = createFileRoute("/_authenticated/work")({
  head: () => ({
    meta: [
      { title: "My Work · Team Workbench" },
      { name: "description", content: "Your tasks, upcoming onboarding and shared cases at a glance." },
    ],
  }),
  component: WorkPage,
});

function useWorkbench() {
  const fetchData = useServerFn(getWorkbenchDataFn);
  return useQuery({ queryKey: ["workbench"], queryFn: () => fetchData() });
}

export function WorkPage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useWorkbench();
  const callToggle = useServerFn(toggleTaskFn);
  const [quickOpen, setQuickOpen] = useState(false);

  const derived = useMemo(() => {
    if (!data || "error" in data) return null;
    const open = data.tasks.filter((x) => x.status !== "Completed" && x.status !== "Cancelled");
    const now = Date.now();
    const in14d = now + 14 * 86400000;
    const dueSoon = open.filter((x) => x.due && new Date(x.due).getTime() <= in14d);
    const waiting = open.filter((x) => x.status === "Waiting" || x.status === "Blocked");
    const today = businessDate();
    const completedToday = data.tasks.filter((x) => x.status === "Completed" && x.completedAt?.slice(0, 10) === today);
    const upcoming = data.cases
      .filter((c) => c.caseType === "Onboarding" && c.startDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 5);
    return { open, dueSoon, waiting, completedToday, upcoming };
  }, [data]);

  if (isLoading) return <Loading />;
  if (isError || !data || "error" in data || !derived) {
    return <Empty icon="alert" title={t("Something went wrong. Please try again.")} />;
  }
  const wb = data as WorkbenchData;

  const onToggle = async (taskId: string, complete: boolean) => {
    try {
      const res = await callToggle({ data: { taskId, complete } });
      if ("error" in res) {
        toast.error(opErrorMessage(t, res.error));
        return;
      }
      await qc.invalidateQueries({ queryKey: ["workbench"] });
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    }
  };

  const firstName = wb.currentUser.name.split(" ")[0];
  const hour = new Date().getHours();

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="eyebrow">
            {t(greetingFor(hour))}, {firstName} ·{" "}
            {new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date())}
          </p>
          <h1>
            {t("Welcome back")}, {firstName} — {t("here is your day at a glance.")}
          </h1>
        </div>
        <div className="relative">
          <button className="primary" onClick={() => setQuickOpen((v) => !v)}>
            <Icon name="plus" /> {t("Quick Action")}
          </button>
          {quickOpen ? (
            <div className="quickmenu">
              <button
                onClick={() => navigate({ to: "/onboarding", search: { q: "", new: "1" } })}
              >
                <Icon name="onboarding" /> {t("New Onboarding")}
              </button>
              <button onClick={() => navigate({ to: "/offboarding", search: { q: "", new: "1", personId: "", employmentId: "" } })}>
                <Icon name="offboarding" /> {t("New Offboarding")}
              </button>
              <button onClick={() => navigate({ to: "/email", search: { caseId: "", taskId: "" } })}>
                <Icon name="mail" /> {t("Compose Email")}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="summary">
        <div className="summarycard">
          <span className="metricicon i-blue">
            <Icon name="doc" />
          </span>
          <div>
            <b>{derived.open.length}</b>
            <span>{t("My Tasks")}</span>
            <small>{t("Open tasks assigned to you")}</small>
          </div>
        </div>
        <div className="summarycard">
          <span className="metricicon i-amber">
            <Icon name="clock" />
          </span>
          <div>
            <b>{derived.dueSoon.length}</b>
            <span>{t("Due Soon")}</span>
            <small>{t("Due within 14 days")}</small>
          </div>
        </div>
        <div className="summarycard">
          <span className="metricicon i-violet">
            <Icon name="alert" />
          </span>
          <div>
            <b>{derived.waiting.length}</b>
            <span>{t("Waiting")}</span>
            <small>{t("Blocked or waiting on others")}</small>
          </div>
        </div>
        <div className="summarycard">
          <span className="metricicon i-green">
            <Icon name="check" />
          </span>
          <div>
            <b>{derived.completedToday.length}</b>
            <span>{t("Completed Today")}</span>
            <small>{t("Finished since midnight")}</small>
          </div>
        </div>
      </div>

      <div className="dashboard">
        <section className="panel">
          <div className="panelhead">
            <b>{t("My Tasks")}</b>
            <span className="badge b-active">{derived.open.length}</span>
          </div>
          {derived.open.length === 0 ? (
            <div className="inlineempty">
              <Icon name="check" /> {t("No open tasks. Enjoy the clarity.")}
            </div>
          ) : (
            <div className="tasks">
              {derived.open.map((task) => (
                <div className="taskrow" key={task.id}>
                  <button
                    className={`taskcheck${task.status === "Completed" ? " done" : ""}`}
                    onClick={() => onToggle(task.id, true)}
                    aria-label={t("Mark Done")}
                  >
                    <Icon name="check" />
                  </button>
                  <div className="taskmain">
                    <b>{task.title}</b>
                    <span>
                      {task.person}
                      {task.caseType ? ` · ${t(task.caseType)}` : ""}
                    </span>
                  </div>
                  <span className="duedate">
                    <Icon name="calendar" /> {fmtDate(task.due, lang)}
                  </span>
                  <Badge>{task.priority}</Badge>
                  <Badge>{task.status}</Badge>
                  {task.caseId ? (
                    <button
                      className="open"
                      onClick={() => navigate({ to: "/cases/$caseId", params: { caseId: task.caseId! } })}
                      aria-label="Open case"
                    >
                      ›
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <div>
          <section className="panel" style={{ marginBottom: 22 }}>
            <div className="panelhead">
              <b>{t("Upcoming Onboarding")}</b>
              <button className="textbutton" onClick={() => navigate({ to: "/onboarding", search: { q: "", new: "" } })}>
                {t("View All")}
              </button>
            </div>
            {derived.upcoming.length === 0 ? (
              <div className="inlineempty">{t("No upcoming onboarding.")}</div>
            ) : (
              <div className="upcoming">
                {derived.upcoming.map((c) => (
                  <div
                    className="event"
                    key={c.id}
                    onClick={() => navigate({ to: "/cases/$caseId", params: { caseId: c.id } })}
                  >
                    <span className="miniavatar">{c.initials}</span>
                    <div>
                      <b>{c.name}</b>
                      <span>
                        {t("starts")} {fmtDate(c.startDate, lang)} · {c.team}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panelhead">
              <b>{t("Shared With Me")}</b>
              <span className="badge b-viewer">{wb.sharedCases.length}</span>
            </div>
            {wb.sharedCases.length === 0 ? (
              <div className="inlineempty">{t("No shared cases yet.")}</div>
            ) : (
              <div className="upcoming">
                {wb.sharedCases.map((c) => (
                  <div
                    className="event"
                    key={c.id}
                    onClick={() => navigate({ to: "/cases/$caseId", params: { caseId: c.id } })}
                  >
                    <span className="miniavatar">{c.initials}</span>
                    <div>
                      <b>{c.name}</b>
                      <span>
                        {t(c.accessLevel)} · {t("Shared with you by the case owner")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <section className="panel" style={{ marginTop: 22 }}>
        <div className="panelhead">
          <b>{t("Recent Cases")}</b>
        </div>
        <div className="casetable recent">
          {wb.cases.slice(0, 6).map((c) => (
            <div
              className="row"
              key={c.id}
              onClick={() => navigate({ to: "/cases/$caseId", params: { caseId: c.id } })}
            >
              <div className="person">
                <span className="miniavatar">{c.initials}</span>
                <div>
                  <b>{c.name}</b>
                  <span>{c.team}</span>
                </div>
              </div>
              <Badge>{c.caseType}</Badge>
              <span className="duedate">{fmtDate(c.startDate, lang)}</span>
              <Badge>{c.status}</Badge>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
