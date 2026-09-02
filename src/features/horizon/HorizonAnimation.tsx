import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  calculateEclipseAnimationTrack,
  interpolateEclipseAnimationSample,
  type EclipseCircumstances,
} from "../../domain/eclipse";
import type { TerrainHorizon } from "../../domain/terrain-horizon";
import { displayTimeZoneForSupportedCoordinate } from "../../domain/terrain-coverage";
import { useI18n } from "../../i18n/useI18n";
import type { MessageKey } from "../../i18n/messages";
import {
  calculateCelestialContext,
  type CelestialObjectId,
} from "./celestial-context";
import { lowerSolarEdgeTerrainMargin } from "./horizon-animation-model";
import { HorizonCanvasView } from "./HorizonCanvasView";
import {
  HORIZON_REVEAL_CONTEXT_MINUTES,
  HORIZON_REVEAL_DURATION_MS,
  horizonRevealProgress,
  type HorizonRevealTimeline,
} from "./horizon-reveal";

type HorizonAnimationProps = {
  active: boolean;
  latitude: number;
  longitude: number;
  eclipse: EclipseCircumstances;
  horizon: TerrainHorizon;
};

type FocusMoment = readonly [MessageKey, Date];
type EclipseVisualPhase = "partial" | "total" | "annular";

type HorizonSliderStyle = CSSProperties & {
  "--horizon-progress": string;
};

const revealedHorizonLocations = new Set<string>();

const CELESTIAL_LABEL_KEYS: Record<CelestialObjectId, MessageKey> = {
  mercury: "horizon.sky.mercury",
  venus: "horizon.sky.venus",
  mars: "horizon.sky.mars",
  jupiter: "horizon.sky.jupiter",
  saturn: "horizon.sky.saturn",
  pollux: "horizon.sky.pollux",
  castor: "horizon.sky.castor",
  regulus: "horizon.sky.regulus",
  sirius: "horizon.sky.sirius",
  procyon: "horizon.sky.procyon",
  capella: "horizon.sky.capella",
  betelgeuse: "horizon.sky.betelgeuse",
  aldebaran: "horizon.sky.aldebaran",
};

function focusWindow(eclipse: EclipseCircumstances) {
  if (eclipse.totalBegin && eclipse.totalEnd) {
    const c2Key = eclipse.kind === "annular" ? "timeline.c2Annular" : "timeline.c2";
    const c3Key = eclipse.kind === "annular" ? "timeline.c3Annular" : "timeline.c3";
    return {
      start: eclipse.partialBegin,
      end: eclipse.partialEnd,
      moments: [
        ["timeline.c1", eclipse.partialBegin],
        [c2Key, eclipse.totalBegin],
        ["timeline.maximum", eclipse.peak],
        [c3Key, eclipse.totalEnd],
        ["timeline.c4", eclipse.partialEnd],
      ] as const satisfies readonly FocusMoment[],
    };
  }
  return {
    start: eclipse.partialBegin,
    end: eclipse.partialEnd,
    moments: [
      ["timeline.c1", eclipse.partialBegin],
      ["timeline.maximum", eclipse.peak],
      ["timeline.c4", eclipse.partialEnd],
    ] as const satisfies readonly FocusMoment[],
  };
}

function visualPhaseAt(
  eclipse: EclipseCircumstances,
  time: Date,
): EclipseVisualPhase {
  if (
    eclipse.totalBegin &&
    eclipse.totalEnd &&
    time >= eclipse.totalBegin &&
    time <= eclipse.totalEnd
  ) {
    return eclipse.kind === "annular" ? "annular" : "total";
  }
  return "partial";
}

function revealTimes(eclipse: EclipseCircumstances) {
  if (eclipse.totalBegin && eclipse.totalEnd) {
    const contextMilliseconds = HORIZON_REVEAL_CONTEXT_MINUTES * 60_000;
    return {
      start: new Date(eclipse.totalBegin.getTime() - contextMilliseconds),
      centralBegin: eclipse.totalBegin,
      centralEnd: eclipse.totalEnd,
      end: new Date(eclipse.totalEnd.getTime() + contextMilliseconds),
    };
  }
  return {
    start: new Date(eclipse.peak.getTime() - 20 * 60_000),
    centralBegin: null,
    centralEnd: null,
    end: new Date(eclipse.peak.getTime() + 20 * 60_000),
  };
}

function boundedTime(time: Date, start: Date, end: Date) {
  return new Date(
    Math.min(end.getTime(), Math.max(start.getTime(), time.getTime())),
  );
}

