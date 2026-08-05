import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fromFile, type GeoTIFFImage } from "geotiff";
import { PNG } from "pngjs";
import { calculateEclipseCircumstances } from "../src/domain/eclipse.ts";
import { EVENT_TIME_SCALE } from "../src/domain/astronomy.ts";
import { ECLIPSE_2026_BESSELIAN_ELEMENTS } from "../src/domain/besselian-eclipse.ts";
import { PLANNING_VIEWPOINT_HEIGHT_METRES } from "../src/domain/observer.ts";
import {
  displayTimeZoneForSupportedCoordinate,
  terrainRequestEnvelopeAt,
  TERRAIN_REQUEST_ENVELOPES,
} from "../src/domain/terrain-coverage.ts";
import {
  evaluateScientificReport,
  SCIENTIFIC_INPUT_PATHS,
} from "./scientific-verification.mjs";
import {
  calculateTerrainHorizonFromTiles,
  createTerrainSamplePlan,
  decodeTerrainRgb,
  SOLAR_DISC_AZIMUTH_STEP_DEGREES,
  TERRAIN_AZIMUTH_HALF_SWEEP_DEGREES,
  TERRAIN_AZIMUTH_STEP_DEGREES,
  TERRAIN_SAMPLE_DISTANCES_KILOMETRES,
  TERRAIN_TILE_SIZE,
  TERRAIN_ZOOM,
  terrainElevationAt,
  terrainPixelAddress,
  terrainTileKey,
  validateElevationTile,
  type ElevationTile,
} from "../src/domain/terrain-horizon.ts";
import {
  REFERENCE_GEOMETRY,
  referenceApparentTerrainAngle,
  referenceDestinationPoint,
} from "./verification-reference-geometry.mjs";
import { requiredInputPath } from "./required-input-path.mts";

type HorizonValidation = {
  terrainClassIntent: string;
  referenceAzimuthDegrees: number;
};

type ValidationPoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  strata: string[];
  horizonValidation?: HorizonValidation;
};

type PointManifest = {
  schemaVersion: number;
  fixtureVersion: string;
  selectionFrozenAt: string;
  selectionRule: string;
  coordinateReferenceSystem: string;
  nearbyHorizonPairs: Array<{
    id: string;
    leftPointId: string;
    rightPointId: string;
    maximumSeparationMetres: number;
    selectionReason: string;
  }>;
  points: ValidationPoint[];
};

type FixtureRecord = {
  sha256: string;
  bytes?: number;
};

type FixtureManifest = {
  schemaVersion: number;
  fixtureVersion: string;
  eventDate: string;
  timeStandard: string;
  displayTimeZone: string;
  thresholds: {
    contactTimeAbsoluteSeconds: number;
    maximumTimeAbsoluteSeconds: number;
    totalityDurationAbsoluteSeconds: number;
    solarPositionAbsoluteDegrees: number;
    terrainRgbEncodedResolutionMetres: number;
    terrainRgbToMdt05HorizonAbsoluteDegrees: number;
    nearbyHorizonDifferentialAbsoluteDegrees: number;
    terrainToFieldHorizonAbsoluteDegrees: number;
    recommendationClearanceDegrees: number;
  };
  officialAstronomyFixture: FixtureRecord & {
    producer: string;
    name: string;
    sourcePage: string;
    license: string;
    observerElevationModel: string;
    spatialReference: string;
    nativeCellSizeMetres: number;
    noDataValue: number;
  };
  officialDescriptionFixture: FixtureRecord;
  officialContourFixture: FixtureRecord;
  terrainRgbFixture: {
    zoom: number;
    tileSizePixels: number;
    decode: string;
  };
  mdt05Fixture: {
    coverageId: string;
    sampleIntervalMetres: number;
    segmentLengthMetres: number;
    maximumDistanceMetres: number;
  };
};

type AcquisitionRecord = FixtureRecord & {
  localPath: string;
  sourceUrl: string;
  key?: string;
  pointId?: string;
  segmentIndex?: number;
  startDistanceKilometres?: number;
  endDistanceKilometres?: number;
};

type AcquisitionManifest = {
  schemaVersion: number;
  fixtureVersion: string;
  acquiredAt: string;
  terrainRgb: AcquisitionRecord[];
  mdt05: AcquisitionRecord[];
};

type OfficialAstronomySample = {
  raster: {
    column: number;
    row: number;
    cellCentreLatitude: number;
    cellCentreLongitude: number;
    inputToCellCentreMetres: number;
  };
  solarAltitudeDegrees: number;
  solarAzimuthDegrees: number;
  obscuration: number;
  partialBegin: Date;
  maximum: Date;
  partialEnd: Date;
  totalBegin: Date | null;
  totalEnd: Date | null;
  kind: "total" | "partial";
  totalityDurationSeconds: number | null;
};

