import { useEffect, useRef, useState } from "react";
import type {
  GeoJSON as LeafletGeoJSON,
  ImageOverlay,
  LayerGroup,
  Map as LeafletMap,
} from "leaflet";
import type { CandidateLocation } from "../../data/candidates";
import type { CloudClimatePoint } from "../../data/cloud-climate";
import type { EclipseCircumstances } from "../../domain/eclipse";
import {
  eclipseEvent,
  type EclipseEventId,
} from "../../domain/eclipse-events";
import {
  ECLIPSE_MAP_FORECAST_UTC_HOUR,
  type EclipseDayForecast,
  type ForecastRunMetadata,
} from "../../domain/weather";
import type { MessageKey, MessageValues } from "../../i18n/messages";
import {
  officialOverviewAssetUrl,
  officialOverviewSourceUrl,
  officialUtcHoursToDate,
  parseOfficialOverviewManifest,
  parseOfficialUmbraArtifact,
  type OfficialOverviewManifest,
  type OfficialUmbraArtifact,
} from "../../data/official-overview";
import {
  isAtmosphereMapView,
  isOfficialOverviewSelection,
  type MapViewSelection,
} from "../../data/map-view";
import {
  officialUmbraFrameFeature,
  UMBRA_LEAFLET_STYLE,
} from "./umbra-leaflet-layer";
import { groupCollidingReferences } from "./reference-marker-groups";
import {
  CLOUD_COVER_LEGEND_GRADIENT,
  UNKNOWN_CLOUD_COVER_COLOR,
  cloudCoverColor,
  cloudCoverTextColor,
} from "./cloud-cover-palette";

const TERRAIN_REQUEST_OVERVIEW_BOUNDS: [[number, number], [number, number]] = [
  [27.5, -18.5],
  [44.5, 4.5],
];
const PRIMARY_SPAIN_OVERVIEW_BOUNDS: [[number, number], [number, number]] = [
  [35.2, -10.2],
  [44.5, 4.5],
];
const OFFICIAL_OVERVIEW_MAX_ZOOM = 10;
const UMBRA_PLAYBACK_DURATION_MILLISECONDS = 20_000;
const UMBRA_MAX_FRAMES_PER_SECOND = 15;
const REFERENCE_COLLISION_PIXELS = 48;
const REFERENCE_CLUSTER_MAX_ZOOM = 10;
const REFERENCE_LABEL_MIN_ZOOM = 9;

export type MappedCandidate = {
  candidate: CandidateLocation;
  eclipse: EclipseCircumstances | null;
};

