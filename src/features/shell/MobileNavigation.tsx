import type { MessageKey, MessageValues } from "../../i18n/messages";

export type MobileView = "map" | "explore" | "live" | "help";

type Translate = (key: MessageKey, values?: MessageValues) => string;

function NavigationIcon({ view }: { view: MobileView }) {
  if (view === "map") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m3.5 6 5-2.5 7 2.5 5-2.5v14.5l-5 2.5-7-2.5-5 2.5z" />
        <path d="M8.5 3.5v14.5M15.5 6v14.5" />
      </svg>
    );
  }

  if (view === "explore") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="m14.7 9.3-1.8 3.6-3.6 1.8 1.8-3.6z" />
      </svg>
    );
  }

  if (view === "live") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.4v4.6l3.1 1.9" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 10.8v5.1M12 7.7h.01" />
    </svg>
  );
}

export function MobileNavigation({
  activeView,
  onChange,
  t,
  inert,
}: {
  activeView: MobileView;
  onChange: (view: MobileView) => void;
  t: Translate;
  /** True while a modal layer covers the navigation. */
  inert?: boolean;
}) {
  const destinations = [
    ["map", "nav.map"],
    ["explore", "panel.explore"],
    ["live", "nav.live"],
    ["help", "nav.help"],
  ] as const satisfies readonly (readonly [MobileView, MessageKey])[];

  return (
    <nav
      className="mobile-navigation"
      aria-label={t("nav.mobileLabel")}
      inert={inert || undefined}
    >
      {destinations.map(([view, label]) => (
        <button
          key={view}
          type="button"
          className={activeView === view ? "is-active" : ""}
          aria-current={activeView === view ? "page" : undefined}
          onClick={() => onChange(view)}
        >
          <NavigationIcon view={view} />
          <span>{t(label)}</span>
        </button>
      ))}
    </nav>
  );
}
