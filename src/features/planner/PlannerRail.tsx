import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { CandidateCategory } from "../../data/candidates";
import type { EclipseEventId } from "../../domain/eclipse-events";
import type { MapViewSelection } from "../../data/map-view";
import type { MapBaseLayerId } from "../map/base-layers";
import { officialObservationDirectories } from "../../data/official-observation-directories";
import type { MessageKey, MessageValues } from "../../i18n/messages";
import type { MappedCandidate } from "../map/EclipseMap";
import { parseCoordinateSearch } from "./coordinate-search";
import {
  MINIMUM_PLACE_NAME_QUERY_LENGTH,
  resolvePlaceNameMatch,
  searchPlaceNames,
  type PlaceNameMatch,
} from "./place-name-search";
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

const baseLayerViews = [
  ["osm", "map.base.osmShort", "map.base.osm"],
  ["ign-mtn", "map.base.mtnShort", "map.base.mtn"],
  ["ign-pnoa", "map.base.pnoaShort", "map.base.pnoa"],
] as const satisfies readonly [MapBaseLayerId, MessageKey, MessageKey][];

const PLACE_NAME_SEARCH_DEBOUNCE_MILLISECONDS = 300;

// Layer identifiers published by the CartoCiudad geocoder, mapped to typed
// labels; the service is not consistent about capitalization.
function placeMatchCategoryKey(type: string): MessageKey {
  const normalized = type.toLocaleLowerCase("es");
  if (normalized === "poblacion") return "explore.geocoder.type.settlement";
  if (normalized === "municipio") return "explore.geocoder.type.municipality";
  if (normalized === "provincia") return "explore.geocoder.type.province";
  if (normalized === "toponimo" || normalized === "ngbe") {
    return "explore.geocoder.type.toponym";
  }
  return "explore.geocoder.type.place";
}

function placeMatchKey(match: PlaceNameMatch) {
  return `${match.type}:${match.id}`;
}

