import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getActiveRosterFn } from "@/lib/workbench.functions";
import type { RosterPersonDto } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { businessDate } from "@/lib/domain";
import { exportRows } from "@/lib/export-service";
import { Badge, Empty, Icon, Loading } from "@/components/workbench/ui";

export const Route = createFileRoute("/_authenticated/roster")({
  head: () => ({ meta: [{ title: "Active Roster · Team Workbench" }] }),
  component: ActiveRosterPage,
});

type SortKey = "name" | "employmentType" | "team" | "location" | "startDate";

function ActiveRosterPage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const fetchRoster = useServerFn(getActiveRosterFn);
  const { data, isLoading } = useQuery({
    queryKey: ["active-roster"],
    queryFn: () => fetchRoster(),
  });
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [team, setTeam] = useState("");
  const [location, setLocation] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [ascending, setAscending] = useState(true);

  const roster = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const teams = [...new Set(roster.map((x) => x.team))].sort();
  const locations = [...new Set(roster.map((x) => x.location).filter(Boolean) as string[])].sort();
  const types = [...new Set(roster.map((x) => x.employmentType))].sort();
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster
      .filter(
        (x) =>
          (!q ||
            [x.name, x.email, x.employeeId, x.role, x.team, x.location, x.supervisorName].some(
              (v) => v?.toLowerCase().includes(q),
            )) &&
          (!type || x.employmentType === type) &&
          (!team || x.team === team) &&
          (!location || x.location === location),
      )
      .sort(
        (a, b) => String(a[sort] ?? "").localeCompare(String(b[sort] ?? "")) * (ascending ? 1 : -1),
      );
  }, [roster, search, type, team, location, sort, ascending]);

  const setSortKey = (key: SortKey) => {
    if (sort === key) setAscending((x) => !x);
    else {
      setSort(key);
      setAscending(true);
    }
  };
  const exportRoster = (scope: "view" | "all", format: "csv" | "xlsx") =>
    exportRows(
      (scope === "view" ? filtered : roster).map((x) => ({
        Name: x.name,
        "Employee ID": x.employeeId,
        Email: x.email,
        "Employment Type": x.employmentType,
        Role: x.role,
        Team: x.team,
        Location: x.location,
        "Start Date": x.startDate,
        Supervisor: x.supervisorName,
        Leaving: x.leaving ? "Yes" : "No",
        "Last Working Day": x.lastWorkingDay,
      })),
      `active-people-${scope}-${businessDate()}`,
      format,
    );
  if (isLoading) return <Loading />;
  if (data && !Array.isArray(data))
    return <Empty icon="lock" title={t("You don't have permission to do that.")} />;

  return (
    <div>
      <div className="pagehead rosterhead">
        <div>
          <span className="eyebrow">{t("PEOPLE OPERATIONS")}</span>
          <h1>{t("Active People")}</h1>
          <p>{t("People currently working, including pending leavers until Confirm Left")}</p>
        </div>
        <div className="actions">
          <button className="secondary" onClick={() => exportRoster("view", "csv")}>
            <Icon name="doc" /> {t("Export Current View")} CSV
          </button>
          <button className="secondary" onClick={() => exportRoster("view", "xlsx")}>
            {t("Export Current View")} XLSX
          </button>
          <button className="secondary" onClick={() => exportRoster("all", "xlsx")}>
            {t("Export All")} XLSX
          </button>
        </div>
      </div>
      <div className="rosterstats">
        <div className="statcard">
          <span>{t("Active People")}</span>
          <strong>{roster.length}</strong>
        </div>
        <div className="statcard">
          <span>{t("Employees")}</span>
          <strong>{roster.filter((x) => x.employmentType === "Employee").length}</strong>
        </div>
        <div className="statcard">
          <span>{t("Interns")}</span>
          <strong>{roster.filter((x) => x.employmentType === "Intern").length}</strong>
        </div>
        <div className="statcard">
          <span>{t("Leased Labour")}</span>
          <strong>{roster.filter((x) => x.employmentType === "Leased Labour").length}</strong>
        </div>
      </div>
      <div className="rosterfilters">
        <label className="rostersearch">
          <Icon name="search" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search roster")}
          />
        </label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t("All Types")}</option>
          {types.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">{t("All Teams")}</option>
          {teams.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="">{t("All Locations")}</option>
          {locations.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <span>
          {filtered.length} {t("people")}
        </span>
      </div>
      <div className="rosterpanel">
        {filtered.length ? (
          <table className="rostertable">
            <thead>
              <tr>
                <SortHead
                  label={t("PERSON")}
                  k="name"
                  current={sort}
                  asc={ascending}
                  click={setSortKey}
                />
                <th>{t("Employee ID")}</th>
                <th>{t("Email")}</th>
                <SortHead
                  label={t("TYPE")}
                  k="employmentType"
                  current={sort}
                  asc={ascending}
                  click={setSortKey}
                />
                <th>{t("Role / Title")}</th>
                <SortHead
                  label={t("TEAM")}
                  k="team"
                  current={sort}
                  asc={ascending}
                  click={setSortKey}
                />
                <SortHead
                  label={t("Location")}
                  k="location"
                  current={sort}
                  asc={ascending}
                  click={setSortKey}
                />
                <SortHead
                  label={t("Start Date")}
                  k="startDate"
                  current={sort}
                  asc={ascending}
                  click={setSortKey}
                />
                <th>{t("Supervisor")}</th>
                <th>{t("Leaving details")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((x) => (
                <tr
                  key={x.personId}
                  onClick={() =>
                    x.caseId && navigate({ to: "/cases/$caseId", params: { caseId: x.caseId } })
                  }
                >
                  <td>
                    <b>{x.name}</b>
                    {x.leaving ? <Badge>{t("Leaving")}</Badge> : null}
                  </td>
                  <td>{x.employeeId ?? "—"}</td>
                  <td>{x.email ?? "—"}</td>
                  <td>
                    <Badge>{x.employmentType}</Badge>
                  </td>
                  <td>{x.role ?? "—"}</td>
                  <td>{x.team}</td>
                  <td>{x.location ?? "—"}</td>
                  <td>{fmtDate(x.startDate, lang)}</td>
                  <td>{x.supervisorName ?? "—"}</td>
                  <td>
                    {x.leaving
                      ? x.lastWorkingDay
                        ? fmtDate(x.lastWorkingDay, lang)
                        : t("Last Working Day not confirmed")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty
            icon="users"
            title={t("No active people found.")}
            text={t("Confirm Joined to add a person to Active People.")}
          />
        )}
      </div>
    </div>
  );
}

function SortHead({
  label,
  k,
  current,
  asc,
  click,
}: {
  label: string;
  k: SortKey;
  current: SortKey;
  asc: boolean;
  click: (k: SortKey) => void;
}) {
  return (
    <th>
      <button className="sorthead" onClick={() => click(k)}>
        {label} {current === k ? (asc ? "↑" : "↓") : "↕"}
      </button>
    </th>
  );
}
