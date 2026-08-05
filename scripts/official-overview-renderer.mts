export const OFFICIAL_OVERVIEW_NODATA = -1000;
export const OBSCURATION_RENDER_TOLERANCE_FRACTION = 0.00002;

export const ALTITUDE_STOPS = [
  "#27324d",
  "#4c5d76",
  "#827370",
  "#d28a5f",
  "#ffd27a",
] as const;

export const OBSCURATION_STOPS = [
  "#eadcf3",
  "#c9a4d5",
  "#a66aae",
  "#7c3f82",
  "#4b214f",
] as const;

export const DURATION_STOPS = [
  "#ffe8c7",
  "#f6b47b",
  "#e77a5f",
  "#bb3f51",
  "#6f1d3c",
] as const;

export type Rgba = readonly [number, number, number, number];

function hexToRgb(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

export function colourForPhysicalValue(
  value: number,
  minimum: number,
  maximum: number,
  stops: readonly string[] = ALTITUDE_STOPS,
): readonly [number, number, number] {
  if (!Number.isFinite(value) || maximum <= minimum || stops.length < 2) {
    throw new RangeError("Colour scale input is invalid.");
  }
  const normalised = Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum)));
  const position = normalised * (stops.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(stops.length - 1, lowerIndex + 1);
  const fraction = position - lowerIndex;
  const lower = hexToRgb(stops[lowerIndex]);
  const upper = hexToRgb(stops[upperIndex]);
  return [
    Math.round(lower[0] + (upper[0] - lower[0]) * fraction),
    Math.round(lower[1] + (upper[1] - lower[1]) * fraction),
    Math.round(lower[2] + (upper[2] - lower[2]) * fraction),
  ];
}

function observableMaximum(maximumUtcHours: number, sunsetUtcHours: number) {
  if (
    maximumUtcHours === OFFICIAL_OVERVIEW_NODATA ||
    sunsetUtcHours === OFFICIAL_OVERVIEW_NODATA
  ) {
    return false;
  }
  if (
    !Number.isFinite(maximumUtcHours) ||
    !Number.isFinite(sunsetUtcHours) ||
    maximumUtcHours < 0 ||
    maximumUtcHours > 24 ||
    sunsetUtcHours < 0 ||
    sunsetUtcHours > 24
  ) {
    throw new RangeError("Official event time is outside decimal UTC hours.");
  }
  return maximumUtcHours <= sunsetUtcHours;
}

export function renderSolarAltitudePixel(
  altitudeDegrees: number,
  maximumUtcHours: number,
  sunsetUtcHours: number,
  domainMaximumDegrees = 25,
): Rgba {
  if (altitudeDegrees === OFFICIAL_OVERVIEW_NODATA) return [0, 0, 0, 0];
  if (!Number.isFinite(altitudeDegrees) || altitudeDegrees < -90 || altitudeDegrees > 90) {
    throw new RangeError("Official solar altitude is outside [-90, 90] degrees.");
  }
  if (!observableMaximum(maximumUtcHours, sunsetUtcHours)) return [0, 0, 0, 0];
  if (altitudeDegrees < 0) return [0, 0, 0, 0];
  return [
    ...colourForPhysicalValue(
      altitudeDegrees,
      0,
      domainMaximumDegrees,
      ALTITUDE_STOPS,
    ),
    210,
  ];
}

export function renderMaximumObscurationPixel(
  obscurationFraction: number,
  maximumUtcHours: number,
  sunsetUtcHours: number,
  domainMinimumFraction = 0.8,
): Rgba {
  if (obscurationFraction === OFFICIAL_OVERVIEW_NODATA) return [0, 0, 0, 0];
  const normalised = normaliseObscurationForColour(obscurationFraction);
  if (!observableMaximum(maximumUtcHours, sunsetUtcHours)) return [0, 0, 0, 0];
  if (
    !Number.isFinite(domainMinimumFraction) ||
    domainMinimumFraction < 0 ||
    domainMinimumFraction >= 1
  ) {
    throw new RangeError("Official obscuration colour domain is invalid.");
  }
  if (normalised.colourFraction < domainMinimumFraction) return [0, 0, 0, 0];
  return [
    ...colourForPhysicalValue(
      normalised.colourFraction,
      domainMinimumFraction,
      1,
      OBSCURATION_STOPS,
    ),
    210,
  ];
}

export function renderTotalityDurationBandPixel(
  minimumSeconds: number,
  maximumSeconds: number,
  domainMaximumSeconds = 123,
): Rgba {
  if (
    !Number.isFinite(minimumSeconds) ||
    !Number.isFinite(maximumSeconds) ||
    minimumSeconds < 0 ||
    maximumSeconds <= minimumSeconds ||
    !Number.isFinite(domainMaximumSeconds) ||
    domainMaximumSeconds <= 0 ||
    maximumSeconds > domainMaximumSeconds
  ) {
    throw new RangeError("Official central-phase duration band is outside its declared domain.");
  }
  const midpointSeconds = (minimumSeconds + maximumSeconds) / 2;
  return [
    ...colourForPhysicalValue(
      midpointSeconds,
      0,
      domainMaximumSeconds,
      DURATION_STOPS,
    ),
    220,
  ];
}

export function normaliseObscurationForColour(obscurationFraction: number) {
  if (
    !Number.isFinite(obscurationFraction) ||
    obscurationFraction < -OBSCURATION_RENDER_TOLERANCE_FRACTION ||
    obscurationFraction > 1 + OBSCURATION_RENDER_TOLERANCE_FRACTION
  ) {
    throw new RangeError(
      "Official obscuration is outside the versioned render tolerance.",
    );
  }
  const colourFraction = Math.min(1, Math.max(0, obscurationFraction));
  return {
    rawFraction: obscurationFraction,
    colourFraction,
    clamped: colourFraction !== obscurationFraction,
  };
}
