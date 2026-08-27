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
  toggleTaskFn,
  updateWorkflowItemFn,
  setCaseConfirmationFn,
  createExternalRequestFn,
} from "@/lib/workbench.functions";
import type { CaseDetailDto, WorkbenchData } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { opErrorMessage } from "@/lib/errors";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Badge, Empty, Icon, Loading, Modal } from "@/components/workbench/ui";

export const Route = createFileRoute("/_authenticated/cases/$caseId")({
  head: () => ({
    meta: [
      { title: "Case Detail · Team Workbench" },
      {
        name: "description",
        content: "Case overview, checklist, communication, files and history.",
      },
    ],
  }),
  component: CaseDetailPage,
});

const TABS = ["Overview", "Tasks", "Workflow", "Checklist", "Communication", "Files", "History"];

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
  const setConfirmation = useServerFn(setCaseConfirmationFn);

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
  const completedTasks = detail.tasks.filter((x) => x.status.toLowerCase() === "completed").length;
  const taskProgress = detail.tasks.length
    ? Math.round((completedTasks / detail.tasks.length) * 100)
    : 0;
  const changeConfirmation = async (confirmed: boolean) => {
    const message = confirmed
      ? c.caseType === "Onboarding"
        ? t(
            "The person will become Active and appear in Active People. This onboarding case and all open tasks will remain.",
          )
        : t(
            "The person will immediately leave Active People. Person history, this case and post-leaving tasks will remain.",
          )
      : t("This reopens the lifecycle confirmation for correction. History remains available.");
    if (!window.confirm(message)) return;
    try {
      const res = await setConfirmation({ data: { caseId, confirmed } });
      if ("error" in res) {
        toast.error(opErrorMessage(t, res.error));
        return;
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case", caseId] }),
        qc.invalidateQueries({ queryKey: ["workbench"] }),
        qc.invalidateQueries({ queryKey: ["active-roster"] }),
      ]);
      toast.success(
        t(
          confirmed
            ? c.caseType === "Onboarding"
              ? "Joined confirmed"
              : "Left confirmed"
            : "Case reopened",
        ),
      );
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    }
  };

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
          {c.caseType === "Onboarding" ? (
            <span className="caseprogress">
              <b>{taskProgress}%</b>
              <i>
                <em style={{ width: `${taskProgress}%` }} />
              </i>
              <small>
                {completedTasks}/{detail.tasks.length} {t("tasks completed")}
              </small>
            </span>
          ) : null}
          {canEdit ? (
            <button
              className={c.joinedAt || c.leftAt ? "secondary" : "primary"}
              onClick={() => changeConfirmation(!(c.joinedAt || c.leftAt))}
            >
              <Icon name={c.joinedAt || c.leftAt ? "history" : "check"} />{" "}
              {t(
                c.joinedAt || c.leftAt
                  ? "Reopen confirmation"
                  : c.caseType === "Onboarding"
                    ? "Confirm Joined"
                    : "Confirm Left",
              )}
            </button>
          ) : null}
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
      {tab === "Tasks" ? <TasksTab detail={detail} canEdit={canEdit} refresh={refresh} /> : null}
      {tab === "Workflow" ? (
        <WorkflowTab detail={detail} canEdit={canEdit} refresh={refresh} />
      ) : null}
      {tab === "Checklist" ? (
        <ChecklistTab detail={detail} canEdit={canEdit} refresh={refresh} caseId={caseId} />
      ) : null}
      {tab === "Communication" ? <CommunicationTab detail={detail} caseId={caseId} /> : null}
      {tab === "Files" ? (
        <FilesTab detail={detail} canEdit={canEdit} refresh={refresh} caseId={caseId} />
      ) : null}
      {tab === "History" ? <HistoryTab detail={detail} /> : null}

      {shareOpen && wb ? (
        <ShareModal
          detail={detail}
          wb={wb}
          caseId={caseId}
          close={() => setShareOpen(false)}
          refresh={refresh}
        />
      ) : null}
    </div>
  );
}

