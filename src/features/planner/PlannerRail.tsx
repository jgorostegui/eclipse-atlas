import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { CandidateCategory } from "../../data/candidates";
import type { EclipseEventId } from "../../domain/eclipse-events";
import type { MapViewSelection } from "../../data/map-view";
import { officialObservationDirectories } from "../../data/official-observation-directories";
import type { MessageKey, MessageValues } from "../../i18n/messages";
import type { MappedCandidate } from "../map/EclipseMap";
import { matchesStackedLayout } from "./responsive";

type Translate = (key: MessageKey, values?: MessageValues) => string;

const eclipseMapViews = [
  ["totality-duration", "map.overlay.durationFull"],
  ["umbra-passage", "map.overlay.umbraFull"],
  ["maximum-obscuration", "map.overlay.obscurationFull"],
  ["solar-altitude-at-maximum", "map.overlay.altitudeFull"],
] as const satisfies readonly [MapViewSelection, MessageKey][];

const skyMapViews = [
  ["august-cloud-climate", "map.atmosphere.climate"],
  ["eclipse-day-cloud-forecast", "map.atmosphere.forecast"],
] as const satisfies readonly [MapViewSelection, MessageKey][];

const categoryLabels: Record<CandidateCategory, MessageKey> = {
  "totality-city": "explore.category.totalityCity",
  "city-reference": "explore.category.cityReference",
  "official-observation": "explore.category.officialObservation",
  "candidate-viewpoint": "explore.category.viewpoint",
  "astronomy-site": "explore.category.astronomySite",
  "partial-context": "explore.category.partialContext",
  "local-reference": "explore.category.localReference",
  custom: "explore.category.custom",
};

export function MapViewPicker({
  value,
  onChange,
  eventId,
  t,
  headingId = "map-views-title",
}: {
  value: MapViewSelection;
  onChange: (selection: MapViewSelection) => void;
  eventId: EclipseEventId;
  t: Translate;
  headingId?: string;
}) {
  const renderViews = (
    views: readonly (readonly [MapViewSelection, MessageKey])[],
  ) =>
    views.map(([selection, label]) => {
      const eventLabel =
        eventId === "2028" && selection === "totality-duration"
          ? "map.overlay.annularityDurationFull"
          : eventId === "2028" && selection === "umbra-passage"
            ? "map.overlay.antumbraFull"
            : label;
      return (
      <button
        key={selection}
        type="button"
        className={value === selection ? "is-active" : ""}
        aria-pressed={value === selection}
        onClick={() => onChange(selection)}
      >
        {t(eventLabel)}
      </button>
      );
    });

  return (
    <section className="rail-map-views" aria-labelledby={headingId}>
      <h2 id={headingId}>{t("explore.mapViews")}</h2>
      <div className="rail-map-view-groups">
        <div className="rail-map-view-group">
          <span>{t("map.group.eclipse")}</span>
          <div>{renderViews(eclipseMapViews)}</div>
        </div>
        {eventId === "2026" && (
          <div className="rail-map-view-group">
            <span>{t("map.group.sky")}</span>
            <div>{renderViews(skyMapViews)}</div>
          </div>
        )}
      </div>
    </section>
  );
}

