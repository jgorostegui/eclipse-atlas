import {
  candidates,
  formatCustomCoordinate,
} from "../data/candidates";
import {
  isAtmosphereMapView,
  mapViewSelectionIds,
  type MapViewSelection,
} from "../data/map-view";
import { isSupportedTerrainCoordinate } from "../domain/terrain-horizon";
import {
  DEFAULT_ECLIPSE_EVENT_ID,
  eclipseEvent,
  eclipseEventIds,
  isEclipseEventId,
  type EclipseEventId,
} from "../domain/eclipse-events";
import { supportedLocales, type Locale } from "../i18n/messages";

export const PLANNER_URL_STATE_VERSION = 1 as const;
export const MAX_COMPARISON_POINTS = 3;

const BUILT_IN_CANDIDATE_IDS = new Set(
  candidates.map((candidate) => candidate.id),
);
const BUILT_IN_CANDIDATE_ID_BY_LOWERCASE = new Map(
  candidates.map((candidate) => [candidate.id.toLowerCase(), candidate.id]),
);
const SUPPORTED_LOCALES = new Set<string>(supportedLocales);
const SUPPORTED_LAYERS = new Set<string>([
  "none",
  ...mapViewSelectionIds,
]);
const SCALAR_PARAMETERS = [
  "state",
  "lang",
  "event",
  "selected",
  "layer",
] as const;
const PLANNER_PARAMETERS = [
  ...SCALAR_PARAMETERS,
  "compare",
] as const satisfies readonly PlannerUrlParameter[];
const DECIMAL_COORDINATE = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
const PLANNER_DATE_TIME_ZONE = "Europe/Madrid";

export type PlaceLocationReference = Readonly<{
  kind: "place";
  id: string;
}>;

export type GeoLocationReference = Readonly<{
  kind: "geo";
  latitude: number;
  longitude: number;
}>;

export type PlannerLocationReference =
  | PlaceLocationReference
  | GeoLocationReference;

export type PlannerUrlStateV1 = Readonly<{
  version: typeof PLANNER_URL_STATE_VERSION;
  locale: Locale | null;
  eventId: EclipseEventId;
  selected: PlannerLocationReference | null;
  compared: readonly PlannerLocationReference[];
  layer: MapViewSelection;
}>;

export type PlannerUrlParameter =
  | "state"
  | "lang"
  | "event"
  | "selected"
  | "compare"
  | "layer";

export type PlannerUrlIssueCode =
  | "duplicate-parameter"
  | "missing-state-version"
  | "invalid-state-version"
  | "invalid-locale"
  | "invalid-event"
  | "invalid-reference-format"
  | "unknown-place-reference"
  | "invalid-coordinate-reference"
  | "unsupported-coordinate"
  | "invalid-layer"
  | "duplicate-comparison"
  | "comparison-limit-exceeded";

export type PlannerUrlIssue = Readonly<{
  code: PlannerUrlIssueCode;
  parameter: PlannerUrlParameter;
  value: string | null;
  index?: number;
}>;

export type PlannerUrlParseResult = Readonly<{
  state: PlannerUrlStateV1;
  issues: readonly PlannerUrlIssue[];
  plannerStateApplied: boolean;
}>;

type PlannerUrlInput = URL | URLSearchParams;

function inputSearchParams(input: PlannerUrlInput) {
  return input instanceof URL ? input.searchParams : input;
}

function normalizedCoordinate(value: number) {
  const rounded = Number(formatCustomCoordinate(value));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formattedCoordinate(value: number) {
  return formatCustomCoordinate(value);
}

function isLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.has(value);
}

function isLayer(value: string): value is MapViewSelection {
  return SUPPORTED_LAYERS.has(value);
}

function scalarParameter(
  parameters: URLSearchParams,
  parameter: (typeof SCALAR_PARAMETERS)[number],
  issues: PlannerUrlIssue[],
) {
  const values = parameters.getAll(parameter);
  if (values.length > 1) {
    issues.push({
      code: "duplicate-parameter",
      parameter,
      value: values[1] ?? null,
      index: 1,
    });
  }
  return values[0] ?? null;
}

function calendarDateKeyInPlannerTimeZone(date: Date) {
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("Planner date must be valid.");
  }
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone: PLANNER_DATE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return value("year") * 10_000 + value("month") * 100 + value("day");
}

/**
 * Selects the next event by Spain's civil date. The event remains current for
 * its whole calendar day and advances at midnight on the following day.
 */
export function defaultPlannerEclipseEventId(
  now: Date = new Date(),
): EclipseEventId {
  const today = calendarDateKeyInPlannerTimeZone(now);
  return (
    eclipseEventIds.find((eventId) => {
      const event = eclipseEvent(eventId);
      return event.year * 10_000 + (event.monthIndex + 1) * 100 + event.day >= today;
    }) ?? eclipseEventIds.at(-1)!
  );
}

