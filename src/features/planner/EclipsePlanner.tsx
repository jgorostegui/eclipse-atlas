import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import {
  candidates,
  createUserCandidate,
  type CandidateLocation,
  type OperationalStatus,
} from "../../data/candidates";
import {
  cloudClimateAssetUrl,
  parseCloudClimateArtifact,
  type CloudClimatePoint,
} from "../../data/cloud-climate";
import {
  isAtmosphereMapView,
  type MapViewSelection,
} from "../../data/map-view";
import {
  calculateEclipseCircumstances,
} from "../../domain/eclipse";
import type { EclipseEventId } from "../../domain/eclipse-events";
import { PLANNING_VIEWPOINT_HEIGHT_METRES } from "../../domain/observer";
import {
  displayTimeZoneForSupportedCoordinate,
  type SpanishDisplayTimeZone,
} from "../../domain/terrain-coverage";
import {
  calculateTerrainElevation,
  isSupportedTerrainCoordinate,
  type TerrainHorizon,
} from "../../domain/terrain-horizon";
import {
  fetchEclipseDayForecast,
  fetchSupplementalCloudForecast,
  SUPPLEMENTAL_CLOUD_MODELS,
  WEATHER_REQUEST_TIMEOUT_MILLISECONDS,
  type EclipseDayForecast,
  type ForecastRunMetadata,
  type SupplementalCloudModelId,
} from "../../domain/weather";
import {
  MAX_COMPARISON_POINTS,
  createGeoLocationReference,
  customCandidateId,
  parsePlannerUrl,
  plannerLocationReferenceKey,
  serializePlannerUrl,
  type PlannerLocationReference,
  type PlannerUrlParseResult,
  type PlannerUrlStateV1,
} from "../../app/planner-url-state";
import { TerrainProfile } from "../horizon/TerrainProfile";
import { EclipseTimeline } from "../eclipse/EclipseTimeline";
import { LiveEclipseMode, LiveEvidencePanel } from "../live/LiveEclipseMode";
import { EclipseMap, type MappedCandidate } from "../map/EclipseMap";
import { AppHeader } from "../shell/AppHeader";
import { HelpPanel } from "../shell/HelpPanel";
import {
  MobileNavigation,
  type MobileView,
} from "../shell/MobileNavigation";
import { LocationExplorer, MapViewPicker } from "./PlannerRail";
import {
  selectedPlacePanelId,
  selectedPlaceTabId,
  type SelectedPlaceEvidenceView,
} from "./selected-place-evidence";
import { SelectedPlaceEvidenceTabs } from "./SelectedPlaceEvidenceTabs";
import { formatObscurationPercent } from "./eclipse-presentation";
import { localizeCandidate } from "../../i18n/localize-candidate";
import type { MessageKey, MessageValues } from "../../i18n/messages";
import { useI18n } from "../../i18n/useI18n";
import {
  detailReturnView,
  primaryWorkspaceView,
  viewAfterClearingSelection,
  workspaceHash,
  workspaceExploreViewFromLocation,
  workspaceHasHistoryParent,
  workspaceHistoryParentSteps,
  workspaceHistoryState,
  workspaceNavigationDestination,
  workspaceSurface,
  workspaceViewFromLocation,
  type WorkspaceExploreView,
  type WorkspaceView,
} from "./workspace-navigation";
import {
  STACKED_LAYOUT_MEDIA_QUERY,
  clampDesktopRailWidth,
  defaultDesktopRailWidth,
  desktopRailWidthBounds,
  type WorkspaceSize,
} from "./responsive";
import {
  FutureSkyEvidence,
  SkyEvidence,
  type ForecastPresentation,
  type MunicipalForecastPanelState,
  type SupplementalForecastState,
  type SupplementalForecastStates,
} from "../weather/WeatherEvidence";
import {
  fetchMunicipalForecastCatalog,
  municipalForecastByName,
  resolveMunicipality,
  type MunicipalForecastCatalog,
  type ResolvedMunicipality,
} from "../weather/municipal-forecast";
import type { MapBaseLayerId } from "../map/base-layers";

type ObserverElevationState =
  | { status: "loading" }
  | { status: "ready"; elevationMetres: number }
  | { status: "error"; message: string };

type ScientificCandidate = MappedCandidate & {
  observerElevation: ObserverElevationState;
  displayTimeZone: SpanishDisplayTimeZone;
  eventId: EclipseEventId;
};

type CloudClimateState =
  | { status: "loading" }
  | {
      status: "ready";
      byCandidateId: Readonly<Record<string, CloudClimatePoint>>;
    }
  | { status: "error" };

type Translate = (key: MessageKey, values?: MessageValues) => string;
type NumberFormatter = (
  value: number,
  options?: Intl.NumberFormatOptions,
) => string;

function supplementalStates(
  status: "idle" | "loading",
): SupplementalForecastStates {
  return {
    "noaa-gfs": { status },
    "dwd-icon": { status },
    "eccc-gem": { status },
  };
}

function workspaceSize(workspaceRef: RefObject<HTMLElement | null>): WorkspaceSize {
  const bounds = workspaceRef.current?.getBoundingClientRect();
  return {
    width: bounds?.width ?? window.innerWidth,
    height: bounds?.height ?? window.innerHeight,
  };
}

function PlannerSplitter({
  workspaceRef,
  workspace,
  width,
  onChange,
  onReset,
  t,
}: {
  workspaceRef: RefObject<HTMLElement | null>;
  workspace: WorkspaceSize;
  width: number;
  onChange: (width: number) => void;
  onReset: () => void;
  t: Translate;
}) {
  const dragging = useRef(false);
  const { minimum, maximum } = desktopRailWidthBounds(workspace);
  const setFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) return;
    onChange(
      clampDesktopRailWidth(
        bounds.right - event.clientX,
        { width: bounds.width, height: bounds.height },
      ),
    );
  };
  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = width + step;
    if (event.key === "ArrowRight") next = width - step;
    if (event.key === "Home") next = minimum;
    if (event.key === "End") next = maximum;
    if (event.key === "Enter") {
      event.preventDefault();
      onReset();
      return;
    }
    if (next === null) return;
    event.preventDefault();
    onChange(clampDesktopRailWidth(next, workspace));
  };

  return (
    <div
      className="planner-splitter"
      role="separator"
      aria-label={t("panel.resize")}
      aria-orientation="vertical"
      aria-valuemin={Math.round(minimum)}
      aria-valuemax={Math.round(maximum)}
      aria-valuenow={Math.round(width)}
      aria-valuetext={t("panel.width", { width: Math.round(width) })}
      tabIndex={0}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        setFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (dragging.current) setFromPointer(event);
      }}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
    >
      <span aria-hidden="true" />
    </div>
  );
}

function initialPlannerUrl(): PlannerUrlParseResult {
  return parsePlannerUrl(new URL(window.location.href));
}

function referenceCandidateId(reference: PlannerLocationReference) {
  return reference.kind === "place"
    ? reference.id
    : customCandidateId(reference.latitude, reference.longitude);
}

function candidateReference(location: CandidateLocation): PlannerLocationReference {
  return location.kind === "user-selected"
    ? createGeoLocationReference(location.latitude, location.longitude)
    : { kind: "place", id: location.id };
}

function isOfficialOperation(status: OperationalStatus) {
  return status === "official-network" || status === "official-recommended";
}

function officialOperationLabel(status: OperationalStatus): MessageKey | null {
  if (status === "official-network") return "operations.officialNetwork";
  if (status === "official-recommended") {
    return "operations.officialRecommended";
  }
  return null;
}

