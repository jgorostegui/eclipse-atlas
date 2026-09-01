import { useEffect, useMemo, useState } from "react";
import type { CandidateLocation } from "../../data/candidates";
import {
  calculateEclipseAnimationTrack,
  type EclipseCircumstances,
} from "../../domain/eclipse";
import type { EclipseEventId } from "../../domain/eclipse-events";
import {
  calculateTerrainHorizon,
  terrainAzimuthRangeForSolarTrack,
  TerrainHorizonError,
  type TerrainHorizon,
} from "../../domain/terrain-horizon";
import { useI18n } from "../../i18n/useI18n";
import { HorizonAnimation } from "./HorizonAnimation";
import { terrainErrorMessageKey } from "./terrain-error-message";

type TerrainProfileProps = {
  active: boolean;
  location: CandidateLocation;
  eventId: EclipseEventId;
  eclipse: EclipseCircumstances | null;
  elevationStatus: "loading" | "ready" | "error";
  onRetryElevation?: () => void;
  onResult?: (locationId: string, result: TerrainHorizon) => void;
  onStatus?: (locationId: string, status: TerrainCalculationStatus) => void;
  cachedResult?: TerrainHorizon;
};

export type TerrainCalculationStatus = "loading" | "ready" | "error";

type TerrainState =
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; result: TerrainHorizon }
  | { status: "error"; key: string; message: string };

export function TerrainProfile({
  active,
  location,
  eventId,
  eclipse,
  elevationStatus,
  onRetryElevation,
  onResult,
  onStatus,
  cachedResult,
}: TerrainProfileProps) {
  const { t } = useI18n();
  const [retryKey, setRetryKey] = useState(0);
  const sunAzimuthDegrees = eclipse?.sunAzimuthDegrees;
  const sunAltitudeDegrees = eclipse?.sunAltitudeDegrees;
  const solarAngularRadiusDegrees = eclipse?.solarAngularRadiusDegrees;
  const viewpointHeightAboveGroundMetres =
    eclipse?.viewpointHeightAboveGroundMetres;
  const profileAzimuthRange = useMemo(
    () =>
      eclipse
        ? terrainAzimuthRangeForSolarTrack(
            calculateEclipseAnimationTrack(
              location.latitude,
              location.longitude,
              eclipse,
              181,
            ),
            eclipse.sunAzimuthDegrees,
          )
        : null,
    [eclipse, location.latitude, location.longitude],
  );
  const key = [
    location.id,
    location.latitude,
    location.longitude,
    sunAzimuthDegrees ?? "none",
    sunAltitudeDegrees ?? "none",
    solarAngularRadiusDegrees ?? "none",
    viewpointHeightAboveGroundMetres ?? "none",
    profileAzimuthRange?.minimumOffsetDegrees ?? "none",
    profileAzimuthRange?.maximumOffsetDegrees ?? "none",
  ].join(":");
  const [state, setState] = useState<TerrainState>(() =>
    cachedResult
      ? { status: "ready", key, result: cachedResult }
      : { status: "loading", key },
  );

  useEffect(() => {
    const controller = new AbortController();

    if (
      elevationStatus !== "ready" ||
      sunAzimuthDegrees === undefined ||
      sunAltitudeDegrees === undefined ||
      solarAngularRadiusDegrees === undefined ||
      viewpointHeightAboveGroundMetres === undefined
    ) {
      return () => controller.abort();
    }
    if (cachedResult) {
      return () => controller.abort();
    }

    calculateTerrainHorizon(
      location.latitude,
      location.longitude,
      {
        centreAltitudeDegrees: sunAltitudeDegrees,
        centreAzimuthDegrees: sunAzimuthDegrees,
        angularRadiusDegrees: solarAngularRadiusDegrees,
      },
      viewpointHeightAboveGroundMetres,
      controller.signal,
      profileAzimuthRange ?? undefined,
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setState({ status: "ready", key, result });
          onResult?.(location.id, result);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof TerrainHorizonError
            ? t(terrainErrorMessageKey(error.code))
            : t("horizon.unavailable");
        setState({ status: "error", key, message });
      });

    return () => controller.abort();
  }, [
    elevationStatus,
    cachedResult,
    key,
    location.id,
    location.latitude,
    location.longitude,
    onResult,
    profileAzimuthRange,
    retryKey,
    solarAngularRadiusDegrees,
    sunAltitudeDegrees,
    sunAzimuthDegrees,
    t,
    viewpointHeightAboveGroundMetres,
  ]);

  const activeState = elevationStatus === "loading"
    ? { status: "loading" as const, key }
    : elevationStatus === "error"
      ? {
          status: "error" as const,
          key,
          message: t("horizon.elevationFailure"),
        }
    : !eclipse
      ? {
        status: "error" as const,
        key,
        message: t("horizon.eclipseFailure", {
          date: t(`events.${eventId}.fullDate`),
        }),
      }
      : cachedResult
        ? { status: "ready" as const, key, result: cachedResult }
        : state.key === key
          ? state
          : { status: "loading" as const, key };
  const result = activeState.status === "ready" ? activeState.result : null;
  const assessment = result?.solarDiscAssessment ?? null;
  const verdict =
    assessment === null
      ? t("horizon.notEvaluated")
      : t("horizon.maximumVerdict", {
          verdict: t(`horizon.${assessment.intersection}`),
        });

  useEffect(() => {
    onStatus?.(location.id, activeState.status);
  }, [activeState.status, location.id, onStatus]);

  return (
    <section className="horizon-card" aria-labelledby="terrain-profile-title">
      <div className="section-heading">
        <h3 id="terrain-profile-title">{t("horizon.title")}</h3>
        <span
          className={`horizon-verdict ${assessment && assessment.intersection !== "fully-clear" ? "is-tight" : ""}`}
        >
          {activeState.status === "loading" ? t("horizon.loading") : verdict}
        </span>
      </div>

      <div className="horizon-card__content">
        {result && eclipse ? (
          <HorizonAnimation
            key={`${eclipse.eventId}:${location.id}:${location.latitude}:${location.longitude}`}
            active={active}
            latitude={location.latitude}
            longitude={location.longitude}
            eclipse={eclipse}
            horizon={result}
          />
        ) : activeState.status === "error" ? (
          <div className="horizon-chart-wrap">
          <div className="horizon-fallback" role="status">
            <strong>{t("horizon.unavailable")}</strong>
            <span>{activeState.message}</span>
            <button
              type="button"
              onClick={() => {
                if (elevationStatus === "error") {
                  onRetryElevation?.();
                } else {
                  setState({ status: "loading", key });
                  setRetryKey((current) => current + 1);
                }
              }}
            >
              {t("sky.retry")}
            </button>
          </div>
          </div>
        ) : (
          <div className="horizon-chart-wrap">
          <div className="horizon-fallback" role="status">
            <strong>{t("horizon.calculating")}</strong>
            <span>{t("horizon.loadingDetail")}</span>
          </div>
          </div>
        )}
      </div>

    </section>
  );
}