export function HorizonAnimation({
  active,
  latitude,
  longitude,
  eclipse,
  horizon,
}: HorizonAnimationProps) {
  const { formatNumber, formatTime, t } = useI18n();
  const timeZone = displayTimeZoneForSupportedCoordinate(latitude, longitude);
  const focusRange = useMemo(() => focusWindow(eclipse), [eclipse]);
  const track = useMemo(
    () =>
      calculateEclipseAnimationTrack(
        latitude,
        longitude,
        eclipse,
        721,
      ),
    [eclipse, latitude, longitude],
  );
  const peakProgress =
    ((eclipse.peak.getTime() - focusRange.start.getTime()) /
      (focusRange.end.getTime() - focusRange.start.getTime())) *
    1000;
  const progressForTime = useCallback(
    (time: Date) =>
      ((time.getTime() - focusRange.start.getTime()) /
        (focusRange.end.getTime() - focusRange.start.getTime())) *
      1000,
    [focusRange.end, focusRange.start],
  );
  const revealTimeline = useMemo<HorizonRevealTimeline>(() => {
    const times = revealTimes(eclipse);
    return {
      startProgress: progressForTime(
        boundedTime(times.start, focusRange.start, focusRange.end),
      ),
      centralBeginProgress: times.centralBegin
        ? progressForTime(times.centralBegin)
        : null,
      peakProgress,
      centralEndProgress: times.centralEnd
        ? progressForTime(times.centralEnd)
        : null,
      endProgress: progressForTime(
        boundedTime(times.end, focusRange.start, focusRange.end),
      ),
    };
  }, [eclipse, focusRange.end, focusRange.start, peakProgress, progressForTime]);
  const [progress, setProgress] = useState(peakProgress);
  const [isRevealing, setIsRevealing] = useState(false);
  const [showCelestialContext, setShowCelestialContext] = useState(false);
  const revealFrameRef = useRef<number | null>(null);
  const revealStartedRef = useRef(false);
  const revealKey = `${eclipse.eventId}:${latitude.toFixed(6)}:${longitude.toFixed(6)}`;

  const cancelReveal = useCallback((markSeen: boolean) => {
    if (revealFrameRef.current !== null) {
      window.cancelAnimationFrame(revealFrameRef.current);
      revealFrameRef.current = null;
    }
    if (markSeen) revealedHorizonLocations.add(revealKey);
    setIsRevealing(false);
  }, [revealKey]);

  const startReveal = useCallback(() => {
    cancelReveal(false);
    revealStartedRef.current = true;
    setProgress(revealTimeline.startProgress);
    setIsRevealing(true);
    const startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      setProgress(horizonRevealProgress(elapsed, revealTimeline));
      if (elapsed >= HORIZON_REVEAL_DURATION_MS) {
        revealFrameRef.current = null;
        revealedHorizonLocations.add(revealKey);
        setProgress(revealTimeline.peakProgress);
        setIsRevealing(false);
        return;
      }
      revealFrameRef.current = window.requestAnimationFrame(tick);
    };
    revealFrameRef.current = window.requestAnimationFrame(tick);
  }, [cancelReveal, revealKey, revealTimeline]);

  useEffect(() => {
    if (!active) return;
    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reducedMotion || revealedHorizonLocations.has(revealKey)) {
      revealedHorizonLocations.add(revealKey);
      return;
    }
    const startFrame = window.requestAnimationFrame(() => startReveal());
    return () => {
      window.cancelAnimationFrame(startFrame);
      cancelReveal(revealStartedRef.current);
    };
  }, [active, cancelReveal, revealKey, startReveal]);

  const sample = interpolateEclipseAnimationSample(track, progress / 1000);
  const phase = visualPhaseAt(eclipse, sample.time);
  const phaseLabel = t(`horizon.phase.${phase}`);
  const windowDurationSeconds =
    (focusRange.end.getTime() - focusRange.start.getTime()) / 1000;
  const progressStep = 1000 / Math.max(1, Math.round(windowDurationSeconds));
  const sliderStyle: HorizonSliderStyle = {
    "--horizon-progress": `${progress / 10}%`,
  };

  const lowerLimbMargin = lowerSolarEdgeTerrainMargin(horizon, sample);
  const maximumClearance =
    horizon.solarDiscAssessment?.fullDiscClearanceDegrees ?? null;
  const maximumIntersection = horizon.solarDiscAssessment?.intersection ?? null;
  const signedDegrees = (value: number) =>
    `${value >= 0 ? "+" : ""}${formatNumber(value, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}°`;
  const accessibleDescription = t("horizon.animationLabel", {
    phase: phaseLabel,
    time: formatTime(sample.time, timeZone),
    altitude: formatNumber(sample.sunAltitudeDegrees, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    azimuth: formatNumber(sample.sunAzimuthDegrees, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
  });
  const isMaximum = Math.abs(sample.time.getTime() - eclipse.peak.getTime()) < 500;
  const celestialObjects = useMemo(
    () => {
      if (!showCelestialContext) return [];
      const selectedSample = interpolateEclipseAnimationSample(
        track,
        progress / 1000,
      );
      return calculateCelestialContext({
        time: selectedSample.time,
        latitude,
        longitude,
        observerElevationMetres: eclipse.observerElevationMetres,
      }).map((object) => ({
        ...object,
        label: t(CELESTIAL_LABEL_KEYS[object.id]),
      }));
    },
    [
      eclipse.observerElevationMetres,
      latitude,
      longitude,
      progress,
      showCelestialContext,
      t,
      track,
    ],
  );
  const limitingTerrainLabel = horizon.solarDiscAssessment
    ? t("horizon.limitingTerrainCallout", {
        distance: formatNumber(
          horizon.solarDiscAssessment.limitingDistanceKilometres,
          { minimumFractionDigits: 1, maximumFractionDigits: 1 },
        ),
      })
    : null;

  return (
    <div className="horizon-animation">
      <div className="horizon-primary">
        <span>{t("horizon.primaryClearance")}</span>
        <strong
          className={
            maximumIntersection !== null && maximumIntersection !== "fully-clear"
              ? "is-blocked"
              : undefined
          }
        >
          {maximumClearance === null
            ? t("horizon.primaryUnavailable")
            : signedDegrees(maximumClearance)}
        </strong>
      </div>

      <ul className="horizon-chart-key" aria-label={t("horizon.legend")}>
        <li>
          <i className="is-sun" aria-hidden="true" />
          {t("horizon.legendSun")}
        </li>
        <li>
          <i className="is-moon" aria-hidden="true" />
          {t("horizon.legendMoon")}
        </li>
        <li>
          <i className="is-terrain" aria-hidden="true" />
          {t("horizon.legendTerrain")}
        </li>
      </ul>

      <div className="horizon-chart-wrap">
        <div className="horizon-chart-actions">
          <button
            type="button"
            aria-label={t(
              isRevealing ? "horizon.reveal.pause" : "horizon.reveal.replay",
            )}
            title={t(
              isRevealing ? "horizon.reveal.pause" : "horizon.reveal.replay",
            )}
            onClick={() => {
              if (isRevealing) cancelReveal(true);
              else startReveal();
            }}
          >
            <span aria-hidden="true">{isRevealing ? "Ⅱ" : "▶"}</span>
          </button>
          <button
            type="button"
            className={showCelestialContext ? "is-active" : undefined}
            aria-pressed={showCelestialContext}
            aria-label={t("horizon.sky.toggle")}
            title={t("horizon.sky.toggle")}
            onClick={() => {
              cancelReveal(true);
              setShowCelestialContext((current) => !current);
            }}
          >
            <span aria-hidden="true">✦</span>
          </button>
        </div>
        <HorizonCanvasView
          track={track}
          sample={sample}
          horizon={horizon}
          accessibleTitle={t("horizon.animationTitle")}
          accessibleDescription={accessibleDescription}
          discInsetLabel={t("horizon.discInset", { phase: phaseLabel })}
          discScaleLabel={(factor) =>
            t("horizon.displayScale", {
              factor: formatNumber(Math.max(1, Math.round(factor))),
            })
          }
          limitingTerrainLabel={limitingTerrainLabel}
          celestialObjects={celestialObjects}
          celestialDescription={
            showCelestialContext ? t("horizon.sky.description") : null
          }
          celestialObjectDescription={(object) =>
            t("horizon.sky.objectPosition", {
              name: object.label,
              altitude: formatNumber(object.altitudeDegrees, {
                maximumFractionDigits: 1,
              }),
              azimuth: formatNumber(object.azimuthDegrees, {
                maximumFractionDigits: 1,
              }),
            })
          }
          phase={phase}
          isMaximum={isMaximum}
          formatNumber={formatNumber}
        />
      </div>

      <div
        className={`horizon-contact-jumps${focusRange.moments.length === 5 ? " has-five-moments" : ""}`}
        role="group"
        aria-label={t("horizon.keyMoments")}
      >
        {focusRange.moments.map(([label, time]) => {
          const isCurrent = Math.abs(sample.time.getTime() - time.getTime()) < 500;
          return (
            <button
              type="button"
              key={label}
              className={isCurrent ? "is-current" : undefined}
              aria-label={`${t(label)} · ${formatTime(time, timeZone)}`}
              aria-pressed={isCurrent}
              onClick={() => {
                cancelReveal(true);
                setProgress(progressForTime(time));
              }}
            >
              <span>{t(label).split(" · ")[0]}</span>
              <time dateTime={time.toISOString()}>
                {formatTime(time, timeZone).split(" ")[0]}
              </time>
            </button>
          );
        })}
      </div>
      <div className="horizon-animation__controls">
        <label>
          <span>{t("horizon.exploreTime")}</span>
          <input
            type="range"
            min="0"
            max="1000"
            step={progressStep}
            value={progress}
            style={sliderStyle}
            aria-label={t("horizon.scrubber")}
            aria-valuetext={formatTime(sample.time, timeZone)}
            onChange={(event) => {
              cancelReveal(true);
              setProgress(Number(event.target.value));
            }}
          />
        </label>
        <time dateTime={sample.time.toISOString()}>
          {formatTime(sample.time, timeZone)}
        </time>
      </div>
      <div className="horizon-live-facts">
        <span>
          {t("horizon.positionNow", {
            altitude: formatNumber(sample.sunAltitudeDegrees, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
            azimuth: formatNumber(sample.sunAzimuthDegrees, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
          })}
        </span>
        {!isMaximum && (
          <strong>
            {lowerLimbMargin === null
              ? t("horizon.marginUnavailable")
              : t("horizon.marginNow", {
                  margin: signedDegrees(lowerLimbMargin),
                })}
          </strong>
        )}
      </div>
    </div>
  );
}