function safeDefaultState(locale: Locale | null): PlannerUrlStateV1 {
  return {
    version: PLANNER_URL_STATE_VERSION,
    locale,
    eventId: defaultPlannerEclipseEventId(),
    selected: null,
    compared: [],
    layer: "totality-duration",
  };
}

function referenceIssue(
  issues: PlannerUrlIssue[],
  code: PlannerUrlIssueCode,
  parameter: "selected" | "compare",
  value: string,
  index?: number,
) {
  issues.push({ code, parameter, value, ...(index === undefined ? {} : { index }) });
}

function parseLocationReference(
  value: string,
  parameter: "selected" | "compare",
  issues: PlannerUrlIssue[],
  index?: number,
): PlannerLocationReference | null {
  if (value.startsWith("place:")) {
    const id = value.slice("place:".length);
    const canonicalId = BUILT_IN_CANDIDATE_ID_BY_LOWERCASE.get(
      id.toLowerCase(),
    );
    if (!canonicalId) {
      referenceIssue(
        issues,
        "unknown-place-reference",
        parameter,
        value,
        index,
      );
      return null;
    }
    return { kind: "place", id: canonicalId };
  }

  if (!value.startsWith("geo:")) {
    referenceIssue(
      issues,
      "invalid-reference-format",
      parameter,
      value,
      index,
    );
    return null;
  }

  const coordinateText = value.slice("geo:".length);
  const parts = coordinateText.split(",");
  if (
    parts.length !== 2 ||
    !DECIMAL_COORDINATE.test(parts[0] ?? "") ||
    !DECIMAL_COORDINATE.test(parts[1] ?? "")
  ) {
    referenceIssue(
      issues,
      "invalid-coordinate-reference",
      parameter,
      value,
      index,
    );
    return null;
  }

  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !isSupportedTerrainCoordinate(latitude, longitude)
  ) {
    referenceIssue(
      issues,
      "unsupported-coordinate",
      parameter,
      value,
      index,
    );
    return null;
  }

  const normalizedLatitude = normalizedCoordinate(latitude);
  const normalizedLongitude = normalizedCoordinate(longitude);
  if (
    !isSupportedTerrainCoordinate(normalizedLatitude, normalizedLongitude)
  ) {
    referenceIssue(
      issues,
      "unsupported-coordinate",
      parameter,
      value,
      index,
    );
    return null;
  }

  return {
    kind: "geo",
    latitude: normalizedLatitude,
    longitude: normalizedLongitude,
  };
}

function assertKnownPlace(id: string) {
  if (!BUILT_IN_CANDIDATE_IDS.has(id)) {
    throw new RangeError(`Unknown built-in candidate reference: ${id}.`);
  }
}

export function createGeoLocationReference(
  latitude: number,
  longitude: number,
): GeoLocationReference {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !isSupportedTerrainCoordinate(latitude, longitude)
  ) {
    throw new RangeError(
      "Custom coordinates must be inside a configured terrain request envelope.",
    );
  }

  const normalizedLatitude = normalizedCoordinate(latitude);
  const normalizedLongitude = normalizedCoordinate(longitude);
  if (
    !isSupportedTerrainCoordinate(normalizedLatitude, normalizedLongitude)
  ) {
    throw new RangeError(
      "Normalized custom coordinates must remain inside a configured terrain request envelope.",
    );
  }

  return {
    kind: "geo",
    latitude: normalizedLatitude,
    longitude: normalizedLongitude,
  };
}

export function plannerLocationReferenceKey(
  reference: PlannerLocationReference,
) {
  if (reference.kind === "place") {
    assertKnownPlace(reference.id);
    return `place:${reference.id}`;
  }

  const normalized = createGeoLocationReference(
    reference.latitude,
    reference.longitude,
  );
  return `geo:${formattedCoordinate(normalized.latitude)},${formattedCoordinate(normalized.longitude)}`;
}

export function customCandidateId(latitude: number, longitude: number) {
  const reference = createGeoLocationReference(latitude, longitude);
  return `custom:${formattedCoordinate(reference.latitude)},${formattedCoordinate(reference.longitude)}`;
}

