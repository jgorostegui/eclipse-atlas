import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import nationalPlanningPoints from "../src/data/national-planning-points.json" with {
  type: "json",
};
import { requiredInputPath } from "./required-input-path.mts";

const START_YEAR = 1991;
const END_YEAR = 2020;
const TARGET_MONTH = 8;
const TARGET_UTC_HOUR = 18;
const EXPECTED_SAMPLES_PER_POINT = 30 * 31;
const ARTIFACT_VERSION = "era5-august-evening-v1";
const ARTIFACT_GENERATED_AT = "2026-08-03T12:00:00.000Z";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const sourceCacheDirectory = requiredInputPath(
  "ECLIPSE_ATLAS_CLIMATE_CACHE_DIRECTORY",
);
const outputDirectory = path.join(repositoryRoot, "public", "climate", "v1");
const artifactPath = path.join(
  outputDirectory,
  "august-cloud-cover-era5-v1.json",
);
const checksumPath = path.join(
  outputDirectory,
  "august-cloud-cover-era5-v1.sha256",
);

type ArchiveResponse = {
  latitude: number;
  longitude: number;
  hourly_units: { time: string; cloud_cover: string };
  hourly: { time: string[]; cloud_cover: Array<number | null> };
};

function sha256(content: string | Uint8Array) {
  return createHash("sha256").update(content).digest("hex");
}

function assertFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }
}

function parseArchiveResponse(value: unknown, year: number): ArchiveResponse[] {
  if (!Array.isArray(value) || value.length !== nationalPlanningPoints.points.length) {
    throw new TypeError(`ERA5 ${year} response has the wrong location count.`);
  }
  return value.map((entry, pointIndex) => {
    if (!entry || typeof entry !== "object") {
      throw new TypeError(`ERA5 ${year} location ${pointIndex} is not an object.`);
    }
    const candidate = entry as Partial<ArchiveResponse>;
    assertFinite(candidate.latitude, `ERA5 ${year} latitude ${pointIndex}`);
    assertFinite(candidate.longitude, `ERA5 ${year} longitude ${pointIndex}`);
    if (
      candidate.hourly_units?.time !== "iso8601" ||
      candidate.hourly_units.cloud_cover !== "%" ||
      !Array.isArray(candidate.hourly?.time) ||
      !Array.isArray(candidate.hourly.cloud_cover) ||
      candidate.hourly.time.length !== 31 * 24 ||
      candidate.hourly.cloud_cover.length !== candidate.hourly.time.length
    ) {
      throw new TypeError(`ERA5 ${year} location ${pointIndex} has invalid hourly data.`);
    }
    const seenTimes = new Set<string>();
    candidate.hourly.time.forEach((time, hourIndex) => {
      const expectedTime = new Date(
        Date.UTC(year, TARGET_MONTH - 1, 1, hourIndex),
      )
        .toISOString()
        .slice(0, 16);
      if (time !== expectedTime || seenTimes.has(time)) {
        throw new TypeError(
          `ERA5 ${year} location ${pointIndex} has an unexpected timestamp at ${hourIndex}.`,
        );
      }
      seenTimes.add(time);
    });
    candidate.hourly.cloud_cover.forEach((cloudCover, hourIndex) => {
      if (
        cloudCover !== null &&
        (typeof cloudCover !== "number" ||
          !Number.isFinite(cloudCover) ||
          cloudCover < 0 ||
          cloudCover > 100)
      ) {
        throw new RangeError(
          `ERA5 ${year} cloud cover ${pointIndex}:${hourIndex} is out of range.`,
        );
      }
    });
    return candidate as ArchiveResponse;
  });
}

function requestUrl(year: number) {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set(
    "latitude",
    nationalPlanningPoints.points.map(({ latitude }) => latitude).join(","),
  );
  url.searchParams.set(
    "longitude",
    nationalPlanningPoints.points.map(({ longitude }) => longitude).join(","),
  );
  url.searchParams.set("start_date", `${year}-08-01`);
  url.searchParams.set("end_date", `${year}-08-31`);
  url.searchParams.set("hourly", "cloud_cover");
  url.searchParams.set("models", "era5");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("cell_selection", "nearest");
  url.searchParams.set(
    "elevation",
    nationalPlanningPoints.points.map(() => "nan").join(","),
  );
  return url;
}