type EclipseMapProps = {
  points: MappedCandidate[];
  selected: MappedCandidate | null;
  onSelect: (id: string) => void;
  onPick: (latitude: number, longitude: number) => void;
  eventId: EclipseEventId;
  overviewRequestKey: number;
  overviewSelection: MapViewSelection;
  climateByCandidateId: Readonly<Record<string, CloudClimatePoint>>;
  forecastByCandidateId: Readonly<Record<string, EclipseDayForecast>>;
  atmosphereStatus: "idle" | "loading" | "ready" | "error";
  forecastRun: ForecastRunMetadata | null;
  forecastSourceMode: "exact-run" | "rolling-model" | null;
  forecastRetrievedAt: Date | null;
  onRetryAtmosphere: () => void;
  t: (key: MessageKey, values?: MessageValues) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

function formatOfficialUtc(date: Date) {
  return `${date.toISOString().slice(11, 19)} UTC`;
}

function formatMetadataUtc(date: Date) {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function escapeMarkerHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

function atmosphereMarkerValue(
  selection: MapViewSelection,
  candidateId: string,
  climateByCandidateId: Readonly<Record<string, CloudClimatePoint>>,
  forecastByCandidateId: Readonly<Record<string, EclipseDayForecast>>,
) {
  if (selection === "august-cloud-climate") {
    return climateByCandidateId[candidateId]?.meanCloudCoverPercent ?? null;
  }
  if (selection === "eclipse-day-cloud-forecast") {
    const forecast = forecastByCandidateId[candidateId];
    return (
      forecast?.hours.find(
        ({ validAt }) => validAt.getUTCHours() === ECLIPSE_MAP_FORECAST_UTC_HOUR,
      )?.cloudCoverPercent ?? null
    );
  }
  return null;
}

export function EclipseMap({
  points,
  selected,
  onSelect,
  onPick,
  eventId,
  overviewRequestKey,
  overviewSelection,
  climateByCandidateId,
  forecastByCandidateId,
  atmosphereStatus,
  forecastRun,
  forecastSourceMode,
  forecastRetrievedAt,
  onRetryAtmosphere,
  t,
  formatNumber,
}: EclipseMapProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const overviewLayerRef = useRef<ImageOverlay | null>(null);
  const umbraLayerRef = useRef<LeafletGeoJSON | null>(null);
  const umbraFrameIndexRef = useRef(0);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const onPickRef = useRef(onPick);
  const tRef = useRef(t);
  const previousSelectedIdRef = useRef<string | null | undefined>(undefined);
  const previousOverviewRequestKeyRef = useRef(overviewRequestKey);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [retryKey, setRetryKey] = useState(0);
  const [overviewManifest, setOverviewManifest] =
    useState<OfficialOverviewManifest | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const [overviewRetryKey, setOverviewRetryKey] = useState(0);
  const [mapZoom, setMapZoom] = useState(5);
  const [mapCenter, setMapCenter] = useState("40.00000,-3.50000");
  const [umbraArtifact, setUmbraArtifact] =
    useState<OfficialUmbraArtifact | null>(null);
  const [umbraFrameIndex, setUmbraFrameIndex] = useState(0);
  const [umbraPlaying, setUmbraPlaying] = useState(false);

  const officialAttribution = `<a href="${officialOverviewSourceUrl(eventId)}" target="_blank" rel="noreferrer">IGN/OAN</a>`;

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    umbraFrameIndexRef.current = umbraFrameIndex;
  }, [umbraFrameIndex]);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        if (!elementRef.current || mapRef.current) return;
        const L = await import("leaflet");
        if (cancelled || !elementRef.current) return;

        leafletRef.current = L;
        const map = L.map(elementRef.current, {
          center: [40, -3.5],
          zoom: 5,
          minZoom: 4,
          maxZoom: 14,
          zoomSnap: 0.25,
          zoomDelta: 0.5,
          zoomControl: false,
        });
        const overviewPane = map.createPane("official-overview");
        overviewPane.style.zIndex = "350";
        overviewPane.style.pointerEvents = "none";
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
          maxZoom: 19,
          crossOrigin: true,
        }).addTo(map);
        L.control
          .zoom({
            position: "bottomright",
            zoomInTitle: tRef.current("map.zoomIn"),
            zoomOutTitle: tRef.current("map.zoomOut"),
          })
          .addTo(map);
        map.on("click", (event) => {
          onPickRef.current(event.latlng.lat, event.latlng.lng);
        });
        map.on("moveend", () => {
          const center = map.getCenter();
          setMapCenter(`${center.lat.toFixed(5)},${center.lng.toFixed(5)}`);
          setMapZoom(map.getZoom());
        });
        markerLayerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setStatus("ready");
      } catch (error) {
        console.error("Map initialization failed.", error);
        if (!cancelled) setStatus("error");
      }
    }

    void setup();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      overviewLayerRef.current = null;
      umbraLayerRef.current = null;
      leafletRef.current = null;
      previousSelectedIdRef.current = null;
    };
  }, [retryKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    const controls = [
      [".leaflet-control-zoom-in", t("map.zoomIn")],
      [".leaflet-control-zoom-out", t("map.zoomOut")],
    ] as const;
    for (const [selector, label] of controls) {
      const control = map.getContainer().querySelector(selector);
      control?.setAttribute("title", label);
      control?.setAttribute("aria-label", label);
    }
  }, [status, t]);

  useEffect(() => {
    const element = elementRef.current;
    const map = mapRef.current;
    if (!element || !map || status !== "ready") return;
    const observer = new ResizeObserver(() =>
      map.invalidateSize({ pan: true, animate: false }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [status]);

  useEffect(() => {
    if (
      !isOfficialOverviewSelection(overviewSelection) ||
      overviewSelection === "none" ||
      overviewManifest
    ) {
      return;
    }
    const controller = new AbortController();
    const event = eclipseEvent(eventId);
    fetch(officialOverviewAssetUrl(eventId, event.officialOverview.manifestFile), {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Official overview manifest failed.");
        return parseOfficialOverviewManifest(await response.json(), eventId);
      })
      .then((manifest) => {
        if (!controller.signal.aborted) setOverviewManifest(manifest);
      })
      .catch(() => {
        if (!controller.signal.aborted) setOverviewError(true);
      });
    return () => controller.abort();
  }, [eventId, overviewManifest, overviewRetryKey, overviewSelection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready" || !isAtmosphereMapView(overviewSelection)) {
      return;
    }
    const attribution = `<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">${escapeMarkerHtml(t("map.atmosphere.attribution"))}</a> · <a href="https://www.ecmwf.int/" target="_blank" rel="noreferrer">ECMWF</a>`;
    map.attributionControl.addAttribution(attribution);
    return () => {
      map.attributionControl.removeAttribution(attribution);
    };
  }, [overviewSelection, status, t]);

  useEffect(() => {
    if (
      overviewSelection !== "umbra-passage" ||
      !overviewManifest ||
      umbraArtifact
    ) {
      return;
    }
    const controller = new AbortController();
    fetch(officialOverviewAssetUrl(eventId, overviewManifest.animation.file), {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Official umbra artifact failed.");
        return parseOfficialUmbraArtifact(await response.json(), eventId);
      })
      .then((artifact) => {
        if (!controller.signal.aborted) {
          setUmbraArtifact(artifact);
          setUmbraFrameIndex(Math.floor((artifact.frames.length - 1) / 2));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setOverviewError(true);
      });
    return () => controller.abort();
  }, [eventId, overviewManifest, overviewSelection, umbraArtifact]);

  useEffect(() => {
    if (overviewSelection !== "umbra-passage") return;
    const map = mapRef.current;
    if (
      status !== "ready" ||
      !map ||
      !umbraArtifact ||
      mapZoom > OFFICIAL_OVERVIEW_MAX_ZOOM
    ) {
      return;
    }
    const L = leafletRef.current;
    if (!L) return;
    map.attributionControl.addAttribution(officialAttribution);
    const renderer = L.svg({ pane: "official-overview", padding: 0.5 });
    const layer = L.geoJSON([], {
      pane: "official-overview",
      interactive: false,
      style: () => ({ ...UMBRA_LEAFLET_STYLE, renderer }),
    });
    const frame = umbraArtifact.frames[Math.round(umbraFrameIndexRef.current)];
    if (frame) layer.addData(officialUmbraFrameFeature(frame));
    layer.addTo(map);
    umbraLayerRef.current = layer;
    return () => {
      map.attributionControl.removeAttribution(officialAttribution);
      layer.remove();
      if (umbraLayerRef.current === layer) umbraLayerRef.current = null;
    };
  }, [mapZoom, officialAttribution, overviewSelection, status, umbraArtifact]);

  useEffect(() => {
    const layer = umbraLayerRef.current;
    const frame = umbraArtifact?.frames[Math.round(umbraFrameIndex)];
    if (!layer || !frame) return;
    layer.clearLayers();
    layer.addData(officialUmbraFrameFeature(frame));
  }, [umbraArtifact, umbraFrameIndex]);

  useEffect(() => {
    if (
      !umbraPlaying ||
      !umbraArtifact ||
      overviewSelection !== "umbra-passage"
    ) {
      return;
    }
    let frameRequest = 0;
    let previous = performance.now();
    let accumulated = 0;
    const minimumFrameDuration = 1000 / UMBRA_MAX_FRAMES_PER_SECOND;
    const tick = (now: number) => {
      const elapsed = now - previous;
      previous = now;
      if (document.visibilityState === "visible") accumulated += elapsed;
      if (accumulated >= minimumFrameDuration) {
        const advance =
          (accumulated / UMBRA_PLAYBACK_DURATION_MILLISECONDS) *
          (umbraArtifact.frames.length - 1);
        accumulated = 0;
        setUmbraFrameIndex((current) => {
          const next = current + advance;
          if (next >= umbraArtifact.frames.length - 1) {
            setUmbraPlaying(false);
            return umbraArtifact.frames.length - 1;
          }
          return next;
        });
      }
      frameRequest = window.requestAnimationFrame(tick);
    };
    frameRequest = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameRequest);
  }, [overviewSelection, umbraArtifact, umbraPlaying]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || status !== "ready") return;
    if (overviewLayerRef.current) {
      overviewLayerRef.current.remove();
      overviewLayerRef.current = null;
    }
    if (
      !isOfficialOverviewSelection(overviewSelection) ||
      overviewSelection === "none" ||
      overviewSelection === "umbra-passage" ||
      !overviewManifest ||
      mapZoom > OFFICIAL_OVERVIEW_MAX_ZOOM
    ) {
      return;
    }
    const output = overviewManifest.outputs.find(
      (candidate) => candidate.id === overviewSelection,
    );
    if (!output) {
      return;
    }
    const bounds = overviewManifest.crop.leafletBounds;
    const overlay = L.imageOverlay(
      officialOverviewAssetUrl(eventId, output.file),
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      {
        pane: "official-overview",
        opacity: overviewSelection === "totality-duration" ? 0.7 : 0.58,
        interactive: false,
        crossOrigin: true,
        className: `official-overview-image official-overview-image--${overviewSelection}`,
        alt: t(
          overviewSelection === "solar-altitude-at-maximum"
            ? "map.overlay.altitude"
            : overviewSelection === "totality-duration"
              ? "map.overlay.duration"
              : "map.overlay.obscuration",
        ),
      },
    );
    overlay.on("error", () => {
      overlay.remove();
      if (overviewLayerRef.current === overlay) {
        overviewLayerRef.current = null;
      }
      setOverviewError(true);
    });
    overlay.addTo(map);
    map.attributionControl.addAttribution(officialAttribution);
    overviewLayerRef.current = overlay;
    return () => {
      overlay.remove();
      map.attributionControl.removeAttribution(officialAttribution);
      if (overviewLayerRef.current === overlay) {
        overviewLayerRef.current = null;
      }
    };
  }, [eventId, mapZoom, officialAttribution, overviewManifest, overviewSelection, status, t]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = markerLayerRef.current;
    const map = mapRef.current;
    if (status !== "ready" || !L || !layer || !map) return;
    layer.clearLayers();

    const selectedPoint = points.find(
      (point) => point.candidate.id === selected?.candidate.id,
    );
    const selectedProjection = selectedPoint
      ? map.latLngToLayerPoint([
          selectedPoint.candidate.latitude,
          selectedPoint.candidate.longitude,
        ])
      : null;
    const unselectedPoints = points.filter((point) => {
      if (point.candidate.id === selected?.candidate.id) return false;
      if (!selectedProjection) return true;
      const projected = map.latLngToLayerPoint([
        point.candidate.latitude,
        point.candidate.longitude,
      ]);
      return projected.distanceTo(selectedProjection) >= REFERENCE_COLLISION_PIXELS;
    });
    const markerGroups =
      mapZoom <= REFERENCE_CLUSTER_MAX_ZOOM &&
      !isAtmosphereMapView(overviewSelection)
        ? groupCollidingReferences(
            unselectedPoints,
            (point) => {
              const projected = map.latLngToLayerPoint([
                point.candidate.latitude,
                point.candidate.longitude,
              ]);
              return { x: projected.x, y: projected.y };
            },
            REFERENCE_COLLISION_PIXELS,
          )
        : unselectedPoints.map((point) => [point]);
    if (selectedPoint) markerGroups.push([selectedPoint]);

    markerGroups.forEach((group) => {
      if (group.length > 1) {
        const latitude =
          group.reduce((sum, point) => sum + point.candidate.latitude, 0) /
          group.length;
        const longitude =
          group.reduce((sum, point) => sum + point.candidate.longitude, 0) /
          group.length;
        const names = group.map((point) => point.candidate.shortName).join(", ");
        const expansionZoom = Math.max(9, mapZoom + 2);
        const marker = L.marker([latitude, longitude], {
          icon: L.divIcon({
            className: "eclipse-reference-cluster-shell",
            html: `<span class="eclipse-reference-cluster"><b>${group.length}</b></span>`,
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          }),
          keyboard: true,
          title: t("map.clusterTitle", { count: group.length, names }),
        });
        marker.bindTooltip(escapeMarkerHtml(names), {
          direction: "top",
          className: "map-tooltip",
          offset: [0, -18],
        });
        marker.on("click", () =>
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? map.setView([latitude, longitude], expansionZoom)
            : map.flyTo([latitude, longitude], expansionZoom, {
                duration: 0.6,
              }),
        );
        marker.addTo(layer);
        return;
      }

      const point = group[0];
      if (!point) return;
      const { candidate, eclipse } = point;
      const isSelected = candidate.id === selected?.candidate.id;
      const duration = eclipse?.totalityDurationSeconds;
      const showLabel = isSelected || mapZoom >= REFERENCE_LABEL_MIN_ZOOM;
      if (isAtmosphereMapView(overviewSelection)) {
        const cloudCover = atmosphereMarkerValue(
          overviewSelection,
          candidate.id,
          climateByCandidateId,
          forecastByCandidateId,
        );
        const markerValue =
          cloudCover === null
            ? atmosphereStatus === "loading"
              ? "…"
              : "?"
            : `${Math.round(cloudCover)}%`;
        const cloudColor =
          cloudCover === null
            ? UNKNOWN_CLOUD_COVER_COLOR
            : cloudCoverColor(cloudCover);
        const cloudTextColor = cloudCoverTextColor(cloudColor);
        const title =
          cloudCover === null
            ? `${candidate.name}: ${t("state.unknown")}`
            : t(
                overviewSelection === "august-cloud-climate"
                  ? "map.atmosphere.climateMarker"
                  : "map.atmosphere.forecastMarker",
                {
                  name: candidate.name,
                  percent: formatNumber(cloudCover, {
                    maximumFractionDigits: 0,
                  }),
                },
              );
        const icon = L.divIcon({
          className: "eclipse-atmosphere-pin-shell",
          html: `<span class="eclipse-atmosphere-pin${isSelected ? " is-selected" : ""}" style="--cloud-color:${cloudColor};--cloud-text-color:${cloudTextColor}" aria-hidden="true"><strong>${markerValue}</strong></span>${showLabel ? `<b class="eclipse-atmosphere-label" aria-hidden="true">${escapeMarkerHtml(candidate.shortName)}</b>` : ""}<span class="sr-only">${escapeMarkerHtml(title)}</span>`,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });
        const marker = L.marker([candidate.latitude, candidate.longitude], {
          icon,
          keyboard: true,
          title,
          zIndexOffset: isSelected ? 1000 : 0,
        });
        marker.bindTooltip(escapeMarkerHtml(title), {
          direction: "top",
          className: "map-tooltip",
          offset: [0, -20],
        });
        marker.on("click", () => onSelect(candidate.id));
        marker.addTo(layer);
        return;
      }
      const icon = L.divIcon({
        className: "eclipse-place-pin-shell",
        html: `<span class="eclipse-place-pin eclipse-place-pin--${candidate.category}${isSelected ? " is-selected" : ""}"><span aria-hidden="true"></span>${showLabel ? `<b>${escapeMarkerHtml(candidate.shortName)}</b>` : ""}</span>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      const marker = L.marker([candidate.latitude, candidate.longitude], {
        icon,
        keyboard: true,
        title:
          eclipse === null
            ? candidate.name
            : `${candidate.name}: ${
                duration === null || duration === undefined
                  ? t(eventId === "2028" ? "map.noAnnularity" : "map.noTotality")
                  : t(eventId === "2028" ? "map.annularitySeconds" : "map.totalitySeconds", {
                      seconds: formatNumber(duration, {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      }),
                    })
              }`,
        zIndexOffset: isSelected ? 1000 : 0,
      });
      marker.bindTooltip(escapeMarkerHtml(candidate.name), {
        direction: "top",
        className: "map-tooltip",
        offset: [0, -20],
      });
      marker.on("click", () => onSelect(candidate.id));
      marker.addTo(layer);
    });
  }, [
    atmosphereStatus,
    climateByCandidateId,
    forecastByCandidateId,
    formatNumber,
    mapZoom,
    eventId,
    onSelect,
    overviewSelection,
    points,
    selected,
    status,
    t,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;

    const previousSelectedId = previousSelectedIdRef.current;
    if (previousSelectedId === undefined) {
      if (selected) {
        map.setView(
          [selected.candidate.latitude, selected.candidate.longitude],
          9,
        );
      } else {
        map.fitBounds(PRIMARY_SPAIN_OVERVIEW_BOUNDS, {
          animate: false,
          padding: [12, 12],
        });
      }
    } else if (selected && previousSelectedId === null) {
      map.setView([selected.candidate.latitude, selected.candidate.longitude], 9);
    } else if (selected && previousSelectedId !== selected.candidate.id) {
      const target: [number, number] = [
        selected.candidate.latitude,
        selected.candidate.longitude,
      ];
      const zoom = Math.max(9, map.getZoom());
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        map.setView(target, zoom);
      } else {
        map.flyTo(target, zoom, { duration: 0.75 });
      }
    }
    previousSelectedIdRef.current = selected?.candidate.id ?? null;
  }, [
    selected,
    selected?.candidate.id,
    selected?.candidate.latitude,
    selected?.candidate.longitude,
    status,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;
    if (previousOverviewRequestKeyRef.current === overviewRequestKey) return;
    previousOverviewRequestKeyRef.current = overviewRequestKey;
    map.fitBounds(PRIMARY_SPAIN_OVERVIEW_BOUNDS, {
      animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      padding: [12, 12],
    });
  }, [overviewRequestKey, status]);

  const currentUmbraFrameIndex = Math.round(umbraFrameIndex);
  const currentUmbraFrame = umbraArtifact?.frames[currentUmbraFrameIndex];
  const currentOverviewOutput =
    !isOfficialOverviewSelection(overviewSelection) ||
    overviewSelection === "none" ||
    overviewSelection === "umbra-passage"
      ? null
      : (overviewManifest?.outputs.find(
          (output) => output.id === overviewSelection,
        ) ?? null);
  const currentLegendGradient = currentOverviewOutput
    ? `linear-gradient(90deg, ${currentOverviewOutput.palette.join(", ")})`
    : undefined;

  return (
    <div className="map-experience">
      <div className="map-stage">
        <div
          ref={elementRef}
          className="map-canvas"
          role="region"
          tabIndex={-1}
          aria-label={t("map.label")}
          data-map-center={mapCenter}
          data-map-zoom={mapZoom}
        />
        {status === "loading" && (
          <div className="map-loading" role="status">
            {t("map.loading")}
          </div>
        )}
        {status === "error" && (
          <div className="map-loading map-loading--error" role="alert">
            <strong>{t("map.error")}</strong>
            <button
              onClick={() => {
                setStatus("loading");
                setRetryKey((current) => current + 1);
              }}
            >
              {t("map.retry")}
            </button>
          </div>
        )}
        <div
          style={{
            position: "absolute",
            zIndex: 700,
            top: 10,
            right: 10,
          }}
        >
          <button
            className="map-overview-button"
            type="button"
            aria-label={t("map.overviewLabel")}
            onClick={() =>
              mapRef.current?.fitBounds(TERRAIN_REQUEST_OVERVIEW_BOUNDS, {
                padding: [24, 24],
              })
            }
          >
            {t("map.overview")}
          </button>
        </div>
      </div>
      {overviewSelection !== "none" && (
        <section
          className={`map-layer-legend ${
            overviewSelection === "umbra-passage" ? "is-umbra" : ""
          }`}
          aria-label={
            isAtmosphereMapView(overviewSelection)
              ? t("map.atmosphere.details")
              : t("map.overlay.details")
          }
        >
          {isAtmosphereMapView(overviewSelection) ? (
            <>
              <b>
                {t(
                  overviewSelection === "august-cloud-climate"
                    ? "map.atmosphere.climateLegend"
                    : "map.atmosphere.forecastLegend",
                )}
              </b>
              <span
                className="map-layer-legend__gradient"
                style={{
                  background: CLOUD_COVER_LEGEND_GRADIENT,
                }}
                aria-hidden="true"
              />
              <div className="map-layer-legend__ticks">
                {[0, 25, 50, 75, 100].map((value) => (
                  <span key={value}>{value}%</span>
                ))}
              </div>
              <p className="map-layer-legend__note">
                {overviewSelection === "august-cloud-climate"
                  ? t("map.atmosphere.climateSource")
                  : forecastRun && forecastRetrievedAt
                    ? t(
                        forecastSourceMode === "exact-run"
                          ? "map.atmosphere.forecastExactRun"
                          : "map.atmosphere.forecastRollingRun",
                        {
                          run: formatMetadataUtc(forecastRun.initializedAt),
                          retrieved: formatMetadataUtc(forecastRetrievedAt),
                        },
                      )
                    : t("map.atmosphere.loading")}
              </p>
            </>
          ) : overviewSelection === "umbra-passage" ? (
            <>
              <div className="map-umbra-controls">
                <button
                  type="button"
                  disabled={!umbraArtifact}
                  onClick={() => {
                    if (
                      currentUmbraFrameIndex >=
                      (umbraArtifact?.frames.length ?? 1) - 1
                    ) {
                      setUmbraFrameIndex(0);
                    }
                    setUmbraPlaying((current) => !current);
                  }}
                >
                  {umbraPlaying
                    ? t("map.umbra.pause")
                    : t("map.umbra.play")}
                </button>
                <label>
                  <span className="sr-only">
                    {t(eventId === "2028" ? "map.antumbra.scrubber" : "map.umbra.scrubber")}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max={(umbraArtifact?.frames.length ?? 1) - 1}
                    step="1"
                    value={currentUmbraFrameIndex}
                    disabled={!umbraArtifact}
                    aria-valuetext={
                      currentUmbraFrame
                        ? formatOfficialUtc(
                            officialUtcHoursToDate(eventId, currentUmbraFrame.utcHours),
                          )
                        : t("map.umbra.loading")
                    }
                    onChange={(event) => {
                      setUmbraPlaying(false);
                      setUmbraFrameIndex(Number(event.target.value));
                    }}
                  />
                </label>
                <time
                  dateTime={
                    currentUmbraFrame
                      ? officialUtcHoursToDate(
                          eventId,
                          currentUmbraFrame.utcHours,
                        ).toISOString()
                      : undefined
                  }
                >
                  {currentUmbraFrame
                    ? formatOfficialUtc(
                        officialUtcHoursToDate(eventId, currentUmbraFrame.utcHours),
                      )
                      : t("map.umbra.loading")}
                </time>
              </div>
            </>
          ) : (
            <>
              <b>
                {t(
                  overviewSelection === "solar-altitude-at-maximum"
                    ? "map.overlay.altitudeFull"
                    : overviewSelection === "totality-duration"
                      ? eventId === "2028"
                        ? "map.overlay.annularityDurationFull"
                        : "map.overlay.durationFull"
                      : "map.overlay.obscurationFull",
                )}
              </b>
              <span
                className="map-layer-legend__gradient"
                style={{ background: currentLegendGradient }}
                aria-hidden="true"
              />
              <div className="map-layer-legend__ticks">
                {(currentOverviewOutput?.legendTicks ?? []).map((value) => (
                  <span key={value}>
                    {value}
                    {overviewSelection === "solar-altitude-at-maximum"
                      ? "°"
                      : overviewSelection === "totality-duration"
                        ? " s"
                        : "%"}
                  </span>
                ))}
              </div>
            </>
          )}
          {isOfficialOverviewSelection(overviewSelection) &&
            mapZoom > OFFICIAL_OVERVIEW_MAX_ZOOM && (
            <strong>{t("map.overlay.hidden")}</strong>
          )}
          {isOfficialOverviewSelection(overviewSelection) && overviewError && (
            <button
              type="button"
              onClick={() => {
                setOverviewManifest(null);
                setUmbraArtifact(null);
                setOverviewError(false);
                setOverviewRetryKey((current) => current + 1);
              }}
            >
              {t("map.overlay.retry")}
            </button>
          )}
          {isAtmosphereMapView(overviewSelection) &&
            atmosphereStatus === "error" && (
              <button type="button" onClick={onRetryAtmosphere}>
                {t("map.atmosphere.retry")}
              </button>
            )}
        </section>
      )}
    </div>
  );
}
