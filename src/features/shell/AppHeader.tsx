import type { EclipseEventId } from "../../domain/eclipse-events";
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher";
import { useI18n } from "../../i18n/useI18n";
import { EclipseEventSwitcher } from "../eclipse-events/EclipseEventSwitcher";

type AppHeaderProps = Readonly<{
  eventId: EclipseEventId;
  onEventSelect: (eventId: EclipseEventId) => void;
  onHome: () => void;
}>;

export function AppHeader({
  eventId,
  onEventSelect,
  onHome,
}: AppHeaderProps) {
  const { t } = useI18n();
  const baseUrl = import.meta.env.BASE_URL;

  return (
    <header className="masthead">
      <div
        className="masthead-art"
        aria-hidden="true"
        style={{
          backgroundImage: `url("${baseUrl}images/eclipse-atlas-header-1600.webp")`,
        }}
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
        <LanguageSwitcher />
      </div>
    </header>
  );
}
