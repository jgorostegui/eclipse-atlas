import {
  DEFAULT_ECLIPSE_EVENT_ID,
  ECLIPSE_2026_BESSELIAN_ELEMENTS,
  ECLIPSE_2027_BESSELIAN_ELEMENTS,
  ECLIPSE_2028_BESSELIAN_ELEMENTS,
  eclipseEvent,
  type EclipseEvent,
  type EclipseEventId,
} from "./eclipse-events.ts";

export {
  ECLIPSE_2026_BESSELIAN_ELEMENTS,
  ECLIPSE_2027_BESSELIAN_ELEMENTS,
  ECLIPSE_2028_BESSELIAN_ELEMENTS,
};

const DEGREES_TO_RADIANS = Math.PI / 180;
const EARTH_EQUATORIAL_RADIUS_METRES = 6_378_137;
const GEOCENTRIC_LATITUDE_FACTOR = 0.996647189335;
const DELTA_T_TO_RADIANS_DIVISOR = 13_713.440924999626;
const ROOT_TOLERANCE_HOURS = 1e-10;

type LocalGeometry = {
  distance: number;
  penumbraRadius: number;
  umbraRadius: number;
  distanceDerivative: number;
};

export type BesselianEclipseCircumstances = {
  kind: "total" | "partial" | "annular";
  magnitude: number;
  obscuration: number;
  partialBegin: Date;
  totalBegin: Date | null;
  maximum: Date;
  totalEnd: Date | null;
  partialEnd: Date;
  totalityDurationSeconds: number | null;
};

function polynomial(coefficients: readonly number[], hours: number) {
  return coefficients.reduce(
    (value, coefficient, degree) => value + coefficient * hours ** degree,
    0,
  );
}

function polynomialDerivative(
  coefficients: readonly number[],
  hours: number,
) {
  return coefficients.reduce(
    (value, coefficient, degree) =>
      degree === 0
        ? value
        : value + degree * coefficient * hours ** (degree - 1),
    0,
  );
}

function localGeometry(
  event: EclipseEvent,
  hours: number,
  latitudeDegrees: number,
  longitudeDegrees: number,
  observerElevationMetres: number,
): LocalGeometry {
  const elements = event.besselian;
  const latitude = latitudeDegrees * DEGREES_TO_RADIANS;
  const westLongitude = -longitudeDegrees * DEGREES_TO_RADIANS;
  const reducedLatitude = Math.atan(
    GEOCENTRIC_LATITUDE_FACTOR * Math.tan(latitude),
  );
  const altitudeRatio =
    observerElevationMetres / EARTH_EQUATORIAL_RADIUS_METRES;
  const rhoSinLatitude =
    GEOCENTRIC_LATITUDE_FACTOR * Math.sin(reducedLatitude) +
    altitudeRatio * Math.sin(latitude);
  const rhoCosLatitude =
    Math.cos(reducedLatitude) + altitudeRatio * Math.cos(latitude);
  const declination =
    polynomial(elements.declinationDegrees, hours) * DEGREES_TO_RADIANS;
  const declinationDerivative =
    polynomialDerivative(elements.declinationDegrees, hours) *
    DEGREES_TO_RADIANS;
  const mu = polynomial(elements.muDegrees, hours) * DEGREES_TO_RADIANS;
  const muDerivative =
    polynomialDerivative(elements.muDegrees, hours) * DEGREES_TO_RADIANS;
  const hourAngle =
    mu -
    westLongitude -
    event.timeScale.deltaTSeconds / DELTA_T_TO_RADIANS_DIVISOR;
  const sinHourAngle = Math.sin(hourAngle);
  const cosHourAngle = Math.cos(hourAngle);
  const sinDeclination = Math.sin(declination);
  const cosDeclination = Math.cos(declination);
  const xi = rhoCosLatitude * sinHourAngle;
  const eta =
    rhoSinLatitude * cosDeclination -
    rhoCosLatitude * cosHourAngle * sinDeclination;
  const zeta =
    rhoSinLatitude * sinDeclination +
    rhoCosLatitude * cosHourAngle * cosDeclination;
  const xiDerivative = muDerivative * rhoCosLatitude * cosHourAngle;
  const etaDerivative =
    muDerivative * xi * sinDeclination - zeta * declinationDerivative;
  const u = polynomial(elements.x, hours) - xi;
  const v = polynomial(elements.y, hours) - eta;
  const a = polynomialDerivative(elements.x, hours) - xiDerivative;
  const b = polynomialDerivative(elements.y, hours) - etaDerivative;

  return {
    distance: Math.hypot(u, v),
    penumbraRadius:
      polynomial(elements.penumbraRadius, hours) -
      zeta * elements.tanPenumbraConeAngle,
    umbraRadius:
      polynomial(elements.umbraRadius, hours) -
      zeta * elements.tanUmbraConeAngle,
    distanceDerivative: u * a + v * b,
  };
}

function bisectRoot(
  evaluate: (hours: number) => number,
  minimumHours: number,
  maximumHours: number,
) {
  let lower = minimumHours;
  let upper = maximumHours;
  let lowerValue = evaluate(lower);
  const upperValue = evaluate(upper);
  if (!Number.isFinite(lowerValue) || !Number.isFinite(upperValue)) {
    throw new RangeError("Besselian root inputs must be finite.");
  }
  if (lowerValue === 0) return lower;
  if (upperValue === 0) return upper;
  if (lowerValue * upperValue > 0) return null;

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    const midpointValue = evaluate(midpoint);
    if (
      Math.abs(midpointValue) < 1e-13 ||
      upper - lower < ROOT_TOLERANCE_HOURS
    ) {
      return midpoint;
    }
    if (lowerValue * midpointValue <= 0) {
      upper = midpoint;
    } else {
      lower = midpoint;
      lowerValue = midpointValue;
    }
  }
  return (lower + upper) / 2;
}

