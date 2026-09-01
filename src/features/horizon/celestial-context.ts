import * as Astronomy from "../../domain/astronomy";

export const celestialObjectIds = [
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "pollux",
  "castor",
  "regulus",
  "sirius",
  "procyon",
  "capella",
  "betelgeuse",
  "aldebaran",
] as const;

export type CelestialObjectId = (typeof celestialObjectIds)[number];

export type CalculatedCelestialObject = Readonly<{
  id: CelestialObjectId;
  kind: "planet" | "star";
  altitudeDegrees: number;
  azimuthDegrees: number;
  magnitude: number | null;
}>;

const PLANETS = [
  { id: "mercury", body: Astronomy.Body.Mercury },
  { id: "venus", body: Astronomy.Body.Venus },
  { id: "mars", body: Astronomy.Body.Mars },
  { id: "jupiter", body: Astronomy.Body.Jupiter },
  { id: "saturn", body: Astronomy.Body.Saturn },
] as const;

// Fixed ICRS/J2000 positions resolved through SIMBAD/CDS on 1 September
// 2026. Proper motion is not propagated because this optional chart context
// is symbolic at degree scale; the source and limitation are documented.
const BRIGHT_STARS = [
  { id: "pollux", body: Astronomy.Body.Star1, raDegrees: 116.32895777, decDegrees: 28.02619889, parallaxMas: 96.54 },
  { id: "castor", body: Astronomy.Body.Star2, raDegrees: 113.64947164, decDegrees: 31.88828222, parallaxMas: 64.12 },
  { id: "regulus", body: Astronomy.Body.Star3, raDegrees: 152.09296244, decDegrees: 11.96720878, parallaxMas: 41.13 },
  { id: "sirius", body: Astronomy.Body.Star4, raDegrees: 101.28715533, decDegrees: -16.71611586, parallaxMas: 379.21 },
  { id: "procyon", body: Astronomy.Body.Star5, raDegrees: 114.82549791, decDegrees: 5.22498756, parallaxMas: 284.56 },
  { id: "capella", body: Astronomy.Body.Star6, raDegrees: 79.17232794, decDegrees: 45.99799147, parallaxMas: 76.2 },
  { id: "betelgeuse", body: Astronomy.Body.Star7, raDegrees: 88.79293899, decDegrees: 7.407064, parallaxMas: 6.55 },
  { id: "aldebaran", body: Astronomy.Body.Star8, raDegrees: 68.98016279, decDegrees: 16.50930235, parallaxMas: 48.94 },
] as const;

for (const star of BRIGHT_STARS) {
  Astronomy.DefineStar(
    star.body,
    star.raDegrees / 15,
    star.decDegrees,
    (1_000 / star.parallaxMas) * 3.26156,
  );
}

function horizontalPosition(
  body: Astronomy.Body,
  time: Date,
  observer: Astronomy.Observer,
) {
  const equatorial = Astronomy.Equator(body, time, observer, true, true);
  return Astronomy.Horizon(
    time,
    observer,
    equatorial.ra,
    equatorial.dec,
    "normal",
  );
}

export function calculateCelestialContext({
  time,
  latitude,
  longitude,
  observerElevationMetres,
}: {
  time: Date;
  latitude: number;
  longitude: number;
  observerElevationMetres: number;
}): readonly CalculatedCelestialObject[] {
  if (
    !Number.isFinite(time.getTime()) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(observerElevationMetres)
  ) {
    throw new RangeError("Celestial context requires finite observer inputs.");
  }
  const observer = new Astronomy.Observer(
    latitude,
    longitude,
    observerElevationMetres,
  );
  const planets: CalculatedCelestialObject[] = PLANETS.map(({ id, body }) => {
    const horizontal = horizontalPosition(body, time, observer);
    return {
      id,
      kind: "planet",
      altitudeDegrees: horizontal.altitude,
      azimuthDegrees: horizontal.azimuth,
      magnitude: Astronomy.Illumination(body, time).mag,
    };
  });
  const stars: CalculatedCelestialObject[] = BRIGHT_STARS.map(({ id, body }) => {
    const horizontal = horizontalPosition(body, time, observer);
    return {
      id,
      kind: "star",
      altitudeDegrees: horizontal.altitude,
      azimuthDegrees: horizontal.azimuth,
      magnitude: null,
    };
  });
  return [...planets, ...stars];
}
