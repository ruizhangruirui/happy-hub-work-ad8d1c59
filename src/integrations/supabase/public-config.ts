/**
 * Supabase URL and publishable keys are public client configuration, not
 * credentials. Keeping a production fallback prevents Git-connected preview
 * hosts from crashing when they do not forward build-time environment values.
 * Privileged keys must never be added here.
 */
export const bundledSupabasePublicConfig = Object.freeze({
  url: "https://xfmtidsdkgxnplbjgvmz.supabase.co",
  publishableKey: "sb_publishable_k0pb8z_pvSMggJWyDQg-mw_cGHrIT1p",
});

export function resolveSupabasePublicConfig(overrides?: {
  url?: string | undefined;
  publishableKey?: string | undefined;
}) {
  return {
    url: overrides?.url || bundledSupabasePublicConfig.url,
    publishableKey: overrides?.publishableKey || bundledSupabasePublicConfig.publishableKey,
  };
}
