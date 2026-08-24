import type { ReactNode } from "react";
import { useLang } from "@/lib/i18n";

const ICONS: Record<string, string> = {
  home: "⌂",
  grid: "▦",
  onboarding: "↗",
  offboarding: "↘",
  mail: "✉",
  template: "▤",
  settings: "⚙",
  search: "⌕",
  bell: "🔔",
  check: "✓",
  plus: "+",
  clock: "◷",
  calendar: "▦",
  filter: "⧨",
  x: "×",
  user: "👤",
  users: "👥",
  lock: "🔒",
  doc: "📄",
  history: "◔",
  link: "🔗",
  dot: "•",
  down: "▾",
  alert: "!",
  flag: "⚑",
  send: "➤",
  info: "ℹ",
  folder: "🗂",
  shield: "🛡",
  upload: "⇪",
};

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={`icon${className ? ` ${className}` : ""}`} aria-hidden>
      {ICONS[name] ?? "•"}
    </span>
  );
}

export function Badge({ children }: { children: string }) {
  const { t } = useLang();
  const slug = children.toLowerCase().replace(/\s+/g, "-");
  return <span className={`badge b-${slug}`}>{t(children)}</span>;
}

export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <div className="modalhead">
          <b>{title}</b>
          <button onClick={close} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({
  icon,
  title,
  text,
  action,
  onAction,
}: {
  icon: string;
  title: string;
  text?: string | undefined;
  action?: string | undefined;
  onAction?: (() => void) | undefined;
}) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <b>{title}</b>
      {text ? <span>{text}</span> : null}
      {action && onAction ? (
        <button className="secondary" onClick={onAction}>
          {action}
        </button>
      ) : null}
    </div>
  );
}

export function Loading() {
  return (
    <div className="authwrap">
      <span className="loadingring" />
    </div>
  );
}
