import { afterEach, describe, expect, it, vi } from "vitest";
import { openOutlookDraft } from "./outlook-draft-service";

describe("Outlook draft abstraction", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses mailto fallback without claiming attachments were included", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("helper unavailable")));
    const location = { href: "" };
    vi.stubGlobal("window", { location });
    const result = await openOutlookDraft({
      to: "peter@example.com",
      subject: "Welcome Peter",
      body: "Hello Peter",
      attachments: [
        {
          id: "attachment",
          filename: "Welcome Guide.pdf",
          storagePath: "email-templates/template/guide.pdf",
          contentType: "application/pdf",
          size: 100,
          source: "template",
          downloadUrl: "https://signed.example/guide.pdf",
        },
      ],
    });
    expect(result).toEqual({ mode: "mailto", attachmentsIncluded: false });
    expect(location.href).toContain("mailto:peter%40example.com");
    expect(location.href).toContain("subject=Welcome%20Peter");
  });

  it("passes template and additional attachments through the localhost bridge", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const result = await openOutlookDraft({
      to: "peter@example.com",
      subject: "Welcome",
      body: "Hello",
      attachments: [
        {
          id: "one",
          filename: "Guide.pdf",
          storagePath: "one",
          contentType: "application/pdf",
          size: 1,
          source: "template",
        },
        {
          id: "two",
          filename: "Peter.pdf",
          storagePath: "two",
          contentType: "application/pdf",
          size: 1,
          source: "additional",
        },
      ],
    });
    expect(result).toEqual({ mode: "desktop_bridge", attachmentsIncluded: true });
    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(payload.attachments.map((item: { source: string }) => item.source)).toEqual([
      "template",
      "additional",
    ]);
  });
});
