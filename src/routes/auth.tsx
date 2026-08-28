import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  // No SEO value and the code-split route component hydration-mismatches
  // against the SSR Suspense fallback — render client-side only.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign In · Team Workbench" },
      {
        name: "description",
        content: "Sign in to Team Workbench — internal onboarding & offboarding operations.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, lang, setLang } = useLang();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        if (signUpError) throw signUpError;
        setNotice(t("Confirm your account via the email we sent, then sign in."));
        setMode("signin");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        navigate({ to: "/work" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authwrap">
      <div className="authcard">
        <span className="brandmark">TW</span>
        <h1>{mode === "signin" ? t("Welcome to Team Workbench") : t("Create an account")}</h1>
        <p className="sub">
          {mode === "signin"
            ? t("Sign in with your work email to continue.")
            : t("Ask an administrator to activate it after signing up.")}
        </p>
        <form onSubmit={submit}>
          {mode === "signup" ? (
            <label>
              {t("Full Name")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </label>
          ) : null}
          <label>
            {t("Email")}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            {t("Password")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </label>
          {error ? <div className="autherror">{error}</div> : null}
          {notice ? <div className="authhint">{notice}</div> : null}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? t("Signing in…") : mode === "signin" ? t("Sign In") : t("Sign Up")}
          </button>
        </form>
        <div className="authswitch">
          {mode === "signin" ? t("Don't have an account?") : t("Have an account?")}{" "}
          <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? t("Sign Up") : t("Sign In")}
          </button>
        </div>
        <div className="authswitch">
          <button onClick={() => setLang(lang === "en" ? "zh" : "en")}>
            {lang === "en" ? "中文" : "English"}
          </button>
        </div>
      </div>
    </div>
  );
}
