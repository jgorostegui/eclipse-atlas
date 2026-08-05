import { useMemo, useState, type CSSProperties } from "react";
import {
  calculateEclipseAnimationTrack,
  interpolateEclipseAnimationSample,
  type EclipseCircumstances,
} from "../../domain/eclipse";
import type { TerrainHorizon } from "../../domain/terrain-horizon";
import { displayTimeZoneForSupportedCoordinate } from "../../domain/terrain-coverage";
import { useI18n } from "../../i18n/useI18n";
import type { MessageKey } from "../../i18n/messages";
import { lowerSolarEdgeTerrainMargin } from "./horizon-animation-model";
import { HorizonCanvasView } from "./HorizonCanvasView";

type HorizonAnimationProps = {
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

export function HorizonAnimation({
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
  const [progress, setProgress] = useState(peakProgress);
  const sample = interpolateEclipseAnimationSample(track, progress / 1000);
  const phase = visualPhaseAt(eclipse, sample.time);
  const phaseLabel = t(`horizon.phase.${phase}`);
  const windowDurationSeconds =
    (focusRange.end.getTime() - focusRange.start.getTime()) / 1000;
  const progressStep = 1000 / Math.max(1, Math.round(windowDurationSeconds));
  const sliderStyle: HorizonSliderStyle = {
    "--horizon-progress": `${progress / 10}%`,
  };

  const progressForTime = (time: Date) =>
    ((time.getTime() - focusRange.start.getTime()) /
      (focusRange.end.getTime() - focusRange.start.getTime())) *
    1000;
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
        <HorizonCanvasView
          track={track}
          sample={sample}
          horizon={horizon}
          accessibleTitle={t("horizon.animationTitle")}
          accessibleDescription={accessibleDescription}
          discInsetLabel={t("horizon.discInset", { phase: phaseLabel })}
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
              onClick={() => setProgress(progressForTime(time))}
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
            onChange={(event) => setProgress(Number(event.target.value))}
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
