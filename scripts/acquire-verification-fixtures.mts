import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { fromFile } from "geotiff";
import {
  createTerrainSamplePlan,
  TERRAIN_TILE_SIZE,
  TERRAIN_ZOOM,
  terrainPixelAddress,
  terrainTileKey,
  terrainTileUrl,
  validateTerrainTilePayload,
} from "../src/domain/terrain-horizon.ts";
import { PLANNING_VIEWPOINT_HEIGHT_METRES } from "../src/domain/observer.ts";
import { referenceDestinationPoint } from "./verification-reference-geometry.mjs";
import { requiredInputPath } from "./required-input-path.mts";

type ValidationPoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  horizonValidation?: {
    terrainClassIntent: string;
    referenceAzimuthDegrees: number;
  };
};

type PointManifest = {
  fixtureVersion: string;
  points: ValidationPoint[];
};

type FixtureManifest = {
  mdt05Fixture: {
    service: string;
    coverageId: string;
    segmentLengthMetres: number;
    maximumDistanceMetres: number;
  };
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pointManifestPath = path.join(
  root,
  "verification/fixtures/v2/validation-points.json",
);
const fixtureManifestPath = path.join(
  root,
  "verification/fixtures/v2/fixture-manifest.json",
);
const officialAstronomyPath = requiredInputPath(
  "ECLIPSE_ATLAS_IGN_2026_RASTER",
);
const fixtureStorageDirectory = requiredInputPath(
  "ECLIPSE_ATLAS_FIXTURE_DIRECTORY",
);
const refresh = process.argv.includes("--refresh");

function sha256(buffer: Uint8Array) {
  return createHash("sha256").update(buffer).digest("hex");
}

function webMercator(latitude: number, longitude: number) {
  const radius = 6_378_137;
  return {
    x: (radius * longitude * Math.PI) / 180,
    y:
      radius *
      Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)),
  };
}

