import { z } from "zod";

export const ECMWF_IFS_MODEL_NAME = "ECMWF IFS HRES";
export const ECMWF_IFS_NOMINAL_RESOLUTION_KILOMETRES = 9;
export const ECLIPSE_FORECAST_UTC_HOURS = [17, 18, 19, 20] as const;
export const ECLIPSE_MAP_FORECAST_UTC_HOUR = 18;
export const WEATHER_REQUEST_TIMEOUT_MILLISECONDS = 8_000;

export const SUPPLEMENTAL_CLOUD_MODELS = [
  {
    id: "noaa-gfs",
    name: "NOAA GFS",
    endpoint: "https://api.open-meteo.com/v1/gfs",
    modelParameter: "gfs_seamless",
    nominalResolutionKilometres: 13,
    sourceId: "open-meteo-noaa-gfs-forecast",
  },
  {
    id: "dwd-icon",
    name: "DWD ICON",
    endpoint: "https://api.open-meteo.com/v1/dwd-icon",
    modelParameter: "icon_seamless",
    nominalResolutionKilometres: 11,
    sourceId: "open-meteo-dwd-icon-forecast",
  },
  {
    id: "eccc-gem",
    name: "ECCC GEM",
    endpoint: "https://api.open-meteo.com/v1/gem",
    modelParameter: "gem_seamless",
    nominalResolutionKilometres: 15,
    sourceId: "open-meteo-eccc-gem-forecast",
  },
] as const;

export type SupplementalCloudModel =
  (typeof SUPPLEMENTAL_CLOUD_MODELS)[number];
export type SupplementalCloudModelId = SupplementalCloudModel["id"];

const RUN_METADATA_URL =
  "https://api.open-meteo.com/data/ecmwf_ifs/static/meta.json";
const EXACT_RUN_FORECAST_URL =
  "https://single-runs-api.open-meteo.com/v1/forecast";
const ROLLING_FORECAST_URL = "https://api.open-meteo.com/v1/ecmwf";
const ECLIPSE_DATE = "2026-08-12";
const ECLIPSE_FORECAST_END = new Date("2026-08-12T20:00:00.000Z");
const MAX_WEATHER_RESPONSE_BYTES = 5_000_000;
const MAX_HOURLY_PRECIPITATION_MILLIMETRES = 500;
const MAX_WIND_SPEED_KILOMETRES_PER_HOUR = 500;
const HOURLY_VARIABLES = [
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "precipitation",
  "wind_speed_10m",
  "wind_gusts_10m",
] as const;

const finiteTimestamp = z.number().int().finite().positive();
const runMetadataSchema = z.object({
  last_run_initialisation_time: finiteTimestamp,
  last_run_availability_time: finiteTimestamp,
  last_run_modification_time: finiteTimestamp,
  data_end_time: finiteTimestamp,
  temporal_resolution_seconds: z.literal(3600),
  update_interval_seconds: z.literal(21600),
});

const nullablePercent = z.number().finite().min(0).max(100).nullable();
const nullablePrecipitation = z
  .number()
  .finite()
  .min(0)
  .max(MAX_HOURLY_PRECIPITATION_MILLIMETRES)
  .nullable();
const nullableWindSpeed = z
  .number()
  .finite()
  .min(0)
  .max(MAX_WIND_SPEED_KILOMETRES_PER_HOUR)
  .nullable();
const hourlySchema = z.object({
  time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/)).min(1).max(400),
  cloud_cover: z.array(nullablePercent).min(1).max(400),
  cloud_cover_low: z.array(nullablePercent).min(1).max(400),
  cloud_cover_mid: z.array(nullablePercent).min(1).max(400),
  cloud_cover_high: z.array(nullablePercent).min(1).max(400),
  precipitation: z.array(nullablePrecipitation).min(1).max(400),
  wind_speed_10m: z.array(nullableWindSpeed).min(1).max(400),
  wind_gusts_10m: z.array(nullableWindSpeed).min(1).max(400),
});

const cloudOnlyHourlySchema = z.object({
  time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/)).min(1).max(400),
  cloud_cover: z.array(nullablePercent).min(1).max(400),
});