function placeMatchContext(match: PlaceNameMatch) {
  if (match.municipality === match.province) return match.province;
  return [match.municipality, match.province]
    .filter((value): value is string => value !== null)
    .join(" · ");
}

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
  baseLayer,
  onBaseLayerChange,
  eventId,
  t,
  headingId = "map-views-title",
}: {
  value: MapViewSelection;
  onChange: (selection: MapViewSelection) => void;
  baseLayer: MapBaseLayerId;
  onBaseLayerChange: (id: MapBaseLayerId) => void;
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
        <div className="rail-map-view-group">
          <span>{t("map.base.label")}</span>
          <div>
            {baseLayerViews.map(([id, shortKey, fullKey]) => (
              <button
                key={id}
                type="button"
                className={baseLayer === id ? "is-active" : ""}
                aria-pressed={baseLayer === id}
                aria-label={t(fullKey)}
                title={t(fullKey)}
                onClick={() => onBaseLayerChange(id)}
              >
                {t(shortKey)}
              </button>
            ))}
          </div>
        </div>
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
  searchPlaces = searchPlaceNames,
  resolvePlace = resolvePlaceNameMatch,
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
  searchPlaces?: typeof searchPlaceNames;
  resolvePlace?: typeof resolvePlaceNameMatch;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [placeAnswer, setPlaceAnswer] = useState<Readonly<{
    query: string;
    status: "ready" | "error";
    matches: readonly PlaceNameMatch[];
  }> | null>(null);
  const [resolvingPlaceKey, setResolvingPlaceKey] = useState<string | null>(
    null,
  );
  const explorerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const coordinateMatch = useMemo(
    () => parseCoordinateSearch(query),
    [query],
  );

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

  const goToCoordinateMatch = () => {
    if (!coordinateMatch) return;
    setError(null);
    onSearchActiveChange(false);
    searchInputRef.current?.blur();
    onCoordinates(coordinateMatch.latitude, coordinateMatch.longitude);
  };

  // A place-name lookup is only attempted for queries that are not
  // coordinates and reach the minimum length; anything else renders nothing.
  const eligiblePlaceQuery = useMemo(() => {
    if (coordinateMatch !== null) return null;
    const trimmed = query.trim();
    return trimmed.length >= MINIMUM_PLACE_NAME_QUERY_LENGTH ? trimmed : null;
  }, [coordinateMatch, query]);

  useEffect(() => {
    if (eligiblePlaceQuery === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchPlaces(eligiblePlaceQuery, controller.signal)
        .then((matches) => {
          if (controller.signal.aborted) return;
          setPlaceAnswer({
            query: eligiblePlaceQuery,
            status: "ready",
            matches,
          });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setPlaceAnswer({
            query: eligiblePlaceQuery,
            status: "error",
            matches: [],
          });
        });
    }, PLACE_NAME_SEARCH_DEBOUNCE_MILLISECONDS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [eligiblePlaceQuery, searchPlaces]);

  const placeStatus =
    eligiblePlaceQuery === null
      ? "idle"
      : placeAnswer !== null && placeAnswer.query === eligiblePlaceQuery
        ? placeAnswer.status
        : "loading";
  const placeMatches =
    placeStatus === "ready" && placeAnswer !== null ? placeAnswer.matches : [];

  const goToPlaceMatch = async (match: PlaceNameMatch) => {
    setResolvingPlaceKey(placeMatchKey(match));
    setError(null);
    try {
      const coordinate = await resolvePlace(match);
      if (coordinate === null) {
        setError(t("explore.geocoder.resolveError"));
        return;
      }
      onSearchActiveChange(false);
      searchInputRef.current?.blur();
      onCoordinates(coordinate.latitude, coordinate.longitude);
    } catch {
      setError(t("explore.geocoder.resolveError"));
    } finally {
      setResolvingPlaceKey(null);
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && coordinateMatch) {
      event.preventDefault();
      goToCoordinateMatch();
    }
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
            onKeyDown={handleSearchKeyDown}
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

      {error && (
        <p className="explorer-alert" role="alert">
          {error}
        </p>
      )}

      <div className="place-list" id="place-search-results">
        {coordinateMatch && (
          <button
            type="button"
            className="place-list__coordinate"
            onClick={goToCoordinateMatch}
          >
            <span
              className="place-list__symbol place-list__symbol--custom"
              aria-hidden="true"
            />
            <span>
              <b>{t("explore.goToCoordinates")}</b>
              <small>{`${coordinateMatch.latitude}, ${coordinateMatch.longitude}`}</small>
            </span>
            <em>{t("explore.category.custom")}</em>
          </button>
        )}
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
        {visiblePoints.length === 0 && !coordinateMatch && (
          <p>{t("explore.noResults")}</p>
        )}
        {placeStatus !== "idle" && (
          <>
            <h3 className="place-list__section-heading">
              {t("explore.geocoder.heading")}
            </h3>
            {placeStatus === "loading" && (
              <p role="status">{t("explore.geocoder.loading")}</p>
            )}
            {placeStatus === "error" && (
              <p role="alert">{t("explore.geocoder.error")}</p>
            )}
            {placeStatus === "ready" && placeMatches.length === 0 && (
              <p>{t("explore.geocoder.noResults")}</p>
            )}
            {placeStatus === "ready" &&
              placeMatches.map((match) => {
                const context = placeMatchContext(match);
                return (
                  <button
                    key={placeMatchKey(match)}
                    type="button"
                    disabled={resolvingPlaceKey !== null}
                    aria-busy={
                      resolvingPlaceKey === placeMatchKey(match) || undefined
                    }
                    onClick={() => void goToPlaceMatch(match)}
                  >
                    <span
                      className="place-list__symbol place-list__symbol--custom"
                      aria-hidden="true"
                    />
                    <span>
                      <b>{match.name}</b>
                      {context !== null && context !== "" && (
                        <small>{context}</small>
                      )}
                    </span>
                    <em>{t(placeMatchCategoryKey(match.type))}</em>
                  </button>
                );
              })}
            <p className="place-list__attribution">
              {t("explore.geocoder.attribution")}
            </p>
          </>
        )}
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
    </div>
  );
}