function inverseWebMercator(x: number, y: number) {
  const radius = 6_378_137;
  return {
    longitude: (x / radius) * (180 / Math.PI),
    latitude:
      (2 * Math.atan(Math.exp(y / radius)) - Math.PI / 2) *
      (180 / Math.PI),
  };
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchFixture(
  url: string,
  filePath: string,
  maximumBytes: number,
) {
  if (!refresh && (await exists(filePath))) {
    const buffer = await readFile(filePath);
    return { buffer, downloaded: false };
  }

  const response = await fetch(url, {
    headers: { "user-agent": "Eclipse-Atlas-verification/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Fixture request failed with HTTP ${response.status}: ${url}`);
  }
  const declaredBytes = Number(response.headers.get("content-length") ?? 0);
  if (declaredBytes > maximumBytes) {
    throw new Error(`Fixture exceeds the ${maximumBytes} byte limit: ${url}`);
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > maximumBytes) {
    throw new Error(`Fixture exceeds the ${maximumBytes} byte limit: ${url}`);
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.partial`;
  await writeFile(temporaryPath, buffer);
  await rename(temporaryPath, filePath);
  return { buffer, downloaded: true, contentType: response.headers.get("content-type") };
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  operation: (item: T) => Promise<U>,
) {
  const results = new Array<U>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function buildWcsUrl(
  fixture: FixtureManifest["mdt05Fixture"],
  minimumLatitude: number,
  maximumLatitude: number,
  minimumLongitude: number,
  maximumLongitude: number,
) {
  const url = new URL(fixture.service);
  url.searchParams.set("SERVICE", "WCS");
  url.searchParams.set("VERSION", "2.0.1");
  url.searchParams.set("REQUEST", "GetCoverage");
  url.searchParams.set("COVERAGEID", fixture.coverageId);
  url.searchParams.set("FORMAT", "image/tiff");
  url.searchParams.append(
    "SUBSET",
    `lat(${minimumLatitude.toFixed(7)},${maximumLatitude.toFixed(7)})`,
  );
  url.searchParams.append(
    "SUBSET",
    `long(${minimumLongitude.toFixed(7)},${maximumLongitude.toFixed(7)})`,
  );
  return url.toString();
}

async function main() {
  const points = JSON.parse(
    await readFile(pointManifestPath, "utf8"),
  ) as PointManifest;
  const fixtures = JSON.parse(
    await readFile(fixtureManifestPath, "utf8"),
  ) as FixtureManifest;
  const horizonPoints = points.points.filter(
    (point) => point.horizonValidation !== undefined,
  );
  const astronomyImage = await (
    await fromFile(officialAstronomyPath)
  ).getImage();
  const [minimumX, , , maximumY] = astronomyImage.getBoundingBox();
  const [resolutionX, resolutionY] = astronomyImage.getResolution();

  const tileAddresses = new Map<
    string,
    ReturnType<typeof terrainPixelAddress>
  >();
  points.points.forEach((point) => {
    const address = terrainPixelAddress(
      point.latitude,
      point.longitude,
      TERRAIN_ZOOM,
    );
    tileAddresses.set(terrainTileKey(address), address);
    const projected = webMercator(point.latitude, point.longitude);
    const column = Math.floor((projected.x - minimumX) / resolutionX);
    const row = Math.floor(
      (maximumY - projected.y) / Math.abs(resolutionY),
    );
    const cellCentre = inverseWebMercator(
      minimumX + (column + 0.5) * resolutionX,
      maximumY - (row + 0.5) * Math.abs(resolutionY),
    );
    const cellAddress = terrainPixelAddress(
      cellCentre.latitude,
      cellCentre.longitude,
      TERRAIN_ZOOM,
    );
    tileAddresses.set(terrainTileKey(cellAddress), cellAddress);
  });
  horizonPoints.forEach((point) => {
    const plan = createTerrainSamplePlan(
      point.latitude,
      point.longitude,
      {
        centreAzimuthDegrees:
          point.horizonValidation!.referenceAzimuthDegrees,
        solarDisc: null,
        viewpointHeightAboveGroundMetres:
          PLANNING_VIEWPOINT_HEIGHT_METRES,
      },
    );
    plan.requiredAddresses.forEach((address) =>
      tileAddresses.set(terrainTileKey(address), address),
    );
  });

  const terrainDirectory = path.join(fixtureStorageDirectory, "terrain-rgb");
  const terrainRecords = await mapWithConcurrency(
    [...tileAddresses.entries()],
    4,
    async ([key, address]) => {
      const relativePath = path.join(`${TERRAIN_ZOOM}`, `${address.tileX}`, `${address.tileY}.png`);
      const filePath = path.join(terrainDirectory, relativePath);
      const result = await fetchFixture(terrainTileUrl(address), filePath, 1_500_000);
      validateTerrainTilePayload(
        result.contentType ?? "image/png",
        result.buffer.byteLength,
        result.buffer,
      );
      const png = PNG.sync.read(Buffer.from(result.buffer));
      if (png.width !== TERRAIN_TILE_SIZE || png.height !== TERRAIN_TILE_SIZE) {
        throw new Error(`Terrain tile ${key} has unexpected dimensions.`);
      }
      return {
        key,
        sourceUrl: terrainTileUrl(address),
        localPath: path.relative(root, filePath),
        bytes: result.buffer.byteLength,
        sha256: sha256(result.buffer),
        downloaded: result.downloaded,
      };
    },
  );

  const mdtDirectory = path.join(fixtureStorageDirectory, "mdt05");
  const mdtRequests = horizonPoints.flatMap((point) => {
    const segmentCount =
      fixtures.mdt05Fixture.maximumDistanceMetres /
      fixtures.mdt05Fixture.segmentLengthMetres;
    return Array.from({ length: segmentCount }, (_, segmentIndex) => {
      const startDistanceKilometres =
        (segmentIndex * fixtures.mdt05Fixture.segmentLengthMetres) / 1_000;
      const endDistanceKilometres =
        ((segmentIndex + 1) * fixtures.mdt05Fixture.segmentLengthMetres) /
        1_000;
      const start = referenceDestinationPoint(
        point.latitude,
        point.longitude,
        point.horizonValidation!.referenceAzimuthDegrees,
        startDistanceKilometres,
      );
      const end = referenceDestinationPoint(
        point.latitude,
        point.longitude,
        point.horizonValidation!.referenceAzimuthDegrees,
        endDistanceKilometres,
      );
      const paddingDegrees = 0.00008;
      const bounds = {
        minimumLatitude:
          Math.min(start.latitude, end.latitude) - paddingDegrees,
        maximumLatitude:
          Math.max(start.latitude, end.latitude) + paddingDegrees,
        minimumLongitude:
          Math.min(start.longitude, end.longitude) - paddingDegrees,
        maximumLongitude:
          Math.max(start.longitude, end.longitude) + paddingDegrees,
      };
      return {
        point,
        segmentIndex,
        startDistanceKilometres,
        endDistanceKilometres,
        url: buildWcsUrl(
          fixtures.mdt05Fixture,
          bounds.minimumLatitude,
          bounds.maximumLatitude,
          bounds.minimumLongitude,
          bounds.maximumLongitude,
        ),
      };
    });
  });

  const mdtRecords = await mapWithConcurrency(
    mdtRequests,
    2,
    async (request) => {
      const filename = `__segment-${String(request.segmentIndex).padStart(2, "0")}.tif`;
      const filePath = path.join(mdtDirectory, request.point.id, filename);
      const result = await fetchFixture(request.url, filePath, 8_000_000);
      const signature = String.fromCharCode(
        result.buffer[0],
        result.buffer[1],
        result.buffer[2],
        result.buffer[3],
      );
      if (signature !== "II*\u0000" && signature !== "MM\u0000*") {
        throw new Error(`MDT05 segment is not a TIFF: ${request.url}`);
      }
      return {
        pointId: request.point.id,
        segmentIndex: request.segmentIndex,
        startDistanceKilometres: request.startDistanceKilometres,
        endDistanceKilometres: request.endDistanceKilometres,
        sourceUrl: request.url,
        localPath: path.relative(root, filePath),
        bytes: result.buffer.byteLength,
        sha256: sha256(result.buffer),
        downloaded: result.downloaded,
      };
    },
  );

  const acquisition = {
    schemaVersion: 1,
    fixtureVersion: points.fixtureVersion,
    acquiredAt: new Date().toISOString(),
    refresh,
    terrainRgb: terrainRecords,
    mdt05: mdtRecords,
  };
  const acquisitionPath = path.join(
    fixtureStorageDirectory,
    "__fixture-acquisition.json",
  );
  await mkdir(path.dirname(acquisitionPath), { recursive: true });
  await writeFile(acquisitionPath, `${JSON.stringify(acquisition, null, 2)}\n`);
  console.log(
    `Verified ${terrainRecords.length} TerrainRGB tiles and ${mdtRecords.length} MDT05 segments.`,
  );
  console.log(path.relative(root, acquisitionPath));
}

await main();
