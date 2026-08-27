import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getPersonDetailFn, updatePersonIdentityFn } from "@/lib/workbench.functions";
import { useLang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { opErrorMessage } from "@/lib/errors";
import { Badge, Empty, Loading, Modal } from "@/components/workbench/ui";

export const Route = createFileRoute("/_authenticated/people/$personId")({ component: PersonPage });

function PersonPage() {
  const { personId } = Route.useParams();
  const { t, lang } = useLang();
  const nav = useNavigate();
  const qc = useQueryClient();
  const call = useServerFn(getPersonDetailFn);
  const updateIdentity = useServerFn(updatePersonIdentityFn);
  const { data, isLoading } = useQuery({
    queryKey: ["person", personId],
    queryFn: () => call({ data: { personId } }),
  });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (isLoading) return <Loading />;
  if (!data || "error" in data) return <Empty icon="alert" title={t("Person not found")} />;
  const active = data.employments.find((e) => ["active", "ending"].includes(e.status));
  const save = async (form: { employeeId: string; email: string; phone: string }) => {
    setBusy(true);
    try {
      const result = await updateIdentity({
        data: {
          personId,
          employeeId: form.employeeId || undefined,
          email: form.email,
          phone: form.phone || undefined,
        },
      });
      if ("error" in result) {
        toast.error(opErrorMessage(t, result.error));
        return;
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["person", personId] }),
        qc.invalidateQueries({ queryKey: ["people"] }),
        qc.invalidateQueries({ queryKey: ["workbench"] }),
      ]);
      setEditing(false);
      toast.success(t("Saved"));
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="eyebrow">{t("PERSON PROFILE")}</p>
          <h1>{data.person.displayName}</h1>
          <p>
            {data.person.email ?? "—"} · {data.person.employeeId ?? "—"}
          </p>
        </div>
        <div className="actions">
          <button className="secondary" onClick={() => setEditing(true)}>
            {t("Edit Person")}
          </button>
          {active ? (
            <button
              className="primary"
              onClick={() =>
                nav({
                  to: "/offboarding",
                  search: { q: "", new: "1", personId, employmentId: active.id },
                })
              }
            >
              {t("Start Offboarding")}
            </button>
          ) : null}
        </div>
      </div>
      <section className="panel">
        <div className="panelhead">
          <b>{t("Employment History")}</b>
        </div>
        <div className="timeline">
          {data.employments.map((e) => (
            <div className="timelineitem" key={e.id}>
              <Badge>{e.status}</Badge>
              <div>
                <b>
                  {e.employmentType} · {e.role ?? "—"}
                </b>
                <p>
                  {e.team} · {fmtDate(e.startDate, lang)} – {fmtDate(e.endDate, lang)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panelhead">
          <b>{t("Lifecycle Cases")}</b>
        </div>
        {data.cases.map((c) => (
          <button
            className="templatecard"
            key={c.id}
            onClick={() => nav({ to: "/cases/$caseId", params: { caseId: c.id } })}
          >
            <div>
              <b>
                {t(c.caseType)} · {t(c.status)}
              </b>
              <span>{fmtDate(c.effectiveDate, lang)}</span>
            </div>
          </button>
        ))}
      </section>
      {editing ? (
        <IdentityModal
          initial={{
            employeeId: data.person.employeeId ?? "",
            email: data.person.email ?? "",
            phone: data.person.phone ?? "",
          }}
          busy={busy}
          close={() => setEditing(false)}
          save={save}
        />
      ) : null}
    </div>
  );
}

function IdentityModal({
  initial,
  busy,
  close,
  save,
}: {
  initial: { employeeId: string; email: string; phone: string };
  busy: boolean;
  close: () => void;
  save: (form: { employeeId: string; email: string; phone: string }) => void;
}) {
  const { t } = useLang();
  const [form, setForm] = useState(initial);
  return (
    <Modal title={t("Edit Person")} close={close}>
      <form
        className="userform"
        onSubmit={(e) => {
          e.preventDefault();
          save(form);
        }}
      >
        <label>
          {t("Employee ID")} ({t("Optional")})
          <input
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            maxLength={80}
          />
        </label>
        <label>
          {t("Personal Email")}
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            maxLength={320}
          />
        </label>
        <label>
          {t("Phone")}
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            maxLength={80}
          />
        </label>
        <p>{t("This updates the existing Person. It does not create a duplicate record.")}</p>
        <div className="modalactions">
          <button type="button" className="secondary" onClick={close}>
            {t("Cancel")}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? t("Saving…") : t("Save Changes")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