function TasksTab({
  detail,
  canEdit,
  refresh,
}: {
  detail: CaseDetailDto;
  canEdit: boolean;
  refresh: () => void;
}) {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const toggle = useServerFn(toggleTaskFn);
  const qc = useQueryClient();
  const update = async (taskId: string, complete: boolean) => {
    try {
      const res = await toggle({ data: { taskId, complete } });
      if ("error" in res) {
        toast.error(opErrorMessage(t, res.error));
        return;
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ["workbench"] }), refresh()]);
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    }
  };
  if (!detail.tasks.length) return <Empty icon="check" title={t("No tasks yet.")} />;
  return (
    <div className="panel">
      <div className="panelhead">
        <div>
          <b>{t("Case Tasks")}</b>
          <p>{t("Tasks are generated automatically from the onboarding case.")}</p>
        </div>
        <Badge>{`${detail.tasks.filter((x) => x.status.toLowerCase() === "completed").length}/${detail.tasks.length}`}</Badge>
      </div>
      <div className="casetasks">
        {detail.tasks.map((task) => {
          const done = task.status.toLowerCase() === "completed";
          const welcome =
            task.defaultTaskKey === "send_welcome_email" ||
            task.title.toLowerCase().includes("welcome email");
          return (
            <div className={`casetask ${done ? "done" : ""}`} key={task.id}>
              <button
                className={`taskcheck${done ? " done" : ""}`}
                disabled={!canEdit}
                onClick={() => update(task.id, !done)}
              >
                <Icon name="check" />
              </button>
              <div className="taskmain">
                <b>{t(task.title)}</b>
                <span>
                  {task.assigneeRole ? `${t("Assigned role")}: ${t(task.assigneeRole)}` : ""}
                  {task.due ? ` · ${t("due")} ${fmtDate(task.due, lang)}` : ""}
                </span>
              </div>
              <Badge>{task.status}</Badge>
              {welcome && !done ? (
                <button
                  className="primary emailtaskbutton"
                  onClick={() =>
                    navigate({ to: "/email", search: { caseId: detail.case.id, taskId: task.id } })
                  }
                >
                  <Icon name="mail" />
                  {t("Go send email")}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkflowTab({
  detail,
  canEdit,
  refresh,
}: {
  detail: CaseDetailDto;
  canEdit: boolean;
  refresh: () => void;
}) {
  const { t, lang } = useLang();
  const update = useServerFn(updateWorkflowItemFn);
  const [requestItem, setRequestItem] = useState<CaseDetailDto["workflow"][number] | null>(null);
  const done = detail.workflow.filter(
    (x) => x.status === "Completed" || x.status === "Not Required",
  ).length;
  const setStatus = async (
    itemId: string,
    status: "Not Started" | "In Progress" | "Blocked" | "Completed" | "Not Required",
  ) => {
    try {
      const res = await update({ data: { itemId, status } });
      if ("error" in res) {
        toast.error(opErrorMessage(t, res.error));
        return;
      }
      refresh();
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    }
  };
  return (
    <>
      <div className="panel workflowpanel">
        <div className="panelhead">
          <div>
            <b>{t("Onboarding workflow")}</b>
            <p>
              {done} / {detail.workflow.length} {t("steps complete")}
            </p>
          </div>
          <Badge>{`${Math.round((done / Math.max(detail.workflow.length, 1)) * 100)}%`}</Badge>
        </div>
        <div className="workflowline">
          {detail.workflow.map((item, index) => {
            const requests = detail.externalRequests.filter((x) => x.workflowItemId === item.id);
            return (
              <div
                className={`workflowstep ${item.status.toLowerCase().replaceAll(" ", "-")}`}
                key={item.id}
              >
                <span className="workflowdot">{item.status === "Completed" ? "✓" : index + 1}</span>
                <div className="workflowbody">
                  <div>
                    <b>{t(item.title)}</b>
                    <Badge>{item.status}</Badge>
                  </div>
                  {item.description ? <p>{t(item.description)}</p> : null}
                  <small>
                    {item.targetDate
                      ? `${t("Target")} ${fmtDate(item.targetDate, lang)}`
                      : t("No target date")}
                    {item.completedByName ? ` · ${t("Completed by")} ${item.completedByName}` : ""}
                  </small>
                  {requests.map((x) => (
                    <div className="externalrequest" key={x.id}>
                      <Icon name="mail" />
                      <span>
                        <b>{x.recipientTeam || x.recipientName || x.recipientEmail}</b>
                        <small>
                          {x.recipientEmail}
                          {x.respondedAt ? ` · ${fmtDateTime(x.respondedAt, lang)}` : ""}
                        </small>
                        {x.responseNote ? <em>{x.responseNote}</em> : null}
                      </span>
                      <Badge>{x.status}</Badge>
                    </div>
                  ))}
                  {canEdit && item.status !== "Not Required" ? (
                    <div className="workflowactions">
                      <select
                        value={item.status}
                        onChange={(e) =>
                          setStatus(
                            item.id,
                            e.target.value as
                              "Not Started" | "In Progress" | "Blocked" | "Completed",
                          )
                        }
                      >
                        <option>Not Started</option>
                        <option>In Progress</option>
                        <option>Blocked</option>
                        <option>Completed</option>
                      </select>
                      <button className="secondary" onClick={() => setRequestItem(item)}>
                        <Icon name="send" /> {t("Request external update")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {requestItem ? (
        <ExternalRequestModal
          item={requestItem}
          personName={detail.case.name}
          close={() => setRequestItem(null)}
          refresh={refresh}
        />
      ) : null}
    </>
  );
}

function ExternalRequestModal({
  item,
  personName,
  close,
  refresh,
}: {
  item: CaseDetailDto["workflow"][number];
  personName: string;
  close: () => void;
  refresh: () => void;
}) {
  const { t, lang } = useLang();
  const createRequest = useServerFn(createExternalRequestFn);
  const [form, setForm] = useState({
    recipientEmail: "",
    recipientName: "",
    recipientTeam: "",
    dueDate: item.targetDate ?? "",
    requestMessage: "",
  });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!form.recipientEmail) return;
    setBusy(true);
    try {
      const res = await createRequest({ data: { workflowItemId: item.id, ...form } });
      if ("error" in res) {
        toast.error(opErrorMessage(t, res.error));
        return;
      }
      const link = `${window.location.origin}/respond/${res.token}`;
      const subject = `${t("Action required")}: ${t(item.title)} · ${personName}`;
      const greeting = form.recipientName
        ? `${t("Hello")} ${form.recipientName},`
        : `${t("Hello")},`;
      const body =
        lang === "zh"
          ? `${greeting}\n\n请协助处理以下事项：${t(item.title)}（${personName}）。${form.requestMessage ? `\n\n${form.requestMessage}` : ""}${form.dueDate ? `\n\n截止日期：${fmtDate(form.dueDate, lang)}` : ""}\n\n无需登录，请通过以下安全链接反馈进度：\n${link}\n\n谢谢。`
          : `${greeting}\n\nPlease help with the following task: ${item.title} for ${personName}.${form.requestMessage ? `\n\n${form.requestMessage}` : ""}${form.dueDate ? `\n\nDue: ${fmtDate(form.dueDate, lang)}` : ""}\n\nNo account is required. Please update the progress using this secure link:\n${link}\n\nThank you.`;
      await navigator.clipboard?.writeText(link).catch(() => undefined);
      refresh();
      close();
      window.location.href = `mailto:${encodeURIComponent(form.recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      toast.success(t("Feedback link created and copied"));
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t("Request external update")} close={close}>
      <div className="externalform">
        <div className="requestsummary">
          <Icon name="send" />
          <div>
            <b>{t(item.title)}</b>
            <span>{personName}</span>
          </div>
        </div>
        <div className="userform two">
          <label>
            <span>{t("Recipient Email")}</span>
            <input
              type="email"
              required
              value={form.recipientEmail}
              onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })}
            />
          </label>
          <label>
            <span>{t("Recipient Name")}</span>
            <input
              value={form.recipientName}
              onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
            />
          </label>
          <label>
            <span>{t("Recipient Team")}</span>
            <input
              placeholder="IT / Administration / Reception"
              value={form.recipientTeam}
              onChange={(e) => setForm({ ...form, recipientTeam: e.target.value })}
            />
          </label>
          <label>
            <span>{t("Due Date")}</span>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </label>
        </div>
        <label className="sharefield">
          <span>{t("Message")}</span>
          <textarea
            rows={4}
            maxLength={1000}
            value={form.requestMessage}
            onChange={(e) => setForm({ ...form, requestMessage: e.target.value })}
          />
        </label>
        <p className="securityhint">
          <Icon name="lock" />{" "}
          {t(
            "The recipient will receive a private feedback link and will not need a Team Workbench account.",
          )}
        </p>
        <div className="modalactions">
          <button className="secondary" onClick={close}>
            {t("Cancel")}
          </button>
          <button className="primary" disabled={busy || !form.recipientEmail} onClick={submit}>
            <Icon name="send" /> {busy ? t("Creating…") : t("Create & Open Outlook")}
          </button>
        </div>
      </div>
    </Modal>
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
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: "var(--ink-sub)",
              whiteSpace: "pre-wrap",
            }}
          >
            {c.notes}
          </p>
        ) : (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-sub)" }}>
            <Icon name="lock" />{" "}
            {t("Restricted field: visible to case owners and collaborators only.")}
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
    try {
      const res = await callToggle({ data: { itemId, complete } });
      if ("error" in res) {
        toast.error(opErrorMessage(t, res.error));
        return;
      }
      refresh();
      qc.invalidateQueries({ queryKey: ["workbench"] });
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    }
  };

  const assign = async (itemId: string, ownerId: string | null) => {
    try {
      const res = await callAssign({ data: { itemId, ownerId } });
      if ("error" in res) {
        toast.error(opErrorMessage(t, res.error));
        return;
      }
      refresh();
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    }
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
                const done = item.status === "Completed";
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
                      <b
                        style={done ? { textDecoration: "line-through", opacity: 0.6 } : undefined}
                      >
                        {item.title}
                      </b>
                      <span>
                        {item.dueDate ? `${t("due")} ${fmtDate(item.dueDate, lang)}` : ""}
                        {item.completedByName
                          ? ` · ${t("Completed by")} ${item.completedByName}`
                          : ""}
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
        <button
          className="primary"
          onClick={() => navigate({ to: "/email", search: { caseId, taskId: "" } })}
        >
          <Icon name="mail" /> {t("Compose Email")}
        </button>
      </div>
      {drafts.length === 0 ? (
        <Empty
          icon="mail"
          title={t("No communications yet.")}
          action={t("Send the first email")}
          onAction={() => navigate({ to: "/email", search: { caseId, taskId: "" } })}
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
      toast.error(t("Upload failed. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const download = async (fileId: string, filename: string) => {
    const f = detail.files.find((x) => x.id === fileId);
    if (!f) return;
    void filename;
    const { data: row } = await supabase
      .from("case_files")
      .select("storage_path")
      .eq("id", fileId)
      .maybeSingle();
    if (!row) return;
    const { data: signed } = await supabase.storage
      .from("case-files")
      .createSignedUrl(row.storage_path, 60);
    if (signed?.signedUrl) window.open(signed.signedUrl, "_blank", "noopener");
  };

  const remove = async (fileId: string) => {
    const { data: row } = await supabase
      .from("case_files")
      .select("storage_path")
      .eq("id", fileId)
      .maybeSingle();
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
        toast.error(opErrorMessage(t, res.error));
        return;
      }
      toast.success(t("Saved"));
      refresh();
      setTarget("");
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (memberId: string) => {
    try {
      const res = await callRemove({ data: { memberId } });
      if ("error" in res) {
        toast.error(opErrorMessage(t, res.error));
        return;
      }
      refresh();
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    }
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
          <button
            className={level === "collaborator" ? "active" : ""}
            onClick={() => setLevel("collaborator")}
          >
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
