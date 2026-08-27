/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  completeEmailTaskFn,
  bindEmailComposeAttachmentsFn,
  getCaseDetailFn,
  listPublishedTemplatesFn,
  listEmailEligibleCaseIdsFn,
  recordOutlookOpenedFn,
  saveEmailDraftFn,
} from "@/lib/workbench.functions";
import { useWorkbench } from "@/components/workbench/CaseList";
import type { EmailAttachmentDto, TemplateDto } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { opErrorMessage } from "@/lib/errors";
import { Empty, Icon, Loading } from "@/components/workbench/ui";
import { detectOutlookIntegration, openOutlookDraft } from "@/lib/outlook-draft-service";
import {
  referencedManualVariables,
  resolveEmailVariables,
  resolveRecipient,
} from "@/lib/email-compose";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/email")({
  validateSearch: (s: Record<string, unknown>) => ({
    caseId: typeof s["caseId"] === "string" ? s["caseId"] : "",
    taskId: typeof s["taskId"] === "string" ? s["taskId"] : "",
    templateId: typeof s["templateId"] === "string" ? s["templateId"] : "",
  }),
  head: () => ({ meta: [{ title: "Email Center · Team Workbench" }] }),
  component: EmailPage,
});

type AdditionalAttachment = EmailAttachmentDto & { downloadUrl: string };

