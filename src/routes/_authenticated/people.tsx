import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { exportPeopleFn, getPeopleFn, importPeopleFn } from "@/lib/workbench.functions";
import { useLang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { businessDate } from "@/lib/domain";
import { exportRows } from "@/lib/export-service";
import { normalizePeopleImportRows, PEOPLE_IMPORT_COLUMNS } from "@/lib/people-import";
import { useWorkbench } from "@/components/workbench/CaseList";
import { Badge, Empty, Icon, Loading, Modal } from "@/components/workbench/ui";

export const Route = createFileRoute("/_authenticated/people")({
  head: () => ({ meta: [{ title: "People · Team Workbench" }] }),
  component: PeoplePage,
});

function PeoplePage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const fetchPeople = useServerFn(getPeopleFn);
  const importPeople = useServerFn(importPeopleFn);
  const fetchExportPeople = useServerFn(exportPeopleFn);
  const { data: workbench } = useWorkbench();
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<null | {
    created: number;
    updated: number;
    errors: Array<{ row: number; message: string }>;
  }>(null);
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

  const canImport = Boolean(
    workbench &&
    !("error" in workbench) &&
    ["Admin", "Operator"].includes(workbench.currentUser.role),
  );
  const exportPeople = async (all: boolean, format: "csv" | "xlsx") => {
    const response = await fetchExportPeople();
    if (!Array.isArray(response)) {
      toast.error(t("You don't have permission to do that."));
      return;
    }
    const query = search.trim().toLowerCase();
    const people = response.filter(
      (person) =>
        all ||
        ((!status || person.status === status) &&
          (!query ||
            [
              person.givenName,
              person.familyName,
              person.preferredName,
              person.personalEmail,
              person.employeeId,
              person.team,
              person.role,
            ].some((value) =>
              String(value ?? "")
                .toLowerCase()
                .includes(query),
            ))),
    );
    const result = await exportRows(
      people.map((person) => ({
        "First Name": person.givenName,
        "Last Name": person.familyName,
        "Preferred Name": person.preferredName,
        "Personal Email": person.personalEmail,
        "Company Email": person.companyEmail,
        "Employee ID": person.employeeId,
        Phone: person.phone,
        "Employment Type": person.employmentType,
        Team: person.team,
        "Role / Title": person.role,
        Location: person.location,
        Supervisor: person.supervisorName,
        "Supervisor Email": person.supervisorEmail,
        Workload: person.workload,
        "Contract Type": person.contractType,
        Status: person.status,
        "Start Date": person.startDate,
        "End Date": person.endDate,
      })),
      `people-${all ? "all" : "filtered"}-${businessDate()}`,
      format,
    );
    if (!result.exported) toast.info(t("No records to export."));
  };
  const downloadTemplate = () =>
    exportRows(
      [
        {
          "First Name": "Example",
          "Last Name": "Person",
          "Employment Type": "Employee",
          "Start Date": businessDate(),
        },
      ],
      "people-import-template",
      "xlsx",
      { columns: PEOPLE_IMPORT_COLUMNS, sheetName: "People Import" },
    );
  const upload = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = book.Sheets[book.SheetNames[0]!];
      if (!sheet) throw new Error("The workbook does not contain a worksheet.");
      const rows = normalizePeopleImportRows(
        XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }),
      );
      if (!rows.length) throw new Error("The import file contains no records.");
      const result = await importPeople({ data: { rows } });
      if ("error" in result) throw new Error(t("You don't have permission to do that."));
      setImportResult(result);
      await refetch();
      toast.success(t("People import completed"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("Something went wrong. Please try again."),
      );
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="eyebrow">{t("PEOPLE OPERATIONS")}</p>
          <h1>{t("People")}</h1>
          <p>{t("One person, one profile, complete employment history")}</p>
        </div>
        <details className="toolmenu">
          <summary>{t("Tools")}</summary>
          <div>
            {canImport ? (
              <>
                <input
                  ref={fileRef}
                  hidden
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                  }}
                />
                <button
                  className="secondary"
                  disabled={importing}
                  onClick={() => fileRef.current?.click()}
                >
                  <Icon name="upload" /> {importing ? t("Importing…") : t("Import People")}
                </button>
                <button className="secondary" onClick={() => void downloadTemplate()}>
                  {t("Import Template")}
                </button>
              </>
            ) : null}
            <button className="secondary" onClick={() => void exportPeople(false, "csv")}>
              <Icon name="doc" /> {t("Export Current View")} CSV
            </button>
            <button className="secondary" onClick={() => void exportPeople(false, "xlsx")}>
              {t("Export Current View")} XLSX
            </button>
            <button className="secondary" onClick={() => void exportPeople(true, "xlsx")}>
              {t("Export All")} XLSX
            </button>
          </div>
        </details>
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
          {["active", "ending"].map((item) => (
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
      {importResult ? (
        <Modal title={t("People Import Result")} close={() => setImportResult(null)}>
          <div className="userform">
            <p>
              {t("Created")}: <b>{importResult.created}</b> · {t("Updated")}:{" "}
              <b>{importResult.updated}</b> · {t("Errors")}: <b>{importResult.errors.length}</b>
            </p>
            {importResult.errors.length ? (
              <div className="inlineempty">
                {importResult.errors.map((error) => (
                  <p key={`${error.row}-${error.message}`}>
                    {t("Row")} {error.row}: {error.message}
                  </p>
                ))}
              </div>
            ) : null}
            <div className="modalactions">
              <button className="primary" onClick={() => setImportResult(null)}>
                {t("Close")}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
