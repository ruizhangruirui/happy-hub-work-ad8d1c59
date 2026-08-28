import { describe, expect, it } from "vitest";
import { bundledSupabasePublicConfig, resolveSupabasePublicConfig } from "./public-config";

describe("Supabase public deployment configuration", () => {
  it("provides a Git-connected hosting fallback without a privileged key", () => {
    const config = resolveSupabasePublicConfig();

    expect(config.url).toBe("https://xfmtidsdkgxnplbjgvmz.supabase.co");
    expect(config.publishableKey).toMatch(/^sb_publishable_/);
    expect(JSON.stringify(bundledSupabasePublicConfig)).not.toContain("sb_secret_");
    expect(JSON.stringify(bundledSupabasePublicConfig)).not.toContain("service_role");
  });

  it("prefers deployment-provided public configuration", () => {
    expect(
      resolveSupabasePublicConfig({
        url: "https://example.supabase.co",
        publishableKey: "sb_publishable_override",
      }),
    ).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_override",
    });
  });
});
