import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("tools/outlook-helper/Program.cs"), "utf8");

describe("Windows Outlook Helper safety contract", () => {
  it("binds only to localhost and exposes only health and draft routes", () => {
    expect(source).toContain('listener.Prefixes.Add($"http://127.0.0.1:{Port}/")');
    expect(source).toContain('AbsolutePath=="/v1/health"');
    expect(source).toContain('AbsolutePath!="/v1/drafts"');
    expect(source).not.toContain("0.0.0.0");
    expect(source).not.toMatch(/\/send["']/i);
  });

  it("displays a draft and contains no Outlook Send operation", () => {
    expect(source).toContain("mail.Display(false)");
    expect(source).not.toMatch(/mail\.Send\s*\(/i);
  });

  it("enforces origin, HTTPS, host, private-address and attachment limits", () => {
    expect(source).toContain("origin_not_allowed");
    expect(source).toContain('uri.Scheme!="https"');
    expect(source).toContain("attachment_host_not_allowed");
    expect(source).toContain("attachment_host_private");
    expect(source).toContain("request.Attachments.Count>10");
    expect(source).toContain("request.Attachments.Sum(x=>x.Size)>50*1024*1024");
    expect(source).toContain("CopyLimited(input,output,25*1024*1024)");
  });
});
