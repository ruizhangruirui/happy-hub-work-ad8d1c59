import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { listTemplatesFn, saveTemplateFn } from "@/lib/workbench.functions";
import type { TemplateDto, WorkbenchData } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { opErrorMessage } from "@/lib/errors";
import { useWorkbench } from "@/components/workbench/CaseList";
import { Badge, Empty, Icon, Loading, Modal } from "@/components/workbench/ui";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Template Manager · Team Workbench" },
      { name: "description", content: "Email templates for onboarding and offboarding communications." },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const { t, lang } = useLang();
  const fetchTemplates = useServerFn(listTemplatesFn);
  const { data: wbData } = useWorkbench();
  const { data, isLoading } = useQuery({ queryKey: ["templates"], queryFn: () => fetchTemplates() });
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<TemplateDto | "new" | null>(null);

  if (isLoading) return <Loading />;
  const templates: TemplateDto[] = data && !("error" in data) ? data.templates : [];
  const categories = [...new Set(templates.map((x) => x.category))];
  const filtered = templates.filter((x) => !category || x.category === category);
  const current = templates.find((x) => x.id === selected) ?? filtered[0] ?? null;
  const wb: WorkbenchData | null = wbData && !("error" in wbData) ? (wbData as WorkbenchData) : null;
  const canManage = wb ? ["Admin", "Operator"].includes(wb.currentUser.role) : false;

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="eyebrow">{t("ADMIN")}</p>
          <h1>{t("Template Manager")}</h1>
        </div>
        <div className="actions">
          <select className="filter" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t("All Categories")}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {t(cat)}
              </option>
            ))}
          </select>
          {canManage ? (
            <button className="primary" onClick={() => setEditing("new")}>
              <Icon name="plus" /> {t("New Template")}
            </button>
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty
          icon="template"
          title={t("No templates yet.")}
          action={canManage ? t("New Template") : undefined}
          onAction={canManage ? () => setEditing("new") : undefined}
        />
      ) : (
        <div className="templateeditgrid">
          <section className="panel templatelibrary">
            {filtered.map((tpl) => (
              <button
                key={tpl.id}
                className={`templatecard${current?.id === tpl.id ? " active" : ""}`}
                onClick={() => setSelected(tpl.id)}
              >
                <span className="templateicon">
                  <Icon name="template" />
                </span>
                <div>
                  <b>{tpl.name}</b>
                  <span>
                    {t(tpl.category)} · {t("Last Updated")} {fmtDate(tpl.updatedAt, lang)}
                  </span>
                </div>
                <Badge>{tpl.status}</Badge>
              </button>
            ))}
          </section>

          <section className="panel">
            {current ? (
              <>
                <div className="panelhead">
                  <div>
                    <b className="templatebig">{current.name}</b>
                    <span>{t("Last Updated")} {fmtDate(current.updatedAt, lang)}</span>
                  </div>
                  <div className="actions">
                    <Badge>{current.status}</Badge>
                    {canManage ? (
                      <>
                        <button className="secondary" onClick={() => setEditing(current)}>
                          <Icon name="settings" /> {t("Edit Template")}
                        </button>
                        <button className="secondary" onClick={() => setEditing({ ...current, id: "", name: `${current.name} Copy`, status: "Draft" })}>
                          <Icon name="template" /> {t("Duplicate")}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="templateoverview">
                  <div>
                    <span>{t("Category")}</span>
                    <b>{t(current.category)}</b>
                  </div>
                  <div>
                    <span>{t("Last Updated")}</span>
                    <b>{fmtDate(current.updatedAt, lang)}</b>
                  </div>
                  <div>
                    <span>{t("Version")}</span>
                    <b>v1</b>
                  </div>
                </div>
                <div className="panelhead" style={{ marginTop: 14 }}>
                  <b>{t("Variables")}</b>
                </div>
                <div className="chips">
                  {current.variables.map((v) => (
                    <span className="variable" key={v}>
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
                <div className="panelhead" style={{ marginTop: 14 }}>
                  <b>{t("Subject")}</b>
                </div>
                <p style={{ margin: "4px 0", fontSize: 13 }}>{current.subject}</p>
                <div className="panelhead" style={{ marginTop: 14 }}>
                  <b>{t("Body Preview")}</b>
                </div>
                <div className="bodymini">
                  <pre style={{ whiteSpace: "pre-wrap", font: "inherit", margin: 0 }}>{current.body}</pre>
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}
      {editing ? (
        <TemplateModal
          template={editing === "new" ? null : editing}
          categories={categories}
          close={() => setEditing(null)}
          onSaved={(id) => {
            setSelected(id);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function TemplateModal({
  template,
  categories,
  close,
  onSaved,
}: {
  template: TemplateDto | null;
  categories: string[];
  close: () => void;
  onSaved: (id: string) => void;
}) {
  const { t } = useLang();
  const qc = useQueryClient();
  const callSave = useServerFn(saveTemplateFn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: template?.name ?? "",
    category: template?.category ?? categories[0] ?? "General",
    status: (template?.status === "Published" ? "Published" : "Draft") as "Draft" | "Published",
    subject: template?.subject ?? "",
    body: template?.body ?? "",
    variables: template?.variables.join("\n") ?? "person.first_name\nperson.full_name\ncase.start_date\nmanager.name",
  });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await callSave({
        data: {
          id: template?.id || undefined,
          name: form.name.trim(),
          category: form.category.trim(),
          status: form.status,
          subject: form.subject.trim(),
          body: form.body,
          variables: form.variables.split(/[\n,]/).map((v) => v.trim()).filter(Boolean),
        },
      });
      if ("error" in res) {
        setError(opErrorMessage(t, res.error));
        return;
      }
      await qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success(t("Saved"));
      onSaved(res.id);
    } catch {
      setError(t("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={template?.id ? t("Edit Template") : t("New Template")} close={close}>
      <form className="userform templateform" onSubmit={submit}>
        {error ? <p className="autherror">{error}</p> : null}
        <label>
          {t("Template Name")}
          <input value={form.name} onChange={set("name")} required maxLength={160} />
        </label>
        <div className="userform two compact">
          <label>
            {t("Category")}
            <input list="template-categories" value={form.category} onChange={set("category")} required maxLength={80} />
            <datalist id="template-categories">
              {categories.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </label>
          <label>
            {t("Status")}
            <select value={form.status} onChange={set("status")}>
              <option value="Draft">{t("Draft")}</option>
              <option value="Published">{t("Published")}</option>
            </select>
          </label>
        </div>
        <label>
          {t("Subject")}
          <input value={form.subject} onChange={set("subject")} required maxLength={300} />
        </label>
        <label>
          {t("Variables")}
          <textarea value={form.variables} onChange={set("variables")} rows={4} placeholder="person.first_name" />
        </label>
        <label>
          {t("Body")}
          <textarea value={form.body} onChange={set("body")} rows={12} required maxLength={20000} />
        </label>
        <div className="modalactions">
          <button type="button" className="secondary" onClick={close} disabled={busy}>
            {t("Cancel")}
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? t("Saving…") : t("Save Changes")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
