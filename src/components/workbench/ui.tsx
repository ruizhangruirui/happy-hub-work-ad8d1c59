import { useEffect, useId, useRef, type ReactNode } from "react";
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
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel
      ?.querySelector<HTMLElement>(
        "input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])",
      )
      ?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab" || !panel) return;
      const focusable = [
        ...panel.querySelectorAll<HTMLElement>(
          "input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),a[href]",
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, []);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="modal" ref={panelRef}>
        <div className="modalhead">
          <b id={titleId}>{title}</b>
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

export function Spinner() {
  return <span className="btnspin" aria-hidden />;
}

/** Dashboard-shaped skeleton: keeps layout stable while data loads. */
export function Loading() {
  return (
    <div className="pageskeleton" role="status" aria-busy="true" aria-live="polite">
      <div className="skeleton" style={{ height: 26, width: 220 }} />
      <div className="skeleton" style={{ height: 14, width: 320 }} />
      <div className="skelcards">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
      <div className="skelrows">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="skeleton" key={index} />
        ))}
      </div>
    </div>
  );
}
