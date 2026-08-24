import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { zh } from "./zh";

export type Lang = "en" | "zh";

const LangContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (s: string) => string;
}>({ lang: "en", setLang: () => undefined, t: (s) => s });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem("tw-lang");
    if (saved === "zh" || saved === "en") setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    window.localStorage.setItem("tw-lang", l);
  };

  const t = (s: string) => (lang === "zh" ? (zh[s] ?? s) : s);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