type MdtSegment = {
  segmentIndex: number;
  image: GeoTIFFImage;
  elevations: ArrayLike<number>;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDirectory = path.join(root, "verification/fixtures/v2");
const reportPath = path.join(root, "verification/scientific-verification.json");
const checksumPath = path.join(root, "verification/scientific-verification.sha256");
const officialAstronomyPath = requiredInputPath(
  "ECLIPSE_ATLAS_IGN_2026_RASTER",
);
const officialDescriptionPath = requiredInputPath(
  "ECLIPSE_ATLAS_IGN_2026_DESCRIPTION",
);
const officialContourPath = requiredInputPath(
  "ECLIPSE_ATLAS_IGN_2026_VECTOR",
);
const fixtureStorageDirectory = requiredInputPath(
  "ECLIPSE_ATLAS_FIXTURE_DIRECTORY",
);
const RELEASE_CRITERIA = JSON.parse(
  await readFile(path.join(root, "verification/acceptance.json"), "utf8"),
) as {
  minimumValidationPointCount: number;
  minimumMdt05ComparisonCount: number;
  minimumNearbyHorizonPairCount: number;
  requiredValidationStrata: string[];
  numericalThresholds: FixtureManifest["thresholds"];
  requiredEvidenceCounts: Record<string, number>;
};

function sha256(buffer: Uint8Array | string) {
  return createHash("sha256").update(buffer).digest("hex");
}

function round(value: number, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function maximumAbsolute(values: number[]) {
  return values.length === 0
    ? null
    : round(Math.max(...values.map((value) => Math.abs(value))));
}

function pearson(left: number[], right: number[]) {
  if (left.length < 3 || left.length !== right.length) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquares += leftDelta ** 2;
    rightSquares += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftSquares * rightSquares);
  return denominator === 0 ? null : round(numerator / denominator);
}

function decimalUtcHoursToDate(hours: number) {
  return new Date(Date.UTC(2026, 7, 12) + hours * 3_600_000);
}

function timeResidualSeconds(product: Date | null, reference: Date | null) {
  if (!product || !reference) return null;
  return round((product.getTime() - reference.getTime()) / 1_000);
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

function distanceMetres(
  leftLatitude: number,
  leftLongitude: number,
  rightLatitude: number,
  rightLongitude: number,
) {
  const latitudeDelta = ((rightLatitude - leftLatitude) * Math.PI) / 180;
  const longitudeDelta = ((rightLongitude - leftLongitude) * Math.PI) / 180;
  const leftRadians = (leftLatitude * Math.PI) / 180;
  const rightRadians = (rightLatitude * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftRadians) *
      Math.cos(rightRadians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
}

async function verifyFixture(
  fixtureId: string,
  filePath: string,
  record: FixtureRecord,
) {
  const buffer = await readFile(filePath);
  const actualSha256 = sha256(buffer);
  return {
    fixtureId,
    bytes: buffer.byteLength,
    expectedSha256: record.sha256,
    actualSha256,
    checksumPass: actualSha256 === record.sha256,
  };
}

async function sampleOfficialAstronomy(
  image: GeoTIFFImage,
  point: ValidationPoint,
  noDataValue: number,
): Promise<OfficialAstronomySample> {
  const [minimumX, , , maximumY] = image.getBoundingBox();
  const [resolutionX, resolutionY] = image.getResolution();
  const projected = webMercator(point.latitude, point.longitude);
  const column = Math.floor((projected.x - minimumX) / resolutionX);
  const row = Math.floor(
    (maximumY - projected.y) / Math.abs(resolutionY),
  );
  const bands = await image.readRasters({
    window: [column, row, column + 1, row + 1],
  });
  const values = bands.map((band) => Number(band[0]));
  const cellCentre = inverseWebMercator(
    minimumX + (column + 0.5) * resolutionX,
    maximumY - (row + 0.5) * Math.abs(resolutionY),
  );
  const totalBegin =
    values[8] === noDataValue ? null : decimalUtcHoursToDate(values[8]);
  const totalEnd =
    values[9] === noDataValue ? null : decimalUtcHoursToDate(values[9]);

  return {
    raster: {
      column,
      row,
      cellCentreLatitude: round(cellCentre.latitude, 8),
      cellCentreLongitude: round(cellCentre.longitude, 8),
      inputToCellCentreMetres: round(
        distanceMetres(
          point.latitude,
          point.longitude,
          cellCentre.latitude,
          cellCentre.longitude,
        ),
        3,
      ),
    },
    solarAltitudeDegrees: values[0],
    solarAzimuthDegrees: values[1],
    obscuration: values[2],
    partialBegin: decimalUtcHoursToDate(values[5]),
    maximum: decimalUtcHoursToDate(values[6]),
    partialEnd: decimalUtcHoursToDate(values[7]),
    totalBegin,
    totalEnd,
    kind: totalBegin && totalEnd ? "total" : "partial",
    totalityDurationSeconds:
      totalBegin && totalEnd
        ? round((totalEnd.getTime() - totalBegin.getTime()) / 1_000)
        : null,
  };
}

async function loadTerrainTiles(records: AcquisitionRecord[]) {
  const tiles = new Map<string, ElevationTile>();
  for (const record of records) {
    if (!record.key) throw new Error("Terrain acquisition record has no key.");
    const buffer = await readFile(path.join(root, record.localPath));
    if (sha256(buffer) !== record.sha256) {
      throw new Error(`Terrain fixture checksum mismatch: ${record.localPath}`);
    }
    const png = PNG.sync.read(buffer);
    const tile = {
      width: png.width,
      height: png.height,
      pixels: new Uint8ClampedArray(png.data),
    } satisfies ElevationTile;
    validateElevationTile(tile);
    tiles.set(record.key, tile);
  }
  return tiles;
}

function rgbControl(
  point: ValidationPoint,
  tiles: ReadonlyMap<string, ElevationTile>,
) {
  const address = terrainPixelAddress(
    point.latitude,
    point.longitude,
    TERRAIN_ZOOM,
  );
  const tile = tiles.get(terrainTileKey(address));
  if (!tile) throw new Error(`Missing TerrainRGB tile for ${point.id}.`);
  const offset = (address.pixelY * TERRAIN_TILE_SIZE + address.pixelX) * 4;
  const red = tile.pixels[offset];
  const green = tile.pixels[offset + 1];
  const blue = tile.pixels[offset + 2];
  const alpha = tile.pixels[offset + 3];
  const elevationMetres = terrainElevationAt(address, tiles);
  const encodedInteger = red * 256 * 256 + green * 256 + blue;
  return {
    pointId: point.id,
    latitude: point.latitude,
    longitude: point.longitude,
    address,
    rgba: [red, green, blue, alpha],
    elevationMetres: round(elevationMetres, 1),
    encodedRoundTripPass:
      Math.round((elevationMetres + 10_000) * 10) === encodedInteger,
    opaquePass: alpha !== 0,
  };
}

function collectTileBoundaryTransitions(point: ValidationPoint) {
  if (!point.horizonValidation) return [];
  const plan = createTerrainSamplePlan(
    point.latitude,
    point.longitude,
    {
      centreAzimuthDegrees:
        point.horizonValidation.referenceAzimuthDegrees,
      solarDisc: null,
      viewpointHeightAboveGroundMetres:
        PLANNING_VIEWPOINT_HEIGHT_METRES,
    },
  );
  return plan.profileRays.flatMap((ray) =>
    ray.samples.flatMap((sample, index) => {
      if (index === 0) return [];
      const previous = ray.samples[index - 1];
      if (
        previous.tileX === sample.tileX &&
        previous.tileY === sample.tileY
      ) {
        return [];
      }
      return [
        {
          pointId: point.id,
          azimuthDegrees: ray.azimuthDegrees,
          beforeDistanceKilometres: previous.distanceKilometres,
          afterDistanceKilometres: sample.distanceKilometres,
          before: {
            tileX: previous.tileX,
            tileY: previous.tileY,
            pixelX: previous.pixelX,
            pixelY: previous.pixelY,
          },
          after: {
            tileX: sample.tileX,
            tileY: sample.tileY,
            pixelX: sample.pixelX,
            pixelY: sample.pixelY,
          },
        },
      ];
    }),
  );
}

function minimumDecodedElevation(tiles: ReadonlyMap<string, ElevationTile>) {
  let minimum: null | {
    tileKey: string;
    pixelX: number;
    pixelY: number;
    rgba: number[];
    elevationMetres: number;
  } = null;
  for (const [key, tile] of tiles) {
    for (let offset = 0; offset < tile.pixels.length; offset += 4) {
      if (tile.pixels[offset + 3] === 0) continue;
      const elevationMetres = decodeTerrainRgb(
        tile.pixels[offset],
        tile.pixels[offset + 1],
        tile.pixels[offset + 2],
      );
      if (!minimum || elevationMetres < minimum.elevationMetres) {
        const pixelIndex = offset / 4;
        minimum = {
          tileKey: key,
          pixelX: pixelIndex % TERRAIN_TILE_SIZE,
          pixelY: Math.floor(pixelIndex / TERRAIN_TILE_SIZE),
          rgba: [
            tile.pixels[offset],
            tile.pixels[offset + 1],
            tile.pixels[offset + 2],
            tile.pixels[offset + 3],
          ],
          elevationMetres: round(elevationMetres, 1),
        };
      }
    }
  }
  return minimum;
}

async function loadMdtSegments(
  pointId: string,
  records: AcquisitionRecord[],
) {
  const pointRecords = records
    .filter((record) => record.pointId === pointId)
    .sort((left, right) => left.segmentIndex! - right.segmentIndex!);
  const segments: MdtSegment[] = [];
  for (const record of pointRecords) {
    if (record.segmentIndex === undefined) {
      throw new Error("MDT05 acquisition record has no segment index.");
    }
    const buffer = await readFile(path.join(root, record.localPath));
    if (sha256(buffer) !== record.sha256) {
      throw new Error(`MDT05 fixture checksum mismatch: ${record.localPath}`);
    }
    const image = await (await fromFile(path.join(root, record.localPath))).getImage();
    const [elevations] = await image.readRasters();
    segments.push({
      segmentIndex: record.segmentIndex,
      image,
      elevations,
    });
  }
  return segments;
}

function sampleMdtElevation(
  latitude: number,
  longitude: number,
  segment: MdtSegment,
) {
  const [minimumLongitude, minimumLatitude, maximumLongitude, maximumLatitude] =
    segment.image.getBoundingBox();
  const [resolutionLongitude, resolutionLatitude] =
    segment.image.getResolution();
  const column = Math.max(
    0,
    Math.min(
      segment.image.getWidth() - 1,
      Math.floor((longitude - minimumLongitude) / resolutionLongitude),
    ),
  );
  const row = Math.max(
    0,
    Math.min(
      segment.image.getHeight() - 1,
      Math.floor(
        (maximumLatitude - latitude) / Math.abs(resolutionLatitude),
      ),
    ),
  );
  if (
    longitude < minimumLongitude ||
    longitude > maximumLongitude ||
    latitude < minimumLatitude ||
    latitude > maximumLatitude
  ) {
    throw new Error(
      `MDT05 sample falls outside segment ${segment.segmentIndex}.`,
    );
  }
  return Number(
    segment.elevations[row * segment.image.getWidth() + column],
  );
}

function calculateMdtHorizon(
  point: ValidationPoint,
  segments: MdtSegment[],
  sampleIntervalMetres: number,
  segmentLengthMetres: number,
  maximumDistanceMetres: number,
) {
  if (!point.horizonValidation) {
    throw new Error(`${point.id} is not a horizon validation point.`);
  }
  const groundElevationMetres = sampleMdtElevation(
    point.latitude,
    point.longitude,
    segments[0],
  );
  let horizonAltitudeDegrees = -90;
  let limitingDistanceKilometres = 0;
  for (
    let distanceMetres = sampleIntervalMetres;
    distanceMetres <= maximumDistanceMetres;
    distanceMetres += sampleIntervalMetres
  ) {
    const segmentIndex = Math.min(
      segments.length - 1,
      Math.floor(distanceMetres / segmentLengthMetres),
    );
    const coordinate = referenceDestinationPoint(
      point.latitude,
      point.longitude,
      point.horizonValidation.referenceAzimuthDegrees,
      distanceMetres / 1_000,
    );
    const targetElevationMetres = sampleMdtElevation(
      coordinate.latitude,
      coordinate.longitude,
      segments[segmentIndex],
    );
    const angle = referenceApparentTerrainAngle({
      observerGroundElevationMetres: groundElevationMetres,
      viewpointHeightAboveGroundMetres: PLANNING_VIEWPOINT_HEIGHT_METRES,
      targetGroundElevationMetres: targetElevationMetres,
      distanceKilometres: distanceMetres / 1_000,
    });
    if (angle > horizonAltitudeDegrees) {
      horizonAltitudeDegrees = angle;
      limitingDistanceKilometres = distanceMetres / 1_000;
    }
  }

  let scheduledHorizonDegrees = -90;
  let scheduledLimitingDistanceKilometres = 0;
  for (const distanceKilometres of TERRAIN_SAMPLE_DISTANCES_KILOMETRES) {
    const distanceMetres = distanceKilometres * 1_000;
    const segmentIndex = Math.min(
      segments.length - 1,
      Math.floor(distanceMetres / segmentLengthMetres),
    );
    const coordinate = referenceDestinationPoint(
      point.latitude,
      point.longitude,
      point.horizonValidation.referenceAzimuthDegrees,
      distanceKilometres,
    );
    const targetElevationMetres = sampleMdtElevation(
      coordinate.latitude,
      coordinate.longitude,
      segments[segmentIndex],
    );
    const angle = referenceApparentTerrainAngle({
      observerGroundElevationMetres: groundElevationMetres,
      viewpointHeightAboveGroundMetres: PLANNING_VIEWPOINT_HEIGHT_METRES,
      targetGroundElevationMetres: targetElevationMetres,
      distanceKilometres,
    });
    if (angle > scheduledHorizonDegrees) {
      scheduledHorizonDegrees = angle;
      scheduledLimitingDistanceKilometres = distanceKilometres;
    }
  }

  return {
    groundElevationMetres,
    viewpointHeightAboveGroundMetres: PLANNING_VIEWPOINT_HEIGHT_METRES,
    observerElevationMetres:
      groundElevationMetres + PLANNING_VIEWPOINT_HEIGHT_METRES,
    horizonAltitudeDegrees: round(horizonAltitudeDegrees),
    limitingDistanceKilometres,
    scheduledHorizonDegrees: round(scheduledHorizonDegrees),
    scheduledLimitingDistanceKilometres,
    samplingSensitivityDegrees: round(
      scheduledHorizonDegrees - horizonAltitudeDegrees,
    ),
  };
}

function gitOutput(arguments_: string[]) {
  try {
    return execFileSync("git", arguments_, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function commandOutput(command: string, arguments_: string[]) {
  try {
    return execFileSync(command, arguments_, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const pointManifest = JSON.parse(
    await readFile(path.join(fixtureDirectory, "validation-points.json"), "utf8"),
  ) as PointManifest;
  const fixtureManifest = JSON.parse(
    await readFile(path.join(fixtureDirectory, "fixture-manifest.json"), "utf8"),
  ) as FixtureManifest;
  const acquisitionPath = path.join(
    fixtureStorageDirectory,
    "__fixture-acquisition.json",
  );
  const acquisition = JSON.parse(
    await readFile(acquisitionPath, "utf8"),
  ) as AcquisitionManifest;
  if (
    pointManifest.fixtureVersion !== fixtureManifest.fixtureVersion ||
    acquisition.fixtureVersion !== fixtureManifest.fixtureVersion
  ) {
    throw new Error("Verification fixture versions do not agree.");
  }
  if (
    JSON.stringify(fixtureManifest.thresholds) !==
    JSON.stringify(RELEASE_CRITERIA.numericalThresholds)
  ) {
    throw new Error(
      "Verification fixture thresholds do not match the release criteria.",
    );
  }

  const officialFixtureChecks = await Promise.all([
    verifyFixture(
      "ign-2026-astronomy-raster",
      officialAstronomyPath,
      fixtureManifest.officialAstronomyFixture,
    ),
    verifyFixture(
      "ign-2026-description",
      officialDescriptionPath,
      fixtureManifest.officialDescriptionFixture,
    ),
    verifyFixture(
      "ign-2026-contours",
      officialContourPath,
      fixtureManifest.officialContourFixture,
    ),
  ]);
  const acquiredFixtureChecks = await Promise.all(
    [...acquisition.terrainRgb, ...acquisition.mdt05].map((record, index) =>
      verifyFixture(
        record.key ??
          `${record.pointId ?? "acquired"}:${record.segmentIndex ?? index}`,
        path.join(root, record.localPath),
        record,
      ),
    ),
  );
  if (
    [...officialFixtureChecks, ...acquiredFixtureChecks].some(
      (fixture) => !fixture.checksumPass,
    )
  ) {
    throw new Error("A frozen verification fixture failed its SHA-256 check.");
  }
  const terrainTiles = await loadTerrainTiles(acquisition.terrainRgb);
  const astronomyImage = await (
    await fromFile(officialAstronomyPath)
  ).getImage();

  const astronomyComparisons = [];
  const elevationEffects = [];
  for (const point of pointManifest.points) {
    const official = await sampleOfficialAstronomy(
      astronomyImage,
      point,
      fixtureManifest.officialAstronomyFixture.noDataValue,
    );
    const requestedAddress = terrainPixelAddress(
      point.latitude,
      point.longitude,
      TERRAIN_ZOOM,
    );
    const requestedObserverElevationMetres = terrainElevationAt(
      requestedAddress,
      terrainTiles,
    );
    const comparisonAddress = terrainPixelAddress(
      official.raster.cellCentreLatitude,
      official.raster.cellCentreLongitude,
      TERRAIN_ZOOM,
    );
    const observerElevationMetres = terrainElevationAt(
      comparisonAddress,
      terrainTiles,
    );
    const product = calculateEclipseCircumstances(
      official.raster.cellCentreLatitude,
      official.raster.cellCentreLongitude,
      {
        groundElevationMetres: observerElevationMetres,
        viewpointHeightAboveGroundMetres: PLANNING_VIEWPOINT_HEIGHT_METRES,
      },
    );
    const requestedProduct = calculateEclipseCircumstances(
      point.latitude,
      point.longitude,
      {
        groundElevationMetres: requestedObserverElevationMetres,
        viewpointHeightAboveGroundMetres: PLANNING_VIEWPOINT_HEIGHT_METRES,
      },
    );
    const zeroElevationProduct = calculateEclipseCircumstances(
      point.latitude,
      point.longitude,
      {
        groundElevationMetres: 0,
        viewpointHeightAboveGroundMetres: PLANNING_VIEWPOINT_HEIGHT_METRES,
      },
    );
    if (!product || !requestedProduct || !zeroElevationProduct) {
      throw new Error(`Target eclipse was not calculated at ${point.id}.`);
    }
    const contactResiduals = {
      c1: timeResidualSeconds(product.partialBegin, official.partialBegin),
      c2: timeResidualSeconds(product.totalBegin, official.totalBegin),
      maximum: timeResidualSeconds(product.peak, official.maximum),
      c3: timeResidualSeconds(product.totalEnd, official.totalEnd),
      c4: timeResidualSeconds(product.partialEnd, official.partialEnd),
    };
    astronomyComparisons.push({
      pointId: point.id,
      displayTimeZone: displayTimeZoneForSupportedCoordinate(
        point.latitude,
        point.longitude,
      ),
      solarAltitudeReference: "apparent-refraction-adjusted-solar-centre",
      contactHorizonReference: "ideal-horizontal-plane",
      contactTerrainObstructionEvaluated: false,
      contactVisibilityCriterion:
        "unrounded apparent solar-centre altitude > 0 degrees",
      requestedCoordinate: {
        latitude: point.latitude,
        longitude: point.longitude,
      },
      comparisonCoordinate: {
        latitude: official.raster.cellCentreLatitude,
        longitude: official.raster.cellCentreLongitude,
        coordinateAlignedWithOfficialCellCentre: true,
      },
      observerElevation: {
        groundMetres: round(observerElevationMetres, 1),
        viewpointHeightAboveGroundMetres:
          PLANNING_VIEWPOINT_HEIGHT_METRES,
        effectiveObserverMetres: round(
          observerElevationMetres + PLANNING_VIEWPOINT_HEIGHT_METRES,
          1,
        ),
        source: "IGN/CNIG TerrainRGB zoom 11",
        officialMetres: null,
        officialModel: fixtureManifest.officialAstronomyFixture.observerElevationModel,
      },
      officialRasterCell: official.raster,
      classification: {
        product: product.kind,
        official: official.kind,
      },
      product: {
        partialBegin: product.partialBegin.toISOString(),
        totalBegin: product.totalBegin?.toISOString() ?? null,
        maximum: product.peak.toISOString(),
        totalEnd: product.totalEnd?.toISOString() ?? null,
        partialEnd: product.partialEnd.toISOString(),
        totalityDurationSeconds: product.totalityDurationSeconds,
        obscuration: product.obscuration,
        solarAltitudeDegrees: product.sunAltitudeDegrees,
        solarAzimuthDegrees: product.sunAzimuthDegrees,
        solarAngularRadiusDegrees: product.solarAngularRadiusDegrees,
      },
      official: {
        partialBegin: official.partialBegin.toISOString(),
        totalBegin: official.totalBegin?.toISOString() ?? null,
        maximum: official.maximum.toISOString(),
        totalEnd: official.totalEnd?.toISOString() ?? null,
        partialEnd: official.partialEnd.toISOString(),
        totalityDurationSeconds: official.totalityDurationSeconds,
        obscuration: official.obscuration,
        solarAltitudeDegrees: official.solarAltitudeDegrees,
        solarAzimuthDegrees: official.solarAzimuthDegrees,
      },
      residuals: {
        seconds: contactResiduals,
        totalityDurationSeconds:
          product.totalityDurationSeconds === null ||
          official.totalityDurationSeconds === null
            ? null
            : round(
                product.totalityDurationSeconds -
                  official.totalityDurationSeconds,
              ),
        obscuration: round(product.obscuration - official.obscuration),
        solarAltitudeDegrees: round(
          product.sunAltitudeDegrees - official.solarAltitudeDegrees,
        ),
        solarAzimuthDegrees: round(
          product.sunAzimuthDegrees - official.solarAzimuthDegrees,
        ),
      },
    });
    elevationEffects.push({
      pointId: point.id,
      terrainElevationMetres: round(requestedObserverElevationMetres, 1),
      classificationChanged:
        requestedProduct.kind !== zeroElevationProduct.kind,
      maximumTimeDeltaSeconds: timeResidualSeconds(
        requestedProduct.peak,
        zeroElevationProduct.peak,
      ),
      totalityDurationDeltaSeconds:
        requestedProduct.totalityDurationSeconds === null ||
        zeroElevationProduct.totalityDurationSeconds === null
          ? null
          : round(
              requestedProduct.totalityDurationSeconds -
                zeroElevationProduct.totalityDurationSeconds,
            ),
      solarAltitudeDeltaDegrees: round(
        requestedProduct.sunAltitudeDegrees -
          zeroElevationProduct.sunAltitudeDegrees,
      ),
      solarAzimuthDeltaDegrees: round(
        requestedProduct.sunAzimuthDegrees -
          zeroElevationProduct.sunAzimuthDegrees,
      ),
    });
  }

  const allContactResiduals = astronomyComparisons.flatMap((comparison) =>
    [
      comparison.residuals.seconds.c1,
      comparison.residuals.seconds.c2,
      comparison.residuals.seconds.c3,
      comparison.residuals.seconds.c4,
    ].filter((value): value is number => value !== null),
  );
  const maximumResiduals = astronomyComparisons.map(
    (comparison) => comparison.residuals.seconds.maximum!,
  );
  const durationResiduals = astronomyComparisons
    .map((comparison) => comparison.residuals.totalityDurationSeconds)
    .filter((value): value is number => value !== null);
  const altitudeResiduals = astronomyComparisons.map(
    (comparison) => comparison.residuals.solarAltitudeDegrees,
  );
  const azimuthResiduals = astronomyComparisons.map(
    (comparison) => comparison.residuals.solarAzimuthDegrees,
  );
  const obscurationResiduals = astronomyComparisons.map(
    (comparison) => comparison.residuals.obscuration,
  );
  const maximumContactResidualByPoint = astronomyComparisons.map((comparison) =>
    Math.max(
      ...[
        comparison.residuals.seconds.c1,
        comparison.residuals.seconds.c2,
        comparison.residuals.seconds.maximum,
        comparison.residuals.seconds.c3,
        comparison.residuals.seconds.c4,
      ]
        .filter((value): value is number => value !== null)
        .map(Math.abs),
    ),
  );
  const terrainControls = pointManifest.points.map((point) =>
    rgbControl(point, terrainTiles),
  );
  const boundaryTransitions = pointManifest.points
    .flatMap(collectTileBoundaryTransitions)
    .slice(0, 30);
  const minimumElevation = minimumDecodedElevation(terrainTiles);
  const horizonComparisons = [];
  for (const point of pointManifest.points.filter(
    (candidate) => candidate.horizonValidation,
  )) {
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
    const terrainRgb = calculateTerrainHorizonFromTiles(plan, terrainTiles);
    const segments = await loadMdtSegments(point.id, acquisition.mdt05);
    const mdt05 = calculateMdtHorizon(
      point,
      segments,
      fixtureManifest.mdt05Fixture.sampleIntervalMetres,
      fixtureManifest.mdt05Fixture.segmentLengthMetres,
      fixtureManifest.mdt05Fixture.maximumDistanceMetres,
    );
    horizonComparisons.push({
      pointId: point.id,
      terrainClassIntent: point.horizonValidation!.terrainClassIntent,
      azimuthDegrees: point.horizonValidation!.referenceAzimuthDegrees,
      terrainRgb: {
        groundElevationMetres: terrainRgb.groundElevationMetres,
        viewpointHeightAboveGroundMetres:
          terrainRgb.viewpointHeightAboveGroundMetres,
        observerElevationMetres: terrainRgb.observerElevationMetres,
        horizonAltitudeDegrees: terrainRgb.horizonAtSunDegrees,
        limitingDistanceKilometres:
          terrainRgb.profile[Math.floor(terrainRgb.profile.length / 2)]
            .limitingDistanceKilometres,
        samplesPerRay: terrainRgb.samplesPerRay,
      },
      mdt05,
      residuals: {
        groundElevationMetres: round(
          terrainRgb.groundElevationMetres - mdt05.groundElevationMetres,
        ),
        observerElevationMetres: round(
          terrainRgb.observerElevationMetres - mdt05.observerElevationMetres,
        ),
        horizonDegrees: round(
          terrainRgb.horizonAtSunDegrees - mdt05.horizonAltitudeDegrees,
        ),
      },
      thresholdPass:
        Math.abs(
          terrainRgb.horizonAtSunDegrees - mdt05.horizonAltitudeDegrees,
        ) <=
        fixtureManifest.thresholds.terrainRgbToMdt05HorizonAbsoluteDegrees,
    });
  }
  const horizonComparisonByPointId = new Map(
    horizonComparisons.map((comparison) => [comparison.pointId, comparison]),
  );
  const pointById = new Map(
    pointManifest.points.map((point) => [point.id, point]),
  );
  const nearbyHorizonComparisons = pointManifest.nearbyHorizonPairs.map(
    (pair) => {
      const leftPoint = pointById.get(pair.leftPointId);
      const rightPoint = pointById.get(pair.rightPointId);
      const left = horizonComparisonByPointId.get(pair.leftPointId);
      const right = horizonComparisonByPointId.get(pair.rightPointId);
      if (!leftPoint || !rightPoint || !left || !right) {
        throw new Error(`Nearby horizon pair ${pair.id} is incomplete.`);
      }
      const separationMetres = distanceMetres(
        leftPoint.latitude,
        leftPoint.longitude,
        rightPoint.latitude,
        rightPoint.longitude,
      );
      if (separationMetres > pair.maximumSeparationMetres) {
        throw new Error(`Nearby horizon pair ${pair.id} exceeds its frozen separation.`);
      }
      const terrainRgbDifferenceDegrees =
        right.terrainRgb.horizonAltitudeDegrees -
        left.terrainRgb.horizonAltitudeDegrees;
      const mdt05DifferenceDegrees =
        right.mdt05.horizonAltitudeDegrees -
        left.mdt05.horizonAltitudeDegrees;
      return {
        pairId: pair.id,
        leftPointId: pair.leftPointId,
        rightPointId: pair.rightPointId,
        separationMetres: round(separationMetres),
        terrainRgbDifferenceDegrees: round(terrainRgbDifferenceDegrees),
        mdt05DifferenceDegrees: round(mdt05DifferenceDegrees),
        differentialResidualDegrees: round(
          terrainRgbDifferenceDegrees - mdt05DifferenceDegrees,
        ),
      };
    },
  );
  const commit = gitOutput(["rev-parse", "--verify", "HEAD"]);
  const gitStatus = gitOutput(["status", "--porcelain=v1"]);
  const dependencyLock = await readFile(path.join(root, "package-lock.json"));
  const dependencyLockJson = JSON.parse(dependencyLock.toString("utf8")) as {
    packages: Record<string, { version?: string }>;
  };
  const verificationHarness = await readFile(
    path.join(root, "scripts/run-scientific-verification.mts"),
  );
  const scientificInputSha256 = Object.fromEntries(
    await Promise.all(
      SCIENTIFIC_INPUT_PATHS.map(async (relativePath) => [
        relativePath,
        sha256(await readFile(path.join(root, relativePath))),
      ]),
    ),
  );
  const packageJson = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  ) as { version: string; dependencies: Record<string, string> };
  const validationEnvelopeIds = [...new Set(
    pointManifest.points.map((point) => {
      const envelope = terrainRequestEnvelopeAt(point.latitude, point.longitude);
      if (!envelope) {
        throw new Error(`Validation point ${point.id} is outside every request envelope.`);
      }
      return envelope.id;
    }),
  )];
  const validationTimeZones = [...new Set(
    pointManifest.points.map((point) =>
      displayTimeZoneForSupportedCoordinate(point.latitude, point.longitude),
    ),
  )];
const validationPointManifestBuffer = await readFile(
    path.join(fixtureDirectory, "validation-points.json"),
  );
  const fixtureManifestBuffer = await readFile(
    path.join(fixtureDirectory, "fixture-manifest.json"),
  );
  const cleanFixtureCheck = (fixture: {
    fixtureId: string;
    bytes: number;
    expectedSha256: string;
    actualSha256: string;
  }) => ({
    fixtureId: fixture.fixtureId,
    bytes: fixture.bytes,
    expectedSha256: fixture.expectedSha256,
    actualSha256: fixture.actualSha256,
  });
  const cleanedHorizonComparisons = horizonComparisons.map((comparison) => {
    const measurement = { ...comparison } as Partial<typeof comparison>;
    delete measurement.thresholdPass;
    return measurement;
  });
  const cleanedTerrainControls = terrainControls.map((control) => ({
    pointId: control.pointId,
    latitude: control.latitude,
    longitude: control.longitude,
    address: control.address,
    rgba: control.rgba,
    elevationMetres: control.elevationMetres,
  }));

  const report = {
    schemaVersion: 2,
    reportVersion: "2.1.0",
    generatedAt: new Date().toISOString(),
    event: {
      date: fixtureManifest.eventDate,
      timeStandard: fixtureManifest.timeStandard,
    },
    environment: {
      projectVersion: packageJson.version,
      gitCommit: commit,
      gitClean: gitStatus === "",
      node: process.version,
      npm: commandOutput("npm", ["--version"]),
      operatingSystem: os.type() + " " + os.release() + " " + os.arch(),
      packageLockSha256: sha256(dependencyLock),
      generatorSha256: sha256(verificationHarness),
      acceptanceSha256:
        scientificInputSha256["verification/acceptance.json"],
      scientificInputSha256,
      dependencyVersions: {
        astronomyEngine:
          dependencyLockJson.packages["node_modules/astronomy-engine"]?.version,
        geotiff: dependencyLockJson.packages["node_modules/geotiff"]?.version,
        pngjs: dependencyLockJson.packages["node_modules/pngjs"]?.version,
      },
      calculationConfiguration: {
        viewpointHeightAboveGroundMetres:
          PLANNING_VIEWPOINT_HEIGHT_METRES,
        observerElevationFormula:
          "decoded ground elevation + assumed viewpoint height",
        terrainZoom: TERRAIN_ZOOM,
        terrainTilePixels: TERRAIN_TILE_SIZE,
        terrainSamplesPerRay:
          TERRAIN_SAMPLE_DISTANCES_KILOMETRES.length,
        terrainMaximumDistanceKilometres:
          TERRAIN_SAMPLE_DISTANCES_KILOMETRES.at(-1),
        terrainProfileAzimuthHalfSweepDegrees:
          TERRAIN_AZIMUTH_HALF_SWEEP_DEGREES,
        terrainProfileAzimuthStepDegrees:
          TERRAIN_AZIMUTH_STEP_DEGREES,
        solarDiscAzimuthMaximumStepDegrees:
          SOLAR_DISC_AZIMUTH_STEP_DEGREES,
        earthRadiusMetres: 6_371_000,
        refractionCoefficient: 0.13,
      },
    },
    fixtures: {
      fixtureVersion: fixtureManifest.fixtureVersion,
      validationPointManifestSha256: sha256(validationPointManifestBuffer),
      fixtureManifestSha256: sha256(fixtureManifestBuffer),
      acquiredAt: acquisition.acquiredAt,
      official: officialFixtureChecks.map(cleanFixtureCheck),
      acquired: acquiredFixtureChecks.map(cleanFixtureCheck),
    },
    validationSample: {
      frozenAt: pointManifest.selectionFrozenAt,
      rule: pointManifest.selectionRule,
      coordinateReferenceSystem: pointManifest.coordinateReferenceSystem,
      requestEnvelopeSemantics:
        "Configured TerrainRGB request envelopes, not a Spanish political boundary.",
      configuredRequestEnvelopes: TERRAIN_REQUEST_ENVELOPES,
      requestEnvelopeIdsPresentInSample: validationEnvelopeIds,
      displayTimeZonesPresentInSample: validationTimeZones,
      limitation:
        "The frozen sample does not represent every configured request envelope or display time zone.",
    },
    observerElevation: {
      source: "IGN/CNIG TerrainRGB ground elevation",
      viewpointHeightAboveGroundMetres:
        PLANNING_VIEWPOINT_HEIGHT_METRES,
      formula: "decoded ground elevation + planning viewpoint height",
      zeroGroundElevationSensitivity: {
        comparison:
          "0 m ground elevation versus TerrainRGB ground elevation with the same viewpoint height",
        maximumAbsoluteMaximumTimeDeltaSeconds: maximumAbsolute(
          elevationEffects.map((effect) => effect.maximumTimeDeltaSeconds!),
        ),
        maximumAbsoluteTotalityDurationDeltaSeconds: maximumAbsolute(
          elevationEffects
            .map((effect) => effect.totalityDurationDeltaSeconds)
            .filter((value): value is number => value !== null),
        ),
        maximumAbsoluteSolarAltitudeDeltaDegrees: maximumAbsolute(
          elevationEffects.map((effect) => effect.solarAltitudeDeltaDegrees),
        ),
        maximumAbsoluteSolarAzimuthDeltaDegrees: maximumAbsolute(
          elevationEffects.map((effect) => effect.solarAzimuthDeltaDegrees),
        ),
        classificationChangeCount: elevationEffects.filter(
          (effect) => effect.classificationChanged,
        ).length,
        points: elevationEffects,
      },
    },
    astronomy: {
      model: {
        eclipseCircumstances: {
          implementation: "owned-besselian-local-circumstances-v1",
          ...ECLIPSE_2026_BESSELIAN_ELEMENTS,
        },
        eventTimeScale: EVENT_TIME_SCALE,
        apparentBodyPositions: {
          engine: "Astronomy Engine",
          version: "2.1.19",
          role: "Topocentric apparent Sun and Moon positions and angular radii only",
        },
        timeScaleTransformation:
          "TT-UTC = (TAI-UTC) + (TT-TAI); Delta T = (TT-UTC) - (UT1-UTC). The current IERS event prediction replaces the source page's older Delta T assumption without altering its published polynomial elements.",
      },
      independentReference: {
        producer: fixtureManifest.officialAstronomyFixture.producer,
        sha256: fixtureManifest.officialAstronomyFixture.sha256,
      },
      coordinateAlignment:
        "Product values use the official raster cell centre; the official per-cell observer elevation is not available.",
      summary: {
        classificationMatches: astronomyComparisons.filter(
          (comparison) =>
            comparison.classification.product ===
            comparison.classification.official,
        ).length,
        comparisonCount: astronomyComparisons.length,
        maximumAbsoluteContactResidualSeconds:
          maximumAbsolute(allContactResiduals),
        maximumAbsoluteMaximumResidualSeconds:
          maximumAbsolute(maximumResiduals),
        maximumAbsoluteTotalityDurationResidualSeconds:
          maximumAbsolute(durationResiduals),
        maximumAbsoluteSolarAltitudeResidualDegrees:
          maximumAbsolute(altitudeResiduals),
        maximumAbsoluteSolarAzimuthResidualDegrees:
          maximumAbsolute(azimuthResiduals),
        maximumAbsoluteObscurationResidual:
          maximumAbsolute(obscurationResiduals),
        maximumContactResidualCorrelationWithLatitude: pearson(
          maximumContactResidualByPoint,
          pointManifest.points.map((point) => point.latitude),
        ),
        maximumContactResidualCorrelationWithLongitude: pearson(
          maximumContactResidualByPoint,
          pointManifest.points.map((point) => point.longitude),
        ),
        maximumContactResidualCorrelationWithProductElevation: pearson(
          maximumContactResidualByPoint,
          elevationEffects.map((effect) => effect.terrainElevationMetres),
        ),
      },
      comparisons: astronomyComparisons,
      solarAngularRadiusMethod:
        "asin(695700 km / Astronomy Engine topocentric Sun distance at maximum)",
    },
    terrainRgb: {
      encodedResolutionMetres:
        fixtureManifest.thresholds.terrainRgbEncodedResolutionMetres,
      tileCount: terrainTiles.size,
      coordinateControls: cleanedTerrainControls,
      tileBoundaryTransitions: boundaryTransitions,
      minimumDecodedFixtureElevation: minimumElevation,
      payloadFailureTests: {
        coveredCases: [
          "corrupt PNG signature",
          "oversized declared payload",
          "wrong MIME type",
          "wrong image dimensions",
          "transparent no-data pixel",
          "partially transparent no-data pixel",
          "opaque black no-data pixel",
          "delayed request timeout",
          "caller abort",
        ],
        testFile: "src/domain/terrain-horizon.test.ts",
      },
    },
    horizons: {
      lineage:
        "TerrainRGB and MDT05 share IGN/CNIG elevation lineage; this is a decoding and implementation consistency check, not independent DEM accuracy evidence.",
      referenceGeometry: REFERENCE_GEOMETRY,
      comparisons: cleanedHorizonComparisons,
      nearbyComparisons: nearbyHorizonComparisons,
      solarDiscMethod:
        "The application tests the complete apparent solar disc against terrain rays with no azimuth gap wider than 0.05 degrees. This fixture comparison validates the centre bearing at maximum; browser regression tests separately bind the rendered full-profile interaction.",
    },
    releaseEvidence: {
      independentAstronomyComparisons: [],
      fieldHorizonComparisons: [],
      independentReviews: [],
      exactVenues: [],
      currentWeatherArtifacts: [],
      freshOperationsReviews: [],
      documentedClearances: [],
    },
  };

  const evaluation = await evaluateScientificReport(report);
  const reportBuffer = Buffer.from(JSON.stringify(report, null, 2) + "\n");
  const checksumDocument = {
    schemaVersion: 2,
    file: "verification/scientific-verification.json",
    bytes: reportBuffer.byteLength,
    sha256: sha256(reportBuffer),
  };
  const reportTemporaryPath = reportPath + ".next-" + process.pid;
  const checksumTemporaryPath = checksumPath + ".next-" + process.pid;
  try {
    await writeFile(reportTemporaryPath, reportBuffer, { flag: "wx" });
    await writeFile(
      checksumTemporaryPath,
      JSON.stringify(checksumDocument, null, 2) + "\n",
      { flag: "wx" },
    );
    await rename(reportTemporaryPath, reportPath);
    await rename(checksumTemporaryPath, checksumPath);
  } catch (error) {
    await Promise.allSettled([
      unlink(reportTemporaryPath),
      unlink(checksumTemporaryPath),
    ]);
    throw error;
  }

  console.log("Scientific verification report: " + evaluation.reportIntegrity);
  console.log(
    "Recommendation readiness: " +
      evaluation.recommendationReadiness.status.replace("-", " "),
  );
  console.log("Validation points: " + pointManifest.points.length);
  console.log(
    "Maximum contact residual: " +
      evaluation.metrics.maximumContactResidualSeconds +
      " s",
  );
  console.log(
    "Maximum TerrainRGB/MDT05 horizon residual: " +
      evaluation.metrics.maximumMdt05HorizonResidualDegrees +
      " degrees",
  );
  console.log(path.relative(root, reportPath));
}

await main();
