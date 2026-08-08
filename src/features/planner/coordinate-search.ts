export type ParsedCoordinate = Readonly<{
  latitude: number;
  longitude: number;
}>;

// Latitude first, then longitude, separated by a comma and/or whitespace. This
// is the shape people copy from Google Maps, OpenStreetMap and most mapping
// tools, for example "42.1234, -3.5678", "42.1234,-3.5678" or "42.1234 -3.5678".
const COORDINATE_PAIR =
  /^(-?\d+(?:\.\d+)?)(?:\s*,\s*|\s+)(-?\d+(?:\.\d+)?)$/;

// Parses a search query as a decimal-degree coordinate pair. Returns null for
// anything that is not a well-formed global coordinate, so place-name queries
// and partial input never get mistaken for a location. Membership of a
// supported terrain envelope is enforced later, when the point is committed.
export function parseCoordinateSearch(input: string): ParsedCoordinate | null {
  const match = input.trim().match(COORDINATE_PAIR);
  if (!match) return null;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
}
