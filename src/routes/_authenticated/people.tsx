import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getPeopleFn } from "@/lib/workbench.functions";
import { useLang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { Badge, Empty, Icon, Loading } from "@/components/workbench/ui";

export const Route = createFileRoute("/_authenticated/people")({
  head: () => ({ meta: [{ title: "People · Team Workbench" }] }),
  component: PeoplePage,
});

function PeoplePage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const fetchPeople = useServerFn(getPeopleFn);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["people", search, status, page],
    queryFn: () => fetchPeople({ data: { search, status, page, pageSize: 50 } }),
  });

  if (isLoading) return <Loading />;
  if (isError)
    return (
      <Empty
        icon="alert"
        title={t("People could not be loaded.")}
        action={t("Try again")}
        onAction={() => void refetch()}
      />
    );
  if (!data || "error" in data)
    return <Empty icon="lock" title={t("You don't have permission to do that.")} />;

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="eyebrow">{t("PEOPLE OPERATIONS")}</p>
          <h1>{t("People")}</h1>
          <p>{t("One person, one profile, complete employment history")}</p>
        </div>
      </div>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={t("Search people")}
          />
        </div>
        <select
          className="filter"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("All Status")}</option>
          {["planned", "active", "ending", "ended"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <span aria-live="polite">
          {data.total} {t("people")}
        </span>
      </div>
      <div className="rosterpanel">
        {data.items.length ? (
          <table className="rostertable">
            <thead>
              <tr>
                <th>{t("PERSON")}</th>
                <th>{t("Employee ID")}</th>
                <th>{t("Employment Type")}</th>
                <th>{t("TEAM")}</th>
                <th>{t("Role / Title")}</th>
                <th>{t("STATUS")}</th>
                <th>{t("Start Date")}</th>
                <th>{t("End Date")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((person) => (
                <tr
                  key={person.personId}
                  tabIndex={0}
                  onClick={() =>
                    navigate({ to: "/people/$personId", params: { personId: person.personId } })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter")
                      navigate({
                        to: "/people/$personId",
                        params: { personId: person.personId },
                      });
                  }}
                >
                  <td>
                    <b>{person.displayName}</b>
                    <br />
                    <small>{person.email ?? "—"}</small>
                  </td>
                  <td>{person.employeeId ?? "—"}</td>
                  <td>{person.employmentType ?? "—"}</td>
                  <td>{person.team}</td>
                  <td>{person.role ?? "—"}</td>
                  <td>
                    <Badge>{person.status}</Badge>
                  </td>
                  <td>{fmtDate(person.startDate, lang)}</td>
                  <td>{fmtDate(person.endDate, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty icon="users" title={t("No people found.")} />
        )}
      </div>
      {data.totalPages > 1 ? (
        <nav className="pagination" aria-label={t("People pagination")}>
          <button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
            {t("Previous")}
          </button>
          <span>
            {t("Page")} {page} / {data.totalPages}
          </span>
          <button
            className="secondary"
            disabled={page >= data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            {t("Next")}
          </button>
        </nav>
      ) : null}
    </div>
  );
}