const forecastResponseSchema = z.object({
  location_id: z.number().int().min(0).optional(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  elevation: z.number().finite().min(-500).max(9_000),
  timezone: z.literal("GMT"),
  timezone_abbreviation: z.literal("GMT"),
  utc_offset_seconds: z.literal(0),
  hourly_units: z.object({
    time: z.literal("iso8601"),
    cloud_cover: z.literal("%"),
    cloud_cover_low: z.literal("%"),
    cloud_cover_mid: z.literal("%"),
    cloud_cover_high: z.literal("%"),
    precipitation: z.literal("mm"),
    wind_speed_10m: z.literal("km/h"),
    wind_gusts_10m: z.literal("km/h"),
  }),
  hourly: hourlySchema,
});

const cloudOnlyForecastResponseSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  elevation: z.number().finite().min(-500).max(9_000),
  timezone: z.literal("GMT"),
  timezone_abbreviation: z.literal("GMT"),
  utc_offset_seconds: z.literal(0),
  hourly_units: z.object({
    time: z.literal("iso8601"),
    cloud_cover: z.literal("%"),
  }),
  hourly: cloudOnlyHourlySchema,
});

export type ForecastRunMetadata = Readonly<{
  initializedAt: Date;
  availableAt: Date;
  dataEndsAt: Date;
}>;

export type EclipseForecastHour = Readonly<{
  validAt: Date;
  cloudCoverPercent: number;
  lowCloudCoverPercent: number;
  midCloudCoverPercent: number;
  highCloudCoverPercent: number;
  precipitationMillimetres: number;
  windSpeedKilometresPerHour: number;
  windGustsKilometresPerHour: number;
}>;

export type EclipseDayForecast = Readonly<{
  locationId: string;
  requestedCoordinate: Readonly<{ latitude: number; longitude: number }>;
  serviceCoordinate: Readonly<{
    latitude: number;
    longitude: number;
    downscalingElevationMetres: number;
  }>;
  hours: readonly [
    EclipseForecastHour,
    EclipseForecastHour,
    EclipseForecastHour,
    EclipseForecastHour,
  ];
}>;

export type EclipseForecastBatch = Readonly<{
  model: typeof ECMWF_IFS_MODEL_NAME;
  nominalResolutionKilometres: typeof ECMWF_IFS_NOMINAL_RESOLUTION_KILOMETRES;
  run: ForecastRunMetadata;
  retrievedAt: Date;
  sourceMode: "exact-run" | "rolling-model";
  forecasts: readonly (EclipseDayForecast | null)[];
}>;

export type ForecastLocationInput = Readonly<{
  id: string;
  latitude: number;
  longitude: number;
}>;

export type SupplementalCloudForecastHour = Readonly<{
  validAt: Date;
  cloudCoverPercent: number;
}>;

export type SupplementalCloudForecast = Readonly<{
  modelId: SupplementalCloudModelId;
  modelName: SupplementalCloudModel["name"];
  nominalResolutionKilometres: number;
  sourceId: SupplementalCloudModel["sourceId"];
  requestedCoordinate: Readonly<{ latitude: number; longitude: number }>;
  serviceCoordinate: Readonly<{
    latitude: number;
    longitude: number;
    downscalingElevationMetres: number;
  }>;
  hours: readonly [
    SupplementalCloudForecastHour,
    SupplementalCloudForecastHour,
    SupplementalCloudForecastHour,
    SupplementalCloudForecastHour,
  ];
  retrievedAt: Date;
}>;

type FetchOptions = Readonly<{
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  run?: ForecastRunMetadata;
  requestTimeoutMilliseconds?: number;
}>;

function dateFromUnixSeconds(value: number, label: string) {
  const date = new Date(value * 1_000);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError(`${label} is not a valid timestamp.`);
  }
  return date;
}

function formatRunParameter(date: Date) {
  return date.toISOString().slice(0, 16);
}

function appendCoordinates(url: URL, locations: readonly ForecastLocationInput[]) {
  url.searchParams.set(
    "latitude",
    locations.map(({ latitude }) => String(latitude)).join(","),
  );
  url.searchParams.set(
    "longitude",
    locations.map(({ longitude }) => String(longitude)).join(","),
  );
}