function eventDate(event: EclipseEvent, hoursFromT0: number) {
  const utcHours =
    event.besselian.referenceTdtHours +
    hoursFromT0 -
    event.timeScale.ttMinusUtcSeconds / 3_600;
  return new Date(
    Date.UTC(event.year, event.monthIndex, event.day) + utcHours * 3_600_000,
  );
}

function clampUnit(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function magnitudeAtMaximum(geometry: LocalGeometry) {
  return (
    (geometry.penumbraRadius - geometry.distance) /
    (geometry.penumbraRadius + geometry.umbraRadius)
  );
}

function obscurationAtMaximum(
  geometry: LocalGeometry,
  kind: BesselianEclipseCircumstances["kind"],
) {
  const l1 = geometry.penumbraRadius;
  const l2 = geometry.umbraRadius;
  const separation = geometry.distance;
  const magnitude = (l1 - separation) / (l1 + l2);
  const radiusRatio = (l1 - l2) / (l1 + l2);
  if (magnitude <= 0) return 0;
  if (kind === "total" || magnitude >= 1) return 1;
  if (kind === "annular") return Math.min(1, radiusRatio ** 2);

  const c = Math.acos(
    clampUnit(
      (l1 ** 2 + l2 ** 2 - 2 * separation ** 2) /
        (l1 ** 2 - l2 ** 2),
    ),
  );
  const b = Math.acos(
    clampUnit(
      (l1 * l2 + separation ** 2) /
        (separation * (l1 + l2)),
    ),
  );
  const a = Math.PI - b - c;
  return Math.max(
    0,
    Math.min(
      1,
      (radiusRatio ** 2 * a + b - radiusRatio * Math.sin(c)) / Math.PI,
    ),
  );
}

export function calculateBesselianEclipseCircumstances(
  latitudeDegrees: number,
  longitudeDegrees: number,
  observerElevationMetres: number,
  eventId: EclipseEventId = DEFAULT_ECLIPSE_EVENT_ID,
): BesselianEclipseCircumstances | null {
  if (
    !Number.isFinite(latitudeDegrees) ||
    latitudeDegrees < -90 ||
    latitudeDegrees > 90 ||
    !Number.isFinite(longitudeDegrees) ||
    longitudeDegrees < -180 ||
    longitudeDegrees > 180 ||
    !Number.isFinite(observerElevationMetres) ||
    observerElevationMetres < -500 ||
    observerElevationMetres > 12_000
  ) {
    throw new RangeError("Invalid observer input for Besselian circumstances.");
  }

  const event = eclipseEvent(eventId);
  const searchMinimumHours =
    event.besselian.validityStartTdtHours -
    event.besselian.referenceTdtHours;
  const searchMaximumHours =
    event.localCircumstancesSearchEndTdtHours -
    event.besselian.referenceTdtHours;
  const geometry = (hours: number) =>
    localGeometry(
      event,
      hours,
      latitudeDegrees,
      longitudeDegrees,
      observerElevationMetres,
    );
  const maximumHours = bisectRoot(
    (hours) => geometry(hours).distanceDerivative,
    searchMinimumHours,
    searchMaximumHours,
  );
  if (maximumHours === null) return null;
  const maximumGeometry = geometry(maximumHours);
  const externalContact = (hours: number) => {
    const value = geometry(hours);
    return value.distance - value.penumbraRadius;
  };
  if (externalContact(maximumHours) >= 0) return null;
  const partialBeginHours = bisectRoot(
    externalContact,
    searchMinimumHours,
    maximumHours,
  );
  const partialEndHours = bisectRoot(
    externalContact,
    maximumHours,
    searchMaximumHours,
  );
  if (partialBeginHours === null || partialEndHours === null) return null;

  const internalContact = (hours: number) => {
    const value = geometry(hours);
    return value.distance - Math.abs(value.umbraRadius);
  };
  const hasCentralPhase = internalContact(maximumHours) < 0;
  const totalBeginHours = hasCentralPhase
    ? bisectRoot(internalContact, partialBeginHours, maximumHours)
    : null;
  const totalEndHours = hasCentralPhase
    ? bisectRoot(internalContact, maximumHours, partialEndHours)
    : null;
  const kind =
    totalBeginHours === null || totalEndHours === null
      ? "partial"
      : maximumGeometry.umbraRadius < 0
        ? "total"
        : "annular";
  const totalityDurationSeconds =
    kind !== "partial" && totalBeginHours !== null && totalEndHours !== null
      ? (totalEndHours - totalBeginHours) * 3_600
      : null;

  return {
    kind,
    magnitude: magnitudeAtMaximum(maximumGeometry),
    obscuration: obscurationAtMaximum(maximumGeometry, kind),
    partialBegin: eventDate(event, partialBeginHours),
    totalBegin:
      totalBeginHours === null ? null : eventDate(event, totalBeginHours),
    maximum: eventDate(event, maximumHours),
    totalEnd:
      totalEndHours === null ? null : eventDate(event, totalEndHours),
    partialEnd: eventDate(event, partialEndHours),
    totalityDurationSeconds,
  };
}
