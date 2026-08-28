import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  createOnboardingCaseFn,
  createOffboardingCaseFn,
  findOnboardingCandidatesFn,
  getPeopleFn,
  getWorkbenchDataFn,
} from "@/lib/workbench.functions";
import type { PersonCandidateDto, WorkbenchData } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { opErrorMessage } from "@/lib/errors";
import { fmtDate } from "@/lib/format";
import { EMPLOYMENT_TYPES } from "@/lib/domain";
import { businessDate } from "@/lib/domain";
import { exportRows } from "@/lib/export-service";
import { Badge, Empty, Icon, Loading, Modal } from "./ui";

export function useWorkbench() {
  const fetchData = useServerFn(getWorkbenchDataFn);
  return useQuery({ queryKey: ["workbench"], queryFn: () => fetchData() });
}

export function CaseList({ caseType }: { caseType: "onboarding" | "offboarding" }) {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const { q, new: openNew } = useSearch({ strict: false }) as { q?: string; new?: string };
  const { data, isLoading, isError } = useWorkbench();
  const [search, setSearch] = useState(q ?? "");
  const [status, setStatus] = useState("");
  const [team, setTeam] = useState("");
  const [empType, setEmpType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [leavingType, setLeavingType] = useState("");
  const [sort, setSort] = useState<"date" | "name" | "status" | "priority">("date");
  const [modalOpen, setModalOpen] = useState(openNew === "1");

  const wb: WorkbenchData | null = data && !("error" in data) ? data : null;

  const filtered = useMemo(() => {
    if (!wb) return [];
    const needle = search.trim().toLowerCase();
    return wb.cases
      .filter((c) => {
        const relevantDate =
          caseType === "onboarding" ? c.startDate : (c.lastWorkingDay ?? c.contractEndDate);
        return (
          c.caseType.toLowerCase() === caseType &&
          (!needle ||
            c.name.toLowerCase().includes(needle) ||
            c.team.toLowerCase().includes(needle)) &&
          (!status || c.status === status) &&
          (!team || c.team === team) &&
          (!empType || c.employmentType === empType) &&
          (!leavingType || c.leavingType === leavingType) &&
          (!dateFrom || Boolean(relevantDate && relevantDate >= dateFrom)) &&
          (!dateTo || Boolean(relevantDate && relevantDate <= dateTo))
        );
      })
      .sort((a, b) => {
        const av =
          sort === "date"
            ? caseType === "onboarding"
              ? a.startDate
              : (a.lastWorkingDay ?? a.contractEndDate)
            : a[sort];
        const bv =
          sort === "date"
            ? caseType === "onboarding"
              ? b.startDate
              : (b.lastWorkingDay ?? b.contractEndDate)
            : b[sort];
        return String(av ?? "").localeCompare(String(bv ?? ""));
      });
  }, [wb, caseType, search, status, team, empType, leavingType, dateFrom, dateTo, sort]);

  if (isLoading) return <Loading />;
  if (isError || !wb)
    return <Empty icon="alert" title={t("Something went wrong. Please try again.")} />;

  const title = caseType === "onboarding" ? "Onboarding" : "Offboarding";
  const canCreate = ["Admin", "Operator", "Manager"].includes(wb.currentUser.role);
  const statuses = [
    ...new Set(wb.cases.filter((c) => c.caseType.toLowerCase() === caseType).map((c) => c.status)),
  ];
  const teams = [...new Set(wb.cases.map((c) => c.team))];
  const exportCases = async (scope: "view" | "all", format: "csv" | "xlsx") => {
    const source =
      scope === "view" ? filtered : wb.cases.filter((c) => c.caseType.toLowerCase() === caseType);
    const result = await exportRows(
      source.map((c) => ({
        Person: c.name,
        "Employment Type": c.employmentType,
        Team: c.team,
        [caseType === "onboarding" ? "Start Date" : "Contract End Date"]:
          caseType === "onboarding" ? c.startDate : c.contractEndDate,
        ...(caseType === "offboarding" ? { "Last Working Day": c.lastWorkingDay } : {}),
        Status: c.status,
        Owner: c.owner,
        Priority: c.priority,
      })),
      `${caseType}-${scope}-${businessDate()}`,
      format,
    );
    if (!result.exported) toast.info(t("No records to export."));
  };

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="eyebrow">{t(title)}</p>
          <h1>
            {filtered.length} {t("current and historical cases across your scope")}
          </h1>
        </div>
        {canCreate ? (
          <button className="primary" onClick={() => setModalOpen(true)}>
            <Icon name="plus" />{" "}
            {caseType === "onboarding" ? t("New Onboarding") : t("New Offboarding")}
          </button>
        ) : null}
        <div className="actions">
          <button className="secondary" onClick={() => exportCases("view", "csv")}>
            {t("Export Current View")} CSV
          </button>
          <button className="secondary" onClick={() => exportCases("view", "xlsx")}>
            {t("Export Current View")} XLSX
          </button>
          <button className="secondary" onClick={() => exportCases("all", "xlsx")}>
            {t("Export All")} XLSX
          </button>
        </div>
      </div>

      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search people, tasks, emails")}
          />
        </div>
        <select className="filter" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("All Status")}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {t(s)}
            </option>
          ))}
        </select>
        <select className="filter" value={empType} onChange={(e) => setEmpType(e.target.value)}>
          <option value="">{t("All Types")}</option>
          {EMPLOYMENT_TYPES.map((x) => (
            <option key={x} value={x}>
              {t(x)}
            </option>
          ))}
        </select>
        <select className="filter" value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">{t("All Teams")}</option>
          {teams.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        {caseType === "offboarding" ? (
          <select
            className="filter"
            value={leavingType}
            onChange={(e) => setLeavingType(e.target.value)}
          >
            <option value="">{t("All Leaving Types")}</option>
            {[
              ...new Set(
                wb.cases
                  .filter((c) => c.caseType === "Offboarding")
                  .map((c) => c.leavingType)
                  .filter(Boolean) as string[],
              ),
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        ) : null}
        <input
          className="filter"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label={t("Date from")}
        />
        <input
          className="filter"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label={t("Date to")}
        />
        <select
          className="filter"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          <option value="date">{t("Sort by date")}</option>
          <option value="name">{t("Sort by name")}</option>
          <option value="status">{t("Sort by status")}</option>
          <option value="priority">{t("Sort by priority")}</option>
        </select>
        {search || status || team || empType || leavingType || dateFrom || dateTo ? (
          <button
            className="clear"
            onClick={() => {
              setSearch("");
              setStatus("");
              setTeam("");
              setEmpType("");
              setLeavingType("");
              setDateFrom("");
              setDateTo("");
            }}
          >
            <Icon name="x" /> {t("Clear")}
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <Empty
          icon="folder"
          title={t("No cases found.")}
          text={t("adjust filters")}
          action={canCreate ? t("Create one") : undefined}
          onAction={canCreate ? () => setModalOpen(true) : undefined}
        />
      ) : (
        <div className="casetable">
          <div className="row head">
            <span>{t("PERSON")}</span>
            <span>{t("TYPE")}</span>
            <span>{t("TEAM")}</span>
            <span>{t("DATE")}</span>
            <span>{t("OWNER")}</span>
            <span>{t("STATUS")}</span>
            <span>{t("PRIORITY")}</span>
            <span />
          </div>
          {filtered.map((c) => (
            <div
              className={`row ${["Joined", "Left", "Completed"].includes(c.status) ? "lifecycle-success" : ""}`}
              key={c.id}
              onClick={() => navigate({ to: "/cases/$caseId", params: { caseId: c.id } })}
            >
              <div className="person">
                <span className="miniavatar">{c.initials}</span>
                <div>
                  <b>{c.name}</b>
                  <span>{c.role ?? ""}</span>
                </div>
              </div>
              <Badge>{c.employmentType}</Badge>
              <span>{c.team}</span>
              <span className="duedate">
                {fmtDate(
                  caseType === "onboarding" ? c.startDate : (c.lastWorkingDay ?? c.contractEndDate),
                  lang,
                )}
              </span>
              <span>{c.owner}</span>
              <Badge>{c.status}</Badge>
              <Badge>{c.priority}</Badge>
              <span className="open">›</span>
            </div>
          ))}
        </div>
      )}

      {modalOpen && canCreate ? (
        <CreateCaseModal caseType={caseType} wb={wb} close={() => setModalOpen(false)} />
      ) : null}
    </div>
  );
}

function CreateCaseModal({
  caseType,
  wb,
  close,
}: {
  caseType: "onboarding" | "offboarding";
  wb: WorkbenchData;
  close: () => void;
}) {
  const { t } = useLang();
  const { employmentId: preselectedEmploymentId } = useSearch({ strict: false }) as {
    employmentId?: string;
  };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const callOnboarding = useServerFn(createOnboardingCaseFn);
  const callOffboarding = useServerFn(createOffboardingCaseFn);
  const fetchPeople = useServerFn(getPeopleFn);
  const findCandidates = useServerFn(findOnboardingCandidatesFn);
  const [offboardingSearch, setOffboardingSearch] = useState("");
  const { data: peopleData } = useQuery({
    queryKey: ["people", "offboarding-picker", offboardingSearch],
    queryFn: () => fetchPeople({ data: { search: offboardingSearch, page: 1, pageSize: 100 } }),
    enabled: caseType === "offboarding",
  });
  const people = peopleData && !("error" in peopleData) ? peopleData.items : [];
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<PersonCandidateDto[]>([]);
  const [duplicateResolved, setDuplicateResolved] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    teamId: "",
    employmentType: "Employee",
    startDate: "",
    endDate: "",
    role: "",
    location: "",
    supervisorName: "",
    supervisorEmail: "",
    priority: "Medium",
    notes: "",
    visaRequired: false,
    employmentId: preselectedEmploymentId ?? "",
    leavingType: "Voluntary Resignation",
    leavingReason: "",
    employeeId: "",
    personId: "",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (caseType === "onboarding" && !duplicateResolved) {
        const found = await findCandidates({
          data: {
            employeeId: form.employeeId || undefined,
            email: form.email || undefined,
            fullName: `${form.firstName} ${form.lastName}`,
            teamId: form.teamId || null,
          },
        });
        if ("error" in found) {
          toast.error(opErrorMessage(t, found.error));
          return;
        }
        if (found.candidates.length) {
          setCandidates(found.candidates as PersonCandidateDto[]);
          return;
        }
        setDuplicateResolved(true);
      }
      const selected = people.find((x) => x.employmentId === form.employmentId);
      const res =
        caseType === "offboarding"
          ? await callOffboarding({
              data: {
                personId: form.personId || selected?.personId || "",
                employmentId: form.employmentId,
                contractEndDate: form.endDate,
                lastWorkingDay: form.startDate || undefined,
                leavingType: form.leavingType,
                leavingReason: form.leavingReason || undefined,
                priority: form.priority as "High" | "Medium" | "Low",
                notes: form.notes || undefined,
              },
            })
          : await callOnboarding({
              data: {
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                email: form.email.trim() || undefined,
                employeeId: form.employeeId.trim() || undefined,
                personId: form.personId || undefined,
                teamId: form.teamId || null,
                caseType: "onboarding",
                employmentType: form.employmentType as (typeof EMPLOYMENT_TYPES)[number],
                startDate: form.startDate,
                role: form.role || undefined,
                location: form.location || undefined,
                supervisorName: form.supervisorName.trim(),
                supervisorEmail: form.supervisorEmail.trim() || undefined,
                priority: form.priority as "High" | "Medium" | "Low",
                notes: form.notes || undefined,
                visaRequired: form.visaRequired,
              },
            });
      if ("error" in res) {
        if (res.error === "offboarding_exists" && "caseId" in res) {
          toast.info(t("An offboarding case already exists for this employment."));
          navigate({ to: "/cases/$caseId", params: { caseId: res.caseId } });
          return;
        }
        toast.error(opErrorMessage(t, res.error));
        return;
      }
      await qc.invalidateQueries({ queryKey: ["workbench"] });
      toast.success(t("Saved"));
      navigate({ to: "/cases/$caseId", params: { caseId: res.caseId } });
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={caseType === "onboarding" ? t("New Onboarding") : t("New Offboarding")}
      close={close}
    >
      <form className="userform" onSubmit={submit}>
        {caseType === "offboarding" ? (
          <>
            <label>
              {t("Select active person")}
              <input
                value={offboardingSearch}
                onChange={(event) => setOffboardingSearch(event.target.value)}
                placeholder={t("Search active people")}
              />
              <select
                value={form.employmentId}
                onChange={(event) => {
                  const selectedPerson = people.find(
                    (person) => person.employmentId === event.target.value,
                  );
                  setForm((current) => ({
                    ...current,
                    employmentId: event.target.value,
                    personId: selectedPerson?.personId ?? "",
                  }));
                }}
                required
              >
                <option value="">—</option>
                {people
                  .filter((x) => x.employmentId && ["active", "ending"].includes(x.status))
                  .map((x) => (
                    <option key={x.employmentId!} value={x.employmentId!}>
                      {x.displayName} · {x.employeeId ?? x.email ?? "—"} · {x.team}
                    </option>
                  ))}
              </select>
            </label>
            <div className="two">
              <label>
                {t("Contract End Date")}
                <input type="date" value={form.endDate} onChange={set("endDate")} required />
              </label>
              <label>
                {t("Last working day")} ({t("Optional")})
                <input type="date" value={form.startDate} onChange={set("startDate")} />
              </label>
            </div>
            <label>
              {t("Leaving type")}
              <select value={form.leavingType} onChange={set("leavingType")}>
                <option>Voluntary Resignation</option>
                <option>Employer Termination</option>
                <option>Contract End</option>
                <option>Retirement</option>
              </select>
            </label>
            <label>
              {t("Leaving reason")} ({t("Optional")})
              <textarea
                value={form.leavingReason}
                onChange={set("leavingReason")}
                maxLength={500}
              />
            </label>
          </>
        ) : (
          <>
            <div className="two">
              <label>
                {t("First Name")}
                <input
                  value={form.firstName}
                  onChange={(e) => {
                    set("firstName")(e);
                    setDuplicateResolved(false);
                  }}
                  required
                  maxLength={60}
                />
              </label>
              <label>
                {t("Last Name")}
                <input
                  value={form.lastName}
                  onChange={(e) => {
                    set("lastName")(e);
                    setDuplicateResolved(false);
                  }}
                  required
                  maxLength={60}
                />
              </label>
            </div>
            <label>
              {t("Email")} ({t("Optional")})
              <input
                type="email"
                value={form.email}
                onChange={(e) => {
                  set("email")(e);
                  setDuplicateResolved(false);
                }}
                maxLength={320}
              />
            </label>
            <label>
              {t("Employee ID")} ({t("Optional")})
              <input
                value={form.employeeId}
                onChange={(e) => {
                  set("employeeId")(e);
                  setDuplicateResolved(false);
                }}
                maxLength={80}
              />
            </label>
            {candidates.length ? (
              <div className="panel">
                <b>{t("Possible existing person found")}</b>
                {candidates.map((c, index) => (
                  <div className="orgrow" key={c.personId ?? `restricted-${index}`}>
                    <div>
                      <b>{t(c.accessible ? c.displayName : "Existing employee record")}</b>
                      {c.accessible ? (
                        <span>
                          {c.lastEmploymentType ?? "—"} · {c.lastTeam ?? "—"} ·{" "}
                          {c.lastEndDate ?? "—"}
                        </span>
                      ) : (
                        <span>{t("Contact HR/Admin to resolve this identity match.")}</span>
                      )}
                      <small>
                        {t(
                          c.matchStrength === "strong"
                            ? "Strong identifier match"
                            : "Name-only warning; never auto-merged",
                        )}
                      </small>
                    </div>
                    {c.accessible && c.personId ? (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            personId: c.personId ?? "",
                            employeeId: c.employeeId ?? f.employeeId,
                          }));
                          setCandidates([]);
                          setDuplicateResolved(true);
                        }}
                      >
                        {t("Use Existing Person")}
                      </button>
                    ) : null}
                  </div>
                ))}
                {candidates.every((c) => c.matchStrength === "warning" && c.accessible) ? (
                  <button
                    type="button"
                    className="textbutton"
                    onClick={() => {
                      setForm((f) => ({ ...f, personId: "" }));
                      setCandidates([]);
                      setDuplicateResolved(true);
                    }}
                  >
                    {t("Create New Person Anyway")}
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="two">
              <label>
                {t("TEAM")}
                <select value={form.teamId} onChange={set("teamId")}>
                  <option value="">—</option>
                  {wb.teams
                    .filter((tm) => tm.status === "Active")
                    .map((tm) => (
                      <option key={tm.id} value={tm.id}>
                        {tm.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {t("Employment Type")}
                <select value={form.employmentType} onChange={set("employmentType")}>
                  {["Employee", "Intern", "Leased Labour"].map((x) => (
                    <option key={x} value={x}>
                      {t(x)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {form.employmentType !== "Leased Labour" ? (
              <label className="workflowcheck">
                <input
                  type="checkbox"
                  checked={form.visaRequired}
                  onChange={(e) => setForm((f) => ({ ...f, visaRequired: e.target.checked }))}
                />
                {t("Visa / work permit required")}
              </label>
            ) : null}
          </>
        )}
        <div className="two">
          {caseType === "onboarding" ? (
            <label>
              {t("Start Date")}
              <input type="date" value={form.startDate} onChange={set("startDate")} required />
            </label>
          ) : (
            <span />
          )}
          <label>
            {t("PRIORITY")}
            <select value={form.priority} onChange={set("priority")}>
              {["High", "Medium", "Low"].map((x) => (
                <option key={x} value={x}>
                  {t(x)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {caseType === "onboarding" ? (
          <div className="two">
            <label>
              {t("Role / Title")}
              <input value={form.role} onChange={set("role")} maxLength={120} />
            </label>
            <label>
              {t("Location")}
              <input value={form.location} onChange={set("location")} maxLength={120} />
            </label>
          </div>
        ) : null}
        {caseType === "onboarding" ? (
          <div className="two">
            <label>
              {t("Supervisor")}
              <input
                value={form.supervisorName}
                onChange={set("supervisorName")}
                required
                maxLength={120}
                placeholder={t("Supervisor full name")}
              />
            </label>
            <label>
              {t("Supervisor Email")} ({t("Optional")})
              <input
                type="email"
                value={form.supervisorEmail}
                onChange={set("supervisorEmail")}
                maxLength={320}
              />
            </label>
          </div>
        ) : null}
        <label>
          {t("Notes")}
          <textarea value={form.notes} onChange={set("notes")} maxLength={2000} rows={3} />
        </label>
        <div className="modalactions">
          <button type="button" className="secondary" onClick={close}>
            {t("Cancel")}
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {t("Create Case")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
