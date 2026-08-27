/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { listTemplatesFn, saveTemplateFn } from "@/lib/workbench.functions";
import type { TemplateDto } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { opErrorMessage } from "@/lib/errors";
import { Badge, Empty, Icon, Loading, Modal } from "@/components/workbench/ui";
import { supabase } from "@/integrations/supabase/client";
import type { EmailVariableDto } from "@/lib/types";
import { extractEmailVariableKeys } from "@/lib/email-compose";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Template Manager · Team Workbench" },
      {
        name: "description",
        content: "Email templates for onboarding and offboarding communications.",
      },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const { t, lang } = useLang();
  const fetchTemplates = useServerFn(listTemplatesFn);
  const { data, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => fetchTemplates(),
  });
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [caseType, setCaseType] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<TemplateDto | "new" | null>(null);

  if (isLoading) return <Loading />;
  const templates: TemplateDto[] = data && !("error" in data) ? data.templates : [];
  const categories = [...new Set(templates.map((x) => x.category))];
  const filtered = templates.filter(
    (x) =>
      (!category || x.category === category) &&
      (!status || x.status === status) &&
      (!caseType || x.applicableCaseTypes.includes(caseType)) &&
      (!search || `${x.name} ${x.description}`.toLowerCase().includes(search.toLowerCase())),
  );
  const current = templates.find((x) => x.id === selected) ?? filtered[0] ?? null;
  const canManage = Boolean(data && !("error" in data) && data.canManageTemplates);

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="eyebrow">{t("ADMIN")}</p>
          <h1>{t("Template Manager")}</h1>
        </div>
        <div className="actions">
          <input
            className="filter"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search templates")}
          />
          <select className="filter" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t("All Categories")}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {t(cat)}
              </option>
            ))}
          </select>
          <select className="filter" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("All Statuses")}</option>
            <option>Draft</option>
            <option>Published</option>
            <option>Archived</option>
          </select>
          <select className="filter" value={caseType} onChange={(e) => setCaseType(e.target.value)}>
            <option value="">{t("All Case Types")}</option>
            <option value="onboarding">{t("Onboarding")}</option>
            <option value="offboarding">{t("Offboarding")}</option>
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
                    <span>
                      {t("Last Updated")} {fmtDate(current.updatedAt, lang)}
                    </span>
                  </div>
                  <div className="actions">
                    <Badge>{current.status}</Badge>
                    {canManage ? (
                      <>
                        <button className="secondary" onClick={() => setEditing(current)}>
                          <Icon name="settings" /> {t("Edit Template")}
                        </button>
                        <button
                          className="secondary"
                          onClick={() =>
                            setEditing({
                              ...current,
                              id: "",
                              name: `${current.name} Copy`,
                              status: "Draft",
                            })
                          }
                        >
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
                    <b>v{current.version}</b>
                  </div>
                  <div>
                    <span>{t("Recipient Source")}</span>
                    <b>{t(current.recipientSource)}</b>
                  </div>
                  <div>
                    <span>{t("Attachments")}</span>
                    <b>{current.attachments.length}</b>
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
                  {current.variableDefinitions.map((v) => (
                    <span className="variable" key={v.key}>
                      {`{{${v.key}}}`} · {t("Manual")}
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
                  <pre style={{ whiteSpace: "pre-wrap", font: "inherit", margin: 0 }}>
                    {current.body}
                  </pre>
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}
      <GlobalVariables
        variables={data && !("error" in data) ? data.globalVariables : []}
        canManage={canManage}
      />
      {editing ? (
        <TemplateModal
          template={editing === "new" ? null : editing}
          categories={categories}
          globalVariables={data && !("error" in data) ? data.globalVariables : []}
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

function GlobalVariables({
  variables,
  canManage,
}: {
  variables: EmailVariableDto[];
  canManage: boolean;
}) {
  const { t } = useLang();
  const qc = useQueryClient();
  const [editingVariable, setEditingVariable] = useState<EmailVariableDto | null>(null);
  const [isNewVariable, setIsNewVariable] = useState(false);
  const disable = async (variable: EmailVariableDto) => {
    const published =
      (
        await (supabase as any)
          .from("email_templates")
          .select("id", { count: "exact", head: true })
          .eq("status", "Published")
          .or(`subject.ilike.%{{${variable.key}}}%,body_html.ilike.%{{${variable.key}}}%`)
      ).count ?? 0;
    if (published) {
      toast.error(`${variable.key} ${t("is used by")} ${published} ${t("Published templates")}`);
      return;
    }
    await (supabase as any)
      .from("email_variable_library")
      .update({ active: false })
      .eq("variable_key", variable.key);
    await qc.invalidateQueries({ queryKey: ["templates"] });
  };
  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="panelhead">
        <div>
          <b>{t("Global Variable Library")}</b>
          <span>{t("Reusable deterministic email fields")}</span>
        </div>
        {canManage ? (
          <button
            className="secondary"
            onClick={() => {
              setIsNewVariable(true);
              setEditingVariable({
                key: "",
                displayName: "",
                dataType: "text",
                sourceType: "manual",
                sourceField: null,
                required: false,
                defaultValue: null,
                description: null,
                choices: [],
              });
            }}
          >
            <Icon name="plus" /> {t("Add Variable")}
          </button>
        ) : null}
      </div>
      <div className="chips">
        {variables.map((variable) => (
          <span className="variable" key={variable.key}>
            {`{{${variable.key}}}`} · {variable.displayName} · {variable.sourceType}
            {canManage ? (
              <>
                <button
                  onClick={() => {
                    setIsNewVariable(false);
                    setEditingVariable(variable);
                  }}
                >
                  {t("Edit")}
                </button>
                <button onClick={() => void disable(variable)}>×</button>
              </>
            ) : null}
          </span>
        ))}
      </div>
      {editingVariable ? (
        <VariableLibraryModal
          variable={editingVariable}
          isNew={isNewVariable}
          close={() => setEditingVariable(null)}
          saved={async () => {
            setEditingVariable(null);
            await qc.invalidateQueries({ queryKey: ["templates"] });
          }}
        />
      ) : null}
    </section>
  );
}

function VariableLibraryModal({
  variable,
  isNew,
  close,
  saved,
}: {
  variable: EmailVariableDto;
  isNew: boolean;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const { t } = useLang();
  const [form, setForm] = useState(variable);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const payload = {
      variable_key: form.key,
      display_name: form.displayName,
      data_type: form.dataType,
      source_type: form.sourceType,
      source_field: form.sourceType === "manual" ? null : form.sourceField,
      required: form.required,
      default_value: form.defaultValue,
      description: form.description,
      choices: form.choices ?? [],
      active: true,
      updated_at: new Date().toISOString(),
    };
    const query = (supabase as any).from("email_variable_library");
    const { error } = isNew
      ? await query.insert(payload)
      : await query.update(payload).eq("variable_key", variable.key);
    setBusy(false);
    if (error) toast.error(error.message);
    else await saved();
  };
  return (
    <Modal title={t(isNew ? "Add Variable" : "Edit Variable")} close={close}>
      <form className="userform" onSubmit={submit}>
        <label>
          {t("Variable Key")}
          <input
            required
            pattern="[a-z][a-z0-9_]*"
            disabled={!isNew}
            value={form.key}
            onChange={(event) => setForm({ ...form, key: event.target.value })}
          />
        </label>
        <label>
          {t("Display Name")}
          <input
            required
            value={form.displayName}
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
          />
        </label>
        <div className="two">
          <label>
            {t("Data Type")}
            <select
              value={form.dataType}
              onChange={(event) => setForm({ ...form, dataType: event.target.value })}
            >
              {["text", "date", "email", "number", "boolean", "dropdown", "choice"].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            {t("Source")}
            <select
              value={form.sourceType}
              onChange={(event) =>
                setForm({
                  ...form,
                  sourceType: event.target.value,
                  sourceField: event.target.value === "manual" ? null : form.sourceField,
                })
              }
            >
              {[
                "person",
                "employment",
                "onboarding_case",
                "offboarding_case",
                "manual",
                "current_user",
                "fixed",
              ].map((source) => (
                <option key={source}>{source.replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {t("Source Field")}
          <input
            disabled={form.sourceType === "manual"}
            value={form.sourceField ?? ""}
            onChange={(event) => setForm({ ...form, sourceField: event.target.value || null })}
          />
        </label>
        <label>
          {t("Default Value")}
          <input
            value={form.defaultValue ?? ""}
            onChange={(event) => setForm({ ...form, defaultValue: event.target.value || null })}
          />
        </label>
        <label>
          {t("Description")}
          <textarea
            value={form.description ?? ""}
            onChange={(event) => setForm({ ...form, description: event.target.value || null })}
          />
        </label>
        {["dropdown", "choice"].includes(form.dataType) ? (
          <label>
            {t("Choices")}
            <input
              value={(form.choices ?? []).join(", ")}
              onChange={(event) =>
                setForm({
                  ...form,
                  choices: event.target.value
                    .split(",")
                    .map((choice) => choice.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
        ) : null}
        <label>
          <input
            type="checkbox"
            checked={form.required}
            onChange={(event) => setForm({ ...form, required: event.target.checked })}
          />{" "}
          {t("Required")}
        </label>
        <div className="modalactions">
          <button type="button" className="secondary" onClick={close}>
            {t("Cancel")}
          </button>
          <button className="primary" disabled={busy}>
            {t("Save Changes")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TemplateAttachments({ template }: { template: TemplateDto }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const upload = async (file: File) => {
    if (
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
    const path = `email-templates/${template.id}/${id}-${safe}`;
    const storage = supabase.storage.from("email-attachments");
    const { error } = await storage.upload(path, file);
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    const { error: metadataError } = await (supabase as any)
      .from("email_template_attachments")
      .insert({
        id,
        template_id: template.id,
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
    await qc.invalidateQueries({ queryKey: ["templates"] });
    toast.success(t("Attachment uploaded"));
  };
  const remove = async (item: TemplateDto["attachments"][number]) => {
    await supabase.storage.from("email-attachments").remove([item.storagePath]);
    await (supabase as any).from("email_template_attachments").delete().eq("id", item.id);
    await qc.invalidateQueries({ queryKey: ["templates"] });
  };
  const view = async (item: TemplateDto["attachments"][number]) => {
    const { data, error } = await supabase.storage
      .from("email-attachments")
      .createSignedUrl(item.storagePath, 60);
    if (error) toast.error(error.message);
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  return (
    <fieldset>
      <legend>{t("Template Attachments")}</legend>
      {template.attachments.map((item) => (
        <div className="actions" key={item.id}>
          <button type="button" className="secondary" onClick={() => void view(item)}>
            {item.filename}
          </button>
          <button type="button" className="danger" onClick={() => void remove(item)}>
            {t("Remove")}
          </button>
        </div>
      ))}
      <label className="secondary">
        <Icon name="plus" /> {t("Upload Attachment")}
        <input
          hidden
          type="file"
          accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </label>
    </fieldset>
  );
}

function TemplateModal({
  template,
  categories,
  globalVariables,
  close,
  onSaved,
}: {
  template: TemplateDto | null;
  categories: string[];
  globalVariables: EmailVariableDto[];
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
    status: (template?.status === "Published"
      ? "Published"
      : template?.status === "Archived"
        ? "Archived"
        : "Draft") as "Draft" | "Published" | "Archived",
    subject: template?.subject ?? "",
    body: template?.body ?? "",
    description: template?.description ?? "",
    recipientSource: template?.recipientSource ?? "personal_email",
    applicableCaseTypes: template?.applicableCaseTypes ?? ["onboarding", "offboarding"],
    manualVariables: template?.variableDefinitions ?? [],
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
          variables: extractEmailVariableKeys(form.subject, form.body),
          description: form.description || undefined,
          recipientSource: form.recipientSource as "personal_email" | "company_email" | "manual",
          applicableCaseTypes: form.applicableCaseTypes,
          variableDefinitions: form.manualVariables,
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
            <input
              list="template-categories"
              value={form.category}
              onChange={set("category")}
              required
              maxLength={80}
            />
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
              <option value="Archived">{t("Archived")}</option>
            </select>
          </label>
        </div>
        <label>
          {t("Description")}
          <textarea
            value={form.description}
            onChange={set("description")}
            rows={2}
            maxLength={1000}
          />
        </label>
        <fieldset>
          <legend>{t("Applicable Case Types")}</legend>
          {["onboarding", "offboarding"].map((value) => (
            <label key={value}>
              <input
                type="checkbox"
                checked={form.applicableCaseTypes.includes(value)}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    applicableCaseTypes: e.target.checked
                      ? [...current.applicableCaseTypes, value]
                      : current.applicableCaseTypes.filter((item) => item !== value),
                  }))
                }
              />{" "}
              {t(value === "onboarding" ? "Onboarding" : "Offboarding")}
            </label>
          ))}
        </fieldset>
        <label>
          {t("Default recipient source")}
          <select value={form.recipientSource} onChange={set("recipientSource")}>
            <option value="personal_email">{t("Personal Email")}</option>
            <option value="company_email">{t("Company Email")}</option>
            <option value="manual">{t("Manual recipient")}</option>
          </select>
        </label>
        <label>
          {t("Subject")}
          <input value={form.subject} onChange={set("subject")} required maxLength={300} />
        </label>
        <div className="chips">
          {globalVariables.map((definition) => (
            <span className="actions" key={definition.key}>
              <button
                type="button"
                className="variable"
                onClick={() => setForm((f) => ({ ...f, body: `${f.body}{{${definition.key}}}` }))}
              >
                {t("Insert into Body")} {`{{${definition.key}}}`}
              </button>
              <button
                type="button"
                className="variable"
                onClick={() =>
                  setForm((f) => ({ ...f, subject: `${f.subject}{{${definition.key}}}` }))
                }
              >
                {t("Insert into Subject")} {`{{${definition.key}}}`}
              </button>
            </span>
          ))}
        </div>
        <fieldset>
          <legend>{t("Template-specific Manual Variables")}</legend>
          {form.manualVariables.map((variable, index) => (
            <div className="actions" key={variable.key}>
              <b>{`{{${variable.key}}}`}</b>
              <span>
                {variable.displayName} · {variable.dataType} ·{" "}
                {variable.required ? t("Required") : t("Optional")}
              </span>
              <button
                type="button"
                className="danger"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    manualVariables: current.manualVariables.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  }))
                }
              >
                {t("Remove")}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setForm((current) => ({
                ...current,
                manualVariables: [
                  ...current.manualVariables,
                  {
                    key: `manual_${current.manualVariables.length + 1}`,
                    displayName: "Manual Field",
                    dataType: "text",
                    sourceType: "manual",
                    sourceField: null,
                    required: false,
                    defaultValue: null,
                    description: null,
                    choices: [],
                  },
                ],
              }))
            }
          >
            <Icon name="plus" /> {t("Add Manual Variable")}
          </button>
          {form.manualVariables.map((variable, index) => (
            <div className="userform two compact" key={`${variable.key}-editor`}>
              <label>
                {t("Variable Key")}
                <input
                  value={variable.key}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      manualVariables: current.manualVariables.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, key: event.target.value } : item,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                {t("Display Name")}
                <input
                  value={variable.displayName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      manualVariables: current.manualVariables.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, displayName: event.target.value } : item,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                {t("Data Type")}
                <select
                  value={variable.dataType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      manualVariables: current.manualVariables.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, dataType: event.target.value } : item,
                      ),
                    }))
                  }
                >
                  {["text", "date", "email", "number", "boolean", "dropdown", "choice"].map(
                    (type) => (
                      <option key={type}>{type}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                {t("Default Value")}
                <input
                  value={variable.defaultValue ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      manualVariables: current.manualVariables.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, defaultValue: event.target.value || null }
                          : item,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={variable.required}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      manualVariables: current.manualVariables.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, required: event.target.checked } : item,
                      ),
                    }))
                  }
                />{" "}
                {t("Required")}
              </label>
              <label>
                {t("Description")}
                <input
                  value={variable.description ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      manualVariables: current.manualVariables.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, description: event.target.value || null }
                          : item,
                      ),
                    }))
                  }
                />
              </label>
              {["dropdown", "choice"].includes(variable.dataType) ? (
                <label>
                  {t("Choices")}
                  <input
                    value={(variable.choices ?? []).join(", ")}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        manualVariables: current.manualVariables.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                choices: event.target.value
                                  .split(",")
                                  .map((choice) => choice.trim())
                                  .filter(Boolean),
                              }
                            : item,
                        ),
                      }))
                    }
                  />
                </label>
              ) : null}
            </div>
          ))}
        </fieldset>
        <label>
          {t("Body")}
          <textarea value={form.body} onChange={set("body")} rows={12} required maxLength={20000} />
        </label>
        {template?.id ? (
          <TemplateAttachments template={template} />
        ) : (
          <p>{t("Save the template before uploading attachments.")}</p>
        )}
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
