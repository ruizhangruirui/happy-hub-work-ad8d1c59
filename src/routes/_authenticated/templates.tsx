import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listTemplatesFn } from "@/lib/workbench.functions";
import type { TemplateDto } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { Badge, Empty, Icon, Loading } from "@/components/workbench/ui";

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
  const { data, isLoading } = useQuery({ queryKey: ["templates"], queryFn: () => fetchTemplates() });
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  if (isLoading) return <Loading />;
  const templates: TemplateDto[] = data && !("error" in data) ? data.templates : [];
  const categories = [...new Set(templates.map((x) => x.category))];
  const filtered = templates.filter((x) => !category || x.category === category);
  const current = templates.find((x) => x.id === selected) ?? filtered[0] ?? null;

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="eyebrow">{t("ADMIN")}</p>
          <h1>{t("Template Manager")}</h1>
        </div>
        <select className="filter" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t("All Categories")}</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {t(cat)}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Empty icon="template" title={t("No templates yet.")} />
      ) : (
        <div className="emailgrid" style={{ gridTemplateColumns: "minmax(280px,1fr) 2fr" }}>
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
                  <b className="templatebig">{current.name}</b>
                  <Badge>{current.status}</Badge>
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
    </div>
  );
}
