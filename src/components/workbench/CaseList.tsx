import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { createCaseFn, getWorkbenchDataFn } from "@/lib/workbench.functions";
import type { WorkbenchData } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
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
  const [modalOpen, setModalOpen] = useState(openNew === "1");

  const wb: WorkbenchData | null = data && !("error" in data) ? data : null;

  const filtered = useMemo(() => {
    if (!wb) return [];
    const needle = search.trim().toLowerCase();
    return wb.cases.filter(
      (c) =>
        c.caseType.toLowerCase() === caseType &&
        (!needle || c.name.toLowerCase().includes(needle) || c.team.toLowerCase().includes(needle)) &&
        (!status || c.status === status) &&
        (!team || c.team === team) &&
        (!empType || c.employmentType === empType),
    );
  }, [wb, caseType, search, status, team, empType]);

  if (isLoading) return <Loading />;
  if (isError || !wb) return <Empty icon="alert" title={t("Something went wrong. Please try again.")} />;

  const title = caseType === "onboarding" ? "Onboarding" : "Offboarding";
  const statuses = [...new Set(wb.cases.filter((c) => c.caseType.toLowerCase() === caseType).map((c) => c.status))];
  const teams = [...new Set(wb.cases.map((c) => c.team))];
  const canCreate = wb.currentUser.role !== "Viewer";

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="eyebrow">{t(title)}</p>
          <h1>
            {filtered.length} {t("active cases across your scope")}
          </h1>
        </div>
        {canCreate ? (
          <button className="primary" onClick={() => setModalOpen(true)}>
            <Icon name="plus" /> {caseType === "onboarding" ? t("New Onboarding") : t("New Offboarding")}
          </button>
        ) : null}
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
          {["Employee", "Intern", "Contractor"].map((x) => (
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
        {search || status || team || empType ? (
          <button
            className="clear"
            onClick={() => {
              setSearch("");
              setStatus("");
              setTeam("");
              setEmpType("");
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
              className="row"
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
              <span className="duedate">{fmtDate(c.startDate, lang)}</span>
              <span>{c.owner}</span>
              <Badge>{c.status}</Badge>
              <Badge>{c.priority}</Badge>
              <span className="open">›</span>
            </div>
          ))}
        </div>
      )}

      {modalOpen ? <CreateCaseModal caseType={caseType} wb={wb} close={() => setModalOpen(false)} /> : null}
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const callCreate = useServerFn(createCaseFn);
  const [busy, setBusy] = useState(false);
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
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await callCreate({
        data: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim() || undefined,
          teamId: form.teamId || null,
          caseType,
          employmentType: form.employmentType as "Employee" | "Intern" | "Contractor",
          startDate: form.startDate,
          endDate: form.endDate || undefined,
          role: form.role || undefined,
          location: form.location || undefined,
          supervisorName: form.supervisorName.trim(),
          supervisorEmail: form.supervisorEmail.trim() || undefined,
          priority: form.priority as "High" | "Medium" | "Low",
          notes: form.notes || undefined,
        },
      });
      if ("error" in res) {
        toast.error(t("You don't have permission to do that."));
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
    <Modal title={caseType === "onboarding" ? t("New Onboarding") : t("New Offboarding")} close={close}>
      <form className="userform" onSubmit={submit}>
        <div className="two">
          <label>
            {t("First Name")}
            <input value={form.firstName} onChange={set("firstName")} required maxLength={60} />
          </label>
          <label>
            {t("Last Name")}
            <input value={form.lastName} onChange={set("lastName")} required maxLength={60} />
          </label>
        </div>
        <label>
          {t("Email")} ({t("Optional")})
          <input type="email" value={form.email} onChange={set("email")} maxLength={320} />
        </label>
        <div className="two">
          <label>
            {t("TEAM")}
            <select value={form.teamId} onChange={set("teamId")}>
              <option value="">—</option>
              {wb.teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Employment Type")}
            <select value={form.employmentType} onChange={set("employmentType")}>
              {["Employee", "Intern", "Contractor"].map((x) => (
                <option key={x} value={x}>
                  {t(x)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="two">
          <label>
            {caseType === "onboarding" ? t("Start Date") : t("End Date")}
            <input type="date" value={form.startDate} onChange={set("startDate")} required />
          </label>
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
            <input type="email" value={form.supervisorEmail} onChange={set("supervisorEmail")} maxLength={320} />
          </label>
        </div>
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
