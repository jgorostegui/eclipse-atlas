export type SpanishDisplayTimeZone =
  | "Europe/Madrid"
  | "Atlantic/Canary";

export type TerrainRequestEnvelopeId =
  | "main-terrain-request-envelope"
  | "canary-terrain-request-envelope"
  | "melilla-terrain-request-envelope";

export type TerrainRequestEnvelope = Readonly<{
  id: TerrainRequestEnvelopeId;
  south: number;
  north: number;
  west: number;
  east: number;
  intendedCoverage: readonly string[];
  displayTimeZone: SpanishDisplayTimeZone;
}>;

export const TERRAIN_REQUEST_ENVELOPES = [
  {
    id: "main-terrain-request-envelope",
    south: 35.5,
    north: 44.5,
    west: -10,
    east: 4.5,
    intendedCoverage: ["Iberian Peninsula", "Balearic Islands", "Ceuta"],
    displayTimeZone: "Europe/Madrid",
  },
  {
    id: "canary-terrain-request-envelope",
    south: 27.5,
    north: 29.5,
    west: -18.5,
    east: -13,
    intendedCoverage: ["Canary Islands"],
    displayTimeZone: "Atlantic/Canary",
  },
  {
    id: "melilla-terrain-request-envelope",
    south: 35.2,
    north: 35.4,
    west: -3.1,
    east: -2.85,
    intendedCoverage: ["Melilla"],
    displayTimeZone: "Europe/Madrid",
  },
] as const satisfies readonly TerrainRequestEnvelope[];

export function terrainRequestEnvelopeAt(
  latitude: number,
  longitude: number,
): TerrainRequestEnvelope | null {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return (
    TERRAIN_REQUEST_ENVELOPES.find(
      (envelope) =>
        latitude >= envelope.south &&
        latitude <= envelope.north &&
        longitude >= envelope.west &&
        longitude <= envelope.east,
    ) ?? null
  );
}

export function isInsideTerrainRequestEnvelope(
  latitude: number,
  longitude: number,
) {
  return terrainRequestEnvelopeAt(latitude, longitude) !== null;
}

export function displayTimeZoneForSupportedCoordinate(
  latitude: number,
  longitude: number,
): SpanishDisplayTimeZone {
  const envelope = terrainRequestEnvelopeAt(latitude, longitude);
  if (!envelope) {
    throw new RangeError(
      "Coordinate is outside the configured TerrainRGB request envelopes.",
    );
  }
  return envelope.displayTimeZone;
}