export function parsePlannerUrl(input: PlannerUrlInput): PlannerUrlParseResult {
  const parameters = inputSearchParams(input);
  const issues: PlannerUrlIssue[] = [];
  const rawLocale = scalarParameter(parameters, "lang", issues);
  let locale: Locale | null = null;
  if (rawLocale !== null) {
    if (isLocale(rawLocale)) {
      locale = rawLocale;
    } else {
      issues.push({
        code: "invalid-locale",
        parameter: "lang",
        value: rawLocale,
      });
    }
  }

  const rawVersion = scalarParameter(parameters, "state", issues);
  if (rawVersion === null) {
    const hasVersionedPlannerState = ["event", "selected", "compare", "layer"].some(
      (parameter) => parameters.has(parameter),
    );
    if (hasVersionedPlannerState) {
      issues.push({
        code: "missing-state-version",
        parameter: "state",
        value: null,
      });
    }
    return {
      state: safeDefaultState(locale),
      issues,
      plannerStateApplied: false,
    };
  }

  if (rawVersion !== String(PLANNER_URL_STATE_VERSION)) {
    issues.push({
      code: "invalid-state-version",
      parameter: "state",
      value: rawVersion,
    });
    return {
      state: safeDefaultState(locale),
      issues,
      plannerStateApplied: false,
    };
  }

  const rawEvent = scalarParameter(parameters, "event", issues);
  let eventId: EclipseEventId = DEFAULT_ECLIPSE_EVENT_ID;
  if (rawEvent !== null) {
    if (isEclipseEventId(rawEvent)) {
      eventId = rawEvent;
    } else {
      issues.push({
        code: "invalid-event",
        parameter: "event",
        value: rawEvent,
      });
    }
  }

  const rawSelected = scalarParameter(parameters, "selected", issues);
  const selected =
    rawSelected === null
      ? null
      : parseLocationReference(rawSelected, "selected", issues);

  const compared: PlannerLocationReference[] = [];
  const comparisonKeys = new Set<string>();
  for (const [index, rawReference] of parameters.getAll("compare").entries()) {
    const reference = parseLocationReference(
      rawReference,
      "compare",
      issues,
      index,
    );
    if (!reference) continue;

    const key = plannerLocationReferenceKey(reference);
    if (comparisonKeys.has(key)) {
      issues.push({
        code: "duplicate-comparison",
        parameter: "compare",
        value: rawReference,
        index,
      });
      continue;
    }
    if (compared.length >= MAX_COMPARISON_POINTS) {
      issues.push({
        code: "comparison-limit-exceeded",
        parameter: "compare",
        value: rawReference,
        index,
      });
      continue;
    }

    comparisonKeys.add(key);
    compared.push(reference);
  }

  const rawLayer = scalarParameter(parameters, "layer", issues);
  let layer: MapViewSelection = "none";
  if (rawLayer !== null) {
    if (isLayer(rawLayer)) {
      layer = rawLayer;
    } else {
      issues.push({
        code: "invalid-layer",
        parameter: "layer",
        value: rawLayer,
      });
    }
  }
  if (eventId !== "2026" && isAtmosphereMapView(layer)) {
    issues.push({
      code: "invalid-layer",
      parameter: "layer",
      value: layer,
    });
    layer = "totality-duration";
  }

  return {
    state: {
      version: PLANNER_URL_STATE_VERSION,
      locale,
      eventId,
      selected,
      compared,
      layer,
    },
    issues,
    plannerStateApplied: true,
  };
}

function assertSerializableState(state: PlannerUrlStateV1) {
  if (state.version !== PLANNER_URL_STATE_VERSION) {
    throw new RangeError(
      `Unsupported planner URL state version: ${String(state.version)}.`,
    );
  }
  if (state.locale !== null && !isLocale(state.locale)) {
    throw new RangeError(`Unsupported planner locale: ${String(state.locale)}.`);
  }
  if (!isEclipseEventId(state.eventId)) {
    throw new RangeError(`Unsupported eclipse event: ${String(state.eventId)}.`);
  }
  if (!isLayer(state.layer)) {
    throw new RangeError(`Unsupported map view: ${String(state.layer)}.`);
  }
  if (state.eventId !== "2026" && isAtmosphereMapView(state.layer)) {
    throw new RangeError("Atmosphere map views are only available for the 2026 event.");
  }
  if (state.compared.length > MAX_COMPARISON_POINTS) {
    throw new RangeError(
      `A planner URL can compare at most ${MAX_COMPARISON_POINTS} points.`,
    );
  }

  const comparisonKeys = new Set<string>();
  for (const reference of state.compared) {
    const key = plannerLocationReferenceKey(reference);
    if (comparisonKeys.has(key)) {
      throw new RangeError(`Duplicate comparison reference: ${key}.`);
    }
    comparisonKeys.add(key);
  }
  if (state.selected) plannerLocationReferenceKey(state.selected);
}

export function serializePlannerUrl(
  baseUrl: string | URL,
  state: PlannerUrlStateV1,
) {
  assertSerializableState(state);
  const url = new URL(typeof baseUrl === "string" ? baseUrl : baseUrl.href);

  for (const parameter of PLANNER_PARAMETERS) {
    url.searchParams.delete(parameter);
  }
  url.searchParams.append("state", String(PLANNER_URL_STATE_VERSION));
  if (state.locale !== null) url.searchParams.append("lang", state.locale);
  url.searchParams.append("event", state.eventId);
  if (state.selected) {
    url.searchParams.append(
      "selected",
      plannerLocationReferenceKey(state.selected),
    );
  }
  for (const reference of state.compared) {
    url.searchParams.append("compare", plannerLocationReferenceKey(reference));
  }
  url.searchParams.append("layer", state.layer);

  return url;
}
