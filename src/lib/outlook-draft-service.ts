import type { EmailAttachmentDto } from "./types";

export interface OutlookDraftPayload {
  to: string;
  subject: string;
  body: string;
  attachments: EmailAttachmentDto[];
}
export interface OutlookDraftResult {
  mode: "desktop_bridge" | "mailto";
  attachmentsIncluded: boolean;
}

export async function openOutlookDraft(payload: OutlookDraftPayload): Promise<OutlookDraftResult> {
  if (payload.attachments.length) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const response = await fetch("http://127.0.0.1:17873/v1/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (response.ok) return { mode: "desktop_bridge", attachmentsIncluded: true };
    } catch {
      /* The optional localhost-only Windows helper is unavailable. */
    }
  }
  window.location.href = `mailto:${encodeURIComponent(payload.to)}?subject=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(payload.body)}`;
  return { mode: "mailto", attachmentsIncluded: false };
}
