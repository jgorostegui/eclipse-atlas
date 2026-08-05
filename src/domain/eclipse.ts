import * as Astronomy from "./astronomy.ts";
import { calculateBesselianEclipseCircumstances } from "./besselian-eclipse.ts";
import {
  DEFAULT_ECLIPSE_EVENT_ID,
  eclipseEvent,
  type EclipseEventId,
} from "./eclipse-events.ts";
import {
  resolveObserverElevation,
  type ObserverElevationInput,
} from "./observer.ts";

export const TARGET_ECLIPSE_DATE = "2026-08-12";
export const NOMINAL_SOLAR_RADIUS_KILOMETRES = 695_700;
export const NOMINAL_LUNAR_RADIUS_KILOMETRES = 1_737.4;

export type EclipseAnimationSample = {
  time: Date;
  sunAltitudeDegrees: number;
  sunAzimuthDegrees: number;
  sunAngularRadiusDegrees: number;
  moonAltitudeDegrees: number;
  moonAzimuthDegrees: number;
  moonAngularRadiusDegrees: number;
};

function interpolateAngleDegrees(start: number, end: number, fraction: number) {
  const difference = ((end - start + 540) % 360) - 180;
  return (start + difference * fraction + 360) % 360;
}

export function interpolateEclipseAnimationSample(
  track: EclipseAnimationSample[],
  fraction: number,
): EclipseAnimationSample {
  if (track.length < 2) {
    throw new RangeError("Animation interpolation requires at least two samples.");
  }
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new RangeError("Animation fraction must be between 0 and 1.");
  }
  const position = fraction * (track.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(track.length - 1, Math.ceil(position));
  const lower = track[lowerIndex];
  const upper = track[upperIndex];
  const localFraction = position - lowerIndex;
  const interpolate = (start: number, end: number) =>
    start + (end - start) * localFraction;

  return {
    time: new Date(
      Math.round(
        track[0].time.getTime() +
          (track.at(-1)!.time.getTime() - track[0].time.getTime()) * fraction,
      ),
    ),
    sunAltitudeDegrees: interpolate(
      lower.sunAltitudeDegrees,
      upper.sunAltitudeDegrees,
    ),
    sunAzimuthDegrees: interpolateAngleDegrees(
      lower.sunAzimuthDegrees,
      upper.sunAzimuthDegrees,
      localFraction,
    ),
    sunAngularRadiusDegrees: interpolate(
      lower.sunAngularRadiusDegrees,
      upper.sunAngularRadiusDegrees,
    ),
    moonAltitudeDegrees: interpolate(
      lower.moonAltitudeDegrees,
      upper.moonAltitudeDegrees,
    ),
    moonAzimuthDegrees: interpolateAngleDegrees(
      lower.moonAzimuthDegrees,
      upper.moonAzimuthDegrees,
      localFraction,
    ),
    moonAngularRadiusDegrees: interpolate(
      lower.moonAngularRadiusDegrees,
      upper.moonAngularRadiusDegrees,
    ),
  };
}

export type EclipseContact = {
  time: Date;
  apparentSolarCentreAltitudeDegrees: number;
  aboveApparentHorizon: boolean;
};

export type EclipseCircumstances = {
  eventId: EclipseEventId;
  kind: "total" | "partial" | "annular";
  magnitude: number;
  obscuration: number;
  partialBegin: Date;
  totalBegin: Date | null;
  peak: Date;
  totalEnd: Date | null;
  partialEnd: Date;
  idealHorizonSunset: Date | null;
  totalityDurationSeconds: number | null;
  sunAltitudeDegrees: number;
  sunAzimuthDegrees: number;
  solarAngularRadiusDegrees: number;
  groundElevationMetres: number;
  viewpointHeightAboveGroundMetres: number;
  observerElevationMetres: number;
  contacts: {
    c1: EclipseContact;
    c2: EclipseContact | null;
    maximum: EclipseContact;
    c3: EclipseContact | null;
    c4: EclipseContact;
  };
  calculationEngine:
    | "NASA/GSFC Besselian elements + IERS Bulletin A"
    | "NASA/GSFC Besselian elements + NASA/GSFC Delta T prediction";
};

