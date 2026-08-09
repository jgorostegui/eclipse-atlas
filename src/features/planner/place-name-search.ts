import { z } from "zod";
import type { ParsedCoordinate } from "./coordinate-search";

// IGN/CNIG CartoCiudad forward geocoder. The candidates endpoint suggests
// named entities for a typed query but carries no coordinates; the find
// endpoint resolves one selected entity to its published WGS 84 position.
// Street, portal and retail layers are excluded because the planner needs
// settlements and toponyms, not postal addresses.
const CANDIDATES_URL =
  "https://www.cartociudad.es/geocoder/api/geocoder/candidates";
const FIND_URL = "https://www.cartociudad.es/geocoder/api/geocoder/find";
const EXCLUDED_LAYERS = "callejero,portal,expendeduria";

export const MINIMUM_PLACE_NAME_QUERY_LENGTH = 3;
export const PLACE_NAME_RESULT_LIMIT = 10;
export const PLACE_NAME_REQUEST_TIMEOUT_MILLISECONDS = 8_000;
// The find response embeds the entity's full boundary geometry, which reaches
// a few hundred kilobytes for a large municipality.
const MAX_RESPONSE_BYTES = 5_000_000;

export type PlaceNameMatch = Readonly<{
  id: string;
  // Layer identifier as published by the geocoder (for example "poblacion",
  // "Municipio" or "ngbe"); it is passed back verbatim to the find endpoint.
  type: string;
  name: string;
  municipality: string | null;
  province: string | null;
}>;

const candidateRecordSchema = z.object({
  id: z.union([z.string().min(1), z.number().finite()]),
  type: z.string().min(1),
  address: z.string().min(1),
  muni: z.string().nullish(),
  province: z.string().nullish(),
});

const findResponseSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

async function fetchGeocoderJson(
  url: URL,
  signal: AbortSignal | undefined,
  fetchImplementation: typeof globalThis.fetch,
): Promise<unknown | null> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromParent();
  else signal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, PLACE_NAME_REQUEST_TIMEOUT_MILLISECONDS);

  try {
    const response = await fetchImplementation(url, {
      signal: controller.signal,
    });
    // 204: the service answered but has nothing for this query. An explicit
    // empty answer, not an error.
    if (response.status === 204) return null;
    if (!response.ok) {
      throw new Error(`Place-name service returned HTTP ${response.status}.`);
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      throw new RangeError("Place-name response exceeds the size limit.");
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new RangeError("Place-name response exceeds the size limit.");
    }
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (timedOut && !signal?.aborted) {
      throw new Error("Place-name service request timed out.", {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

// Suggests named entities for a typed query. Queries below the minimum length
// resolve to an empty list without a request. Transport and contract failures
// throw, so the caller can show an explicit unavailable state.
export async function searchPlaceNames(
  query: string,
  signal?: AbortSignal,
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
): Promise<readonly PlaceNameMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length < MINIMUM_PLACE_NAME_QUERY_LENGTH) return [];

  const url = new URL(CANDIDATES_URL);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", String(PLACE_NAME_RESULT_LIMIT));
  url.searchParams.set("no_process", EXCLUDED_LAYERS);

  const payload = await fetchGeocoderJson(url, signal, fetchImplementation);
  if (payload === null) return [];
  const records = z.array(candidateRecordSchema).parse(payload);
  return records.map((record) => ({
    id: String(record.id),
    type: record.type,
    name: record.address,
    municipality: record.muni ?? null,
    province: record.province ?? null,
  }));
}

// Resolves a selected match to its published coordinate. Returns null when the
// service answers without a usable position, so a missing coordinate stays an
// explicit unknown instead of becoming a fabricated location.
export async function resolvePlaceNameMatch(
  match: Pick<PlaceNameMatch, "id" | "type">,
  signal?: AbortSignal,
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
): Promise<ParsedCoordinate | null> {
  const url = new URL(FIND_URL);
  url.searchParams.set("id", match.id);
  url.searchParams.set("type", match.type);

  const payload = await fetchGeocoderJson(url, signal, fetchImplementation);
  if (payload === null) return null;
  const parsed = findResponseSchema.safeParse(payload);
  if (!parsed.success) return null;
  // The geocoder reports an unresolved position as the literal 0, 0 pair,
  // which is never a valid answer for a Spanish place name.
  if (parsed.data.lat === 0 && parsed.data.lng === 0) return null;
  return { latitude: parsed.data.lat, longitude: parsed.data.lng };
}