export function EmailPage() {
  const { t, lang } = useLang();
  const search = useSearch({ strict: false }) as {
    caseId?: string;
    taskId?: string;
    templateId?: string;
  };
  const qc = useQueryClient();
  const fetchTemplates = useServerFn(listPublishedTemplatesFn);
  const fetchEligibleCases = useServerFn(listEmailEligibleCaseIdsFn);
  const fetchDetail = useServerFn(getCaseDetailFn);
  const saveDraft = useServerFn(saveEmailDraftFn);
  const recordOpened = useServerFn(recordOutlookOpenedFn);
  const completeTask = useServerFn(completeEmailTaskFn);
  const bindAttachments = useServerFn(bindEmailComposeAttachmentsFn);
  const { data: wbData, isLoading: wbLoading } = useWorkbench();
  const { data: templateData, isLoading: templateLoading } = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => fetchTemplates(),
  });
  const { data: eligibleData } = useQuery({
    queryKey: ["email-eligible-cases"],
    queryFn: () => fetchEligibleCases(),
  });
  const [caseId, setCaseId] = useState(search.caseId ?? "");
  const [templateId, setTemplateId] = useState(search.templateId ?? "");
  const [recipientOverride, setRecipientOverride] = useState("");
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [additional, setAdditional] = useState<AdditionalAttachment[]>([]);
  const [communicationId, setCommunicationId] = useState("");
  const [opened, setOpened] = useState(false);
  const [composeSessionId, setComposeSessionId] = useState(() => crypto.randomUUID());
  const [outlookMode, setOutlookMode] = useState<"desktop_bridge" | "mailto">("mailto");
  const additionalRef = useRef<AdditionalAttachment[]>([]);
  const taskId = search.taskId ?? "";
  const { data: detailData } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => fetchDetail({ data: { caseId } }),
    enabled: Boolean(caseId),
  });
  const templateResult = templateData && !("error" in templateData) ? templateData : null;
  const detail = detailData && !("error" in detailData) ? detailData : null;
  const allTemplates: TemplateDto[] = templateResult?.templates ?? [];
  const caseType = detail?.case.caseType.toLowerCase() ?? "";
  const templates = [...allTemplates].sort(
    (a, b) =>
      Number(b.applicableCaseTypes.includes(caseType)) -
      Number(a.applicableCaseTypes.includes(caseType)),
  );
  const selectedTemplate = templates.find((item) => item.id === templateId) ?? null;
  const template =
    selectedTemplate && (!caseType || selectedTemplate.applicableCaseTypes.includes(caseType))
      ? selectedTemplate
      : null;
  const task = detail?.tasks.find((item) => item.id === taskId) ?? null;

  useEffect(() => {
    if (!templateId && !taskId && templates.length) setTemplateId(templates[0]!.id);
  }, [taskId, templateId, templates]);
  useEffect(() => {
    void detectOutlookIntegration().then(setOutlookMode);
  }, []);
  useEffect(() => {
    additionalRef.current = additional;
  }, [additional]);
  useEffect(() => {
    for (const item of additionalRef.current) {
      void supabase.storage.from("email-attachments").remove([item.storagePath]);
      void (supabase as any)
        .from("email_additional_attachments")
        .delete()
        .eq("id", item.id)
        .is("communication_id", null);
    }
    setCommunicationId("");
    setOpened(false);
    setAdditional([]);
    setManualValues({});
    setComposeSessionId(crypto.randomUUID());
  }, [caseId, templateId]);

  const sources = useMemo(
    () =>
      detail
        ? {
            person: {
              display_name: detail.case.name,
              first_name: detail.case.givenName,
              preferred_name: detail.case.preferredName,
              employee_id: detail.case.employeeId,
              email: detail.case.personEmail,
              phone: detail.case.phone,
            },
            employment: {
              company_email: detail.case.companyEmail,
              employment_type: detail.case.employmentType,
              role: detail.case.role,
              team: detail.case.team,
              location: detail.case.location,
              supervisor_name: detail.case.supervisorName,
              supervisor_email: detail.case.supervisorEmail,
              workload: detail.case.workload,
            },
            onboarding_case: { start_date: detail.case.startDate },
            offboarding_case: {
              contract_end_date: detail.case.contractEndDate,
              last_working_day: detail.case.lastWorkingDay,
              leaving_type: (detail.case as unknown as { leavingType?: string }).leavingType,
              leaving_reason: detail.case.leavingReason,
            },
          }
        : {},
    [detail],
  );
  const compose = template
    ? resolveEmailVariables({
        template,
        globalVariables: templateResult?.globalVariables ?? [],
        sources,
        manualValues,
        locale: lang === "zh" ? "zh-CN" : "en-GB",
      })
    : null;
  const recipient = template
    ? resolveRecipient({
        source: template.recipientSource,
        personalEmail: detail?.case.personEmail,
        companyEmail: detail?.case.companyEmail,
        override: recipientOverride,
      })
    : "";
  const manualDefinitions = template
    ? referencedManualVariables(template, templateResult?.globalVariables ?? [])
    : [];
  const validation = [
    ...(!recipient
      ? [
          template?.recipientSource === "company_email"
            ? t("Company Email is missing from this profile.")
            : t("Personal Email is missing from this profile."),
        ]
      : []),
    ...(compose?.missingRequired.map((item) => `${item.displayName} ${t("is required")}`) ?? []),
    ...(compose?.unknownVariables.map((key) => `${t("Unknown variable")}: {{${key}}}`) ?? []),
  ];
  const ready = Boolean(
    detail &&
    template &&
    compose &&
    !validation.length &&
    compose.renderedSubject.trim() &&
    compose.renderedBody.trim(),
  );

  if (wbLoading || templateLoading) return <Loading />;
  const wb = wbData && !("error" in wbData) ? wbData : null;
  if (!wb) return <Empty icon="alert" title={t("Something went wrong. Please try again.")} />;
  if (
    !["Admin", "Operator", "Manager"].includes(wb.currentUser.role) ||
    !wb.currentUser.operationalTeams.includes("HR")
  )
    return <Empty icon="alert" title={t("Email Center is restricted to authorized HR users.")} />;

  const ensurePrepared = async () => {
    if (!ready || !template || !compose) return "";
    if (communicationId) return communicationId;
    const result = await saveDraft({
      data: {
        caseId,
        taskId: taskId || undefined,
        templateId: template.id,
        templateVersion: template.version,
        subject: compose.renderedSubject,
        body: compose.renderedBody,
        recipient,
      },
    });
    if ("error" in result) throw new Error(result.error);
    setCommunicationId(result.communicationId);
    const bound = await bindAttachments({
      data: { composeSessionId, communicationId: result.communicationId },
    });
    if ("error" in bound) throw new Error(bound.error);
    return result.communicationId;
  };

  const uploadAdditional = async (file: File) => {
    if (
      !caseId ||
      file.size > 25 * 1024 * 1024 ||
      ![
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image/png",
        "image/jpeg",
      ].includes(file.type)
    ) {
      toast.error(t("Use PDF, DOCX, XLSX, PNG or JPEG files up to 25 MB."));
      return;
    }
    const id = crypto.randomUUID();
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `additional/${caseId}/${id}-${safe}`;
    const storage = supabase.storage.from("email-attachments");
    const { error } = await storage.upload(path, file);
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    const { error: metadataError } = await (supabase as any)
      .from("email_additional_attachments")
      .insert({
        id,
        case_id: caseId,
        compose_session_id: composeSessionId,
        filename: file.name,
        storage_path: path,
        content_type: file.type,
        size: file.size,
        uploaded_by: auth.user?.id,
      });
    if (metadataError) {
      await storage.remove([path]);
      toast.error(metadataError.message);
      return;
    }
    const { data: signed, error: signError } = await storage.createSignedUrl(path, 600);
    if (signError) {
      toast.error(signError.message);
      return;
    }
    setAdditional((items) => [
      ...items,
      {
        id,
        filename: file.name,
        storagePath: path,
        contentType: file.type,
        size: file.size,
        downloadUrl: signed.signedUrl,
      },
    ]);
  };

  const openOutlook = async () => {
    if (!ready || !template || !compose) return;
    try {
      const attachmentCount = template.attachments.length + additional.length;
      if (outlookMode === "mailto" && attachmentCount) {
        toast.warning(
          t(
            "Outlook helper is unavailable. The draft will open, but attachments must be added manually.",
          ),
        );
      }
      const id = await ensurePrepared();
      if (!id) return;
      const signedTemplate = await Promise.all(
        template.attachments.map(async (item) => {
          const { data, error } = await supabase.storage
            .from("email-attachments")
            .createSignedUrl(item.storagePath, 600);
          if (error) throw new Error(`${t("Unable to prepare attachment")}: ${item.filename}`);
          return { ...item, downloadUrl: data.signedUrl, source: "template" as const };
        }),
      );
      const signedAdditional = await Promise.all(
        additional.map(async (item) => {
          const { data, error } = await supabase.storage
            .from("email-attachments")
            .createSignedUrl(item.storagePath, 600);
          if (error) throw new Error(`${t("Unable to prepare attachment")}: ${item.filename}`);
          return { ...item, downloadUrl: data.signedUrl, source: "additional" as const };
        }),
      );
      const result = await openOutlookDraft({
        to: recipient,
        subject: compose.renderedSubject,
        body: compose.renderedBody,
        attachments: [...signedTemplate, ...signedAdditional],
      });
      const event = await recordOpened({
        data: {
          communicationId: id,
          caseId,
          taskId: taskId || undefined,
          templateId: template.id,
          templateVersion: template.version,
          subject: compose.renderedSubject,
          recipient,
          outlookMode: result.mode,
        },
      });
      if ("error" in event) throw new Error(event.error);
      setOpened(true);
      if (!result.attachmentsIncluded && (template.attachments.length || additional.length))
        toast.warning(t("Attachments must be added manually in Outlook."));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("Something went wrong. Please try again."),
      );
    }
  };

  const markSent = async () => {
    if (!opened || !template || !compose || !communicationId) return;
    const result = await completeTask({
      data: {
        taskId: task?.id,
        caseId,
        templateId: template.id,
        templateVersion: template.version,
        communicationId,
        subject: compose.renderedSubject,
        body: compose.renderedBody,
        recipient,
      },
    });
    if ("error" in result) toast.error(opErrorMessage(t, result.error));
    else {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case", caseId] }),
        qc.invalidateQueries({ queryKey: ["workbench"] }),
      ]);
      toast.success(t("Email marked as sent and task completed"));
    }
  };

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="eyebrow">{t("COMMUNICATION")}</p>
          <h1>{t("Email Center")}</h1>
          <p>{t("Team Workbench prepares the draft. You review and send it in Outlook.")}</p>
        </div>
      </div>
      <div className="emailgrid">
        <section className="panel information">
          <div className="columnhead">
            <b>1. {t("Select")}</b>
          </div>
          <label className="sharefield">
            <span>{t("Select Case")}</span>
            <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">—</option>
              {wb.cases
                .filter((item) => eligibleData?.caseIds.includes(item.id))
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {t(item.caseType)}
                  </option>
                ))}
            </select>
          </label>
          <label className="sharefield">
            <span>{t("Template")}</span>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">—</option>
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.applicableCaseTypes.includes(caseType) ? "★ " : ""}
                  {item.name} · v{item.version}
                </option>
              ))}
            </select>
          </label>
          <label className="sharefield">
            <span>
              {t("To")} ·{" "}
              {template
                ? t(
                    template.recipientSource === "company_email"
                      ? "Company Email"
                      : template.recipientSource === "personal_email"
                        ? "Personal Email"
                        : "Manual recipient",
                  )
                : ""}
            </span>
            <input
              type="email"
              value={recipientOverride || recipient}
              onChange={(e) => setRecipientOverride(e.target.value)}
              placeholder={t("Enter recipient manually")}
            />
          </label>
          <div className="columnhead">
            <b>2. {t("Missing / Manual Information")}</b>
          </div>
          {manualDefinitions.length ? (
            manualDefinitions.map((item) => (
              <label className="sharefield" key={item.key}>
                <span>
                  {item.displayName}
                  {item.required ? " *" : ""}
                </span>
                {item.dataType === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={(manualValues[item.key] ?? item.defaultValue) === "true"}
                    onChange={(event) =>
                      setManualValues((values) => ({
                        ...values,
                        [item.key]: String(event.target.checked),
                      }))
                    }
                  />
                ) : ["dropdown", "choice"].includes(item.dataType) ? (
                  <select
                    value={manualValues[item.key] ?? item.defaultValue ?? ""}
                    onChange={(event) =>
                      setManualValues((values) => ({ ...values, [item.key]: event.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {(item.choices ?? []).map((choice) => (
                      <option key={choice}>{choice}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={
                      item.dataType === "date"
                        ? "date"
                        : item.dataType === "email"
                          ? "email"
                          : item.dataType === "number"
                            ? "number"
                            : "text"
                    }
                    value={manualValues[item.key] ?? item.defaultValue ?? ""}
                    onChange={(event) =>
                      setManualValues((values) => ({ ...values, [item.key]: event.target.value }))
                    }
                  />
                )}
              </label>
            ))
          ) : (
            <p className="inlineempty">{t("No manual information required.")}</p>
          )}
          <div className="columnhead">
            <b>{t("Attachments")}</b>
          </div>
          <p>
            <b>{t("Template Attachments")}</b>:{" "}
            {template?.attachments.map((item) => item.filename).join(", ") || t("No attachments")}
          </p>
          <p>
            <b>{t("Additional Attachments")}</b>:{" "}
            {additional.map((item) => (
              <span className="variable" key={item.id}>
                {item.filename}{" "}
                <button
                  onClick={() => {
                    void supabase.storage.from("email-attachments").remove([item.storagePath]);
                    void (supabase as any)
                      .from("email_additional_attachments")
                      .delete()
                      .eq("id", item.id);
                    setAdditional((list) => list.filter((file) => file.id !== item.id));
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </p>
          <label className="secondary">
            <Icon name="plus" /> {t("Add Attachment")}
            <input
              hidden
              type="file"
              accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadAdditional(file);
                e.target.value = "";
              }}
            />
          </label>
        </section>
        <section className="panel preview">
          <div className="columnhead">
            <b>3. {t("Review")}</b>
            <div className="actions">
              <button className="primary" disabled={!ready} onClick={openOutlook}>
                <Icon name="send" /> 4. {t("Open in Outlook")}
              </button>
              <span className={`badge ${outlookMode === "desktop_bridge" ? "b-active" : ""}`}>
                {t("Outlook Integration")}:{" "}
                {outlookMode === "desktop_bridge"
                  ? `✓ ${t("Full Draft Integration")}`
                  : t("Fallback Mode")}
              </span>
              <button
                className="successbutton"
                disabled={!opened || task?.status === "Completed"}
                onClick={markSent}
              >
                <Icon name="check" />{" "}
                {task?.status === "Completed" ? t("Email Sent") : t("Mark as Sent")}
              </button>
            </div>
          </div>
          {validation.length ? (
            <div className="autherror">
              <b>{t("Cannot prepare email yet")}</b>
              <ul>
                {validation.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {compose ? (
            <>
              <div className="emailmeta">
                <div>
                  <span>{t("To")}</span>
                  <b>{recipient || "—"}</b>
                </div>
                <div>
                  <span>{t("Subject")}</span>
                  <b>{compose.renderedSubject}</b>
                </div>
              </div>
              <div className="emailbody">
                <pre style={{ whiteSpace: "pre-wrap", font: "inherit", margin: 0 }}>
                  {compose.renderedBody}
                </pre>
              </div>
              <p>
                {t("Outlook mode")}:{" "}
                {t("Full integration is attempted first; mailto fallback cannot add attachments.")}
              </p>
            </>
          ) : (
            <div className="inlineempty">
              <Icon name="mail" /> {t("Select a template and case to begin")}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
