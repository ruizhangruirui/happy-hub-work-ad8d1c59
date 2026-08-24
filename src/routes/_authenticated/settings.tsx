import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { saveLabFn, saveTeamFn, saveUserFn } from "@/lib/workbench.functions";
import { useWorkbench } from "@/components/workbench/CaseList";
import type { UserDto, WorkbenchData } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { opErrorMessage } from "@/lib/errors";
import { Badge, Empty, Icon, Loading, Modal } from "@/components/workbench/ui";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Team Workbench" },
      { name: "description", content: "Manage users, roles, scopes and review your access level." },
    ],
  }),
  component: SettingsPage,
});

const SETTING_TABS = ["Users", "Organization", "Roles & Permissions", "Overview"];
const ROLES = ["admin", "operator", "manager", "viewer"] as const;
const ROLE_LABELS: Record<string, string> = { admin: "Admin", operator: "Operator", manager: "Manager", viewer: "Viewer" };

function SettingsPage() {
  const { t } = useLang();
  const { data, isLoading, isError } = useWorkbench();
  const [tab, setTab] = useState("Users");
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [adding, setAdding] = useState(false);

  if (isLoading) return <Loading />;
  if (isError || !data || "error" in data) {
    return <Empty icon="alert" title={t("Something went wrong. Please try again.")} />;
  }
  const wb = data as WorkbenchData;
  const isAdmin = wb.currentUser.role === "Admin";

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="eyebrow">{t("ADMIN")}</p>
          <h1>{t("Settings")}</h1>
        </div>
        {isAdmin && tab === "Users" ? (
          <button className="primary" onClick={() => setAdding(true)}>
            <Icon name="plus" /> {t("Add User")}
          </button>
        ) : null}
      </div>

      <div className="tabs">
        {SETTING_TABS.map((x) => (
          <button key={x} className={tab === x ? "active" : ""} onClick={() => setTab(x)}>
            {t(x)}
          </button>
        ))}
      </div>

      {tab === "Users" ? (
        <div className="casetable">
          <div className="row head">
            <span>{t("PERSON")}</span>
            <span>{t("Email")}</span>
            <span>{t("Role / Title")}</span>
            <span>{t("Scope")}</span>
            <span>{t("STATUS")}</span>
            <span />
          </div>
          {wb.users.map((u) => (
            <div className="row" key={u.id}>
              <div className="person">
                <span className="miniavatar">
                  {u.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <b>{u.name}</b>
                  <span>{u.title ?? ""}</span>
                </div>
              </div>
              <span>{u.email ?? "—"}</span>
              <span>
                <Badge>{u.role}</Badge>
              </span>
              <span>{u.scopes.map((s) => t(s)).join(", ") || "—"}</span>
              <Badge>{u.status}</Badge>
              {isAdmin ? (
                <button className="textbutton" onClick={() => setEditing(u)}>
                  {t("Edit")}
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      ) : null}

      {tab === "Organization" ? <OrgManager wb={wb} isAdmin={isAdmin} /> : null}

      {tab === "Roles & Permissions" ? (
        <div className="settingsgrid">
          {Object.entries(wb.permissions).map(([role, perms]) => (
            <div className="setting" key={role}>
              <b>{t(role)}</b>
              {perms.map((p) => (
                <p key={p}>
                  <Icon name="check" /> {t(p)}
                </p>
              ))}
              <em>{wb.users.filter((u) => u.role === role).length}</em>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "Overview" ? (
        <div className="accessnote">
          <span>
            <Icon name="shield" />
          </span>
          <div>
            <b>{t("Your access level")}</b>
            <p>
              {t(wb.currentUser.role)} · {wb.currentUser.scopes.map((s) => t(s)).join(", ") || t("Assigned Cases")}
            </p>
          </div>
          <Badge>{wb.currentUser.role}</Badge>
        </div>
      ) : null}

      {adding ? <UserModal wb={wb} close={() => setAdding(false)} /> : null}
      {editing ? <UserModal wb={wb} user={editing} close={() => setEditing(null)} /> : null}
    </div>
  );
}

function UserModal({ wb, user, close }: { wb: WorkbenchData; user?: UserDto; close: () => void }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const callSave = useServerFn(saveUserFn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);

  const roleKey = (user?.role ?? "viewer").toLowerCase();
  const scopeRaw = user?.scopes[0] ?? "";
  const initialScope = scopeRaw.startsWith("Lab:")
    ? "lab"
    : scopeRaw.startsWith("Team:")
      ? "team"
      : scopeRaw === "All Organization"
        ? "all_organization"
        : "assigned_cases";

  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    title: user?.title ?? "",
    role: (ROLES.includes(roleKey as (typeof ROLES)[number]) ? roleKey : "viewer") as (typeof ROLES)[number],
    status: user?.status ?? "Active",
    scopeType: initialScope as "all_organization" | "lab" | "team" | "assigned_cases",
    labId: wb.labs[0]?.id ?? "",
    teamId: wb.teams[0]?.id ?? "",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await callSave({
        data: {
          id: user?.id,
          name: form.name.trim(),
          email: user ? undefined : form.email.trim(),
          title: form.title || undefined,
          role: form.role,
          status: form.status as "Active" | "Inactive",
          scopeType: form.scopeType,
          labId: form.scopeType === "lab" ? form.labId : null,
          teamId: form.scopeType === "team" ? form.teamId : null,
        },
      });
      if ("error" in res) {
        setError(opErrorMessage(t, res.error));
        return;
      }
      await qc.invalidateQueries({ queryKey: ["workbench"] });
      if ("password" in res && res.password) {
        setPassword(res.password);
        return;
      }
      toast.success(t("Saved"));
      close();
    } catch {
      setError(t("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={user ? t("Edit User") : t("Add User")} close={close}>
      {password ? (
        <div>
          <p className="authhint">
            {t("Temporary password (share securely, shown once):")}
            <br />
            <b style={{ fontSize: 15, userSelect: "all" }}>{password}</b>
          </p>
          <div className="modalactions">
            <button className="primary" onClick={close}>
              {t("Close")}
            </button>
          </div>
        </div>
      ) : (
        <form className="userform" onSubmit={submit}>
          <label>
            {t("Full Name")}
            <input value={form.name} onChange={set("name")} required maxLength={120} />
          </label>
          <label>
            {t("Email")}
            <input
              type="email"
              value={form.email}
              onChange={set("email")}
              required
              disabled={Boolean(user)}
              maxLength={320}
            />
          </label>
          <label>
            {t("Title")}
            <input value={form.title} onChange={set("title")} maxLength={120} />
          </label>
          <div className="two">
            <label>
              {t("Role / Title")}
              <select value={form.role} onChange={set("role")}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(ROLE_LABELS[r] ?? r)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("STATUS")}
              <select value={form.status} onChange={set("status")}>
                <option value="Active">{t("Active")}</option>
                <option value="Inactive">{t("Inactive")}</option>
              </select>
            </label>
          </div>
          <label>
            {t("Scope")}
            <select value={form.scopeType} onChange={set("scopeType")}>
              <option value="all_organization">{t("All Organization")}</option>
              <option value="lab">Lab</option>
              <option value="team">{t("TEAM")}</option>
              <option value="assigned_cases">{t("Assigned Cases")}</option>
            </select>
          </label>
          {form.scopeType === "lab" ? (
            <label>
              Lab
              <select value={form.labId} onChange={set("labId")}>
                {wb.labs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {form.scopeType === "team" ? (
            <label>
              {t("TEAM")}
              <select value={form.teamId} onChange={set("teamId")}>
                {wb.teams.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {error ? <div className="autherror">{error}</div> : null}
          <div className="modalactions">
            <button type="button" className="secondary" onClick={close}>
              {t("Cancel")}
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {user ? t("Save Changes") : t("Add")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function OrgManager({ wb, isAdmin }: { wb: WorkbenchData; isAdmin: boolean }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const callSaveLab = useServerFn(saveLabFn);
  const callSaveTeam = useServerFn(saveTeamFn);
  const [labName, setLabName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamLab, setTeamLab] = useState(wb.labs[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const labNameOf = (id: string | null) => wb.labs.find((l) => l.id === id)?.name ?? "—";

  const run = async (fn: () => Promise<{ error?: string } | { ok: true }>) => {
    setBusy(true);
    try {
      const res = await fn();
      if ("error" in res) {
        toast.error(opErrorMessage(t, res.error));
        return;
      }
      await qc.invalidateQueries({ queryKey: ["workbench"] });
      toast.success(t("Saved"));
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const addLab = async (e: FormEvent) => {
    e.preventDefault();
    const name = labName.trim();
    if (!name) return;
    await run(() => callSaveLab({ data: { name } }));
    setLabName("");
  };

  const addTeam = async (e: FormEvent) => {
    e.preventDefault();
    const name = teamName.trim();
    if (!name || !teamLab) return;
    await run(() => callSaveTeam({ data: { name, labId: teamLab } }));
    setTeamName("");
  };

  const toggleLab = (id: string, name: string, status: string) =>
    run(() =>
      callSaveLab({ data: { id, name, status: status === "Active" ? "Inactive" : "Active" } }),
    );

  const toggleTeam = (id: string, name: string, labId: string | null, status: string) =>
    run(() =>
      callSaveTeam({
        data: { id, name, labId: labId ?? wb.labs[0]?.id ?? "", status: status === "Active" ? "Inactive" : "Active" },
      }),
    );

  return (
    <div className="orggrid">
      <div className="panel">
        <div className="panelhead">
          <div>
            <b>{t("Labs")}</b>
            <p>{wb.labs.length} {t("labs")}</p>
          </div>
        </div>
        {wb.labs.map((l) => (
          <div className="orgrow" key={l.id}>
            <b>{l.name}</b>
            <Badge>{l.status}</Badge>
            {isAdmin ? (
              <button className="textbutton" disabled={busy} onClick={() => toggleLab(l.id, l.name, l.status)}>
                {l.status === "Active" ? t("Deactivate") : t("Activate")}
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        {isAdmin ? (
          <form className="orgadd" onSubmit={addLab}>
            <input
              value={labName}
              onChange={(e) => setLabName(e.target.value)}
              placeholder={t("New lab name")}
              maxLength={120}
            />
            <button type="submit" className="secondary" disabled={busy || !labName.trim()}>
              <Icon name="plus" /> {t("Add Lab")}
            </button>
          </form>
        ) : null}
      </div>

      <div className="panel">
        <div className="panelhead">
          <div>
            <b>{t("Teams")}</b>
            <p>{wb.teams.length} {t("teams")}</p>
          </div>
        </div>
        {wb.teams.map((tm) => (
          <div className="orgrow" key={tm.id}>
            <b>
              {tm.name} <span className="labname">· {labNameOf(tm.labId)}</span>
            </b>
            <Badge>{tm.status}</Badge>
            {isAdmin ? (
              <button
                className="textbutton"
                disabled={busy}
                onClick={() => toggleTeam(tm.id, tm.name, tm.labId, tm.status)}
              >
                {tm.status === "Active" ? t("Deactivate") : t("Activate")}
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        {isAdmin ? (
          <form className="orgadd" onSubmit={addTeam}>
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder={t("New team name")}
              maxLength={120}
            />
            <select value={teamLab} onChange={(e) => setTeamLab(e.target.value)}>
              {wb.labs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <button type="submit" className="secondary" disabled={busy || !teamName.trim() || !teamLab}>
              <Icon name="plus" /> {t("Add Team")}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