function assertLocations(locations: readonly ForecastLocationInput[]) {
  if (locations.length === 0 || locations.length > 60) {
    throw new RangeError("Forecast batches must contain between 1 and 60 locations.");
  }
  const ids = new Set<string>();
  for (const location of locations) {
    if (
      location.id.trim() === "" ||
      !Number.isFinite(location.latitude) ||
      location.latitude < -90 ||
      location.latitude > 90 ||
      !Number.isFinite(location.longitude) ||
      location.longitude < -180 ||
      location.longitude > 180
    ) {
      throw new RangeError(`Invalid forecast location ${location.id}.`);
    }
    if (ids.has(location.id)) {
      throw new RangeError(`Duplicate forecast location ${location.id}.`);
    }
    ids.add(location.id);
  }
}

async function fetchJson(
  url: URL | string,
  signal: AbortSignal,
  fetchImplementation: typeof globalThis.fetch,
  timeoutMilliseconds: number,
) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(signal.reason);
  if (signal.aborted) abortFromParent();
  else signal.addEventListener("abort", abortFromParent, { once: true });
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMilliseconds);

  try {
    const response = await fetchImplementation(url, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Weather service returned HTTP ${response.status}.`);
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      throw new TypeError("Weather service returned a non-JSON response.");
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_WEATHER_RESPONSE_BYTES
    ) {
      throw new RangeError("Weather response exceeds the size limit.");
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_WEATHER_RESPONSE_BYTES) {
      throw new RangeError("Weather response exceeds the size limit.");
    }
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (timedOut && !signal.aborted) {
      throw new Error("Weather service request timed out.", { cause: error });
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", abortFromParent);
  }
}

export async function fetchEcmwfRunMetadata(
  signal: AbortSignal,
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  timeoutMilliseconds = WEATHER_REQUEST_TIMEOUT_MILLISECONDS,
): Promise<ForecastRunMetadata> {
  const metadata = runMetadataSchema.parse(
    await fetchJson(
      RUN_METADATA_URL,
      signal,
      fetchImplementation,
      timeoutMilliseconds,
    ),
  );
  const initializedAt = dateFromUnixSeconds(
    metadata.last_run_initialisation_time,
    "ECMWF run initialization",
  );
  const availableAt = dateFromUnixSeconds(
    metadata.last_run_availability_time,
    "ECMWF run availability",
  );
  const dataEndsAt = dateFromUnixSeconds(
    metadata.data_end_time,
    "ECMWF data end",
  );
  if (availableAt < initializedAt) {
    throw new RangeError("ECMWF availability precedes initialization.");
  }
  return { initializedAt, availableAt, dataEndsAt };
}

function exactRunUrl(
  run: ForecastRunMetadata,
  locations: readonly ForecastLocationInput[],
) {
  const url = new URL(EXACT_RUN_FORECAST_URL);
  appendCoordinates(url, locations);
  url.searchParams.set("hourly", HOURLY_VARIABLES.join(","));
  url.searchParams.set("models", "ecmwf_ifs");
  url.searchParams.set("run", formatRunParameter(run.initializedAt));
  url.searchParams.set("timezone", "UTC");
  return url;
}

function rollingForecastUrl(locations: readonly ForecastLocationInput[]) {
  const url = new URL(ROLLING_FORECAST_URL);
  appendCoordinates(url, locations);
  url.searchParams.set("hourly", HOURLY_VARIABLES.join(","));
  url.searchParams.set("models", "ecmwf_ifs");
  url.searchParams.set("start_date", ECLIPSE_DATE);
  url.searchParams.set("end_date", ECLIPSE_DATE);
  url.searchParams.set("timezone", "UTC");
  return url;
}

function supplementalForecastUrl(
  model: SupplementalCloudModel,
  location: ForecastLocationInput,
) {
  const url = new URL(model.endpoint);
  appendCoordinates(url, [location]);
  url.searchParams.set("hourly", "cloud_cover");
  url.searchParams.set("models", model.modelParameter);
  url.searchParams.set("start_date", ECLIPSE_DATE);
  url.searchParams.set("end_date", ECLIPSE_DATE);
  url.searchParams.set("timezone", "UTC");
  return url;
}

function normalizeForecastResponses(value: unknown, expectedCount: number) {
  const candidates = Array.isArray(value) ? value : [value];
  if (candidates.length !== expectedCount) {
    throw new TypeError("Weather service returned the wrong location count.");
  }
  return candidates.map((candidate) => forecastResponseSchema.parse(candidate));
}

function alignForecastResponses(
  responses: ReturnType<typeof normalizeForecastResponses>,
  expectedCount: number,
) {
  const aligned = new Array<z.infer<typeof forecastResponseSchema> | undefined>(
    expectedCount,
  );
  for (const response of responses) {
    const index = response.location_id ?? 0;
    if (index >= expectedCount || aligned[index] !== undefined) {
      throw new TypeError("Weather service returned invalid location identifiers.");
    }
    aligned[index] = response;
  }
  if (aligned.some((response) => response === undefined)) {
    throw new TypeError("Weather service returned incomplete location identifiers.");
  }
  return aligned as z.infer<typeof forecastResponseSchema>[];
}

function sameLength(hourly: z.infer<typeof hourlySchema>) {
  const length = hourly.time.length;
  return HOURLY_VARIABLES.every(
    (variable) => hourly[variable].length === length,
  );
}

function assertStrictlyAscendingHourlyTimes(
  hourly: z.infer<typeof hourlySchema>,
) {
  for (let index = 1; index < hourly.time.length; index += 1) {
    if (hourly.time[index] <= hourly.time[index - 1]) {
      throw new TypeError(
        "Weather service returned duplicated or unsorted hourly timestamps.",
      );
    }
  }
}

function eventHoursAvailable(responses: readonly z.infer<typeof forecastResponseSchema>[]) {
  return responses.every(({ hourly }) =>
    ECLIPSE_FORECAST_UTC_HOURS.every((hour) =>
      hourly.time.includes(`${ECLIPSE_DATE}T${String(hour).padStart(2, "0")}:00`),
    ),
  );
}

function finiteHourlyValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractForecast(
  location: ForecastLocationInput,
  response: z.infer<typeof forecastResponseSchema>,
): EclipseDayForecast | null {
  if (!sameLength(response.hourly)) {
    throw new TypeError("Weather service returned misaligned hourly arrays.");
  }
  assertStrictlyAscendingHourlyTimes(response.hourly);
  const extracted = ECLIPSE_FORECAST_UTC_HOURS.map((hour) => {
    const time = `${ECLIPSE_DATE}T${String(hour).padStart(2, "0")}:00`;
    const index = response.hourly.time.indexOf(time);
    if (index < 0) return null;
    const values = {
      cloudCoverPercent: finiteHourlyValue(response.hourly.cloud_cover[index]),
      lowCloudCoverPercent: finiteHourlyValue(response.hourly.cloud_cover_low[index]),
      midCloudCoverPercent: finiteHourlyValue(response.hourly.cloud_cover_mid[index]),
      highCloudCoverPercent: finiteHourlyValue(response.hourly.cloud_cover_high[index]),
      precipitationMillimetres: finiteHourlyValue(response.hourly.precipitation[index]),
      windSpeedKilometresPerHour: finiteHourlyValue(response.hourly.wind_speed_10m[index]),
      windGustsKilometresPerHour: finiteHourlyValue(response.hourly.wind_gusts_10m[index]),
    };
    if (Object.values(values).some((value) => value === null)) return null;
    return {
      validAt: new Date(`${time}:00.000Z`),
      cloudCoverPercent: values.cloudCoverPercent,
      lowCloudCoverPercent: values.lowCloudCoverPercent,
      midCloudCoverPercent: values.midCloudCoverPercent,
      highCloudCoverPercent: values.highCloudCoverPercent,
      precipitationMillimetres: values.precipitationMillimetres,
      windSpeedKilometresPerHour: values.windSpeedKilometresPerHour,
      windGustsKilometresPerHour: values.windGustsKilometresPerHour,
    } as EclipseForecastHour;
  });
  const [first, second, third, fourth] = extracted;
  if (!first || !second || !third || !fourth) return null;
  return {
    locationId: location.id,
    requestedCoordinate: {
      latitude: location.latitude,
      longitude: location.longitude,
    },
    serviceCoordinate: {
      latitude: response.latitude,
      longitude: response.longitude,
      downscalingElevationMetres: response.elevation,
    },
    hours: [first, second, third, fourth],
  };
}

export async function fetchEclipseDayForecast(
  locations: readonly ForecastLocationInput[],
  signal: AbortSignal,
  options: FetchOptions = {},
): Promise<EclipseForecastBatch> {
  assertLocations(locations);
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const requestTimeoutMilliseconds =
    options.requestTimeoutMilliseconds ?? WEATHER_REQUEST_TIMEOUT_MILLISECONDS;
  const run =
    options.run ??
    (await fetchEcmwfRunMetadata(
      signal,
      fetchImplementation,
      requestTimeoutMilliseconds,
    ));
  let sourceMode: EclipseForecastBatch["sourceMode"] = "rolling-model";
  let responses: ReturnType<typeof normalizeForecastResponses> | null = null;
  if (run.dataEndsAt >= ECLIPSE_FORECAST_END) {
    try {
      const exactResponses = alignForecastResponses(
        normalizeForecastResponses(
          await fetchJson(
            exactRunUrl(run, locations),
            signal,
            fetchImplementation,
            requestTimeoutMilliseconds,
          ),
          locations.length,
        ),
        locations.length,
      );
      if (eventHoursAvailable(exactResponses)) {
        sourceMode = "exact-run";
        responses = exactResponses;
      }
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  if (responses === null) {
    responses = alignForecastResponses(
      normalizeForecastResponses(
        await fetchJson(
          rollingForecastUrl(locations),
          signal,
          fetchImplementation,
          requestTimeoutMilliseconds,
        ),
        locations.length,
      ),
      locations.length,
    );
  }
  return {
    model: ECMWF_IFS_MODEL_NAME,
    nominalResolutionKilometres:
      ECMWF_IFS_NOMINAL_RESOLUTION_KILOMETRES,
    run,
    retrievedAt: (options.now ?? (() => new Date()))(),
    sourceMode,
    forecasts: locations.map((location, index) => {
      const response = responses[index];
      if (!response) return null;
      return extractForecast(location, response);
    }),
  };
}

export async function fetchSupplementalCloudForecast(
  modelId: SupplementalCloudModelId,
  location: ForecastLocationInput,
  signal: AbortSignal,
  options: Pick<FetchOptions, "fetch" | "now" | "requestTimeoutMilliseconds"> = {},
): Promise<SupplementalCloudForecast | null> {
  assertLocations([location]);
  const model = SUPPLEMENTAL_CLOUD_MODELS.find(({ id }) => id === modelId);
  if (!model) {
    throw new RangeError(`Unknown supplemental cloud model ${modelId}.`);
  }
  const response = cloudOnlyForecastResponseSchema.parse(
    await fetchJson(
      supplementalForecastUrl(model, location),
      signal,
      options.fetch ?? globalThis.fetch,
      options.requestTimeoutMilliseconds ?? WEATHER_REQUEST_TIMEOUT_MILLISECONDS,
    ),
  );
  if (response.hourly.time.length !== response.hourly.cloud_cover.length) {
    throw new TypeError("Weather service returned misaligned cloud arrays.");
  }
  for (let index = 1; index < response.hourly.time.length; index += 1) {
    if (response.hourly.time[index] <= response.hourly.time[index - 1]) {
      throw new TypeError(
        "Weather service returned duplicated or unsorted cloud timestamps.",
      );
    }
  }
  const extracted = ECLIPSE_FORECAST_UTC_HOURS.map((hour) => {
    const time = `${ECLIPSE_DATE}T${String(hour).padStart(2, "0")}:00`;
    const index = response.hourly.time.indexOf(time);
    if (index < 0) return null;
    const cloudCoverPercent = finiteHourlyValue(
      response.hourly.cloud_cover[index],
    );
    return cloudCoverPercent === null
      ? null
      : {
          validAt: new Date(`${time}:00.000Z`),
          cloudCoverPercent,
        };
  });
  const [first, second, third, fourth] = extracted;
  if (!first || !second || !third || !fourth) return null;
  return {
    modelId: model.id,
    modelName: model.name,
    nominalResolutionKilometres: model.nominalResolutionKilometres,
    sourceId: model.sourceId,
    requestedCoordinate: {
      latitude: location.latitude,
      longitude: location.longitude,
    },
    serviceCoordinate: {
      latitude: response.latitude,
      longitude: response.longitude,
      downscalingElevationMetres: response.elevation,
    },
    hours: [first, second, third, fourth],
    retrievedAt: (options.now ?? (() => new Date()))(),
  };
}
