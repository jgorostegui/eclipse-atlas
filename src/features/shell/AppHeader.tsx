import type { CSSProperties } from "react";
import type { EclipseEventId } from "../../domain/eclipse-events";
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher";
import { useI18n } from "../../i18n/useI18n";
import { EclipseEventSwitcher } from "../eclipse-events/EclipseEventSwitcher";
import {
  ECLIPSE_ATLAS_REPOSITORY_URL,
  GitHubMark,
} from "./GitHubMark";

type AppHeaderProps = Readonly<{
  eventId: EclipseEventId;
  onEventSelect: (eventId: EclipseEventId) => void;
  onHome: () => void;
  /** True while a modal layer covers the header. */
  inert?: boolean;
}>;

export function AppHeader({
  eventId,
  onEventSelect,
  onHome,
  inert,
}: AppHeaderProps) {
  const { t } = useI18n();
  const baseUrl = import.meta.env.BASE_URL;
  const mastheadArtStyle = {
    "--masthead-art-desktop": `url("${new URL(
      `${baseUrl}images/eclipse-atlas-header-1600.webp`,
      window.location.href,
    ).href}")`,
    "--masthead-art-mobile": `url("${new URL(
      `${baseUrl}images/eclipse-atlas-header-mobile-960.webp`,
      window.location.href,
    ).href}")`,
  } as CSSProperties;

  return (
    <header className="masthead" inert={inert || undefined}>
      <div
        className="masthead-art"
        aria-hidden="true"
        style={mastheadArtStyle}
      />
      <div className="masthead-scrim" aria-hidden="true" />

      <div className="masthead-primary">
        <button
          className="brand"
          type="button"
          onClick={onHome}
          aria-label={t("brand.home")}
        >
          <span className="brand-eclipse" aria-hidden="true">
            <i />
          </span>
          <span className="brand-copy">
            <strong>{t("brand.name")}</strong>
            <small>{t(`events.${eventId}.fullDate`)}</small>
          </span>
          <strong className="brand-mobile-name">Atlas</strong>
        </button>
        <EclipseEventSwitcher
          selectedEventId={eventId}
          onSelect={onEventSelect}
        />
      </div>

      <div className="masthead-actions">
        <a
          className="masthead-repository-link"
          href={ECLIPSE_ATLAS_REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
          aria-label={t("repository.open")}
          title={t("repository.open")}
        >
          <GitHubMark />
        </a>
        <LanguageSwitcher />
      </div>
    </header>
  );
}