function assertCoordinate(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError("Latitude must be a finite number between -90 and 90.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError(
      "Longitude must be a finite number between -180 and 180.",
    );
  }
}

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function apparentBodyPosition(
  body: Astronomy.Body,
  time: Date,
  observer: Astronomy.Observer,
  nominalRadiusKilometres: number,
) {
  const equatorial = Astronomy.Equator(body, time, observer, true, true);
  const horizontal = Astronomy.Horizon(
    time,
    observer,
    equatorial.ra,
    equatorial.dec,
    "normal",
  );
  return {
    altitudeDegrees: horizontal.altitude,
    azimuthDegrees: horizontal.azimuth,
    angularRadiusDegrees:
      Math.asin(
        nominalRadiusKilometres / (equatorial.dist * Astronomy.KM_PER_AU),
      ) * Astronomy.RAD2DEG,
  };
}

export function calculateEclipseAnimationTrack(
  latitude: number,
  longitude: number,
  circumstances: EclipseCircumstances,
  sampleCount = 181,
): EclipseAnimationSample[] {
  return calculateEclipseAnimationWindowTrack(
    latitude,
    longitude,
    circumstances,
    circumstances.partialBegin,
    circumstances.partialEnd,
    sampleCount,
  );
}

export function calculateEclipseAnimationWindowTrack(
  latitude: number,
  longitude: number,
  circumstances: EclipseCircumstances,
  start: Date,
  end: Date,
  sampleCount = 121,
): EclipseAnimationSample[] {
  assertCoordinate(latitude, longitude);
  if (!Number.isInteger(sampleCount) || sampleCount < 2 || sampleCount > 721) {
    throw new RangeError("Animation sample count must be an integer from 2 to 721.");
  }
  const startMilliseconds = start.getTime();
  const endMilliseconds = end.getTime();
  if (
    !Number.isFinite(startMilliseconds) ||
    !Number.isFinite(endMilliseconds) ||
    startMilliseconds < circumstances.partialBegin.getTime() ||
    endMilliseconds > circumstances.partialEnd.getTime() ||
    endMilliseconds <= startMilliseconds
  ) {
    throw new RangeError(
      "Animation window must be ordered inside the local partial eclipse.",
    );
  }

  const observer = new Astronomy.Observer(
    latitude,
    longitude,
    circumstances.observerElevationMetres,
  );

  return Array.from({ length: sampleCount }, (_, index) => {
    const fraction = index / (sampleCount - 1);
    const time = new Date(
      startMilliseconds + (endMilliseconds - startMilliseconds) * fraction,
    );
    const sun = apparentBodyPosition(
      Astronomy.Body.Sun,
      time,
      observer,
      NOMINAL_SOLAR_RADIUS_KILOMETRES,
    );
    const moon = apparentBodyPosition(
      Astronomy.Body.Moon,
      time,
      observer,
      NOMINAL_LUNAR_RADIUS_KILOMETRES,
    );
    return {
      time,
      sunAltitudeDegrees: sun.altitudeDegrees,
      sunAzimuthDegrees: sun.azimuthDegrees,
      sunAngularRadiusDegrees: sun.angularRadiusDegrees,
      moonAltitudeDegrees: moon.altitudeDegrees,
      moonAzimuthDegrees: moon.azimuthDegrees,
      moonAngularRadiusDegrees: moon.angularRadiusDegrees,
    };
  });
}

export function isSolarCentreAboveApparentHorizon(
  apparentSolarCentreAltitudeDegrees: number,
) {
  return apparentSolarCentreAltitudeDegrees > 0;
}

function contact(
  time: Date,
  apparentSolarCentreAltitudeDegrees: number,
): EclipseContact {
  return {
    time,
    apparentSolarCentreAltitudeDegrees: round(
      apparentSolarCentreAltitudeDegrees,
    ),
    aboveApparentHorizon: isSolarCentreAboveApparentHorizon(
      apparentSolarCentreAltitudeDegrees,
    ),
  };
}

