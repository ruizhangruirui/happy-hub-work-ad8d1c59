import { describe, expect, it } from "vitest";
import { temporaryComposeAttachments } from "./additional-attachments";

describe("Additional Attachment Compose cleanup", () => {
  it("selects temporary attachments and never selects linked historical evidence", () => {
    const temporary = { id: "temporary", storagePath: "additional/temp.pdf", linked: false };
    const historical = { id: "historical", storagePath: "additional/history.pdf", linked: true };
    expect(temporaryComposeAttachments([temporary, historical])).toEqual([temporary]);
  });
});
