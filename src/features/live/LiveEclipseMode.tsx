import { useEffect, useRef, useState } from "react";
import type { EclipseCircumstances } from "../../domain/eclipse";
import type { EclipseEventId } from "../../domain/eclipse-events";
import type { SpanishDisplayTimeZone } from "../../domain/terrain-coverage";
import type { MessageKey } from "../../i18n/messages";
import { useI18n } from "../../i18n/useI18n";
import { MINIMUM_TRUSTED_SAMPLES } from "./clock-sync";
import {
  formatCountdown,
  liveSnapshot,
  type LiveContactKey,
  type LivePhaseId,
} from "./live-phase";
import { useLiveClock, type LiveClockSyncState } from "./useLiveClock";
import { useWakeLock } from "./useWakeLock";

export type LiveModePoint = Readonly<{
  name: string;
  eclipse: EclipseCircumstances | null;
  displayTimeZone: SpanishDisplayTimeZone;
  elevationStatus: "loading" | "ready" | "error";
}>;

const CONTACT_SHORT_LABEL: Record<LiveContactKey, MessageKey> = {
  c1: "live.contact.c1",
  c2: "live.contact.c2",
  maximum: "live.contact.maximum",
  c3: "live.contact.c3",
  c4: "live.contact.c4",
};

function contactLabelKey(
  key: LiveContactKey,
  kind: EclipseCircumstances["kind"],
): MessageKey {
  if (kind === "annular" && key === "c2") return "timeline.c2Annular";
  if (kind === "annular" && key === "c3") return "timeline.c3Annular";
  const labels: Record<LiveContactKey, MessageKey> = {
    c1: "timeline.c1",
    c2: "timeline.c2",
    maximum: "timeline.maximum",
    c3: "timeline.c3",
    c4: "timeline.c4",
  };
  return labels[key];
}

function phaseLabelKey(
  phase: LivePhaseId,
  kind: EclipseCircumstances["kind"],
): MessageKey {
  switch (phase) {
    case "before":
      return "live.phase.before";
    case "partialIn":
      return "live.phase.partialIn";
    case "central":
      return kind === "annular"
        ? "live.phase.annularity"
        : "live.phase.totality";
    case "partialOut":
      return "live.phase.partialOut";
    case "after":
      return "live.phase.after";
  }
}

const STALE_CALIBRATION_MS = 12 * 60 * 60 * 1000;

type Translate = (
  key: MessageKey,
  values?: Record<string, string | number>,
) => string;
type NumberFormatter = (
  value: number,
  options?: Intl.NumberFormatOptions,
) => string;

function SyncChip({
  clock,
  t,
  formatNumber,
}: {
  clock: LiveClockSyncState;
  t: Translate;
  formatNumber: NumberFormatter;
}) {
  const { status } = clock;
  const calibration = status.calibration;
  const ageMs = calibration
    ? Math.max(
        0,
        clock.nowUtcMs - (calibration.calibratedAtDeviceMs + calibration.offsetMs),
      )
    : 0;
  const age = formatClockAge(ageMs, t, formatNumber);

  let kind: string;
  let label: string;
  if (clock.calibrating) {
    kind = "calibrating";
    label = t("live.sync.calibrating");
  } else if (status.divergent) {
    kind = "warning";
    label = t("live.sync.divergent");
  } else if (status.suspect) {
    kind = "warning";
    label = t("live.sync.suspect");
  } else if (status.source === "calibrated" && calibration) {
    const uncertainty = formatNumber(
      Math.max(1, Math.ceil(calibration.uncertaintyMs)),
      { maximumFractionDigits: 0 },
    );
    if (calibration.sampleCount >= MINIMUM_TRUSTED_SAMPLES) {
      kind = "good";
      label = t("live.sync.calibrated", { uncertainty });
    } else {
      // Too few samples for redundancy: better than the raw device clock,
      // but not presented as synchronized.
      kind = "kept";
      label = t("live.sync.partial", { uncertainty });
    }
  } else if (status.source === "restored" && calibration) {
    kind = ageMs > STALE_CALIBRATION_MS ? "warning" : "kept";
    label = t(
      ageMs > STALE_CALIBRATION_MS ? "live.sync.stale" : "live.sync.restored",
      { age },
    );
  } else if (clock.calibrationUnavailable) {
    kind = "warning";
    label = t("live.sync.failed");
  } else {
    kind = "neutral";
    label = t("live.sync.device");
  }

  return (
    <span className="live-sync" role="status">
      <span className={`live-sync__chip live-sync__chip--${kind}`}>{label}</span>
      {clock.offline && (
        <span className="live-sync__chip live-sync__chip--offline">
          {t("live.sync.offline")}
        </span>
      )}
    </span>
  );
}