export function calculateEclipseCircumstances(
  latitude: number,
  longitude: number,
  elevationInput: ObserverElevationInput,
  eventId: EclipseEventId = DEFAULT_ECLIPSE_EVENT_ID,
): EclipseCircumstances | null {
  assertCoordinate(latitude, longitude);
  const event = eclipseEvent(eventId);
  const observerElevation = resolveObserverElevation(elevationInput);

  const observer = new Astronomy.Observer(
    latitude,
    longitude,
    observerElevation.observerElevationMetres,
  );
  const eclipse = calculateBesselianEclipseCircumstances(
    latitude,
    longitude,
    observerElevation.observerElevationMetres,
    eventId,
  );
  if (!eclipse) return null;

  const apparentSun = apparentBodyPosition(
    Astronomy.Body.Sun,
    eclipse.maximum,
    observer,
    NOMINAL_SOLAR_RADIUS_KILOMETRES,
  );
  const totalityDurationSeconds =
    eclipse.totalBegin && eclipse.totalEnd
      ? round(
          (eclipse.totalEnd.getTime() - eclipse.totalBegin.getTime()) /
            1000,
        )
      : null;
  const idealHorizonSunset = Astronomy.SearchRiseSet(
    Astronomy.Body.Sun,
    observer,
    -1,
    new Date(`${event.date}T00:00:00.000Z`),
    1,
    observerElevation.viewpointHeightAboveGroundMetres,
  );

  return {
    eventId,
    kind: eclipse.kind,
    magnitude: round(eclipse.magnitude, 6),
    obscuration: round(eclipse.obscuration, 6),
    partialBegin: eclipse.partialBegin,
    totalBegin: eclipse.totalBegin,
    peak: eclipse.maximum,
    totalEnd: eclipse.totalEnd,
    partialEnd: eclipse.partialEnd,
    idealHorizonSunset: idealHorizonSunset?.date ?? null,
    totalityDurationSeconds,
    sunAltitudeDegrees: round(apparentSun.altitudeDegrees),
    sunAzimuthDegrees: round(apparentSun.azimuthDegrees),
    solarAngularRadiusDegrees: round(apparentSun.angularRadiusDegrees, 6),
    ...observerElevation,
    contacts: {
      c1: contact(
        eclipse.partialBegin,
        apparentBodyPosition(
          Astronomy.Body.Sun,
          eclipse.partialBegin,
          observer,
          NOMINAL_SOLAR_RADIUS_KILOMETRES,
        ).altitudeDegrees,
      ),
      c2: eclipse.totalBegin
        ? contact(
            eclipse.totalBegin,
            apparentBodyPosition(
              Astronomy.Body.Sun,
              eclipse.totalBegin,
              observer,
              NOMINAL_SOLAR_RADIUS_KILOMETRES,
            ).altitudeDegrees,
          )
        : null,
      maximum: contact(eclipse.maximum, apparentSun.altitudeDegrees),
      c3: eclipse.totalEnd
        ? contact(
            eclipse.totalEnd,
            apparentBodyPosition(
              Astronomy.Body.Sun,
              eclipse.totalEnd,
              observer,
              NOMINAL_SOLAR_RADIUS_KILOMETRES,
            ).altitudeDegrees,
          )
        : null,
      c4: contact(
        eclipse.partialEnd,
        apparentBodyPosition(
          Astronomy.Body.Sun,
          eclipse.partialEnd,
          observer,
          NOMINAL_SOLAR_RADIUS_KILOMETRES,
        ).altitudeDegrees,
      ),
    },
    calculationEngine:
      event.timeScale.source === "IERS Bulletin A"
        ? "NASA/GSFC Besselian elements + IERS Bulletin A"
        : "NASA/GSFC Besselian elements + NASA/GSFC Delta T prediction",
  };
}

export function formatDuration(seconds: number | null) {
  return seconds === null ? "No totality" : `${seconds.toFixed(1)} s`;
}
