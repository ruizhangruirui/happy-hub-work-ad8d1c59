import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useWorkbench } from "@/components/workbench/CaseList";
import { useLang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { Badge, Empty, Icon, Loading } from "@/components/workbench/ui";

export const Route = createFileRoute("/_authenticated/search")({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s["q"] === "string" ? s["q"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Search · Team Workbench" },
      { name: "description", content: "Search cases, tasks and people across Team Workbench." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const { q } = Route.useSearch();
  const { data, isLoading } = useWorkbench();

  const results = useMemo(() => {
    if (!data || "error" in data) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return { cases: [], tasks: [], people: [] };
    const seen = new Set<string>();
    const allCases = [...data.cases, ...data.sharedCases].filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    const match = (fields: (string | null | undefined)[]) =>
      fields.some((f) => (f ?? "").toLowerCase().includes(needle));
    return {
      cases: allCases.filter((c) => match([c.name, c.team, c.role, c.location, c.owner, c.status])),
      tasks: data.tasks.filter((x) => match([x.title, x.person, x.ownerName, x.status])),
      people: data.users.filter((u) => match([u.name, u.email, u.title, u.role])),
    };
  }, [data, q]);

  if (isLoading) return <Loading />;
  if (!results) return <Empty icon="alert" title={t("Something went wrong. Please try again.")} />;
  const total = results.cases.length + results.tasks.length + results.people.length;

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="eyebrow">{t("Search")}</p>
          <h1>
            {t("Search results")}
            {q ? ` — “${q}”` : ""}
          </h1>
        </div>
      </div>

      {total === 0 ? (
        <Empty icon="search" title={t("No results found.")} />
      ) : (
        <div style={{ display: "grid", gap: 22 }}>
          {results.cases.length > 0 ? (
            <section className="panel">
              <div className="panelhead">
                <b>{t("Cases")}</b>
                <span className="badge b-active">{results.cases.length}</span>
              </div>
              <div className="tasks">
                {results.cases.map((c) => (
                  <div className="taskrow" key={c.id}>
                    <span className="avatar">{c.initials}</span>
                    <div className="taskmain">
                      <b>{c.name}</b>
                      <span>
                        {t(c.caseType)} · {c.team}
                        {c.role ? ` · ${c.role}` : ""}
                      </span>
                    </div>
                    <Badge>{c.status}</Badge>
                    <button
                      className="open"
                      onClick={() => navigate({ to: "/cases/$caseId", params: { caseId: c.id } })}
                      aria-label={t("Open Case")}
                    >
                      ›
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {results.tasks.length > 0 ? (
            <section className="panel">
              <div className="panelhead">
                <b>{t("Tasks")}</b>
                <span className="badge b-active">{results.tasks.length}</span>
              </div>
              <div className="tasks">
                {results.tasks.map((task) => (
                  <div className="taskrow" key={task.id}>
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
                    <Badge>{task.status}</Badge>
                    {task.caseId ? (
                      <button
                        className="open"
                        onClick={() =>
                          navigate({ to: "/cases/$caseId", params: { caseId: task.caseId! } })
                        }
                        aria-label={t("Open Case")}
                      >
                        ›
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {results.people.length > 0 ? (
            <section className="panel">
              <div className="panelhead">
                <b>{t("People")}</b>
                <span className="badge b-active">{results.people.length}</span>
              </div>
              <div className="tasks">
                {results.people.map((u) => (
                  <div className="taskrow" key={u.id}>
                    <span className="avatar">
                      {u.name
                        .split(" ")
                        .map((p) => p[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <div className="taskmain">
                      <b>{u.name}</b>
                      <span>
                        {u.title ?? ""}
                        {u.email ? ` · ${u.email}` : ""}
                      </span>
                    </div>
                    <Badge>{u.status}</Badge>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
