import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Shell } from "@/components/workbench/Shell";
import { Loading } from "@/components/workbench/ui";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  component: AuthedLayout,
});

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  operator: "Operator",
  manager: "Manager",
  viewer: "Viewer",
};

async function fetchIdentity() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,name,title,status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.status !== "Active") return null;
  const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
  const role = (roleRow?.role as string) ?? "viewer";
  return { id: user.id, name: profile.name, email: profile.email, role: ROLE_LABEL[role] ?? "Viewer" };
}

function AccessDenied() {
  const { t } = useLang();
  const navigate = useNavigate();
  return (
    <div className="authwrap">
      <div className="authcard deniedcard">
        <span className="brandmark" style={{ margin: "0 auto 14px" }}>
          TW
        </span>
        <h1>{t("Access Pending")}</h1>
        <p className="sub">
          {t("Your account is not activated in Team Workbench yet. Please contact an administrator to grant access.")}
        </p>
        <button
          className="primary"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
        >
          {t("Back to Sign In")}
        </button>
      </div>
    </div>
  );
}

function AuthedLayout() {
  const { data: identity, isLoading } = useQuery({ queryKey: ["identity"], queryFn: fetchIdentity });
  if (isLoading) return <Loading />;
  if (!identity) return <AccessDenied />;
  return (
    <Shell userName={identity.name} userRole={identity.role}>
      <Outlet />
    </Shell>
  );
}
