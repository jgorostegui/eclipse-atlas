import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/useI18n";
import {
  eclipseEventIds,
  type EclipseEventId,
} from "../../domain/eclipse-events";

const OFFICIAL_EVENT_SOURCE_URL =
  "https://centrodedescargas.cnig.es/CentroDescargas/eclipses";

export function EclipseEventSwitcher({
  selectedEventId,
  onSelect,
}: {
  selectedEventId: EclipseEventId;
  onSelect: (eventId: EclipseEventId) => void;
}) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeAndRestoreFocus = () => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!isOpen) return;

    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAndRestoreFocus();
      }
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [isOpen]);

  return (
    <div className="event-switcher" ref={rootRef}>
      <button
        ref={triggerRef}
        className="event-switcher-trigger"
        type="button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? "eclipse-event-panel" : undefined}
        aria-label={t("events.switcher")}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="event-switcher-current">{selectedEventId}</span>
        <span className="event-switcher-series" aria-hidden="true">
          {t("events.countShort")}
        </span>
        <span className="event-switcher-chevron" aria-hidden="true" />
      </button>

      {isOpen && (
        <section
          className="event-switcher-panel"
          id="eclipse-event-panel"
          aria-label={t("events.panelLabel")}
        >
          <header className="event-switcher-heading">
            <span>{t("events.eyebrow")}</span>
            <h2>{t("events.title")}</h2>
            <p>{t("events.description")}</p>
          </header>

          <div className="event-switcher-grid">
            {eclipseEventIds.map((eventId) => {
              const selected = eventId === selectedEventId;
              const annular = eventId === "2028";
              return (
                <button
                  key={eventId}
                  type="button"
                  className={`event-card${selected ? " event-card--current" : ""}`}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => {
                    onSelect(eventId);
                    closeAndRestoreFocus();
                  }}
                >
                  <span
                    className={`event-phase event-phase--${annular ? "annular" : "total"}`}
                    aria-hidden="true"
                  />
                  <span>
                    <strong>{eventId}</strong>
                    <span>
                      {t(`events.${eventId}.date`)} · {t(annular ? "events.annular" : "events.total")}
                    </span>
                  </span>
                  <small>{selected ? t("events.current") : t("events.select")}</small>
                </button>
              );
            })}
          </div>

          <a
            className="event-switcher-source"
            href={OFFICIAL_EVENT_SOURCE_URL}
            target="_blank"
            rel="noreferrer"
          >
            {t("events.source")}
          </a>
        </section>
      )}
    </div>
  );
}