function formatClockAge(
  ageMs: number,
  t: Translate,
  formatNumber: NumberFormatter,
) {
  const minutes = Math.max(1, Math.round(ageMs / 60_000));
  if (minutes < 60) {
    return t("duration.minutes", { minutes: formatNumber(minutes) });
  }
  return t("duration.hoursMinutes", {
    hours: formatNumber(Math.floor(minutes / 60)),
    minutes: formatNumber(minutes % 60),
  });
}

function ClockDetail({
  clock,
  t,
  formatNumber,
}: {
  clock: LiveClockSyncState;
  t: Translate;
  formatNumber: NumberFormatter;
}) {
  const calibration = clock.status.calibration;
  if (!calibration) return null;
  return (
    <p className="live-clock-detail">
      {t("live.clock.offset", {
        offset: `${calibration.offsetMs >= 0 ? "+" : "−"}${formatNumber(
          Math.abs(calibration.offsetMs) / 1000,
          { minimumFractionDigits: 2, maximumFractionDigits: 2 },
        )}`,
      })}
      {" · "}
      {t("live.clock.calibratedAgo", {
        age: formatClockAge(
          Math.max(
            0,
            clock.nowUtcMs -
              (calibration.calibratedAtDeviceMs + calibration.offsetMs),
          ),
          t,
          formatNumber,
        ),
      })}
    </p>
  );
}

function RecalibrateButton({
  clock,
  t,
}: {
  clock: LiveClockSyncState;
  t: Translate;
}) {
  // Always available: pressing it during a run aborts the in-flight
  // calibration and starts a fresh one, so a hung network never traps the
  // "calibrating" state.
  return (
    <button className="live-action" type="button" onClick={clock.recalibrate}>
      {t("live.actions.recalibrate")}
    </button>
  );
}

