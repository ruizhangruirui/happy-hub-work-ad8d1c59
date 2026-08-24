import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getCaseDetailFn, listTemplatesFn, saveEmailDraftFn } from "@/lib/workbench.functions";
import { useWorkbench } from "@/components/workbench/CaseList";
import type { CaseDetailDto, TemplateDto } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { Empty, Icon, Loading } from "@/components/workbench/ui";

export const Route = createFileRoute("/_authenticated/email")({
  validateSearch: (s: Record<string, unknown>) => ({
    caseId: typeof s["caseId"] === "string" ? s["caseId"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Email Center · Team Workbench" },
      { name: "description", content: "Compose onboarding and offboarding emails from templates with case data auto-fill." },
    ],
  }),
  component: EmailPage,
});

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

function EmailPage() {
  const { t, lang } = useLang();
  const search = Route.useSearch();
  const fetchTemplates = useServerFn(listTemplatesFn);
  const fetchDetail = useServerFn(getCaseDetailFn);
  const callSaveDraft = useServerFn(saveEmailDraftFn);
  const { data: wbData, isLoading: wbLoading } = useWorkbench();
  const { data: tplData, isLoading: tplLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => fetchTemplates(),
  });

  const [caseId, setCaseId] = useState(search.caseId);
  const [templateId, setTemplateId] = useState("");
  const [extra, setExtra] = useState("");
  const [saved, setSaved] = useState(false);

  const { data: detailData } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => fetchDetail({ data: { caseId } }),
    enabled: Boolean(caseId),
  });

  const templates: TemplateDto[] = tplData && !("error" in tplData) ? tplData.templates : [];
  const detail: CaseDetailDto | null = detailData && !("error" in detailData) ? detailData : null;
  const template = templates.find((x) => x.id === templateId) ?? null;

  const vars = useMemo(() => {
    if (!detail) return {} as Record<string, string>;
    const c = detail.case;
    const firstName = c.name.split(" ")[0] ?? "";
    return {
      "person.first_name": firstName,
      "person.full_name": c.name,
      "case.start_date": fmtDate(c.startDate, lang),
      "case.end_date": fmtDate(c.endDate, lang),
      "manager.name": c.managerName ?? "",
      "person.team": c.team,
      "case.role": c.role ?? "",
      "manual.additional_information": extra,
    };
  }, [detail, extra, lang]);

  if (wbLoading || tplLoading) return <Loading />;
  const wb = wbData && !("error" in wbData) ? wbData : null;
  if (!wb) return <Empty icon="alert" title={t("Something went wrong. Please try again.")} />;

  const subject = template ? fill(template.subject, vars) : "";
  const body = template ? fill(template.body, vars) : "";
  const recipient = detail?.case.personEmail ?? "";
  const ready = template && detail;

  const saveDraft = async () => {
    if (!ready) return;
    const res = await callSaveDraft({
      data: { caseId, templateId, subject, body, recipient },
    });
    if ("error" in res) {
      toast.error(t("You don't have permission to do that."));
      return;
    }
    setSaved(true);
    toast.success(t("Saved"));
    setTimeout(() => setSaved(false), 2500);
  };

  const openOutlook = () => {
    if (!ready) return;
    const url = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, "_self");
  };

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="eyebrow">{t("COMMUNICATION")}</p>
          <h1>{t("Email Center")}</h1>
        </div>
      </div>

      <div className="emailgrid">
        <section className="panel templatelibrary">
          <div className="columnhead">
            <b>{t("Template")}</b>
          </div>
          {templates.length === 0 ? (
            <div className="inlineempty">{t("No templates yet.")}</div>
          ) : (
            templates.map((tpl) => (
              <button
                key={tpl.id}
                className={`templatecard${tpl.id === templateId ? " active" : ""}`}
                onClick={() => setTemplateId(tpl.id)}
              >
                <span className="templateicon">
                  <Icon name="mail" />
                </span>
                <div>
                  <b>{tpl.name}</b>
                  <span>
                    {t(tpl.category)} · v1 · {fmtDate(tpl.updatedAt, lang)}
                  </span>
                </div>
              </button>
            ))
          )}
        </section>

        <section className="panel information">
          <div className="columnhead">
            <b>{t("Select Case")}</b>
          </div>
          <label className="sharefield">
            <span>{t("Select Case")}</span>
            <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">—</option>
              {wb.cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {t(c.caseType)}
                </option>
              ))}
            </select>
          </label>
          {detail ? (
            <>
              <div className="chips">
                <span className="badge b-active">{t("Auto-filled from case data")}</span>
              </div>
              <div className="fields">
                <div className="inputvalue">
                  <span>{t("First Name")}</span>
                  <b>{vars["person.first_name"]}</b>
                </div>
                <div className="inputvalue">
                  <span>{t("Start Date")}</span>
                  <b>{vars["case.start_date"]}</b>
                </div>
                <div className="inputvalue">
                  <span>{t("Manager")}</span>
                  <b>{vars["manager.name"] || "—"}</b>
                </div>
                <div className="inputvalue">
                  <span>{t("To")}</span>
                  <b className="recipient">{recipient || "—"}</b>
                </div>
              </div>
              <label className="sharefield">
                <span>
                  {t("Additional Information")} ({t("Manual")})
                </span>
                <textarea rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={1000} />
              </label>
            </>
          ) : (
            <div className="inlineempty">{t("Select a template and case to begin")}</div>
          )}
        </section>

        <section className="panel preview">
          <div className="columnhead">
            <b>{t("Subject")}</b>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="secondary" disabled={!ready} onClick={saveDraft}>
                {saved ? t("Saved") : t("Save Draft")}
              </button>
              <button className="primary" disabled={!ready || !recipient} onClick={openOutlook}>
                <Icon name="send" /> {t("Open in Outlook")}
              </button>
            </div>
          </div>
          {ready ? (
            <>
              <div className="emailmeta">
                <div>
                  <span>{t("To")}</span>
                  <b>{recipient || "—"}</b>
                </div>
                <div>
                  <span>{t("Subject")}</span>
                  <b>{subject}</b>
                </div>
              </div>
              <div className="emailbody">
                <pre style={{ whiteSpace: "pre-wrap", font: "inherit", margin: 0 }}>{body}</pre>
              </div>
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
