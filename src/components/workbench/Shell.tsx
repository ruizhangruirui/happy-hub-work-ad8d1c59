import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { initialsOf } from "@/lib/format";
import { Icon } from "./ui";

const NAV = [
  { group: "HOME", items: [{ to: "/work", icon: "home", label: "My Work" }] },
  {
    group: "OPERATIONS",
    items: [
      { to: "/onboarding", icon: "onboarding", label: "Onboarding" },
      { to: "/offboarding", icon: "offboarding", label: "Offboarding" },
      { to: "/people", icon: "users", label: "People" },
    ],
  },
  { group: "COMMUNICATION", items: [{ to: "/email", icon: "mail", label: "Email Center" }] },
  {
    group: "ADMIN",
    items: [
      { to: "/templates", icon: "template", label: "Template Manager" },
      { to: "/settings", icon: "settings", label: "Settings" },
    ],
  },
];

export function Shell({
  userName,
  userRole,
  children,
}: {
  userName: string;
  userRole: string;
  children: ReactNode;
}) {
  const { lang, setLang, t } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate({ to: "/search", search: { q: search } });
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brandmark">TW</span>
          <span>
            <b>TEAM WORKBENCH</b>
            <br />
            {t("Internal Operations")}
          </span>
        </div>
        {NAV.map((g) => (
          <div className="navgroup" key={g.group}>
            <p className="navlabel">{t(g.group)}</p>
            {g.items.map((item) => {
              const active = location.pathname.startsWith(item.to);
              return (
                <button
                  key={item.to}
                  className={active ? "active" : ""}
                  onClick={() => navigate({ to: item.to })}
                >
                  <Icon name={item.icon} /> <span>{t(item.label)}</span> <em>›</em>
                </button>
              );
            })}
          </div>
        ))}
        <div className="sidebarfoot">
          <div className="support">
            <b>{t("Support & Feedback")}</b>
            <span>{t("Contact HR Ops")}</span>
          </div>
          <Icon name="mail" />
        </div>
      </aside>
      <div>
        <header className="topbar">
          <form className="globalsearch" onSubmit={submitSearch}>
            <Icon name="search" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search people, tasks, emails")}
            />
          </form>
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              className="langtoggle"
              onClick={() => setLang(lang === "en" ? "zh" : "en")}
              aria-label="Toggle language"
            >
              {lang === "en" ? "中文" : "EN"}
            </button>
            <div className="userwrap">
              <button className="user" onClick={() => setMenuOpen((v) => !v)}>
                <span className="avatar">{initialsOf(userName)}</span>
                <span>
                  {userName}
                  <b>{t(userRole)}</b>
                </span>
                <Icon name="down" />
              </button>
              {menuOpen ? (
                <div className="menu">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate({ to: "/settings" });
                    }}
                  >
                    <Icon name="user" /> {t("My Account")}
                  </button>
                  <button onClick={signOut}>
                    <Icon name="x" /> {t("Sign Out")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
