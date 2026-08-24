import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  assignChecklistOwnerFn,
  getCaseDetailFn,
  getWorkbenchDataFn,
  removeMemberFn,
  shareCaseFn,
  toggleChecklistFn,
} from "@/lib/workbench.functions";
import type { CaseDetailDto, WorkbenchData } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Badge, Empty, Icon, Loading, Modal } from "@/components/workbench/ui";

export const Route = createFileRoute("/_authenticated/cases/$caseId")({
  head: () => ({
    meta: [
      { title: "Case Detail · Team Workbench" },
      { name: "description", content: "Case overview, checklist, communication, files and history." },
    ],
  }),
  component: CaseDetailPage,
});

const TABS = ["Overview", "Checklist", "Communication", "Files", "History"];

function CaseDetailPage() {
  const { caseId } = Route.useParams();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getCaseDetailFn);
  const fetchWb = useServerFn(getWorkbenchDataFn);
  const { data, isLoading } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => fetchDetail({ data: { caseId } }),
  });
  const { data: wbData } = useQuery({ queryKey: ["workbench"], queryFn: () => fetchWb() });
  const [tab, setTab] = useState("Overview");
  const [shareOpen, setShareOpen] = useState(false);

  if (isLoading) return <Loading />;
  if (!data || "error" in data) {
    return (
      <Empty
        icon="lock"
        title={t("Case not found or no access.")}
        action={t("Back")}
        onAction={() => navigate({ to: "/onboarding", search: { q: "", new: "" } })}
      />
    );
  }
  const detail = data as CaseDetailDto;
  const c = detail.case;
  const isOwner = c.accessLevel === "Owner";
  const canEdit = isOwner || c.accessLevel === "Collaborator";
  const wb: WorkbenchData | null = wbData && !("error" in wbData) ? wbData : null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["case", caseId] });

  return (
    <div>
      <button
        className="back"
        onClick={() =>
          navigate({
            to: c.caseType === "Onboarding" ? "/onboarding" : "/offboarding",
            search: { q: "", new: "" },
          })
        }
      >
        ‹ {t("Back")}
      </button>

      <div className="casehero">
        <span className="personavatar">{c.initials}</span>
        <div>
          <h2>{c.name}</h2>
          <p>
            {c.role ?? t(c.employmentType)} · {c.team} · {t(c.caseType)}
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Badge>{c.status}</Badge>
          <Badge>{c.priority}</Badge>
          <Badge>{c.accessLevel}</Badge>
          {isOwner ? (
            <button className="primary" onClick={() => setShareOpen(true)}>
              <Icon name="link" /> {t("Share")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="tabs">
        {TABS.map((x) => (
          <button key={x} className={tab === x ? "active" : ""} onClick={() => setTab(x)}>
            {t(x)}
          </button>
        ))}
      </div>

      {tab === "Overview" ? <OverviewTab detail={detail} /> : null}
      {tab === "Checklist" ? (
        <ChecklistTab detail={detail} canEdit={canEdit} refresh={refresh} caseId={caseId} />
      ) : null}
      {tab === "Communication" ? <CommunicationTab detail={detail} caseId={caseId} /> : null}
      {tab === "Files" ? <FilesTab detail={detail} canEdit={canEdit} refresh={refresh} caseId={caseId} /> : null}
      {tab === "History" ? <HistoryTab detail={detail} /> : null}

      {shareOpen && wb ? (
        <ShareModal detail={detail} wb={wb} caseId={caseId} close={() => setShareOpen(false)} refresh={refresh} />
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  const { t, lang } = useLang();
  return (
    <div>
      <span>{t(label)}</span>
      <b>{value && /^\d{4}-\d{2}-\d{2}/.test(value) ? fmtDate(value, lang) : (value ?? "—")}</b>
    </div>
  );
}

function OverviewTab({ detail }: { detail: CaseDetailDto }) {
  const { t } = useLang();
  const c = detail.case;
  return (
    <div className="overviewgrid">
      <div className="detailcard">
        <b>{t("Personal & Contact")}</b>
        <div className="fields">
          <Field label="Email" value={c.personEmail} />
          <Field label="Employee ID" value={c.employeeId} />
          <Field label="Phone" value={c.phone} />
          <Field label="Manager" value={c.managerName} />
          <Field label={t("Supervisor")} value={c.supervisorName} />
          <Field label={t("Supervisor Email")} value={c.supervisorEmail} />
        </div>
      </div>
      <div className="detailcard">
        <b>{t("Job Details")}</b>
        <div className="fields">
          <Field label="Role / Title" value={c.role} />
          <Field label="TEAM" value={c.team} />
          <Field label="Location" value={c.location} />
          <Field label="Employment Type" value={t(c.employmentType)} />
          <Field label="Workload" value={c.workload} />
          <Field label="Contract Type" value={c.contractType} />
        </div>
      </div>
      <div className="detailcard">
        <b>{t("Timeline")}</b>
        <div className="fields">
          <Field label="Start Date" value={c.startDate} />
          <Field label="End Date" value={c.endDate} />
          <Field label="OWNER" value={c.owner} />
        </div>
      </div>
      <div className="detailcard">
        <b>{c.notes !== null ? t("Notes") : t("Notes (restricted)")}</b>
        {c.notes !== null ? (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-sub)", whiteSpace: "pre-wrap" }}>{c.notes}</p>
        ) : (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-sub)" }}>
            <Icon name="lock" /> {t("Restricted field: visible to case owners and collaborators only.")}
          </p>
        )}
      </div>
    </div>
  );
}

function ChecklistTab({
  detail,
  canEdit,
  refresh,
  caseId,
}: {
  detail: CaseDetailDto;
  canEdit: boolean;
  refresh: () => void;
  caseId: string;
}) {
  const { t, lang } = useLang();
  const callToggle = useServerFn(toggleChecklistFn);
  const callAssign = useServerFn(assignChecklistOwnerFn);
  const qc = useQueryClient();

  const toggle = async (itemId: string, complete: boolean) => {
    const res = await callToggle({ data: { itemId, complete } });
    if ("error" in res) {
      toast.error(t("You don't have permission to do that."));
      return;
    }
    refresh();
    qc.invalidateQueries({ queryKey: ["workbench"] });
  };

  const assign = async (itemId: string, ownerId: string | null) => {
    const res = await callAssign({ data: { itemId, ownerId } });
    if ("error" in res) {
      toast.error(t("You don't have permission to do that."));
      return;
    }
    refresh();
  };

  if (detail.checklist.length === 0) {
    return <Empty icon="check" title={t("No checklist items yet.")} />;
  }

  const sections = [...new Set(detail.checklist.map((c) => c.section))];
  return (
    <div className="panel">
      {sections.map((section) => (
        <div key={section}>
          <div className="panelhead" style={{ marginTop: 8 }}>
            <b>{section}</b>
          </div>
          <div className="checklist">
            {detail.checklist
              .filter((item) => item.section === section)
              .map((item) => {
                const done = item.status === "Done";
                return (
                  <div className="checkrow" key={item.id}>
                    <button
                      className={`taskcheck${done ? " done" : ""}`}
                      disabled={!canEdit}
                      onClick={() => toggle(item.id, !done)}
                      aria-label={done ? t("Reopen") : t("Mark Done")}
                    >
                      <Icon name="check" />
                    </button>
                    <div className="taskmain">
                      <b style={done ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>{item.title}</b>
                      <span>
                        {item.dueDate ? `${t("due")} ${fmtDate(item.dueDate, lang)}` : ""}
                        {item.completedByName ? ` · ${t("Completed by")} ${item.completedByName}` : ""}
                      </span>
                    </div>
                    {canEdit ? (
                      <select
                        className="ownerselect"
                        value={item.ownerId ?? ""}
                        onChange={(e) => assign(item.id, e.target.value || null)}
                      >
                        <option value="">{t("Unassigned")}</option>
                        {detail.assignableUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{item.ownerName || t("Unassigned")}</span>
                    )}
                    <Badge>{item.status}</Badge>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
      <p style={{ display: "none" }}>{caseId}</p>
    </div>
  );
}

function CommunicationTab({ detail, caseId }: { detail: CaseDetailDto; caseId: string }) {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const drafts = detail.history.filter((h) => h.action === "Email draft saved");
  return (
    <div className="panel">
      <div className="panelhead">
        <b>{t("Communication")}</b>
        <button className="primary" onClick={() => navigate({ to: "/email", search: { caseId } })}>
          <Icon name="mail" /> {t("Compose Email")}
        </button>
      </div>
      {drafts.length === 0 ? (
        <Empty
          icon="mail"
          title={t("No communications yet.")}
          action={t("Send the first email")}
          onAction={() => navigate({ to: "/email", search: { caseId } })}
        />
      ) : (
        <div className="communications">
          {drafts.map((d) => (
            <div className="comm" key={d.id}>
              <span className="mailicon">
                <Icon name="mail" />
              </span>
              <div>
                <b>{d.action}</b>
                <span>
                  {d.actorName} · {fmtDateTime(d.at, lang)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilesTab({
  detail,
  canEdit,
  refresh,
  caseId,
}: {
  detail: CaseDetailDto;
  canEdit: boolean;
  refresh: () => void;
  caseId: string;
}) {
  const { t, lang } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const path = `${caseId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("case-files").upload(path, file);
      if (upErr) throw upErr;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("no session");
      const { error: rowErr } = await supabase.from("case_files").insert({
        case_id: caseId,
        storage_path: path,
        filename: file.name,
        size: file.size,
        content_type: file.type || null,
        uploaded_by: user.id,
      });
      if (rowErr) throw rowErr;
      toast.success(t("Saved"));
      refresh();
    } catch {
      toast.error(t("You don't have permission to do that."));
    } finally {
      setBusy(false);
    }
  };

  const download = async (fileId: string, filename: string) => {
    const f = detail.files.find((x) => x.id === fileId);
    if (!f) return;
    void filename;
    const { data: row } = await supabase.from("case_files").select("storage_path").eq("id", fileId).maybeSingle();
    if (!row) return;
    const { data: signed } = await supabase.storage.from("case-files").createSignedUrl(row.storage_path, 60);
    if (signed?.signedUrl) window.open(signed.signedUrl, "_blank", "noopener");
  };

  const remove = async (fileId: string) => {
    const { data: row } = await supabase.from("case_files").select("storage_path").eq("id", fileId).maybeSingle();
    if (!row) return;
    await supabase.storage.from("case-files").remove([row.storage_path]);
    await supabase.from("case_files").delete().eq("id", fileId);
    refresh();
  };

  return (
    <div className="panel">
      <div className="panelhead">
        <b>{t("Files")}</b>
        {canEdit ? (
          <>
            <input
              ref={inputRef}
              type="file"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
            <button className="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Icon name="upload" /> {busy ? t("Uploading…") : t("Upload File")}
            </button>
          </>
        ) : null}
      </div>
      {detail.files.length === 0 ? (
        <div className="inlineempty">
          <Icon name="folder" /> {t("No files yet. Upload contracts, forms or certificates here.")}
        </div>
      ) : (
        <div className="communications">
          {detail.files.map((f) => (
            <div className="comm" key={f.id}>
              <span className="mailicon">
                <Icon name="doc" />
              </span>
              <div>
                <b>{f.filename}</b>
                <span>
                  {f.size ? `${Math.round(f.size / 1024)} KB · ` : ""}
                  {f.uploadedByName} · {fmtDateTime(f.at, lang)}
                </span>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button className="textbutton" onClick={() => download(f.id, f.filename)}>
                  {t("Download")}
                </button>
                {canEdit ? (
                  <button className="textbutton" onClick={() => remove(f.id)}>
                    {t("Delete")}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryTab({ detail }: { detail: CaseDetailDto }) {
  const { t, lang } = useLang();
  if (detail.history.length === 0) return <Empty icon="history" title={t("No history yet.")} />;
  return (
    <div className="panel">
      <div className="history">
        {detail.history.map((h) => (
          <div className="historyrow" key={h.id}>
            <div className="timeline" />
            <div>
              <b>{h.action}</b>
              <span>
                {h.actorName} · {fmtDateTime(h.at, lang)}
                {h.newValue ? ` · ${h.newValue}` : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShareModal({
  detail,
  wb,
  caseId,
  close,
  refresh,
}: {
  detail: CaseDetailDto;
  wb: WorkbenchData;
  caseId: string;
  close: () => void;
  refresh: () => void;
}) {
  const { t } = useLang();
  const callShare = useServerFn(shareCaseFn);
  const callRemove = useServerFn(removeMemberFn);
  const [target, setTarget] = useState("");
  const [level, setLevel] = useState<"viewer" | "collaborator">("viewer");
  const [busy, setBusy] = useState(false);

  const memberIds = new Set(detail.members.map((m) => m.userId));
  const candidates = wb.users.filter(
    (u) => u.status === "Active" && !memberIds.has(u.id) && u.id !== detail.case.ownerId,
  );

  const share = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const res = await callShare({ data: { caseId, targetUserId: target, accessLevel: level } });
      if ("error" in res) {
        toast.error(
          res.error === "already_shared"
            ? t("This person is already shared on the case.")
            : t("You don't have permission to do that."),
        );
        return;
      }
      toast.success(t("Saved"));
      refresh();
      setTarget("");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (memberId: string) => {
    const res = await callRemove({ data: { memberId } });
    if ("error" in res) {
      toast.error(t("You don't have permission to do that."));
      return;
    }
    refresh();
  };

  return (
    <Modal title={t("Share Case")} close={close}>
      <div className="sharefield">
        <label>{t("Choose a colleague")}</label>
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">—</option>
          {candidates.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} {u.title ? `· ${u.title}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="sharefield">
        <label>{t("Choose access level")}</label>
        <div className="accesschoice">
          <button className={level === "viewer" ? "active" : ""} onClick={() => setLevel("viewer")}>
            <b>{t("Viewer")}</b>
            <span>{t("Can view case details")}</span>
          </button>
          <button className={level === "collaborator" ? "active" : ""} onClick={() => setLevel("collaborator")}>
            <b>{t("Collaborator")}</b>
            <span>{t("Can edit tasks and upload files")}</span>
          </button>
        </div>
      </div>
      <div className="modalactions">
        <button className="secondary" onClick={close}>
          {t("Cancel")}
        </button>
        <button className="primary" disabled={!target || busy} onClick={share}>
          <Icon name="link" /> {t("Share")}
        </button>
      </div>
      <div className="sharefield" style={{ marginTop: 16 }}>
        <label>{t("People with access")}</label>
        {detail.members.length === 0 ? (
          <div className="inlineempty">{t("This case has not been shared yet.")}</div>
        ) : (
          detail.members.map((m) => (
            <div className="memberrow" key={m.id}>
              <b>{m.name}</b>
              <Badge>{m.accessLevel}</Badge>
              <button className="textbutton" onClick={() => remove(m.id)}>
                {t("Remove")}
              </button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