export function LocationExplorer({
  hidden,
  searchActive,
  selectedId,
  focusSelectedRequestKey,
  points,
  onSelect,
  onCoordinates,
  onSearchActiveChange,
  eventId,
  t,
  formatNumber,
}: {
  hidden: boolean;
  searchActive: boolean;
  selectedId: string | null;
  focusSelectedRequestKey: number;
  points: MappedCandidate[];
  onSelect: (id: string) => void;
  onCoordinates: (latitude: number, longitude: number) => void;
  onSearchActiveChange: (active: boolean) => void;
  eventId: EclipseEventId;
  t: Translate;
  formatNumber: (value: number) => string;
}) {
  const [query, setQuery] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [error, setError] = useState<string | null>(null);
  const explorerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const cataloguePoints = useMemo(
    () =>
      points.filter(
        ({ candidate }) => candidate.kind !== "user-selected",
      ),
    [points],
  );
  const visiblePoints = useMemo(() => {
    return cataloguePoints.filter(({ candidate }) => {
      if (normalizedQuery === "" && !candidate.defaultVisible) return false;
      const haystack = `${candidate.name} ${candidate.shortName} ${candidate.region}`
        .toLocaleLowerCase();
      return normalizedQuery === "" || haystack.includes(normalizedQuery);
    });
  }, [cataloguePoints, normalizedQuery]);

  useEffect(() => {
    if (hidden || focusSelectedRequestKey === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const buttons = explorerRef.current?.querySelectorAll<HTMLButtonElement>(
        ".place-list button[data-candidate-id]",
      );
      const selectedButton = [...(buttons ?? [])].find(
        (button) => button.dataset.candidateId === selectedId,
      );
      if (selectedButton) {
        selectedButton.focus();
      } else if (matchesStackedLayout()) {
        explorerRef.current?.focus();
      } else {
        searchInputRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusSelectedRequestKey, hidden, selectedId]);

  useEffect(() => {
    if (hidden && searchActive) {
      onSearchActiveChange(false);
    }
  }, [hidden, onSearchActiveChange, searchActive]);

  const closeSearch = () => {
    setQuery("");
    onSearchActiveChange(false);
    searchInputRef.current?.blur();
  };

  const activateSearch = () => {
    onSearchActiveChange(true);
  };

  const clearSearch = () => {
    setQuery("");
    searchInputRef.current?.focus();
  };

  const selectPoint = (id: string) => {
    onSearchActiveChange(false);
    searchInputRef.current?.blur();
    onSelect(id);
  };

  const submitCoordinates = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    if (
      latitude.trim() === "" ||
      longitude.trim() === "" ||
      !Number.isFinite(parsedLatitude) ||
      !Number.isFinite(parsedLongitude) ||
      parsedLatitude < -90 ||
      parsedLatitude > 90 ||
      parsedLongitude < -180 ||
      parsedLongitude > 180
    ) {
      setError(t("coordinates.invalid"));
      return;
    }
    setError(null);
    onCoordinates(parsedLatitude, parsedLongitude);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError(t("explore.locationUnsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setError(null);
        onCoordinates(coords.latitude, coords.longitude);
      },
      () => setError(t("explore.locationError")),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
    );
  };

  return (
    <div
      className="location-explorer"
      hidden={hidden}
      ref={explorerRef}
      role="region"
      aria-labelledby="location-explorer-title"
      tabIndex={-1}
    >
      <header className="explorer-heading">
        <h2 id="location-explorer-title">{t("explore.title")}</h2>
        <p>{t("explore.instruction")}</p>
      </header>

      <div className="place-search" role="search">
        <button
          className="place-search__back"
          type="button"
          aria-label={t("explore.closeSearch")}
          onClick={closeSearch}
        >
          <span aria-hidden="true">←</span>
        </button>
        <label className="place-search__field">
          <span className="sr-only">{t("explore.search")}</span>
          <input
            ref={searchInputRef}
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            spellCheck={false}
            value={query}
            placeholder={t("explore.search")}
            aria-controls="place-search-results"
            onFocus={activateSearch}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          className="place-search__clear"
          type="button"
          aria-label={t("explore.clearSearch")}
          hidden={!searchActive || query === ""}
          onClick={clearSearch}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div className="place-list-heading">
        <b>
          {t("explore.pointCount", {
            total: formatNumber(cataloguePoints.length),
            shown: formatNumber(visiblePoints.length),
          })}
        </b>
        <button type="button" onClick={useCurrentLocation}>
          {t("explore.useLocation")}
        </button>
      </div>

      <div className="place-list" id="place-search-results">
        {visiblePoints.map(({ candidate }) => (
          <button
            key={candidate.id}
            type="button"
            data-candidate-id={candidate.id}
            aria-current={selectedId === candidate.id ? "true" : undefined}
            onClick={() => selectPoint(candidate.id)}
          >
            <span
              className={`place-list__symbol place-list__symbol--${candidate.category}`}
              aria-hidden="true"
            />
            <span>
              <b>{searchActive ? candidate.name : candidate.shortName}</b>
              <small>{candidate.region}</small>
            </span>
            <em>
              {t(
                eventId !== "2026" && candidate.kind === "administrative-centre"
                  ? "explore.category.cityReference"
                  : categoryLabels[candidate.category],
              )}
            </em>
          </button>
        ))}
        {visiblePoints.length === 0 && <p>{t("explore.noResults")}</p>}
      </div>

      <details className="official-directories">
        <summary>{t("explore.officialDirectories")}</summary>
        <p>{t("explore.officialDirectoriesHelp")}</p>
        <div>
          {officialObservationDirectories.map((directory) => (
            <a
              key={directory.region}
              href={directory.url}
              target="_blank"
              rel="noreferrer"
            >
              <b>{directory.region}</b>
              <small>{directory.producer}</small>
            </a>
          ))}
        </div>
      </details>

      <form className="rail-coordinate-form" onSubmit={submitCoordinates}>
        <b>{t("explore.coordinates")}</b>
        <label>
          <span>{t("coordinates.latitude")}</span>
          <input
            inputMode="decimal"
            value={latitude}
            placeholder={t("coordinates.latitudeExample")}
            onChange={(event) => setLatitude(event.target.value)}
          />
        </label>
        <label>
          <span>{t("coordinates.longitude")}</span>
          <input
            inputMode="decimal"
            value={longitude}
            placeholder={t("coordinates.longitudeExample")}
            onChange={(event) => setLongitude(event.target.value)}
          />
        </label>
        <button type="submit">{t("coordinates.analyse")}</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </div>
  );
}
