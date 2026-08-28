import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  assignChecklistOwnerFn,
  assignTaskFn,
  addTaskCommentFn,
  createTaskFn,
  getCaseDetailFn,
  getWorkbenchDataFn,
  removeMemberFn,
  shareCaseFn,
  toggleChecklistFn,
  toggleTaskFn,
  setTaskStatusFn,
  syncCaseTasksFn,
  updateWorkflowItemFn,
  updateOffboardingDatesFn,
  setCaseConfirmationFn,
  createExternalRequestFn,
  deleteCaseFileFn,
} from "@/lib/workbench.functions";
import type { CaseDetailDto, WorkbenchData } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { opErrorMessage } from "@/lib/errors";
import { fmtDate, fmtDateTime, functionalTeamLabel } from "@/lib/format";
import { taskProgressSummary } from "@/lib/domain";
import { Badge, Empty, Icon, Loading, Modal } from "@/components/workbench/ui";

export const Route = createFileRoute("/_authenticated/cases/$caseId")({
  validateSearch: z.object({ tab: z.string().optional(), taskId: z.string().optional() }),
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
  const search = Route.useSearch();
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
  const [tab, setTab] = useState(TABS.includes(search.tab ?? "") ? search.tab! : "Overview");
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
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
  const capabilities = detail.capabilities;
  const wb: WorkbenchData | null = wbData && !("error" in wbData) ? wbData : null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["case", caseId] });
  const mandatoryProgress = taskProgressSummary(detail.tasks, true);
  const changeConfirmation = async (confirmed: boolean) => {
    if (confirmationBusy) return;
    const message = confirmed
      ? c.caseType === "Onboarding"
        ? t(
            "The person will become Active and appear in Active People. This onboarding case and all open tasks will remain.",
          )
        : t(
            "The person will immediately leave Active People. Person history, this case and post-leaving tasks will remain.",
          )
      : t(
          "This reopens only the Case workflow. The Person lifecycle and confirmation history will not change.",
        );
    if (!window.confirm(message)) return;
    setConfirmationBusy(true);
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
            : "Case workflow reopened; lifecycle unchanged",
        ),
      );
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    } finally {
      setConfirmationBusy(false);
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
          {detail.tasks.length ? (
            <span className="caseprogress">
              <b>{mandatoryProgress.percent}%</b>
              <i>
                <em style={{ width: `${mandatoryProgress.percent}%` }} />
              </i>
              <small>
                {mandatoryProgress.completed}/{mandatoryProgress.applicable}{" "}
                {t("applicable mandatory tasks completed")}
              </small>
            </span>
          ) : null}
          {capabilities.canConfirmLifecycle ? (
            <button
              className={c.joinedAt || c.leftAt ? "secondary" : "primary"}
              disabled={confirmationBusy}
              onClick={() => changeConfirmation(!(c.joinedAt || c.leftAt))}
            >
              <Icon name={c.joinedAt || c.leftAt ? "history" : "check"} />{" "}
              {t(
                c.joinedAt || c.leftAt
                  ? "Reopen workflow"
                  : c.caseType === "Onboarding"
                    ? "Confirm Joined"
                    : "Confirm Left",
              )}
            </button>
          ) : null}
          {capabilities.canShareCase ? (
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

      {tab === "Overview" ? (
        <OverviewTab detail={detail} canManageCase={capabilities.canManageCase} refresh={refresh} />
      ) : null}
      {tab === "Tasks" ? (
        <TasksTab
          detail={detail}
          canManageTaskStructure={capabilities.canManageTaskStructure}
          refresh={refresh}
          targetTaskId={search.taskId}
        />
      ) : null}
      {tab === "Workflow" ? (
        <WorkflowTab
          detail={detail}
          canManageWorkflow={capabilities.canManageWorkflow}
          refresh={refresh}
        />
      ) : null}
      {tab === "Checklist" ? (
        <ChecklistTab detail={detail} refresh={refresh} caseId={caseId} />
      ) : null}
      {tab === "Communication" ? <CommunicationTab detail={detail} caseId={caseId} /> : null}
      {tab === "Files" ? (
        <FilesTab
          detail={detail}
          canManageFiles={capabilities.canManageFiles}
          refresh={refresh}
          caseId={caseId}
        />
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
  canManageTaskStructure,
  refresh,
  targetTaskId,
}: {
  detail: CaseDetailDto;
  canManageTaskStructure: boolean;
  refresh: () => void;
  targetTaskId: string | undefined;
}) {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const setStatus = useServerFn(setTaskStatusFn);
  const assign = useServerFn(assignTaskFn);
  const addComment = useServerFn(addTaskCommentFn);
  const createTask = useServerFn(createTaskFn);
  const syncTasks = useServerFn(syncCaseTasksFn);
  const qc = useQueryClient();
  const [commenting, setCommenting] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [adding, setAdding] = useState(false);
  const [manual, setManual] = useState({
    title: "",
    ownerTeam: "HR" as "HR" | "IT" | "Admin",
    dueDate: "",
    mandatory: true,
  });
  useEffect(() => {
    if (!targetTaskId) return;
    document
      .getElementById(`task-${targetTaskId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [targetTaskId]);
  const reload = async () =>
    Promise.all([qc.invalidateQueries({ queryKey: ["workbench"] }), refresh()]);
  const update = async (taskId: string, status: string) => {
    const reason = status === "Not Applicable" ? window.prompt(t("Reason required")) : undefined;
    if (status === "Not Applicable" && !reason?.trim()) return;
    try {
      const res = await setStatus({
        data: {
          taskId,
          status: status as
            "Not Started" | "In Progress" | "Waiting" | "Blocked" | "Completed" | "Not Applicable",
          comment: reason?.trim(),
        },
      });
      if ("error" in res) {
        toast.error(opErrorMessage(t, res.error));
        return;
      }
      await reload();
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    }
  };
  const submitComment = async (taskId: string) => {
    if (!comment.trim()) return;
    const res = await addComment({ data: { taskId, body: comment.trim() } });
    if ("error" in res) {
      toast.error(opErrorMessage(t, res.error));
      return;
    }
    setComment("");
    setCommenting(null);
    await reload();
  };
  if (!detail.tasks.length) return <Empty icon="check" title={t("No tasks yet.")} />;
  const teamGroups = (["HR", "IT", "Admin"] as const).map((team) => ({
    team,
    tasks: detail.tasks.filter((task) => task.ownerTeam === team),
  }));
  return (
    <div className="panel phase2tasks">
      <div className="panelhead">
        <div>
          <b>{t("Case Tasks")}</b>
          <p>{t("Shared Case · Team-owned Tasks")}</p>
        </div>
        <div className="tasktools">
          {canManageTaskStructure ? (
            <>
              <button
                className="secondary"
                onClick={async () => {
                  const result = await syncTasks({ data: { caseId: detail.case.id } });
                  if ("error" in result) toast.error(opErrorMessage(t, result.error));
                  else {
                    await reload();
                    toast.success(t("Tasks synchronized"));
                  }
                }}
              >
                <Icon name="history" /> {t("Sync Tasks")}
              </button>
              <button className="primary" onClick={() => setAdding(true)}>
                <Icon name="plus" /> {t("Add Task")}
              </button>
            </>
          ) : null}
        </div>
      </div>
      {teamGroups.map(({ team, tasks }) => {
        if (!tasks.length) return null;
        const progress = taskProgressSummary(tasks);
        return (
          <section className="taskteamgroup" key={team}>
            <div className="taskteamhead">
              <b>{t(functionalTeamLabel(team))}</b>
              <span>
                {progress.completed}/{progress.applicable} {t("applicable tasks completed")}
              </span>
            </div>
            <div className="casetasks">
              {tasks.map((task) => {
                const comments = detail.taskComments.filter((item) => item.taskId === task.id);
                const candidates = detail.assignableUsers.filter((user) =>
                  user.operationalTeams.includes(team),
                );
                return (
                  <div
                    id={`task-${task.id}`}
                    className={`casetask taskcollab ${task.status === "Completed" ? "done" : ""}`}
                    style={
                      task.id === targetTaskId
                        ? { outline: "3px solid var(--accent, #4968db)", outlineOffset: 2 }
                        : undefined
                    }
                    key={task.id}
                  >
                    <div className="taskmain">
                      <div className="tasktitleline">
                        <b>{t(task.title)}</b>
                        {!task.mandatory ? <Badge>{t("Optional")}</Badge> : null}
                        <Badge>{task.source === "manual" ? t("Manual") : t("Template")}</Badge>
                      </div>
                      {task.description ? <p>{t(task.description)}</p> : null}
                      <span>
                        {task.due ? `${t("Due")} ${fmtDate(task.due, lang)}` : t("Not scheduled")}
                        {task.completedByName
                          ? ` · ${t("Completed by")} ${task.completedByName}`
                          : ""}
                      </span>
                      {task.notApplicableReason ? <em>{task.notApplicableReason}</em> : null}
                      {comments.map((item) => (
                        <div className="taskcomment" key={item.id}>
                          <b>
                            {item.authorName}
                            {item.authorTeam ? ` · ${item.authorTeam}` : ""}
                          </b>
                          <small>{fmtDateTime(item.at, lang)}</small>
                          <p>{item.body}</p>
                        </div>
                      ))}
                      {commenting === task.id ? (
                        <div className="taskcommentform">
                          <input
                            value={comment}
                            maxLength={2000}
                            placeholder={t("Add a progress note…")}
                            onChange={(event) => setComment(event.target.value)}
                          />
                          <button className="primary" onClick={() => submitComment(task.id)}>
                            {t("Add")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="taskcontrols">
                      <select
                        disabled={!task.canEdit}
                        value={task.status}
                        onChange={(event) => update(task.id, event.target.value)}
                      >
                        <option>Not Started</option>
                        <option>In Progress</option>
                        <option>Waiting</option>
                        <option>Blocked</option>
                        <option>Completed</option>
                        <option>Not Applicable</option>
                      </select>
                      <select
                        disabled={!task.canEdit}
                        value={task.ownerId ?? ""}
                        onChange={async (event) => {
                          const result = await assign({
                            data: { taskId: task.id, ownerId: event.target.value || null },
                          });
                          if ("error" in result) toast.error(opErrorMessage(t, result.error));
                          else await reload();
                        }}
                      >
                        <option value="">
                          {t("Unassigned")} · {t(functionalTeamLabel(team))}
                        </option>
                        {candidates.map((user) => (
                          <option value={user.id} key={user.id}>
                            {user.name}
                          </option>
                        ))}
                      </select>
                      {task.canEdit ? (
                        <button
                          className="textbutton"
                          onClick={() => setCommenting(commenting === task.id ? null : task.id)}
                        >
                          {t("Comment")}
                        </button>
                      ) : null}
                      {detail.capabilities.canComposeEmail &&
                      task.canEdit &&
                      task.ownerTeam === "HR" &&
                      task.taskType === "Email" &&
                      task.status !== "Completed" ? (
                        <button
                          className="primary emailtaskbutton"
                          onClick={() =>
                            navigate({
                              to: "/email",
                              search: {
                                caseId: detail.case.id,
                                taskId: task.id,
                                templateId: task.preferredEmailTemplateId ?? "",
                              },
                            })
                          }
                        >
                          <Icon name="mail" /> {t("Go send email")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {adding ? (
        <Modal title={t("Add Task")} close={() => setAdding(false)}>
          <div className="userform">
            <label>
              {t("Task Name")}
              <input
                value={manual.title}
                maxLength={200}
                onChange={(event) => setManual({ ...manual, title: event.target.value })}
              />
            </label>
            <div className="two">
              <label>
                {t("Owner Team")}
                <select
                  value={manual.ownerTeam}
                  onChange={(event) =>
                    setManual({ ...manual, ownerTeam: event.target.value as "HR" | "IT" | "Admin" })
                  }
                >
                  <option>HR</option>
                  <option>IT</option>
                  <option value="Admin">{t("Administration")}</option>
                </select>
              </label>
              <label>
                {t("Due Date")}
                <input
                  type="date"
                  value={manual.dueDate}
                  onChange={(event) => setManual({ ...manual, dueDate: event.target.value })}
                />
              </label>
            </div>
            <label className="checkline">
              <input
                type="checkbox"
                checked={manual.mandatory}
                onChange={(event) => setManual({ ...manual, mandatory: event.target.checked })}
              />{" "}
              {t("Mandatory")}
            </label>
            <p className="securityhint">
              {t("Manual tasks are never changed by checklist synchronization.")}
            </p>
            <div className="modalactions">
              <button className="secondary" onClick={() => setAdding(false)}>
                {t("Cancel")}
              </button>
              <button
                className="primary"
                disabled={!manual.title.trim()}
                onClick={async () => {
                  const result = await createTask({
                    data: {
                      caseId: detail.case.id,
                      title: manual.title.trim(),
                      ownerTeam: manual.ownerTeam,
                      dueDate: manual.dueDate || undefined,
                      priority: "Medium",
                      mandatory: manual.mandatory,
                    },
                  });
                  if ("error" in result) toast.error(opErrorMessage(t, result.error));
                  else {
                    setAdding(false);
                    await reload();
                  }
                }}
              >
                {t("Add Task")}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function WorkflowTab({
  detail,
  canManageWorkflow,
  refresh,
}: {
  detail: CaseDetailDto;
  canManageWorkflow: boolean;
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
                  {canManageWorkflow && item.status !== "Not Required" ? (
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

function OverviewTab({
  detail,
  canManageCase,
  refresh,
}: {
  detail: CaseDetailDto;
  canManageCase: boolean;
  refresh: () => void;
}) {
  const { t } = useLang();
  const c = detail.case;
  const qc = useQueryClient();
  const updateDates = useServerFn(updateOffboardingDatesFn);
  const [dateOpen, setDateOpen] = useState(false);
  const saveDates = async (values: { contractEndDate: string; lastWorkingDay: string }) => {
    try {
      const result = await updateDates({
        data: {
          caseId: c.id,
          contractEndDate: values.contractEndDate,
          lastWorkingDay: values.lastWorkingDay || undefined,
        },
      });
      if ("error" in result) {
        toast.error(opErrorMessage(t, result.error));
        return;
      }
      await Promise.all([
        refresh(),
        qc.invalidateQueries({ queryKey: ["workbench"] }),
        qc.invalidateQueries({ queryKey: ["active-roster"] }),
      ]);
      setDateOpen(false);
      toast.success(t("Saved"));
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    }
  };
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
        <div className="panelhead">
          <b>{t("Timeline")}</b>
          {c.caseType === "Offboarding" && canManageCase ? (
            <button className="secondary" onClick={() => setDateOpen(true)}>
              {t("Edit dates")}
            </button>
          ) : null}
        </div>
        <div className="fields">
          <Field label="Start Date" value={c.startDate} />
          {c.caseType === "Offboarding" ? (
            <>
              <Field label="Contract End Date" value={c.contractEndDate} />
              <Field label="Last Working Day" value={c.lastWorkingDay ?? t("Not confirmed")} />
              <Field label="Confirmed Leaving Date" value={c.leftDate} />
            </>
          ) : (
            <Field label="Joined Date" value={c.joinedDate} />
          )}
          <Field label="OWNER" value={c.owner} />
        </div>
      </div>
      {dateOpen ? (
        <OffboardingDatesModal
          initial={{
            contractEndDate: c.contractEndDate ?? "",
            lastWorkingDay: c.lastWorkingDay ?? "",
          }}
          close={() => setDateOpen(false)}
          save={saveDates}
        />
      ) : null}
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
            {t("Restricted field: visible to authorized HR case managers only.")}
          </p>
        )}
      </div>
    </div>
  );
}

function OffboardingDatesModal({
  initial,
  close,
  save,
}: {
  initial: { contractEndDate: string; lastWorkingDay: string };
  close: () => void;
  save: (values: { contractEndDate: string; lastWorkingDay: string }) => void;
}) {
  const { t } = useLang();
  const [values, setValues] = useState(initial);
  return (
    <Modal title={t("Edit offboarding dates")} close={close}>
      <form
        className="userform"
        onSubmit={(event) => {
          event.preventDefault();
          save(values);
        }}
      >
        <label>
          {t("Contract End Date")}
          <input
            type="date"
            required
            value={values.contractEndDate}
            onChange={(event) => setValues({ ...values, contractEndDate: event.target.value })}
          />
        </label>
        <label>
          {t("Last Working Day")} ({t("Optional")})
          <input
            type="date"
            value={values.lastWorkingDay}
            onChange={(event) => setValues({ ...values, lastWorkingDay: event.target.value })}
          />
        </label>
        <p>{t("Contract End Date and Last Working Day are stored independently.")}</p>
        <div className="modalactions">
          <button type="button" className="secondary" onClick={close}>
            {t("Cancel")}
          </button>
          <button className="primary">{t("Save Changes")}</button>
        </div>
      </form>
    </Modal>
  );
}

function ChecklistTab({
  detail,
  refresh,
  caseId,
}: {
  detail: CaseDetailDto;
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
                const resolved = done || item.status === "Not Required";
                const candidates = detail.assignableUsers.filter((user) =>
                  user.operationalTeams.includes(item.ownerTeam),
                );
                return (
                  <div className="checkrow" key={item.id}>
                    <button
                      className={`taskcheck${resolved ? " done" : ""}`}
                      disabled={!item.canEdit}
                      onClick={() => toggle(item.id, !resolved)}
                      aria-label={resolved ? t("Reopen") : t("Mark Done")}
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
                      {item.status === "Not Required" ? <Badge>{t("Not Applicable")}</Badge> : null}
                    </div>
                    {item.canEdit ? (
                      <select
                        className="ownerselect"
                        value={item.ownerId ?? ""}
                        onChange={(e) => assign(item.id, e.target.value || null)}
                      >
                        <option value="">
                          {t("Unassigned")} · {t(functionalTeamLabel(item.ownerTeam))}
                        </option>
                        {candidates.map((u) => (
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
  const communications = detail.communications;
  return (
    <div className="panel">
      <div className="panelhead">
        <b>{t("Communication")}</b>
        {detail.capabilities.canComposeEmail ? (
          <button
            className="primary"
            onClick={() =>
              navigate({ to: "/email", search: { caseId, taskId: "", templateId: "" } })
            }
          >
            <Icon name="mail" /> {t("Compose Email")}
          </button>
        ) : null}
      </div>
      {communications.length === 0 ? (
        <Empty
          icon="mail"
          title={t("No communications yet.")}
          action={detail.capabilities.canComposeEmail ? t("Send the first email") : undefined}
          onAction={
            detail.capabilities.canComposeEmail
              ? () => navigate({ to: "/email", search: { caseId, taskId: "", templateId: "" } })
              : undefined
          }
        />
      ) : (
        <div className="communications">
          {communications.map((communication) => (
            <div className="comm" key={communication.communicationId}>
              <span className="mailicon">
                <Icon name="mail" />
              </span>
              <div>
                <b>{communication.templateName}</b>
                <span>
                  {t("To")}: {communication.recipient}
                </span>
                <span>
                  {t("Template")}: {communication.templateName} · v
                  {communication.templateVersion ?? "—"}
                </span>
                <span>
                  {t("Subject")}: {communication.renderedSubject}
                </span>
                <span>
                  {t("State")}: {t(communication.state)}
                  {communication.outlookMode ? ` · ${communication.outlookMode}` : ""}
                </span>
                <span>
                  {t("Prepared by")} {communication.preparedBy} ·{" "}
                  {fmtDateTime(communication.preparedAt, lang)}
                </span>
                {communication.markedSentAt ? (
                  <span>
                    {t("Marked Sent")}: {fmtDateTime(communication.markedSentAt, lang)}
                  </span>
                ) : null}
                {communication.attachments.length ? (
                  <span>
                    {t("Attachments")}:{" "}
                    {communication.attachments.map((attachment) => attachment.filename).join(", ")}
                  </span>
                ) : null}
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
  canManageFiles,
  refresh,
  caseId,
}: {
  detail: CaseDetailDto;
  canManageFiles: boolean;
  refresh: () => void;
  caseId: string;
}) {
  const { t, lang } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const deleteFile = useServerFn(deleteCaseFileFn);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/png",
      "image/jpeg",
    ];
    if (file.size > 25 * 1024 * 1024 || !allowedTypes.includes(file.type)) {
      toast.error(t("Use PDF, DOCX, XLSX, PNG or JPEG files up to 25 MB."));
      return;
    }
    setBusy(true);
    const fileId = crypto.randomUUID();
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${caseId}/${fileId}-${safeName}`;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("no session");
      const { error: rowErr } = await supabase.from("case_files").insert({
        id: fileId,
        case_id: caseId,
        storage_path: path,
        filename: file.name,
        size: file.size,
        content_type: file.type || null,
        uploaded_by: user.id,
      });
      if (rowErr) throw rowErr;
      const { error: upErr } = await supabase.storage.from("case-files").upload(path, file);
      if (upErr) {
        await deleteFile({ data: { fileId } });
        throw upErr;
      }
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
    if (!window.confirm(t("Remove this file? This action cannot be undone."))) return;
    setBusy(true);
    try {
      const result = await deleteFile({ data: { fileId } });
      if ("error" in result) toast.error(opErrorMessage(t, result.error));
      else {
        toast.success(t("File removed"));
        refresh();
      }
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="panelhead">
        <b>{t("Files")}</b>
        {canManageFiles ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
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
                {canManageFiles ? (
                  <button className="textbutton" disabled={busy} onClick={() => remove(f.id)}>
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
            <span>{t("Can view shared Case information allowed by their access")}</span>
          </button>
          <button
            className={level === "collaborator" ? "active" : ""}
            onClick={() => setLevel("collaborator")}
          >
            <b>{t("Collaborator")}</b>
            <span>{t("Can participate according to functional-team and Task permissions")}</span>
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
