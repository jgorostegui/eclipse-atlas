import { z } from "zod";

// AEMET municipal forecast for the 2026 eclipse day, republished by the IGN
// as a single national JSON document keyed by INE municipality code. The
// producer of the meteorological values is AEMET; the IGN hosts the document
// for its own eclipse visualizer, so availability is not guaranteed and every
// failure must surface as an explicit unavailable state.
export const MUNICIPAL_FORECAST_URL =
  "https://www.ign.es/resources/cnig/weather.json";

// IGN/CNIG CartoCiudad reverse geocoder used to resolve a coordinate to its
// municipality and INE code. Chosen over the INSPIRE administrative-units WFS
// because that service sits behind a challenge-cookie WAF that rejects plain
// cross-origin browser requests. CartoCiudad answers 204 for coordinates far
// from any addressable feature, which surfaces as an explicit unknown.
const CARTOCIUDAD_REVERSE_GEOCODE_URL =
  "https://www.cartociudad.es/geocoder/api/geocoder/reverseGeocode";

const municipalRecordSchema = z.object({
  municipio: z.string().min(1),
  estado_cielo: z.string().min(1),
  precipitacion: z.string(),
  temperatura: z.object({
    maxima: z.string(),
    minima: z.string(),
  }),
});

const municipalDocumentSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .catchall(z.union([municipalRecordSchema, z.string()]));

export type MunicipalForecast = Readonly<{
  ineCode: string;
  municipalityName: string;
  // AEMET's own closed-vocabulary Spanish sky description, shown as source
  // data in both locales rather than translated through an unverified map.
  skyStateSpanish: string;
  // AEMET publishes probability of precipitation for the day in percent.
  precipitationProbabilityPercent: number | null;
  temperatureMaximumCelsius: number | null;
  temperatureMinimumCelsius: number | null;
}>;

export type MunicipalForecastCatalog = Readonly<{
  forecastDate: string;
  updatedAt: Date | null;
  byIneCode: ReadonlyMap<string, MunicipalForecast>;
}>;

export type ResolvedMunicipality = Readonly<{
  ineCode: string;
  name: string;
}>;

function parseIntegerField(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

export function parseMunicipalForecastCatalog(
  value: unknown,
  updatedAt: Date | null,
): MunicipalForecastCatalog {
  const document = municipalDocumentSchema.parse(value);
  const byIneCode = new Map<string, MunicipalForecast>();
  for (const [key, record] of Object.entries(document)) {
    if (!/^\d{5}$/.test(key) || typeof record === "string") continue;
    const parsed = municipalRecordSchema.parse(record);
    byIneCode.set(key, {
      ineCode: key,
      municipalityName: parsed.municipio,
      skyStateSpanish: parsed.estado_cielo,
      precipitationProbabilityPercent: parseIntegerField(parsed.precipitacion),
      temperatureMaximumCelsius: parseIntegerField(parsed.temperatura.maxima),
      temperatureMinimumCelsius: parseIntegerField(parsed.temperatura.minima),
    });
  }
  if (byIneCode.size === 0) {
    throw new Error("Municipal forecast document contains no municipalities.");
  }
  return { forecastDate: document.date, updatedAt, byIneCode };
}

export async function fetchMunicipalForecastCatalog(
  signal?: AbortSignal,
): Promise<MunicipalForecastCatalog> {
  const response = await fetch(MUNICIPAL_FORECAST_URL, { signal });
  if (!response.ok) {
    throw new Error(`Municipal forecast request failed: ${response.status}.`);
  }
  const lastModified = response.headers.get("last-modified");
  const updatedAtTime = lastModified === null ? Number.NaN : Date.parse(lastModified);
  return parseMunicipalForecastCatalog(
    await response.json(),
    Number.isFinite(updatedAtTime) ? new Date(updatedAtTime) : null,
  );
}

const reverseGeocodeSchema = z.object({
  muni: z.string().min(1).optional().nullable(),
  muniCode: z.string().optional().nullable(),
});

// Extracts the municipality from a CartoCiudad reverse-geocode payload.
// Exported for deterministic tests.
export function parseMunicipalityFromReverseGeocode(
  value: unknown,
): ResolvedMunicipality | null {
  const parsed = reverseGeocodeSchema.safeParse(value);
  if (!parsed.success) return null;
  const ineCode = parsed.data.muniCode ?? "";
  const name = parsed.data.muni ?? "";
  if (!/^\d{5}$/.test(ineCode) || name === "") return null;
  return { ineCode, name };
}

export async function resolveMunicipality(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<ResolvedMunicipality | null> {
  const url = new URL(CARTOCIUDAD_REVERSE_GEOCODE_URL);
  url.searchParams.set("lon", longitude.toFixed(5));
  url.searchParams.set("lat", latitude.toFixed(5));
  const response = await fetch(url, { signal });
  // 204: no addressable feature near the coordinate. An explicit unknown,
  // not an error.
  if (response.status === 204) return null;
  if (!response.ok) {
    throw new Error(`Municipality resolution failed: ${response.status}.`);
  }
  return parseMunicipalityFromReverseGeocode(await response.json());
}

function normalizedMunicipalityName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

// Name-based fallback for saved places whose municipality is catalogued but
// whose coordinate sits too far from any addressable feature for the reverse
// geocoder. Returns a forecast only on an unambiguous name match.
export function municipalForecastByName(
  catalog: MunicipalForecastCatalog,
  municipalityName: string,
): MunicipalForecast | null {
  const target = normalizedMunicipalityName(municipalityName);
  if (target === "") return null;
  let match: MunicipalForecast | null = null;
  for (const forecast of catalog.byIneCode.values()) {
    if (normalizedMunicipalityName(forecast.municipalityName) !== target) {
      continue;
    }
    if (match !== null) return null;
    match = forecast;
  }
  return match;
}
