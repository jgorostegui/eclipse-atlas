import type { EclipseCircumstances } from "../../domain/eclipse";
import { useI18n } from "../../i18n/useI18n";
import type { MessageKey } from "../../i18n/messages";
import type { SpanishDisplayTimeZone } from "../../domain/terrain-coverage";

type EclipseTimelineProps = {
  eclipse: EclipseCircumstances | null;
  displayTimeZone: SpanishDisplayTimeZone;
};

const contactRows = [
  ["c1", "timeline.c1"],
  ["c2", "timeline.c2"],
  ["maximum", "timeline.maximum"],
  ["c3", "timeline.c3"],
  ["c4", "timeline.c4"],
] as const satisfies readonly [
  keyof EclipseCircumstances["contacts"],
  MessageKey,
][];

export function EclipseTimeline({
  eclipse,
  displayTimeZone,
}: EclipseTimelineProps) {
  const { formatNumber, formatTime, t } = useI18n();
  const c4AfterSunset = Boolean(
    eclipse?.idealHorizonSunset &&
      eclipse.contacts.c4.time > eclipse.idealHorizonSunset,
  );
  const availableContacts = eclipse
    ? contactRows.flatMap(([contactKey, labelKey]) => {
        const contact = eclipse.contacts[contactKey];
        return contact ? [{ contactKey, labelKey, contact }] : [];
      })
    : [];

  return (
    <section className="eclipse-timeline" aria-label={t("timeline.title")}>
      <ol className="contact-list">
        {availableContacts.map(({ contactKey, labelKey, contact }) => {
          const resolvedLabelKey =
            eclipse?.kind === "annular" && contactKey === "c2"
              ? "timeline.c2Annular"
              : eclipse?.kind === "annular" && contactKey === "c3"
                ? "timeline.c3Annular"
                : labelKey;
          const altitude = formatNumber(
            contact.apparentSolarCentreAltitudeDegrees,
            {
              minimumFractionDigits:
                Math.abs(contact.apparentSolarCentreAltitudeDegrees) < 0.1
                  ? 3
                  : 1,
              maximumFractionDigits:
                Math.abs(contact.apparentSolarCentreAltitudeDegrees) < 0.1
                  ? 3
                  : 1,
            },
          );
          return (
            <li
              key={contactKey}
              className={
                !contact.aboveApparentHorizon ? "is-below-horizon" : ""
              }
            >
              <span className="contact-list__marker" aria-hidden="true" />
              <div>
                <b>{t(resolvedLabelKey)}</b>
                <time dateTime={contact.time.toISOString()}>
                  {formatTime(contact.time, displayTimeZone)}
                </time>
                <small>
                  {contact.aboveApparentHorizon
                    ? `${altitude}°`
                    : `${altitude}° · ${t("timeline.notObservable")}`}
                </small>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="timeline-summaries">
        <div className={`timeline-summary${c4AfterSunset ? " is-after-sunset" : ""}`}>
          <span>
            {t("timeline.sunset")}
            {c4AfterSunset && <small>{t("timeline.c4AfterSunset")}</small>}
          </span>
          <b>{formatTime(eclipse?.idealHorizonSunset ?? null, displayTimeZone)}</b>
        </div>
      </div>
    </section>
  );
}