async function loadYear(year: number) {
  const rawPath = path.join(sourceCacheDirectory, `${year}.json`);
  let raw: string;
  try {
    raw = await readFile(rawPath, "utf8");
  } catch {
    const url = requestUrl(year);
    let response: Response | null = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      response = await fetch(url, {
        headers: { "User-Agent": "Eclipse-Atlas climate generator" },
      });
      if (response.ok || response.status !== 429) break;
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const delayMilliseconds = Number.isFinite(retryAfterSeconds)
        ? Math.min(45_000, retryAfterSeconds * 1_000)
        : Math.min(45_000, 5_000 * 2 ** attempt);
      process.stdout.write(
        `ERA5 ${year} rate limited; retrying in ${delayMilliseconds / 1_000} s\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMilliseconds));
    }
    if (!response?.ok) {
      const detail = await response?.text();
      throw new Error(
        `ERA5 ${year} request failed with HTTP ${response?.status ?? "unknown"}: ${detail ?? "no response"}`,
      );
    }
    raw = await response.text();
    await writeFile(rawPath, raw);
  }
  const parsed = parseArchiveResponse(JSON.parse(raw) as unknown, year);
  return { year, rawSha256: sha256(raw), responses: parsed };
}

function percentile(sortedValues: readonly number[], percentileValue: number) {
  if (sortedValues.length === 0) {
    throw new RangeError("A percentile requires at least one value.");
  }
  const index = (sortedValues.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = sortedValues[lower];
  const upperValue = sortedValues[upper];
  if (lowerValue === undefined || upperValue === undefined) {
    throw new RangeError("Percentile index is out of range.");
  }
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}

function rounded(value: number) {
  return Number(value.toFixed(1));
}

await mkdir(sourceCacheDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });

const years: Array<Awaited<ReturnType<typeof loadYear>>> = [];
for (let year = START_YEAR; year <= END_YEAR; year += 1) {
  process.stdout.write(`ERA5 ${year}\n`);
  years.push(await loadYear(year));
}

const points = nationalPlanningPoints.points.map((point, pointIndex) => {
  const values: number[] = [];
  let gridLatitude: number | null = null;
  let gridLongitude: number | null = null;
  for (const { year, responses } of years) {
    const response = responses[pointIndex];
    if (!response) throw new RangeError(`ERA5 ${year} point ${pointIndex} is missing.`);
    gridLatitude ??= response.latitude;
    gridLongitude ??= response.longitude;
    if (
      response.latitude !== gridLatitude ||
      response.longitude !== gridLongitude
    ) {
      throw new RangeError(`ERA5 grid coordinate changed for ${point.id} in ${year}.`);
    }
    response.hourly.time.forEach((time, hourIndex) => {
      if (!time.endsWith(`T${String(TARGET_UTC_HOUR).padStart(2, "0")}:00`)) return;
      const cloudCover = response.hourly.cloud_cover[hourIndex];
      if (cloudCover === null || cloudCover === undefined) {
        throw new TypeError(`ERA5 ${year} ${point.id} is missing ${time}.`);
      }
      values.push(cloudCover);
    });
  }
  if (values.length !== EXPECTED_SAMPLES_PER_POINT) {
    throw new RangeError(
      `${point.id} has ${values.length} samples; expected ${EXPECTED_SAMPLES_PER_POINT}.`,
    );
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    candidateId: point.id,
    requestedCoordinate: {
      latitude: point.latitude,
      longitude: point.longitude,
    },
    era5GridCoordinate: {
      latitude: gridLatitude,
      longitude: gridLongitude,
    },
    sampleCount: values.length,
    meanCloudCoverPercent: rounded(
      values.reduce((sum, value) => sum + value, 0) / values.length,
    ),
    percentile25CloudCoverPercent: rounded(percentile(sorted, 0.25)),
    medianCloudCoverPercent: rounded(percentile(sorted, 0.5)),
    percentile75CloudCoverPercent: rounded(percentile(sorted, 0.75)),
  };
});

const rawInputAggregateSha256 = sha256(
  years.map(({ year, rawSha256 }) => `${year}:${rawSha256}`).join("\n"),
);
const artifact = {
  schemaVersion: 1,
  artifactVersion: ARTIFACT_VERSION,
  generatedAt: ARTIFACT_GENERATED_AT,
  source: {
    producer: "Copernicus Climate Change Service / ECMWF",
    dataset: "ERA5 hourly data on single levels",
    doi: "10.24381/cds.adbb2d47",
    deliveryService: "Open-Meteo Historical Weather API",
    deliveryUrl: "https://archive-api.open-meteo.com/v1/archive",
    modelParameter: "era5",
    variable: "cloud_cover",
    sourceVariable: "total_cloud_cover",
    unit: "percent",
  },
  sampling: {
    period: { startYear: START_YEAR, endYear: END_YEAR },
    month: TARGET_MONTH,
    utcHour: TARGET_UTC_HOUR,
    samplesPerPoint: EXPECTED_SAMPLES_PER_POINT,
    referencePointCount: nationalPlanningPoints.points.length,
    nativeGridDegrees: 0.25,
    cellSelection: "nearest",
    statisticalDownscaling: false,
  },
  generation: {
    tool: "scripts/generate-cloud-climate.mts",
    rawInputAggregateSha256,
    rawInputCount: years.length,
    parameters:
      "Every August day at 18:00 UTC from 1991 through 2020 at the 41 national map references.",
  },
  points,
  limitations: [
    "Values are ERA5 reanalysis grid-cell cloud fractions, not station observations or a forecast for 12 August 2026.",
    "The 0.25 degree grid cannot resolve site-scale cloud, fog, coastal or mountain effects.",
    "Reference-point statistics do not form a continuous Spain-wide raster and are not a probability of successful viewing.",
  ],
};

const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
await writeFile(artifactPath, serialized);
await writeFile(
  checksumPath,
  `${sha256(serialized)}  ${path.basename(artifactPath)}\n`,
);
process.stdout.write(`Wrote ${path.relative(repositoryRoot, artifactPath)}\n`);