/** The countdown instrument shared by the evidence tab and the full screen. */
function LiveCountdownBody({
  point,
  clock,
}: {
  point: LiveModePoint;
  clock: LiveClockSyncState;
}) {
  const { t, formatNumber, formatTime } = useI18n();
  const eclipse = point.eclipse;

  if (point.elevationStatus === "loading") {
    return (
      <div className="live-countdown__pending">
        <p>{t("elevation.loading")}</p>
      </div>
    );
  }
  if (!eclipse) {
    return (
      <div className="live-countdown__pending">
        <p>
          {point.elevationStatus === "error"
            ? t("elevation.unavailable")
            : t("live.noEclipse")}
        </p>
      </div>
    );
  }

  const snapshot = liveSnapshot(eclipse.contacts, clock.nowUtcMs);
  return (
    <div className="live-countdown">
      <div className="live-clock">
        <small>{t("live.clock.now")}</small>
        <span className="live-clock__time">
          {formatTime(new Date(clock.nowUtcMs), point.displayTimeZone)}
        </span>
      </div>

      <section
        className={`live-phase${
          snapshot.phase === "central" ? " live-phase--central" : ""
        }`}
        aria-label={t("live.phaseLabel")}
      >
        <span className="live-phase__label">
          {t(phaseLabelKey(snapshot.phase, eclipse.kind))}
        </span>
        {snapshot.next && snapshot.msToNext !== null ? (
          <>
            <span className="live-phase__target">
              {t("live.nextIn", {
                contact: t(CONTACT_SHORT_LABEL[snapshot.next.key]),
              })}
            </span>
            <span className="live-phase__countdown">
              {formatCountdown(snapshot.msToNext)}
            </span>
          </>
        ) : (
          <span className="live-phase__countdown live-phase__countdown--done">
            {formatCountdown(0)}
          </span>
        )}
      </section>

      {eclipse.contacts.c2 &&
        eclipse.contacts.c3 &&
        eclipse.totalityDurationSeconds !== null && (
          <section
            className="live-band"
            aria-label={t(
              eclipse.kind === "annular"
                ? "metric.annularity"
                : "metric.totality",
            )}
          >
            <header>
              <span>
                {t(
                  eclipse.kind === "annular"
                    ? "metric.annularity"
                    : "metric.totality",
                )}
              </span>
              <b>
                {t("duration.minutesSeconds", {
                  minutes: formatNumber(
                    Math.floor(Math.round(eclipse.totalityDurationSeconds) / 60),
                  ),
                  seconds: formatNumber(
                    Math.round(eclipse.totalityDurationSeconds) % 60,
                  ),
                })}
              </b>
            </header>
            <div
              className="live-band__track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(
                (snapshot.phase === "partialOut" || snapshot.phase === "after"
                  ? 1
                  : (snapshot.centralProgress ?? 0)) * 100,
              )}
            >
              <div
                className="live-band__fill"
                style={{
                  width: `${(
                    (snapshot.phase === "partialOut" ||
                    snapshot.phase === "after"
                      ? 1
                      : (snapshot.centralProgress ?? 0)) * 100
                  ).toFixed(2)}%`,
                }}
              />
            </div>
            <div className="live-band__marks">
              <span>
                <small>{t("live.contact.c2")}</small>
                <b>
                  {formatTime(eclipse.contacts.c2.time, point.displayTimeZone)}
                </b>
              </span>
              <span>
                <small>{t("live.contact.maximum")}</small>
                <b>
                  {formatTime(
                    eclipse.contacts.maximum.time,
                    point.displayTimeZone,
                  )}
                </b>
              </span>
              <span>
                <small>{t("live.contact.c3")}</small>
                <b>
                  {formatTime(eclipse.contacts.c3.time, point.displayTimeZone)}
                </b>
              </span>
            </div>
          </section>
        )}

      <ol className="live-contacts" aria-label={t("timeline.title")}>
        {snapshot.contacts.map((row) => (
          <li
            key={row.key}
            data-status={row.status}
            className={row.aboveApparentHorizon ? "" : "is-below-horizon"}
          >
            <span className="live-contacts__marker" aria-hidden="true">
              {row.status === "past" ? "✓" : row.status === "next" ? "▲" : "·"}
            </span>
            <div className="live-contacts__identity">
              <b>{t(contactLabelKey(row.key, eclipse.kind))}</b>
              {!row.aboveApparentHorizon && (
                <small className="live-contacts__note">
                  {t("timeline.notObservable")}
                </small>
              )}
            </div>
            <time dateTime={new Date(row.timeMs).toISOString()}>
              {formatTime(new Date(row.timeMs), point.displayTimeZone)}
            </time>
            <small className="live-contacts__delta">
              {row.status === "past"
                ? t("live.ago", {
                    time: formatCountdown(clock.nowUtcMs - row.timeMs),
                  })
                : t("live.in", {
                    time: formatCountdown(row.timeMs - clock.nowUtcMs),
                  })}
            </small>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The live countdown as selected-place evidence: rendered inside the detail
 * panel in the application's light language, with the full-screen mode as an
 * explicit action.
 */
export function LiveEvidencePanel({
  point,
  active,
  onOpenFullscreen,
}: Readonly<{
  point: LiveModePoint;
  /** False while the tab is hidden or the full-screen layer is open. */
  active: boolean;
  onOpenFullscreen: () => void;
}>) {
  const { t, formatNumber } = useI18n();
  const clock = useLiveClock(active);

  return (
    <div className="live-evidence">
      <div className="live-evidence__status">
        <SyncChip clock={clock} t={t} formatNumber={formatNumber} />
      </div>
      <LiveCountdownBody point={point} clock={clock} />
      <footer className="live-evidence__footer">
        <ClockDetail clock={clock} t={t} formatNumber={formatNumber} />
        <div className="live-actions">
          <button
            className="live-action"
            type="button"
            onClick={onOpenFullscreen}
          >
            <span aria-hidden="true">⛶</span> {t("live.fullscreen")}
          </button>
          <RecalibrateButton clock={clock} t={t} />
        </div>
      </footer>
    </div>
  );
}

/**
 * The full-screen field clock: the mobile navigation destination, the #live
 * deep link, and the "full screen" action of the evidence tab.
 */
export function LiveEclipseMode({
  point,
  eventId,
  onClose,
  onChoosePlace,
}: Readonly<{
  point: LiveModePoint | null;
  eventId: EclipseEventId;
  onClose: () => void;
  onChoosePlace: () => void;
}>) {
  const { t, formatNumber } = useI18n();
  const clock = useLiveClock(true);
  const wakeLock = useWakeLock(true);
  const rootRef = useRef<HTMLElement>(null);
  const [offlineReady, setOfflineReady] = useState(() =>
    Boolean(navigator.serviceWorker?.controller),
  );

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const container = navigator.serviceWorker;
    if (!container) return;
    const onControllerChange = () =>
      setOfflineReady(Boolean(container.controller));
    container.addEventListener("controllerchange", onControllerChange);
    return () =>
      container.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return (
    <section
      className="live-mode"
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-mode-title"
    >
      <div className="live-mode__frame">
        <header className="live-mode__header">
          <button className="live-mode__back" type="button" onClick={onClose}>
            <span aria-hidden="true">←</span>
            <span>{t("live.back")}</span>
          </button>
          <div className="live-mode__identity">
            <span className="live-mode__eyebrow">
              {t(`events.${eventId}.fullDate`)}
            </span>
            <h2 id="live-mode-title">{point ? point.name : t("live.title")}</h2>
          </div>
          <SyncChip clock={clock} t={t} formatNumber={formatNumber} />
        </header>

        <div className="live-mode__body">
          {!point ? (
            <div className="live-mode__empty">
              <h3>{t("live.noSelection.title")}</h3>
              <p>{t("live.noSelection.body")}</p>
              <button
                className="live-mode__primary-action"
                type="button"
                onClick={onChoosePlace}
              >
                {t("live.noSelection.action")}
              </button>
            </div>
          ) : (
            <LiveCountdownBody point={point} clock={clock} />
          )}
        </div>

        <footer className="live-mode__footer">
          <ClockDetail clock={clock} t={t} formatNumber={formatNumber} />
          <div className="live-actions">
            {wakeLock.state === "idle" && (
              <button
                className="live-action"
                type="button"
                onClick={wakeLock.enable}
              >
                {t("live.wakeLock.enable")}
              </button>
            )}
            {wakeLock.state === "active" && (
              <span className="live-action-note" role="status">
                {t("live.wakeLock.active")}
              </span>
            )}
            {wakeLock.state === "unavailable" && (
              <span className="live-action-note">
                {t("live.wakeLock.unavailable")}
              </span>
            )}
            <RecalibrateButton clock={clock} t={t} />
          </div>
          <p className="live-mode__offline-note">
            {offlineReady ? t("live.offline.ready") : t("live.offline.notReady")}
          </p>
        </footer>
      </div>
    </section>
  );
}