function Metric({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MobileSelectedSummary({
  point,
  terrain,
  onOpen,
  onClear,
  t,
  formatNumber,
}: {
  point: ScientificCandidate;
  terrain: TerrainHorizon | undefined;
  onOpen: () => void;
  onClear: () => void;
  t: Translate;
  formatNumber: NumberFormatter;
}) {
  const clearance = terrainClearance(point, terrain);
  const eclipse = point.eclipse;
  const clearanceLabel =
    clearance == null
      ? "mobile.selected.clearance"
      : clearance >= 0
        ? "mobile.selected.horizonClear"
        : "mobile.selected.horizonBlocked";

  return (
    <section
      className="mobile-selected-summary"
      aria-label={t("mobile.selected.summary", { name: point.candidate.name })}
    >
      <button
        className="mobile-selected-summary__open"
        type="button"
        onClick={onOpen}
      >
        <span className="sr-only">
          {t("mobile.selected.open", { name: point.candidate.name })}. {" "}
        </span>
        <span className="mobile-selected-summary__marker" aria-hidden="true" />
        <span className="mobile-selected-summary__identity">
          <b>{point.candidate.name}</b>
          <small>
            {eclipse ? t(`eclipse.${eclipse.kind}`) : t("state.unknown")}
            {eclipse?.totalityDurationSeconds != null
              ? ` · ${candidateDuration(point, t, formatNumber)}`
              : ""}
          </small>
          <span className="mobile-selected-summary__action">
            {t("mobile.selected.details")} <span aria-hidden="true">→</span>
          </span>
        </span>
        <span className="mobile-selected-summary__fact mobile-selected-summary__fact--primary">
          <small>{t("mobile.selected.obscuration")}</small>
          <b>
            {eclipse
              ? formatObscurationPercent(eclipse, formatNumber)
              : t("state.unknown")}
          </b>
        </span>
        <span className="mobile-selected-summary__fact">
          <small>{t(clearanceLabel)}</small>
          <b>
            {clearance == null
              ? t("mobile.selected.pending")
              : `${clearance >= 0 ? "+" : ""}${formatNumber(clearance, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}°`}
          </b>
        </span>
      </button>
      <button
        className="mobile-selected-summary__clear"
        type="button"
        onClick={onClear}
        aria-label={t("selection.clearNamed", { name: point.candidate.name })}
        title={t("selection.clear")}
      >
        <span aria-hidden="true">×</span>
      </button>
    </section>
  );
}

function EclipseOutcome({
  point,
  t,
  formatNumber,
  formatTime,
}: {
  point: ScientificCandidate;
  t: Translate;
  formatNumber: NumberFormatter;
  formatTime: (date: Date | null, timeZone: SpanishDisplayTimeZone) => string;
}) {
  const eclipse = point.eclipse;
  const durationLabel =
    eclipse?.kind === "annular" ? "metric.annularity" : "metric.totality";

  return (
    <section className="eclipse-outcome" aria-label={t("detail.factsLabel")}>
      <div className="eclipse-outcome__result">
        <span>{t("metric.obscuration")}</span>
        <strong className={eclipse ? undefined : "is-unknown"}>
          {eclipse
            ? formatObscurationPercent(eclipse, formatNumber)
            : t("state.unknown")}
        </strong>
        <small>{t("outcome.solarDisc")}</small>
      </div>
      <div className="eclipse-outcome__context">
        <span className={`eclipse-outcome__kind${eclipse ? ` is-${eclipse.kind}` : ""}`}>
          {eclipse ? t(`outcome.kind.${eclipse.kind}`) : t("state.unknown")}
        </span>
        {eclipse?.totalityDurationSeconds != null && (
          <strong>
            <span className="eclipse-outcome__duration-label">
              {t(durationLabel)}
            </span>
            <span
              className="eclipse-outcome__duration-separator"
              aria-hidden="true"
            >
              {" · "}
            </span>
            <span>{candidateDuration(point, t, formatNumber)}</span>
          </strong>
        )}
        <time dateTime={eclipse?.peak.toISOString()}>
          {t("outcome.maximum", {
            time: eclipse
              ? formatTime(eclipse.peak, point.displayTimeZone)
              : t("state.unknown"),
          })}
        </time>
      </div>
    </section>
  );
}

function mapCandidate(
  location: CandidateLocation,
  observerElevation: ObserverElevationState,
  eventId: EclipseEventId,
): ScientificCandidate {
  const eclipse =
    observerElevation.status === "ready"
      ? calculateEclipseCircumstances(
          location.latitude,
          location.longitude,
          {
            groundElevationMetres: observerElevation.elevationMetres,
            viewpointHeightAboveGroundMetres: PLANNING_VIEWPOINT_HEIGHT_METRES,
          },
          eventId,
        )
      : null;

  return {
    candidate: location,
    eclipse,
    observerElevation,
    displayTimeZone: displayTimeZoneForSupportedCoordinate(
      location.latitude,
      location.longitude,
    ),
    eventId,
  };
}

function formatDuration(
  durationSeconds: number | null | undefined,
  eventId: EclipseEventId,
  t: Translate,
  formatNumber: NumberFormatter,
) {
  if (durationSeconds === null || durationSeconds === undefined) {
    return t(eventId === "2028" ? "state.noAnnularity" : "state.noTotality");
  }
  const rounded = Math.max(0, Math.round(durationSeconds));
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return minutes > 0
    ? t("duration.minutesSeconds", {
        minutes: formatNumber(minutes),
        seconds: formatNumber(seconds),
      })
    : t("duration.seconds", { seconds: formatNumber(seconds) });
}

function candidateDuration(
  point: ScientificCandidate,
  t: Translate,
  formatNumber: NumberFormatter,
) {
  return point.observerElevation.status === "ready"
    ? formatDuration(
        point.eclipse?.totalityDurationSeconds,
        point.eventId,
        t,
        formatNumber,
      )
    : t("state.unknown");
}

function terrainResultKey(eventId: EclipseEventId, candidateId: string) {
  return `${eventId}:${candidateId}`;
}

function terrainClearance(
  point: ScientificCandidate,
  terrain: TerrainHorizon | undefined,
) {
  if (!point.eclipse || !terrain) return null;
  return terrain.solarDiscAssessment?.fullDiscClearanceDegrees ?? null;
}

function formatUtcTimestamp(date: Date, locale: string) {
  return `${new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(date)} UTC`;
}

function cloudRange(
  forecast: EclipseDayForecast,
  formatNumber: NumberFormatter,
) {
  const values = forecast.hours.map(({ cloudCoverPercent }) => cloudCoverPercent);
  return `${formatNumber(Math.min(...values), {
    maximumFractionDigits: 0,
  })}–${formatNumber(Math.max(...values), {
    maximumFractionDigits: 0,
  })}%`;
}

function aemetMunicipalityUrl(municipality: string | undefined) {
  const url = new URL("https://www.aemet.es/es/eltiempo/prediccion/municipios");
  if (municipality) {
    url.searchParams.set("modo", "and");
    url.searchParams.set("orden", "n");
    url.searchParams.set("str", municipality);
    url.searchParams.set("tipo", "sta");
  }
  return url.href;
}

function ComparisonCard({
  point,
  terrain,
  climate,
  forecast,
  forecastPresentation,
  onShow,
  onRemove,
  t,
  formatNumber,
  formatTime,
  locale,
}: {
  point: ScientificCandidate;
  terrain: TerrainHorizon | undefined;
  climate: CloudClimatePoint | null;
  forecast: EclipseDayForecast | null;
  forecastPresentation: ForecastPresentation | null;
  onShow: () => void;
  onRemove: () => void;
  t: Translate;
  formatNumber: NumberFormatter;
  formatTime: (date: Date | null, timeZone: SpanishDisplayTimeZone) => string;
  locale: string;
}) {
  const clearance = terrainClearance(point, terrain);
  const facts = [
    [
      t("timeline.obscuration"),
      point.eclipse
        ? formatObscurationPercent(point.eclipse, formatNumber)
        : t("state.unknown"),
    ],
    [
      t(
        point.observerElevation.status === "ready" && point.eventId === "2028"
          ? "metric.annularity"
          : "comparison.totality",
      ),
      candidateDuration(point, t, formatNumber),
    ],
    [
      t("comparison.climate"),
      climate
        ? `${formatNumber(climate.meanCloudCoverPercent, {
            maximumFractionDigits: 0,
          })}%`
        : t("state.unknown"),
    ],
    [
      t("comparison.weather"),
      forecast
        ? t("comparison.weatherValue", {
            range: cloudRange(forecast, formatNumber),
          })
        : t("state.unknown"),
    ],
    [
      t("comparison.maximum"),
      point.eclipse
        ? formatTime(point.eclipse.peak, point.displayTimeZone)
        : t("state.unknown"),
    ],
    [
      t("comparison.sun"),
      point.eclipse
        ? `${formatNumber(point.eclipse.sunAltitudeDegrees, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}°`
        : t("state.unknown"),
    ],
    [
      t("comparison.clearance"),
      clearance === null
        ? t("comparison.pending")
        : t("comparison.clearanceValue", {
            margin: `${clearance > 0 ? "+" : ""}${formatNumber(clearance, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}`,
          }),
    ],
  ] as const;

  return (
    <article
      className="comparison-card"
      aria-label={t("comparison.cardLabel", { name: point.candidate.name })}
    >
      <header>
        <button
          className="comparison-card__show"
          onClick={onShow}
          aria-label={t("comparison.show", { name: point.candidate.name })}
        >
          <span>{point.candidate.region}</span>
          <strong>{point.candidate.shortName}</strong>
        </button>
        <button
          className="comparison-card__remove"
          onClick={onRemove}
          aria-label={t("comparison.remove", { name: point.candidate.name })}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <dl>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {forecastPresentation && (
        <p className="comparison-card__provenance">
          {t(
            forecastPresentation.sourceMode === "exact-run"
              ? "sky.forecast.exactProvenance"
              : "sky.forecast.rollingProvenance",
            {
              run: formatUtcTimestamp(
                forecastPresentation.run.initializedAt,
                locale,
              ),
              retrieved: formatUtcTimestamp(
                forecastPresentation.retrievedAt,
                locale,
              ),
            },
          )}
        </p>
      )}
      {!terrain && (
        <button className="comparison-card__calculate" onClick={onShow}>
          {t("comparison.open")}
        </button>
      )}
    </article>
  );
}

export default function EclipsePlanner() {
  const { formatNumber, formatTime, locale, t } = useI18n();
  const plannerWorkspaceRef = useRef<HTMLElement>(null);
  const [plannerWorkspaceSize, setPlannerWorkspaceSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [railWidth, setRailWidth] = useState(() =>
    defaultDesktopRailWidth({
      width: window.innerWidth,
      height: window.innerHeight,
    }),
  );
  const [railWidthCustomized, setRailWidthCustomized] = useState(false);
  const [initialParse] = useState<PlannerUrlParseResult>(initialPlannerUrl);
  const [plannerState, setPlannerState] = useState<PlannerUrlStateV1>(
    initialParse.state,
  );
  const eventId = plannerState.eventId;
  const [urlIssueCount, setUrlIssueCount] = useState(
    initialParse.issues.length,
  );
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const [comparisonNotice, setComparisonNotice] = useState<string | null>(null);
  const [workspaceNavigation, setWorkspaceNavigation] = useState(() => {
    const view = workspaceViewFromLocation(
      window.location.hash,
      initialParse.state.selected !== null,
      window.history.state,
    );
    return {
      view,
      exploreView: workspaceExploreViewFromLocation(
        view,
        initialParse.state.selected !== null,
        window.history.state,
      ),
    };
  });
  const { view: workspaceView, exploreView } = workspaceNavigation;
  // The live mode renders as a full-screen layer, so the workspace underneath
  // keeps laying itself out for the view the layer will return to.
  const layoutView =
    workspaceView.kind === "live" ? workspaceView.returnTo : workspaceView;
  const mobileSurface = workspaceSurface(workspaceView);
  const mobileNavigationDestination =
    workspaceNavigationDestination(workspaceView);
  const panelMode =
    layoutView.kind === "help"
      ? "help"
      : layoutView.kind === "compare"
        ? "compare"
        : "explore";
  const previousMobileSurface = useRef(mobileSurface);
  const workspaceNavigationRef = useRef(workspaceNavigation);
  const pendingMapFocus = useRef(false);
  const pendingRailFocus = useRef<
    | ".help-panel"
    | ".detail-panel"
    | ".rail-comparison"
    | null
  >(null);
  const pendingHistoryReturn = useRef<{
    plannerState: PlannerUrlStateV1;
    view: WorkspaceView;
    exploreView: WorkspaceExploreView;
  } | null>(null);
  const [overviewRequestKey, setOverviewRequestKey] = useState(0);
  const [explorerFocusRequestKey, setExplorerFocusRequestKey] = useState(0);
  const [workspaceFocusRequestKey, setWorkspaceFocusRequestKey] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [observerElevations, setObserverElevations] = useState<
    Record<string, ObserverElevationState>
  >({});
  const [terrainResults, setTerrainResults] = useState<
    Record<string, TerrainHorizon>
  >({});
  const [climateState, setClimateState] = useState<CloudClimateState>({
    status: "loading",
  });
  const [climateRetryKey, setClimateRetryKey] = useState(0);
  const [forecastByCandidateId, setForecastByCandidateId] = useState<
    Record<string, EclipseDayForecast>
  >({});
  const [forecastStatus, setForecastStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [forecastPresentation, setForecastPresentation] =
    useState<ForecastPresentation | null>(null);
  const [forecastPresentationByCandidateId, setForecastPresentationByCandidateId] =
    useState<Record<string, ForecastPresentation>>({});
  const [forecastRetryKey, setForecastRetryKey] = useState(0);
  const [supplementalForecastResult, setSupplementalForecastResult] = useState<{
    candidateKey: string;
    forecasts: SupplementalForecastStates;
  }>(() => ({
    candidateKey: "",
    forecasts: supplementalStates("idle"),
  }));
  const [supplementalForecastRetryKey, setSupplementalForecastRetryKey] =
    useState(0);
  const [baseLayerId, setBaseLayerId] = useState<MapBaseLayerId>("osm");
  const [municipalForecast, setMunicipalForecast] =
    useState<MunicipalForecastPanelState>({ status: "idle" });
  const [municipalForecastRetryKey, setMunicipalForecastRetryKey] = useState(0);
  const municipalCatalogRef = useRef<MunicipalForecastCatalog | null>(null);
  const municipalityCacheRef = useRef(
    new Map<string, ResolvedMunicipality | null>(),
  );
  const forecastCacheRef = useRef<Record<string, EclipseDayForecast>>({});
  const forecastRunRef = useRef<ForecastRunMetadata | null>(null);
  const forecastRequestRef = useRef<AbortController | null>(null);
  const forecastAttemptedRef = useRef(new Set<string>());
  const supplementalForecastCacheRef = useRef(
    new Map<string, SupplementalForecastState>(),
  );
  const supplementalForecastRequestRef = useRef<AbortController | null>(null);
  const elevationRequests = useRef(
    new Map<string, { coordinateKey: string; controller: AbortController }>(),
  );
  const initialUrlCanonicalized = useRef(false);
  const initialRequestedHash = useRef(window.location.hash);

  useEffect(() => {
    document.title = `${t(`events.${eventId}.fullDate`)} · ${t("app.title")}`;
  }, [eventId, t]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let availableHeight = viewport.height;
    let keyboardIsOpen = false;
    const syncVisualViewportHeight = () => {
      if (
        !window.matchMedia(STACKED_LAYOUT_MEDIA_QUERY).matches ||
        viewport.scale !== 1
      ) {
        root.style.removeProperty("--app-viewport-height");
        keyboardIsOpen = false;
        setKeyboardOpen(false);
        return;
      }
      const currentHeight = viewport.height;
      root.style.setProperty(
        "--app-viewport-height",
        `${Math.round(currentHeight)}px`,
      );
      const activeElement = document.activeElement;
      const isEditingText =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable);
      if (keyboardIsOpen) {
        keyboardIsOpen = currentHeight < availableHeight - 60;
      } else {
        keyboardIsOpen = isEditingText && currentHeight < availableHeight - 100;
      }
      if (!keyboardIsOpen && !isEditingText) {
        availableHeight = currentHeight;
      }
      setKeyboardOpen(keyboardIsOpen);
    };

    syncVisualViewportHeight();
    viewport.addEventListener("resize", syncVisualViewportHeight);
    window.addEventListener("resize", syncVisualViewportHeight);
    document.addEventListener("focusin", syncVisualViewportHeight);
    return () => {
      viewport.removeEventListener("resize", syncVisualViewportHeight);
      window.removeEventListener("resize", syncVisualViewportHeight);
      document.removeEventListener("focusin", syncVisualViewportHeight);
      root.style.removeProperty("--app-viewport-height");
    };
  }, []);

  useLayoutEffect(() => {
    const workspace = plannerWorkspaceRef.current;
    if (!workspace) return;
    const resize = () => {
      const bounds = workspace.getBoundingClientRect();
      const size = { width: bounds.width, height: bounds.height };
      setPlannerWorkspaceSize(size);
      setRailWidth((current) =>
        railWidthCustomized
          ? clampDesktopRailWidth(current, size)
          : defaultDesktopRailWidth(size),
      );
    };
    resize();
    if (typeof ResizeObserver !== "function") {
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [railWidthCustomized]);

  useEffect(() => {
    workspaceNavigationRef.current = workspaceNavigation;
  }, [workspaceNavigation]);

  const requestWorkspaceFocus = useCallback((view: WorkspaceView) => {
    if (view.kind === "help") {
      pendingRailFocus.current = ".help-panel";
    } else if (view.kind === "map") {
      pendingMapFocus.current = true;
    } else if (view.kind === "places") {
      setExplorerFocusRequestKey((current) => current + 1);
    } else if (view.kind === "details") {
      pendingRailFocus.current = ".detail-panel";
    } else if (view.kind === "compare") {
      pendingRailFocus.current = ".rail-comparison";
    }
    // The live layer manages its own focus when it mounts.
    setWorkspaceFocusRequestKey((current) => current + 1);
  }, []);

  useEffect(() => {
    const previous = previousMobileSurface.current;
    previousMobileSurface.current = mobileSurface;
    if (pendingRailFocus.current) {
      const selector = pendingRailFocus.current;
      pendingRailFocus.current = null;
      const frame = window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(selector)?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (pendingMapFocus.current && mobileSurface === "map") {
      pendingMapFocus.current = false;
      const frame = window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(".map-canvas")?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (
      previous === mobileSurface ||
      !window.matchMedia?.(STACKED_LAYOUT_MEDIA_QUERY).matches
    ) {
      return;
    }
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return;
    const focusWasInMap = Boolean(
      activeElement.closest(".map-panel, .mobile-selected-summary"),
    );
    const focusWasInRail = Boolean(activeElement.closest(".planner-rail"));
    if (mobileSurface === "map" && focusWasInRail) {
      document.querySelector<HTMLElement>(".map-canvas")?.focus();
    } else if (mobileSurface !== "map" && focusWasInMap) {
      document.querySelector<HTMLElement>(".planner-rail")?.focus();
    }
  }, [mobileSurface, workspaceFocusRequestKey]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setClimateState({ status: "error" });
      controller.abort();
    }, WEATHER_REQUEST_TIMEOUT_MILLISECONDS);
    fetch(cloudClimateAssetUrl(), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Climate artifact could not be loaded.");
        return parseCloudClimateArtifact(await response.json());
      })
      .then((artifact) => {
        if (controller.signal.aborted) return;
        setClimateState({
          status: "ready",
          byCandidateId: Object.fromEntries(
            artifact.points.map((point) => [point.candidateId, point]),
          ),
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setClimateState({ status: "error" });
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [climateRetryKey]);

  const commitPlannerState = useCallback(
    (
      nextState: PlannerUrlStateV1,
      options: Readonly<{
        exploreView?: WorkspaceExploreView;
        hasWorkspaceParent?: boolean;
        mode?: "push" | "replace";
        view?: WorkspaceView;
      }> = {},
    ) => {
      const nextView = options.view ?? workspaceView;
      const nextExploreView = nextState.selected
        ? (options.exploreView ?? exploreView)
        : ({ kind: "places" } as const);
      const updatesCurrentChildRoute =
        (workspaceView.kind === "details" ||
          workspaceView.kind === "help" ||
          workspaceView.kind === "live") &&
        workspaceHash(nextView) === workspaceHash(workspaceView);
      const mode =
        options.mode ?? (updatesCurrentChildRoute ? "replace" : "push");
      const localizedState: PlannerUrlStateV1 = {
        ...nextState,
        locale,
      };
      const url = serializePlannerUrl(window.location.href, localizedState);
      url.hash = workspaceHash(nextView);
      const currentParentSteps = workspaceHistoryParentSteps(
        window.history.state,
        workspaceView,
      );
      const retainsWorkspaceParent =
        nextView.kind === "details" ||
        nextView.kind === "help" ||
        nextView.kind === "live";
      const workspaceParentSteps = options.hasWorkspaceParent
        ? 1
        : retainsWorkspaceParent && currentParentSteps > 0
          ? currentParentSteps + (mode === "push" ? 1 : 0)
          : undefined;
      const nextHistoryState = workspaceHistoryState(
        window.history.state,
        nextView,
        {
          exploreView: nextExploreView,
          parentSteps: workspaceParentSteps,
        },
      );
      if (url.href === window.location.href) {
        window.history.replaceState(nextHistoryState, "", url);
        setPlannerState(localizedState);
        setWorkspaceNavigation({
          view: nextView,
          exploreView: nextExploreView,
        });
        setUrlIssueCount(0);
        return;
      }
      window.history[mode === "push" ? "pushState" : "replaceState"](
        nextHistoryState,
        "",
        url,
      );
      setPlannerState(localizedState);
      setWorkspaceNavigation({
        view: nextView,
        exploreView: nextExploreView,
      });
      setUrlIssueCount(0);
    },
    [exploreView, locale, workspaceView],
  );

  useEffect(() => {
    if (initialUrlCanonicalized.current) return;
    initialUrlCanonicalized.current = true;
    const localizedState = { ...initialParse.state, locale };
    const canonical = serializePlannerUrl(window.location.href, localizedState);
    canonical.hash = workspaceHash(workspaceView);
    window.history.replaceState(
      workspaceHistoryState(
        window.history.state,
        workspaceView,
        { exploreView },
      ),
      "",
      canonical,
    );
  }, [exploreView, initialParse, locale, workspaceView]);

  useEffect(() => {
    const targetId = initialRequestedHash.current.slice(1);
    if (!["map", "comparison"].includes(targetId)) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const restorePlannerState = () => {
      const pending = pendingHistoryReturn.current;
      if (pending) {
        pendingHistoryReturn.current = null;
        requestWorkspaceFocus(pending.view);
        const url = serializePlannerUrl(
          window.location.href,
          pending.plannerState,
        );
        url.hash = workspaceHash(pending.view);
        window.history.replaceState(
          workspaceHistoryState(
            window.history.state,
            pending.view,
            { exploreView: pending.exploreView },
          ),
          "",
          url,
        );
        setPlannerState(pending.plannerState);
        setWorkspaceNavigation({
          view: pending.view,
          exploreView: pending.exploreView,
        });
        setUrlIssueCount(0);
        setComparisonNotice(null);
        return;
      }
      const parsed = parsePlannerUrl(new URL(window.location.href));
      const restoredView = workspaceViewFromLocation(
        window.location.hash,
        parsed.state.selected !== null,
        window.history.state,
      );
      const restoredExploreView = workspaceExploreViewFromLocation(
        restoredView,
        parsed.state.selected !== null,
        window.history.state,
      );
      const canonical = serializePlannerUrl(window.location.href, parsed.state);
      canonical.hash = workspaceHash(restoredView);
      window.history.replaceState(
        workspaceHistoryState(
          window.history.state,
          restoredView,
          { exploreView: restoredExploreView },
        ),
        "",
        canonical,
      );
      if (
        workspaceHash(workspaceNavigationRef.current.view) !==
        workspaceHash(restoredView)
      ) {
        requestWorkspaceFocus(restoredView);
      }
      setPlannerState(parsed.state);
      setUrlIssueCount(parsed.issues.length);
      setComparisonNotice(null);
      setWorkspaceNavigation({
        view: restoredView,
        exploreView: restoredExploreView,
      });
    };
    window.addEventListener("popstate", restorePlannerState);
    return () => window.removeEventListener("popstate", restorePlannerState);
  }, [requestWorkspaceFocus]);

  const customCandidates = useMemo(() => {
    const references = [
      ...(plannerState.selected ? [plannerState.selected] : []),
      ...plannerState.compared,
    ];
    const seen = new Set<string>();
    return references.flatMap((reference) => {
      if (reference.kind !== "geo") return [];
      const key = plannerLocationReferenceKey(reference);
      if (seen.has(key)) return [];
      seen.add(key);
      return [
        createUserCandidate(
          customCandidateId(reference.latitude, reference.longitude),
          reference.latitude,
          reference.longitude,
        ),
      ];
    });
  }, [plannerState.compared, plannerState.selected]);

  const selectedId = plannerState.selected
    ? referenceCandidateId(plannerState.selected)
    : null;
  // Sticky evidence lens: it persists as the selected place changes and only
  // moves when the reader picks a tab. Session-only, so a reload resets it.
  const [detailEvidenceView, setDetailEvidenceView] =
    useState<SelectedPlaceEvidenceView>("horizon");
  const selectDetailEvidence = (view: SelectedPlaceEvidenceView) => {
    setDetailEvidenceView(view);
  };
  const compareIds = useMemo(
    () => plannerState.compared.map(referenceCandidateId),
    [plannerState.compared],
  );
  const requestedCandidateIds = useMemo(
    () =>
      new Set(
        [selectedId, ...compareIds].filter(
          (id): id is string => id !== null,
        ),
      ),
    [compareIds, selectedId],
  );
  const rawCandidates = useMemo(
    () => [
      ...candidates.filter(
        (candidate) =>
          eventId === "2026" ||
          candidate.kind !== "official-site" ||
          requestedCandidateIds.has(candidate.id),
      ),
      ...customCandidates,
    ],
    [customCandidates, eventId, requestedCandidateIds],
  );
  const allCandidates = useMemo(
    () => rawCandidates.map((candidate) => localizeCandidate(candidate, t)),
    [rawCandidates, t],
  );
  const requestedCandidates = rawCandidates.filter((candidate) =>
    requestedCandidateIds.has(candidate.id),
  );
  const requestedCandidateCoordinateKey = requestedCandidates
    .map(({ id, latitude, longitude }) => `${id}:${latitude}:${longitude}`)
    .join("|");
  const forecastCandidates =
    eventId === "2026" && plannerState.layer === "eclipse-day-cloud-forecast"
      ? rawCandidates.filter(
          (candidate) =>
            candidate.atmosphereReference ||
            requestedCandidateIds.has(candidate.id),
        )
    : eventId === "2026"
      ? requestedCandidates
      : [];
  const forecastCandidateKey = forecastCandidates
    .map(({ id, latitude, longitude }) => `${id}:${latitude}:${longitude}`)
    .join("|");
  const supplementalForecastCandidate =
    eventId === "2026" && selectedId
      ? rawCandidates.find(({ id }) => id === selectedId) ?? null
      : null;
  const supplementalForecastCandidateKey = supplementalForecastCandidate
    ? `${supplementalForecastCandidate.id}:${supplementalForecastCandidate.latitude}:${supplementalForecastCandidate.longitude}`
    : "";
  const supplementalForecasts =
    supplementalForecastResult.candidateKey === supplementalForecastCandidateKey
      ? supplementalForecastResult.forecasts
      : supplementalStates(
          supplementalForecastCandidate ? "loading" : "idle",
        );

  useEffect(() => {
    forecastRequestRef.current?.abort();
    const controller = new AbortController();
    forecastRequestRef.current = controller;
    const loadForecast = async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      if (forecastCandidates.length === 0) {
        setForecastStatus("idle");
        return;
      }
      const missing = forecastCandidates.filter(
        ({ id }) =>
          forecastCacheRef.current[id] === undefined &&
          !forecastAttemptedRef.current.has(id),
      );
      if (missing.length === 0) {
        setForecastStatus("ready");
        return;
      }
      setForecastStatus("loading");
      try {
        const batch = await fetchEclipseDayForecast(
          missing.map(({ id, latitude, longitude }) => ({
            id,
            latitude,
            longitude,
          })),
          controller.signal,
          forecastRunRef.current ? { run: forecastRunRef.current } : {},
        );
        if (controller.signal.aborted) return;
        if (batch.sourceMode === "exact-run") {
          forecastRunRef.current ??= batch.run;
        }
        const additions: Record<string, EclipseDayForecast> = {};
        for (const forecast of batch.forecasts) {
          if (forecast) additions[forecast.locationId] = forecast;
        }
        for (const { id } of missing) forecastAttemptedRef.current.add(id);
        forecastCacheRef.current = {
          ...forecastCacheRef.current,
          ...additions,
        };
        setForecastByCandidateId(forecastCacheRef.current);
        const presentation = {
          run: batch.run,
          retrievedAt: batch.retrievedAt,
          sourceMode: batch.sourceMode,
        } satisfies ForecastPresentation;
        setForecastPresentation(presentation);
        setForecastPresentationByCandidateId((current) => ({
          ...current,
          ...Object.fromEntries(missing.map(({ id }) => [id, presentation])),
        }));
        setForecastStatus("ready");
      } catch {
        if (!controller.signal.aborted) setForecastStatus("error");
      } finally {
        if (forecastRequestRef.current === controller) {
          forecastRequestRef.current = null;
        }
      }
    };
    void loadForecast();
    return () => controller.abort();
    // Candidate coordinates and retry intent fully define this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecastCandidateKey, forecastRetryKey]);

  useEffect(() => {
    supplementalForecastRequestRef.current?.abort();
    const controller = new AbortController();
    supplementalForecastRequestRef.current = controller;
    if (!supplementalForecastCandidate) {
      return () => controller.abort();
    }

    const candidate = supplementalForecastCandidate;
    const cachedState = (id: SupplementalCloudModelId) =>
      supplementalForecastCacheRef.current.get(`${candidate.id}:${id}`) ?? {
        status: "loading" as const,
      };
    const cachedStates: SupplementalForecastStates = {
      "noaa-gfs": cachedState("noaa-gfs"),
      "dwd-icon": cachedState("dwd-icon"),
      "eccc-gem": cachedState("eccc-gem"),
    };
    setSupplementalForecastResult({
      candidateKey: supplementalForecastCandidateKey,
      forecasts: cachedStates,
    });

    for (const model of SUPPLEMENTAL_CLOUD_MODELS) {
      const cacheKey = `${candidate.id}:${model.id}`;
      if (supplementalForecastCacheRef.current.has(cacheKey)) continue;
      void fetchSupplementalCloudForecast(
        model.id,
        {
          id: candidate.id,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
        },
        controller.signal,
      )
        .then((forecast) => {
          if (controller.signal.aborted) return;
          const state: SupplementalForecastState = forecast
            ? { status: "available", forecast }
            : { status: "outside-horizon", retrievedAt: new Date() };
          supplementalForecastCacheRef.current.set(cacheKey, state);
          setSupplementalForecastResult((current) =>
            current.candidateKey === supplementalForecastCandidateKey
              ? {
                  ...current,
                  forecasts: {
                    ...current.forecasts,
                    [model.id]: state,
                  },
                }
              : current,
          );
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          const state: SupplementalForecastState = {
            status: "error",
            retrievedAt: new Date(),
          };
          setSupplementalForecastResult((current) =>
            current.candidateKey === supplementalForecastCandidateKey
              ? {
                  ...current,
                  forecasts: {
                    ...current.forecasts,
                    [model.id]: state,
                  },
                }
              : current,
          );
        });
    }

    return () => controller.abort();
  }, [
    supplementalForecastCandidate,
    supplementalForecastCandidateKey,
    supplementalForecastRetryKey,
  ]);

  useEffect(
    () => () => {
      forecastRequestRef.current?.abort();
      forecastRequestRef.current = null;
      supplementalForecastRequestRef.current?.abort();
      supplementalForecastRequestRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const activeIds = new Set(
      requestedCandidates.map((candidate) => candidate.id),
    );
    elevationRequests.current.forEach((request, id) => {
      if (!activeIds.has(id)) {
        request.controller.abort();
        elevationRequests.current.delete(id);
      }
    });

    requestedCandidates.forEach((location) => {
      const coordinateKey = `${location.latitude}:${location.longitude}`;
      const pendingRequest = elevationRequests.current.get(location.id);
      const resolved = observerElevations[location.id];
      if (
        resolved !== undefined ||
        pendingRequest?.coordinateKey === coordinateKey
      ) {
        return;
      }
      const controller = new AbortController();
      elevationRequests.current.set(location.id, { coordinateKey, controller });
      calculateTerrainElevation(
        location.latitude,
        location.longitude,
        controller.signal,
      )
        .then((result) => {
          if (controller.signal.aborted) return;
          setObserverElevations((current) => ({
            ...current,
            [location.id]: {
              status: "ready",
              elevationMetres: result.elevationMetres,
            },
          }));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setObserverElevations((current) => ({
            ...current,
            [location.id]: {
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Observer elevation could not be resolved.",
            },
          }));
        })
        .finally(() => {
          const activeRequest = elevationRequests.current.get(location.id);
          if (activeRequest?.controller === controller) {
            elevationRequests.current.delete(location.id);
          }
        });
    });
    // The coordinate key represents the requested-candidate array without making
    // its per-render array identity a request trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observerElevations, requestedCandidateCoordinateKey]);

  useEffect(
    () => () => {
      elevationRequests.current.forEach(({ controller }) => controller.abort());
      elevationRequests.current.clear();
    },
    [],
  );

  const mappedCandidates = useMemo(
    () =>
      allCandidates.map((location) =>
        mapCandidate(
          location,
          observerElevations[location.id] ?? { status: "loading" },
          eventId,
        ),
      ),
    [allCandidates, eventId, observerElevations],
  );
  const selected =
    mappedCandidates.find((point) => point.candidate.id === selectedId) ?? null;
  const compared = compareIds
    .map((id) =>
      mappedCandidates.find((point) => point.candidate.id === id),
    )
    .filter((point): point is ScientificCandidate => Boolean(point));
  const selectedTerrain = selected
    ? terrainResults[terrainResultKey(eventId, selected.candidate.id)]
    : undefined;
  const selectedOfficialOperationLabel = selected
    ? officialOperationLabel(selected.candidate.operations.status)
    : null;
  const climateByCandidateId =
    climateState.status === "ready" ? climateState.byCandidateId : {};
  const selectedMunicipality = selected?.candidate.municipality ?? null;
  const selectedAemetUrl = aemetMunicipalityUrl(
    selectedMunicipality ?? undefined,
  );
  const atmosphereStatus =
    plannerState.layer === "august-cloud-climate"
      ? climateState.status
      : plannerState.layer === "eclipse-day-cloud-forecast"
        ? forecastStatus
        : "idle";
  const selectedLatitude = selected?.candidate.latitude ?? null;
  const selectedLongitude = selected?.candidate.longitude ?? null;
  const selectedCatalogMunicipality = selected?.candidate.municipality ?? null;

  // The AEMET municipal document only describes the 2026 eclipse day, so the
  // lookup stays scoped to that event. The coordinate is resolved through the
  // CartoCiudad reverse geocoder, with the catalogued municipality name as a
  // fallback for remote points; failures and missing municipalities surface
  // as explicit states instead of substituted values.
  useEffect(() => {
    const controller = new AbortController();
    const loadCatalog = async () => {
      const cached = municipalCatalogRef.current;
      if (cached !== null) return cached;
      const catalog = await fetchMunicipalForecastCatalog(controller.signal);
      municipalCatalogRef.current = catalog;
      return catalog;
    };
    const loadMunicipalForecast = async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      if (
        eventId !== "2026" ||
        selectedLatitude === null ||
        selectedLongitude === null
      ) {
        setMunicipalForecast({ status: "idle" });
        return;
      }
      setMunicipalForecast({ status: "loading" });
      const cacheKey = `${selectedLatitude.toFixed(5)},${selectedLongitude.toFixed(5)}`;
      let municipality = municipalityCacheRef.current.get(cacheKey);
      if (municipality === undefined) {
        municipality = await resolveMunicipality(
          selectedLatitude,
          selectedLongitude,
          controller.signal,
        );
        municipalityCacheRef.current.set(cacheKey, municipality);
      }
      if (controller.signal.aborted) return;
      if (municipality === null) {
        if (selectedCatalogMunicipality === null) {
          setMunicipalForecast({ status: "no-municipality" });
          return;
        }
        const catalog = await loadCatalog();
        if (controller.signal.aborted) return;
        const fallback = municipalForecastByName(
          catalog,
          selectedCatalogMunicipality,
        );
        if (fallback === null) {
          setMunicipalForecast({ status: "no-municipality" });
          return;
        }
        setMunicipalForecast({
          status: "ready",
          forecast: fallback,
          forecastDate: catalog.forecastDate,
          updatedAt: catalog.updatedAt,
        });
        return;
      }
      const catalog = await loadCatalog();
      if (controller.signal.aborted) return;
      const forecast = catalog.byIneCode.get(municipality.ineCode);
      if (forecast === undefined) {
        setMunicipalForecast({
          status: "no-forecast",
          municipalityName: municipality.name,
        });
        return;
      }
      setMunicipalForecast({
        status: "ready",
        forecast,
        forecastDate: catalog.forecastDate,
        updatedAt: catalog.updatedAt,
      });
    };
    loadMunicipalForecast().catch(() => {
      if (!controller.signal.aborted) {
        setMunicipalForecast({ status: "error" });
      }
    });
    return () => controller.abort();
  }, [
    eventId,
    municipalForecastRetryKey,
    selectedCatalogMunicipality,
    selectedLatitude,
    selectedLongitude,
  ]);

  const scrollToWorkspace = useCallback(() => {
    window.requestAnimationFrame(() => {
      const mobileDetail = window.matchMedia?.(STACKED_LAYOUT_MEDIA_QUERY).matches
        ? document.querySelector<HTMLElement>(".detail-panel")
        : null;
      (mobileDetail ?? document.getElementById("map"))?.scrollIntoView({
        block: "start",
      });
    });
  }, []);

  const selectCandidate = useCallback(
    (id: string, view: WorkspaceView, shouldScroll = true) => {
      const location = rawCandidates.find((candidate) => candidate.id === id);
      if (!location) return;
      commitPlannerState(
        {
          ...plannerState,
          selected: candidateReference(location),
        },
        {
          exploreView: { kind: "details", returnTo: "places" },
          view,
        },
      );
      if (shouldScroll) scrollToWorkspace();
    },
    [commitPlannerState, plannerState, rawCandidates, scrollToWorkspace],
  );
  const selectCandidateFromMap = useCallback(
    (id: string) => selectCandidate(id, { kind: "map" }, false),
    [selectCandidate],
  );
  const selectCandidateFromExplorer = useCallback(
    (id: string) => {
      const location = rawCandidates.find((candidate) => candidate.id === id);
      if (!location) return;
      const nextState = {
        ...plannerState,
        selected: candidateReference(location),
      };
      commitPlannerState(nextState, {
        exploreView: { kind: "places" },
        mode: "replace",
        view: { kind: "places" },
      });
      requestWorkspaceFocus({ kind: "details", returnTo: "places" });
      commitPlannerState(nextState, {
        exploreView: { kind: "details", returnTo: "places" },
        hasWorkspaceParent: true,
        view: { kind: "details", returnTo: "places" },
      });
    },
    [commitPlannerState, plannerState, rawCandidates, requestWorkspaceFocus],
  );

  const saveTerrainResult = useCallback(
    (id: string, result: TerrainHorizon) => {
      setTerrainResults((current) => ({
        ...current,
        [terrainResultKey(eventId, id)]: result,
      }));
    },
    [eventId],
  );

  const retryObserverElevation = useCallback((id: string) => {
    setObserverElevations((current) => {
      if (current[id]?.status !== "error") return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const retrySelectedForecast = () => {
    if (!selected) return;
    const candidateId = selected.candidate.id;
    forecastAttemptedRef.current.delete(candidateId);
    delete forecastCacheRef.current[candidateId];
    setForecastByCandidateId((current) => {
      if (!(candidateId in current)) return current;
      const next = { ...current };
      delete next[candidateId];
      return next;
    });
    for (const { id } of SUPPLEMENTAL_CLOUD_MODELS) {
      supplementalForecastCacheRef.current.delete(`${candidateId}:${id}`);
    }
    setForecastStatus("loading");
    setSupplementalForecastResult({
      candidateKey: supplementalForecastCandidateKey,
      forecasts: supplementalStates("loading"),
    });
    setForecastRetryKey((current) => current + 1);
    setSupplementalForecastRetryKey((current) => current + 1);
  };

  const addCustomPoint = useCallback(
    (
      latitude: number,
      longitude: number,
      view: WorkspaceView,
      shouldScroll = true,
    ) => {
      if (!isSupportedTerrainCoordinate(latitude, longitude)) {
        setCoordinateError(t("coordinates.outside"));
        return;
      }
      const reference = createGeoLocationReference(latitude, longitude);
      commitPlannerState(
        { ...plannerState, selected: reference },
        {
          exploreView: { kind: "details", returnTo: "places" },
          view,
        },
      );
      setCoordinateError(null);
      if (shouldScroll) scrollToWorkspace();
    },
    [commitPlannerState, plannerState, scrollToWorkspace, t],
  );
  const addCustomPointFromMap = useCallback(
    (latitude: number, longitude: number) =>
      addCustomPoint(latitude, longitude, { kind: "map" }, false),
    [addCustomPoint],
  );
  const addCustomPointFromExplorer = useCallback(
    (latitude: number, longitude: number) => {
      if (!isSupportedTerrainCoordinate(latitude, longitude)) {
        setCoordinateError(t("coordinates.outside"));
        return;
      }
      const nextState = {
        ...plannerState,
        selected: createGeoLocationReference(latitude, longitude),
      };
      commitPlannerState(nextState, {
        exploreView: { kind: "places" },
        mode: "replace",
        view: { kind: "places" },
      });
      requestWorkspaceFocus({ kind: "details", returnTo: "places" });
      commitPlannerState(nextState, {
        exploreView: { kind: "details", returnTo: "places" },
        hasWorkspaceParent: true,
        view: { kind: "details", returnTo: "places" },
      });
      setCoordinateError(null);
    },
    [commitPlannerState, plannerState, requestWorkspaceFocus, t],
  );

  const toggleCompare = useCallback(
    (id: string) => {
      const location = rawCandidates.find((candidate) => candidate.id === id);
      if (!location) return;
      const reference = candidateReference(location);
      const referenceKey = plannerLocationReferenceKey(reference);
      const existing = plannerState.compared.some(
        (item) => plannerLocationReferenceKey(item) === referenceKey,
      );
      if (existing) {
        commitPlannerState({
          ...plannerState,
          compared: plannerState.compared.filter(
            (item) => plannerLocationReferenceKey(item) !== referenceKey,
          ),
        });
        setComparisonNotice(
          t("compare.statusRemoved", { name: location.name }),
        );
        return;
      }
      if (plannerState.compared.length >= MAX_COMPARISON_POINTS) {
        setComparisonNotice(t("compare.limit"));
        return;
      }
      commitPlannerState({
        ...plannerState,
        compared: [...plannerState.compared, reference],
      });
      setComparisonNotice(t("compare.statusAdded", { name: location.name }));
    },
    [commitPlannerState, plannerState, rawCandidates, t],
  );

  const selectEvent = useCallback(
    (nextEventId: EclipseEventId) => {
      if (nextEventId === eventId) return;
      const layer =
        nextEventId !== "2026" && isAtmosphereMapView(plannerState.layer)
          ? "totality-duration"
          : plannerState.layer;
      setTerrainResults({});
      setComparisonNotice(null);
      commitPlannerState({
        ...plannerState,
        eventId: nextEventId,
        layer,
      });
    },
    [commitPlannerState, eventId, plannerState],
  );

  const setOverviewSelection = useCallback(
    (layer: MapViewSelection) => {
      commitPlannerState({ ...plannerState, layer });
    },
    [commitPlannerState, plannerState],
  );

  const openComparisonDetails = (id: string) => {
    const location = rawCandidates.find((candidate) => candidate.id === id);
    if (!location) return;
    const nextState = {
      ...plannerState,
      selected: candidateReference(location),
    };
    commitPlannerState(nextState, {
      mode: "replace",
      view: { kind: "compare" },
    });
    const detailView = { kind: "details", returnTo: "compare" } as const;
    requestWorkspaceFocus(detailView);
    commitPlannerState(nextState, {
      exploreView: { kind: "details", returnTo: "places" },
      hasWorkspaceParent: true,
      view: detailView,
    });
  };

  const clearSelection = (view = viewAfterClearingSelection(workspaceView)) => {
    requestWorkspaceFocus(view);
    commitPlannerState(
      { ...plannerState, selected: null },
      { exploreView: { kind: "places" }, view },
    );
    setComparisonNotice(null);
  };

  const resetToOverview = () => {
    clearSelection({ kind: "map" });
    setOverviewRequestKey((current) => current + 1);
  };

  const returnToWorkspace = (
    view: WorkspaceView,
    nextExploreView = exploreView,
  ) => {
    if (pendingHistoryReturn.current) return;
    if (workspaceHasHistoryParent(window.history.state, workspaceView)) {
      pendingHistoryReturn.current = {
        exploreView: nextExploreView,
        plannerState: { ...plannerState, locale },
        view,
      };
      window.history.go(
        -workspaceHistoryParentSteps(window.history.state, workspaceView),
      );
      return;
    }
    requestWorkspaceFocus(view);
    commitPlannerState(plannerState, {
      exploreView: nextExploreView,
      mode: "replace",
      view,
    });
  };

  const closeDetail = () => {
    const returnView = { kind: detailReturnView(workspaceView) } as const;
    returnToWorkspace(
      returnView,
      returnView.kind === "places" ? { kind: "places" } : exploreView,
    );
  };

  const closeHelp = () => {
    const returnTo =
      workspaceView.kind === "help"
        ? workspaceView.returnTo
        : { kind: "places" as const };
    returnToWorkspace(returnTo);
  };

  const openHelp = () => {
    const helpView = {
      kind: "help",
      returnTo: primaryWorkspaceView(workspaceView),
    } as const;
    requestWorkspaceFocus(helpView);
    commitPlannerState(plannerState, {
      hasWorkspaceParent: true,
      view: helpView,
    });
  };

  const openSelectedDetails = () => {
    if (!selected) return;
    const detailView = { kind: "details", returnTo: "places" } as const;
    requestWorkspaceFocus(detailView);
    commitPlannerState(plannerState, {
      exploreView: detailView,
      view: detailView,
    });
  };

  const openExplore = () => {
    requestWorkspaceFocus(exploreView);
    commitPlannerState(plannerState, {
      exploreView,
      view: exploreView,
    });
  };

  const openLive = () => {
    if (workspaceView.kind === "live") return;
    const liveView = {
      kind: "live",
      returnTo: primaryWorkspaceView(workspaceView),
    } as const;
    commitPlannerState(plannerState, {
      hasWorkspaceParent: true,
      view: liveView,
    });
  };

  const closeLive = () => {
    returnToWorkspace(
      workspaceView.kind === "live"
        ? workspaceView.returnTo
        : { kind: "map" as const },
    );
  };

  const choosePlaceFromLive = () => {
    returnToWorkspace({ kind: "places" }, { kind: "places" });
  };

  const changeMobileView = (view: MobileView) => {
    if (view === "help") {
      openHelp();
      return;
    }
    if (view === "live") {
      openLive();
      return;
    }
    if (view === "explore") {
      openExplore();
      return;
    }
    const nextView = { kind: "map" } as const;
    requestWorkspaceFocus(nextView);
    commitPlannerState(plannerState, {
      exploreView,
      view: nextView,
    });
  };

  const visibleMapCandidates = mappedCandidates.filter(({ candidate }) => {
    const explicitlyRequested =
      candidate.id === selectedId || compareIds.includes(candidate.id);
    if (isAtmosphereMapView(plannerState.layer)) {
      return candidate.atmosphereReference || explicitlyRequested;
    }
    return (
      (candidate.mapVisibleByDefault ?? candidate.defaultVisible) ||
      explicitlyRequested
    );
  });
  const railContent =
    layoutView.kind === "help"
      ? "help"
      : layoutView.kind === "compare"
        ? "compare"
        : layoutView.kind === "details" ||
            (layoutView.kind === "map" && selected)
          ? "details"
          : "places";
  const setActiveRailWidth = (width: number) => {
    setRailWidthCustomized(true);
    setRailWidth(width);
  };
  const resetActiveRailWidth = () => {
    const size = workspaceSize(plannerWorkspaceRef);
    setRailWidthCustomized(false);
    setRailWidth(defaultDesktopRailWidth(size));
  };
  const detailDestination = detailReturnView(layoutView);
  const detailBackLabel: MessageKey =
    detailDestination === "map"
      ? "detail.backToMap"
      : detailDestination === "compare"
        ? "detail.backToComparison"
        : "detail.backToPlaces";

  return (
    <main
      className="planner-shell"
      data-keyboard-open={keyboardOpen ? "true" : undefined}
      data-search-active={searchActive ? "true" : undefined}
      style={
        { "--planner-rail-width": `${railWidth}px` } as CSSProperties
      }
    >
      <AppHeader
        eventId={eventId}
        onEventSelect={selectEvent}
        onHome={resetToOverview}
        inert={workspaceView.kind === "live"}
      />

      <h1 className="sr-only" id="planner-title">{t("planner.title")}</h1>

      <div className="planner-notices" aria-live="polite">
        {urlIssueCount > 0 && (
          <p className="link-notice">
            {t("url.invalidNotice", { count: urlIssueCount })}
          </p>
        )}
        {coordinateError && (
          <p className="link-notice" role="alert">
            {coordinateError}
          </p>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {selected
          ? t("selection.announcement", {
              name: selected.candidate.name,
              count: rawCandidates.length,
            })
          : t("selection.none", { count: rawCandidates.length })}
      </p>

      <section
        ref={plannerWorkspaceRef}
        className="planner-workspace"
        id="map"
        aria-labelledby="planner-title"
        data-mobile-view={mobileSurface}
        // The live layer is modal: everything it covers leaves the focus
        // order and the accessibility tree while it is open.
        inert={workspaceView.kind === "live" || undefined}
      >
        <div className="map-panel">
          <EclipseMap
            key={eventId}
            points={visibleMapCandidates}
            selected={selected}
            onSelect={selectCandidateFromMap}
            onPick={addCustomPointFromMap}
            eventId={eventId}
            overviewRequestKey={overviewRequestKey}
            overviewSelection={plannerState.layer}
            baseLayerId={baseLayerId}
            climateByCandidateId={climateByCandidateId}
            forecastByCandidateId={forecastByCandidateId}
            atmosphereStatus={atmosphereStatus}
            forecastRun={forecastPresentation?.run ?? null}
            forecastSourceMode={forecastPresentation?.sourceMode ?? null}
            forecastRetrievedAt={forecastPresentation?.retrievedAt ?? null}
            onRetryAtmosphere={() => {
              if (plannerState.layer === "august-cloud-climate") {
                setClimateState({ status: "loading" });
                setClimateRetryKey((current) => current + 1);
              } else {
                setForecastRetryKey((current) => current + 1);
              }
            }}
            t={t}
            formatNumber={formatNumber}
          />
          <details
            className={`mobile-map-view-picker ${
              railContent === "details" ? "is-desktop-visible" : ""
            }`}
          >
            <summary>{t("mobile.layers")}</summary>
            <MapViewPicker
              value={plannerState.layer}
              onChange={setOverviewSelection}
              baseLayer={baseLayerId}
              onBaseLayerChange={setBaseLayerId}
              eventId={eventId}
              t={t}
              headingId="mobile-map-views-title"
            />
          </details>
        </div>
        {selected && (
          <MobileSelectedSummary
            point={selected}
            terrain={selectedTerrain}
            onOpen={openSelectedDetails}
            onClear={() => clearSelection({ kind: "map" })}
            t={t}
            formatNumber={formatNumber}
          />
        )}
        <PlannerSplitter
          workspaceRef={plannerWorkspaceRef}
          workspace={plannerWorkspaceSize}
          width={railWidth}
          onChange={setActiveRailWidth}
          onReset={resetActiveRailWidth}
          t={t}
        />
        <aside
          className="planner-rail"
          aria-label={t("panel.label")}
          data-content={railContent}
          tabIndex={-1}
        >
          {railContent !== "details" && (
            <>
              <div className="desktop-map-view-picker">
                <MapViewPicker
                  value={plannerState.layer}
                  onChange={setOverviewSelection}
                  baseLayer={baseLayerId}
                  onBaseLayerChange={setBaseLayerId}
                  eventId={eventId}
                  t={t}
                  headingId="rail-map-views-title"
                />
              </div>
              <nav className="rail-tabs" aria-label={t("nav.label")}>
                <button
                  type="button"
                  className={panelMode === "explore" ? "is-active" : ""}
                  aria-pressed={panelMode === "explore"}
                  onClick={() => {
                    if (panelMode !== "explore") openExplore();
                  }}
                >
                  {t("panel.explore")}
                </button>
                <button
                  type="button"
                  className={panelMode === "compare" ? "is-active" : ""}
                  aria-pressed={panelMode === "compare"}
                  onClick={() =>
                    commitPlannerState(plannerState, {
                      view: { kind: "compare" },
                    })
                  }
                >
                  {t("panel.compare", { count: compared.length })}
                </button>
              </nav>
            </>
          )}

          {railContent !== "details" &&
            panelMode !== "help" &&
            (compared.length > 0 || panelMode === "compare") && (
              <div className="mobile-comparison-action">
                <button
                  type="button"
                  onClick={() => {
                    if (panelMode === "compare") {
                      openExplore();
                      return;
                    }
                    commitPlannerState(plannerState, {
                      view: { kind: "compare" },
                    });
                  }}
                >
                  {panelMode === "compare"
                    ? t("mobile.compare.back")
                    : t("mobile.compare.view", { count: compared.length })}
                </button>
              </div>
            )}

          {railContent === "help" ? (
            <HelpPanel onClose={closeHelp} t={t} />
          ) : railContent === "compare" ? (
            <section
              className="rail-comparison"
              id="comparison"
              aria-labelledby="comparison-title"
              tabIndex={-1}
            >
              <header>
                <span>{t("comparison.eyebrow")}</span>
                <h2 id="comparison-title">{t("comparison.title")}</h2>
              </header>
              {comparisonNotice && (
                <p className="comparison-notice" role="status">
                  {comparisonNotice}
                </p>
              )}
              {compared.length === 0 ? (
                <p className="comparison-empty">{t("compare.emptyDock")}</p>
              ) : (
                <div className="comparison-cards">
                  {compared.map((point) => (
                    <ComparisonCard
                      key={point.candidate.id}
                      point={point}
                      terrain={
                        terrainResults[
                          terrainResultKey(eventId, point.candidate.id)
                        ]
                      }
                      climate={
                        eventId === "2026"
                          ? climateByCandidateId[point.candidate.id] ?? null
                          : null
                      }
                      forecast={
                        eventId === "2026"
                          ? forecastByCandidateId[point.candidate.id] ?? null
                          : null
                      }
                      forecastPresentation={
                        eventId === "2026"
                          ? forecastPresentationByCandidateId[
                              point.candidate.id
                            ] ?? null
                          : null
                      }
                      onShow={() => openComparisonDetails(point.candidate.id)}
                      onRemove={() => toggleCompare(point.candidate.id)}
                      t={t}
                      formatNumber={formatNumber}
                      formatTime={formatTime}
                      locale={locale}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : railContent === "details" && selected ? (
            <section
              className="detail-panel"
              aria-labelledby="selected-location-title"
              tabIndex={-1}
            >
              <div className="detail-header">
                <button
                  className="detail-back"
                  type="button"
                  onClick={closeDetail}
                >
                  <span className="detail-back__icon" aria-hidden="true">←</span>
                  <span className="detail-back__label">{t(detailBackLabel)}</span>
                </button>
                <div className="detail-header__identity">
                  <span className="location-region">
                    {selected.candidate.region}
                  </span>
                  <h2 id="selected-location-title">
                    {selected.candidate.name}
                  </h2>
                </div>
                <div className="detail-header__actions">
                  <button
                    className={`compare-toggle ${
                      compareIds.includes(selected.candidate.id)
                        ? "is-added"
                        : ""
                    }`}
                    type="button"
                    onClick={() => toggleCompare(selected.candidate.id)}
                    aria-pressed={compareIds.includes(selected.candidate.id)}
                  >
                    <span className="compare-toggle__label">
                      {compareIds.includes(selected.candidate.id)
                        ? t("compare.added")
                        : t("compare.add")}
                    </span>
                    <span className="compare-toggle__compact" aria-hidden="true">
                      {compareIds.includes(selected.candidate.id) ? "✓" : "+"}
                    </span>
                  </button>
                  {compared.length > 0 && (
                    <button
                      className="detail-compare-open"
                      type="button"
                      onClick={() =>
                        commitPlannerState(plannerState, {
                          view: { kind: "compare" },
                        })
                      }
                    >
                      <span className="detail-compare-open__label">
                        {t("panel.compare", { count: compared.length })}
                      </span>
                      <span
                        className="detail-compare-open__compact"
                        aria-hidden="true"
                      >
                        {compared.length}
                      </span>
                    </button>
                  )}
                </div>
                <button
                  className="detail-clear"
                  type="button"
                  onClick={() => clearSelection()}
                >
                  <span className="detail-clear__label">
                    {t("selection.clear")}
                  </span>
                  <span className="detail-clear__icon" aria-hidden="true">×</span>
                </button>
                {comparisonNotice && (
                  <p className="comparison-notice" role="status">
                    {comparisonNotice}
                  </p>
                )}
              </div>

              <EclipseOutcome
                point={selected}
                t={t}
                formatNumber={formatNumber}
                formatTime={formatTime}
              />

              <SelectedPlaceEvidenceTabs
                activeView={detailEvidenceView}
                onChange={selectDetailEvidence}
              />

              <div className="detail-evidence-panels">
                <section
                  id={selectedPlacePanelId("horizon")}
                  className="detail-evidence-panel detail-evidence-panel--horizon"
                  role="tabpanel"
                  aria-labelledby={selectedPlaceTabId("horizon")}
                  hidden={detailEvidenceView !== "horizon"}
                >
                  <TerrainProfile
                    location={selected.candidate}
                    eventId={eventId}
                    eclipse={selected.eclipse}
                    elevationStatus={selected.observerElevation.status}
                    onRetryElevation={() =>
                      retryObserverElevation(selected.candidate.id)
                    }
                    onResult={saveTerrainResult}
                    cachedResult={selectedTerrain}
                  />
                  <div className="technical-facts">
                    {eventId === "2026" && selectedOfficialOperationLabel && (
                      <div className="official-place-status">
                        <span>{t(selectedOfficialOperationLabel)}</span>
                        <small>{selected.candidate.coordinate.label}</small>
                        {selected.candidate.operations.sourceUrl && (
                          <a
                            href={selected.candidate.operations.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t("actions.officialPage")}
                          </a>
                        )}
                      </div>
                    )}
                    <section className="contacts-panel">
                      <h3>{t("timeline.title")}</h3>
                      <EclipseTimeline
                        eclipse={selected.eclipse}
                        displayTimeZone={selected.displayTimeZone}
                      />
                    </section>
                    <section
                      className="metric-grid"
                      aria-label={t("detail.technicalLabel")}
                    >
                      <Metric
                        value={
                          selected.eclipse
                            ? t("metric.solarPosition", {
                                altitude: formatNumber(
                                  selected.eclipse.sunAltitudeDegrees,
                                  {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 1,
                                  },
                                ),
                                azimuth: formatNumber(
                                  selected.eclipse.sunAzimuthDegrees,
                                  {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 1,
                                  },
                                ),
                              })
                            : t("state.unknown")
                        }
                        label={t("metric.solarAltitude")}
                      />
                      <Metric
                        value={
                          selected.eclipse
                            ? formatNumber(selected.eclipse.magnitude, {
                                minimumFractionDigits: 4,
                                maximumFractionDigits: 4,
                              })
                            : t("state.unknown")
                        }
                        label={t("metric.magnitude")}
                      />
                      <Metric
                        value={
                          selected.observerElevation.status === "ready"
                            ? `${formatNumber(
                                selected.observerElevation.elevationMetres,
                                { maximumFractionDigits: 0 },
                              )} m`
                            : selected.observerElevation.status === "loading"
                              ? t("elevation.loading")
                              : t("elevation.unavailable")
                        }
                        label={t("metric.groundElevation")}
                      />
                    </section>
                    {selected.observerElevation.status === "ready" && (
                      <dl
                        className="technical-evidence"
                        aria-label={t("detail.terrainEvidence")}
                      >
                        <div>
                          <dt>{t("metric.terrainSource")}</dt>
                          <dd>{t("metric.terrainSourceValue", { zoom: 11 })}</dd>
                        </div>
                        <div>
                          <dt>{t("metric.viewpointModel")}</dt>
                          <dd>
                            {t("metric.viewpointModelValue", {
                              height: formatNumber(
                                PLANNING_VIEWPOINT_HEIGHT_METRES,
                                { maximumFractionDigits: 1 },
                              ),
                            })}
                          </dd>
                        </div>
                        {selectedTerrain && (
                          <>
                            <div>
                              <dt>{t("metric.horizonModel")}</dt>
                              <dd>
                                {t("metric.horizonModelValue", {
                                  distance: formatNumber(
                                    selectedTerrain.maximumDistanceKilometres,
                                  ),
                                  refraction: formatNumber(
                                    selectedTerrain.refractionCoefficient,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    },
                                  ),
                                  samples: formatNumber(
                                    selectedTerrain.samplesPerRay,
                                  ),
                                })}
                              </dd>
                            </div>
                            {selectedTerrain.solarDiscAssessment && (
                              <div>
                                <dt>{t("metric.limitingTerrain")}</dt>
                                <dd>
                                  {t("metric.limitingTerrainValue", {
                                    azimuth: formatNumber(
                                      selectedTerrain.solarDiscAssessment
                                        .limitingTerrainAzimuthDegrees,
                                      {
                                        minimumFractionDigits: 1,
                                        maximumFractionDigits: 1,
                                      },
                                    ),
                                    distance: formatNumber(
                                      selectedTerrain.solarDiscAssessment
                                        .limitingDistanceKilometres,
                                      {
                                        minimumFractionDigits: 1,
                                        maximumFractionDigits: 1,
                                      },
                                    ),
                                  })}
                                </dd>
                              </div>
                            )}
                            <div>
                              <dt>{t("metric.terrainLimits")}</dt>
                              <dd>{t("metric.terrainLimitsValue")}</dd>
                            </div>
                          </>
                        )}
                      </dl>
                    )}
                  </div>
                  <footer className="location-footer">
                    <span>
                      {selected.candidate.latitude.toFixed(5)}, {" "}
                      {selected.candidate.longitude.toFixed(5)}
                    </span>
                    {selected.candidate.coordinate.sourceUrl && (
                      <a
                        href={selected.candidate.coordinate.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("actions.coordinate")}
                      </a>
                    )}
                    {eventId === "2026" &&
                      selected.candidate.operations.sourceUrl &&
                      !isOfficialOperation(
                        selected.candidate.operations.status,
                      ) && (
                        <a
                          href={selected.candidate.operations.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("actions.operations")}
                        </a>
                      )}
                  </footer>
                </section>

                <section
                  id={selectedPlacePanelId("clouds")}
                  className="detail-evidence-panel detail-evidence-panel--clouds"
                  role="tabpanel"
                  aria-labelledby={selectedPlaceTabId("clouds")}
                  hidden={detailEvidenceView !== "clouds"}
                >
                  {eventId === "2026" ? (
                    <SkyEvidence
                      locationName={selected.candidate.name}
                      aemetMunicipality={selectedMunicipality}
                      aemetUrl={selectedAemetUrl}
                      climate={
                        climateByCandidateId[selected.candidate.id] ?? null
                      }
                      climateStatus={climateState.status}
                      forecast={
                        forecastByCandidateId[selected.candidate.id] ?? null
                      }
                      forecastStatus={forecastStatus}
                      forecastPresentation={
                        forecastPresentationByCandidateId[
                          selected.candidate.id
                        ] ?? null
                      }
                      supplementalForecasts={supplementalForecasts}
                      municipalForecast={municipalForecast}
                      eclipse={selected.eclipse}
                      displayTimeZone={selected.displayTimeZone}
                      onRetryClimate={() => {
                        setClimateState({ status: "loading" });
                        setClimateRetryKey((current) => current + 1);
                      }}
                      onRetryForecast={retrySelectedForecast}
                      onRetryMunicipalForecast={() =>
                        setMunicipalForecastRetryKey((current) => current + 1)
                      }
                      locale={locale}
                      t={t}
                      formatNumber={formatNumber}
                    />
                  ) : (
                    <FutureSkyEvidence
                      eventDate={t(`events.${eventId}.fullDate`)}
                      t={t}
                    />
                  )}
                </section>

                <section
                  id={selectedPlacePanelId("live")}
                  className="detail-evidence-panel detail-evidence-panel--live"
                  role="tabpanel"
                  aria-labelledby={selectedPlaceTabId("live")}
                  hidden={detailEvidenceView !== "live"}
                >
                  {/* Mounted only while shown: a hidden countdown would keep
                      duplicate text in the document and a clock nobody reads. */}
                  {detailEvidenceView === "live" && (
                    <LiveEvidencePanel
                      point={{
                        name: selected.candidate.name,
                        eclipse: selected.eclipse,
                        displayTimeZone: selected.displayTimeZone,
                        elevationStatus: selected.observerElevation.status,
                      }}
                      active={workspaceView.kind !== "live"}
                      onOpenFullscreen={openLive}
                    />
                  )}
                </section>

              </div>
          </section>
          ) : null}

          <LocationExplorer
            hidden={railContent !== "places"}
            searchActive={searchActive}
            selectedId={selectedId}
            focusSelectedRequestKey={explorerFocusRequestKey}
            points={mappedCandidates}
            onSelect={selectCandidateFromExplorer}
            onCoordinates={addCustomPointFromExplorer}
            onSearchActiveChange={setSearchActive}
            eventId={eventId}
            t={t}
            formatNumber={formatNumber}
          />

          <footer className="planner-footer">
            <span>{t("footer.placeData")}</span>
            <a href={`${import.meta.env.BASE_URL}sources.json`}>
              {t("footer.sources")}
            </a>
            <a href={`${import.meta.env.BASE_URL}third-party-notices.txt`}>
              {t("footer.notices")}
            </a>
            <button
              type="button"
              className={panelMode === "help" ? "is-active" : ""}
              aria-pressed={panelMode === "help"}
              onClick={openHelp}
            >
              {t("footer.help")}
            </button>
          </footer>
        </aside>
      </section>
      <MobileNavigation
        activeView={mobileNavigationDestination}
        onChange={changeMobileView}
        t={t}
        inert={workspaceView.kind === "live"}
      />
      {workspaceView.kind === "live" && (
        <LiveEclipseMode
          point={
            selected
              ? {
                  name: selected.candidate.name,
                  eclipse: selected.eclipse,
                  displayTimeZone: selected.displayTimeZone,
                  elevationStatus: selected.observerElevation.status,
                }
              : null
          }
          eventId={eventId}
          onClose={closeLive}
          onChoosePlace={choosePlaceFromLive}
        />
      )}
    </main>
  );
}
