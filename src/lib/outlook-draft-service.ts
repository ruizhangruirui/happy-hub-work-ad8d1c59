import type { OutlookAttachment } from "./email-compose";

export interface OutlookDraftPayload {
  to: string;
  subject: string;
  body: string;
  attachments: OutlookAttachment[];
}
export interface OutlookDraftResult {
  mode: "desktop_bridge" | "mailto";
  attachmentsIncluded: boolean;
}

export async function detectOutlookIntegration(): Promise<"desktop_bridge" | "mailto"> {
  try {
    const response = await fetch("http://127.0.0.1:17873/v1/health", {
      signal: AbortSignal.timeout(800),
    });
    if (!response.ok) return "mailto";
    const capability = (await response.json()) as { outlook?: string; attachments?: boolean };
    return capability.outlook === "classic" && capability.attachments ? "desktop_bridge" : "mailto";
  } catch {
    return "mailto";
  }
}

export async function openOutlookDraft(payload: OutlookDraftPayload): Promise<OutlookDraftResult> {
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
    if (response.ok)
      return { mode: "desktop_bridge", attachmentsIncluded: payload.attachments.length > 0 };
  } catch {
    /* The optional localhost-only Windows helper is unavailable. */
  }
  window.location.href = `mailto:${encodeURIComponent(payload.to)}?subject=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(payload.body)}`;
  return { mode: "mailto", attachmentsIncluded: false };
}
