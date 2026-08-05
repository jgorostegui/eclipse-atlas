import { resolveObserverElevation } from "./observer.ts";
import { isInsideTerrainRequestEnvelope } from "./terrain-coverage.ts";

export const TERRAIN_ZOOM = 11;
// IGN/CNIG serves 512 × 512 TerrainRGB tiles. XYZ tile indices are unchanged from
// conventional Web Mercator, but the intra-tile pixel address must use the real size.
export const TERRAIN_TILE_SIZE = 512;
export const EARTH_RADIUS_METRES = 6_371_000;
export const STANDARD_REFRACTION_COEFFICIENT = 0.13;
const TILE_TIMEOUT_MILLISECONDS = 8_000;
const MAX_TILE_BYTES = 1_500_000;
const MAX_CACHED_TILES = 32;
const MIN_SUPPORTED_GROUND_ELEVATION_METRES = -500;
const MAX_SUPPORTED_GROUND_ELEVATION_METRES = 10_000;
export const TERRAIN_AZIMUTH_HALF_SWEEP_DEGREES = 15;
export const TERRAIN_AZIMUTH_STEP_DEGREES = 0.5;
export const SOLAR_DISC_AZIMUTH_STEP_DEGREES = 0.05;
export const TERRAIN_TRACK_PADDING_DEGREES = 1;
const decodedTileCache = new Map<string, ElevationTile>();

function buildSampleDistancesKilometres() {
  const distances: number[] = [];
  const append = (start: number, end: number, step: number) => {
    for (let distance = start; distance <= end + step / 10; distance += step) {
      distances.push(Math.round(distance * 100) / 100);
    }
  };

  // The finest interval is close to the ground size of a zoom-11 TerrainRGB
  // pixel in Spain. Wider intervals are sufficient as angular sensitivity falls
  // with distance, while retaining much denser coverage than the retired
  // hand-picked 19-distance profile.
  append(0.05, 2, 0.05);
  append(2.05, 5, 0.05);
  append(5.1, 15, 0.1);
  append(15.25, 30, 0.25);
  append(30.5, 60, 0.5);
  append(61, 100, 1);
  return distances;
}

export const TERRAIN_SAMPLE_DISTANCES_KILOMETRES =
  buildSampleDistancesKilometres();

export const TERRAIN_SOURCE_URL =
  "https://xyz-mdt.idee.es/1.0.0/raster-dem/{z}/{x}/{y}.png";
export const TERRAIN_DOCUMENTATION_URL =
  "https://blog-idee.blogspot.com/2024/03/nuevo-servicio-xyz-del-modelo-digital.html";

export type TerrainProfilePoint = {
  azimuthDegrees: number;
  horizonAltitudeDegrees: number;
  limitingDistanceKilometres: number;
};

export type SolarDiscGeometry = {
  centreAltitudeDegrees: number;
  centreAzimuthDegrees: number;
  angularRadiusDegrees: number;
};

export type SolarDiscTerrainAssessment = {
  centreClearanceDegrees: number;
  fullDiscClearanceDegrees: number;
  anyDiscVisibilityMarginDegrees: number;
  intersection: "fully-clear" | "partially-obscured" | "fully-blocked";
  raysEvaluated: number;
  limitingDiscAzimuthOffsetDegrees: number;
  limitingTerrainAzimuthDegrees: number;
  limitingDistanceKilometres: number;
};

export type TerrainHorizon = {
  groundElevationMetres: number;
  viewpointHeightAboveGroundMetres: number;
  observerElevationMetres: number;
  profile: TerrainProfilePoint[];
  solarDiscProfile: TerrainProfilePoint[];
  solarDisc: SolarDiscGeometry | null;
  solarDiscAssessment: SolarDiscTerrainAssessment | null;
  horizonAtSunDegrees: number;
  source: "IGN/CNIG TerrainRGB";
  zoom: 11;
  maximumDistanceKilometres: 100;
  refractionCoefficient: 0.13;
  samplesPerRay: number;
  profileAzimuthStepDegrees: 0.5;
  solarDiscAzimuthStepDegrees: 0.05;
};

export type TerrainElevation = {
  elevationMetres: number;
  source: "IGN/CNIG TerrainRGB";
  zoom: 11;
  address: PixelAddress;
};

export type PixelAddress = {
  tileX: number;
  tileY: number;
  pixelX: number;
  pixelY: number;
};

export type TerrainSample = PixelAddress & {
  azimuthDegrees: number;
  distanceKilometres: number;
};

export type TerrainSampleRay = {
  azimuthDegrees: number;
  samples: TerrainSample[];
};

export type TerrainSamplePlan = {
  observerAddress: PixelAddress;
  centreAzimuthDegrees: number;
  minimumProfileAzimuthOffsetDegrees: number;
  maximumProfileAzimuthOffsetDegrees: number;
  profileRays: TerrainSampleRay[];
  solarDiscRays: TerrainSampleRay[];
  solarDisc: SolarDiscGeometry | null;
  viewpointHeightAboveGroundMetres: number;
  requiredAddresses: PixelAddress[];
};

export type TerrainProfileAzimuthRange = Readonly<{
  minimumOffsetDegrees: number;
  maximumOffsetDegrees: number;
}>;

export type ElevationTile = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
};

export class TerrainHorizonError extends Error {
  readonly code:
    | "outside-coverage"
    | "network"
    | "invalid-tile"
    | "aborted";

  constructor(
    code:
      | "outside-coverage"
      | "network"
      | "invalid-tile"
      | "aborted",
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "TerrainHorizonError";
  }
}

export function isSupportedTerrainCoordinate(
  latitude: number,
  longitude: number,
) {
  return isInsideTerrainRequestEnvelope(latitude, longitude);
}

function assertRgbChannel(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError("TerrainRGB channels must be integers from 0 to 255.");
  }
}

export function decodeTerrainRgb(
  red: number,
  green: number,
  blue: number,
) {
  assertRgbChannel(red);
  assertRgbChannel(green);
  assertRgbChannel(blue);
  return -10_000 + (red * 256 * 256 + green * 256 + blue) * 0.1;
}

export function destinationPoint(
  latitude: number,
  longitude: number,
  bearingDegrees: number,
  distanceKilometres: number,
) {
  const angularDistance =
    (distanceKilometres * 1_000) / EARTH_RADIUS_METRES;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const longitudeRadians = (longitude * Math.PI) / 180;
  const targetLatitude = Math.asin(
    Math.sin(latitudeRadians) * Math.cos(angularDistance) +
      Math.cos(latitudeRadians) *
        Math.sin(angularDistance) *
        Math.cos(bearing),
  );
  const targetLongitude =
    longitudeRadians +
    Math.atan2(
      Math.sin(bearing) *
        Math.sin(angularDistance) *
        Math.cos(latitudeRadians),
      Math.cos(angularDistance) -
        Math.sin(latitudeRadians) * Math.sin(targetLatitude),
    );

  return {
    latitude: (targetLatitude * 180) / Math.PI,
    longitude: (targetLongitude * 180) / Math.PI,
  };
}

export function apparentTerrainAngle({
  observerGroundElevationMetres,
  viewpointHeightAboveGroundMetres,
  targetGroundElevationMetres,
  distanceKilometres,
}: {
  observerGroundElevationMetres: number;
  viewpointHeightAboveGroundMetres: number;
  targetGroundElevationMetres: number;
  distanceKilometres: number;
}) {
  const { observerElevationMetres } = resolveObserverElevation({
    groundElevationMetres: observerGroundElevationMetres,
    viewpointHeightAboveGroundMetres,
  });
  const distanceMetres = distanceKilometres * 1_000;
  const effectiveEarthRadius =
    EARTH_RADIUS_METRES / (1 - STANDARD_REFRACTION_COEFFICIENT);
  const curvatureDrop =
    (distanceMetres * distanceMetres) / (2 * effectiveEarthRadius);
  return (
    (Math.atan2(
      targetGroundElevationMetres - observerElevationMetres - curvatureDrop,
      distanceMetres,
    ) *
      180) /
    Math.PI
  );
}

export function terrainPixelAddress(
  latitude: number,
  longitude: number,
  zoom: number,
): PixelAddress {
  const worldSize = 2 ** zoom * TERRAIN_TILE_SIZE;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const worldX = ((longitude + 180) / 360) * worldSize;
  const worldY =
    ((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2) * worldSize;

  return {
    tileX: Math.floor(worldX / TERRAIN_TILE_SIZE),
    tileY: Math.floor(worldY / TERRAIN_TILE_SIZE),
    pixelX: Math.max(
      0,
      Math.min(TERRAIN_TILE_SIZE - 1, Math.floor(worldX % TERRAIN_TILE_SIZE)),
    ),
    pixelY: Math.max(
      0,
      Math.min(TERRAIN_TILE_SIZE - 1, Math.floor(worldY % TERRAIN_TILE_SIZE)),
    ),
  };
}

export function terrainTileKey({ tileX, tileY }: PixelAddress) {
  return `${TERRAIN_ZOOM}/${tileX}/${tileY}`;
}

export function terrainTileUrl({ tileX, tileY }: PixelAddress) {
  return TERRAIN_SOURCE_URL.replace("{z}", String(TERRAIN_ZOOM))
    .replace("{x}", String(tileX))
    .replace("{y}", String(tileY));
}

export function isPng(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return signature.every((byte, index) => bytes[index] === byte);
}

export function validateTerrainTilePayload(
  contentType: string | null,
  contentLength: number,
  bytes: Uint8Array,
) {
  if (
    contentType?.split(";", 1)[0] !== "image/png" ||
    !Number.isFinite(contentLength) ||
    contentLength < 0 ||
    contentLength > MAX_TILE_BYTES
  ) {
    throw new TerrainHorizonError(
      "invalid-tile",
      "Terrain service returned an unexpected payload.",
    );
  }
  if (bytes.byteLength > MAX_TILE_BYTES || !isPng(bytes)) {
    throw new TerrainHorizonError(
      "invalid-tile",
      "Terrain payload failed PNG validation.",
    );
  }
}

export function validateElevationTile(tile: ElevationTile) {
  if (
    tile.width !== TERRAIN_TILE_SIZE ||
    tile.height !== TERRAIN_TILE_SIZE ||
    tile.pixels.length !== TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE * 4
  ) {
    throw new TerrainHorizonError(
      "invalid-tile",
      "Terrain tile dimensions are invalid.",
    );
  }
}

async function fetchTerrainTilePayload(
  url: string,
  externalSignal: AbortSignal,
) {
  if (externalSignal.aborted) {
    throw new TerrainHorizonError(
      "aborted",
      "Terrain calculation was cancelled.",
    );
  }
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let timedOut = false;
  const cancelReader = (reason?: unknown) => {
    const activeReader = reader;
    if (activeReader) {
      void activeReader.cancel(reason).catch(() => undefined);
    }
  };
  const abortFromParent = () => {
    controller.abort(externalSignal.reason);
    cancelReader(externalSignal.reason);
  };
  externalSignal.addEventListener("abort", abortFromParent, { once: true });
  const timeout = window.setTimeout(
    () => {
      timedOut = true;
      controller.abort(
        new DOMException("Terrain tile timed out", "TimeoutError"),
      );
      cancelReader(controller.signal.reason);
    },
    TILE_TIMEOUT_MILLISECONDS,
  );

  try {
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new TerrainHorizonError(
        "network",
        `Terrain service returned HTTP ${response.status}.`,
      );
    }
    const contentType = response.headers.get("content-type");
    const declaredLength = Number(
      response.headers.get("content-length") ?? 0,
    );
    if (
      contentType?.split(";", 1)[0] !== "image/png" ||
      !Number.isFinite(declaredLength) ||
      declaredLength < 0 ||
      declaredLength > MAX_TILE_BYTES
    ) {
      throw new TerrainHorizonError(
        "invalid-tile",
        "Terrain service returned an unexpected payload.",
      );
    }

    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    if (response.body) {
      reader = response.body.getReader();
      while (true) {
        const next = await reader.read();
        if (timedOut || externalSignal.aborted) {
          throw new TerrainHorizonError(
            externalSignal.aborted ? "aborted" : "network",
            externalSignal.aborted
              ? "Terrain calculation was cancelled."
              : "The terrain service did not respond before the timeout.",
          );
        }
        if (next.done) break;
        byteLength += next.value.byteLength;
        if (byteLength > MAX_TILE_BYTES) {
          cancelReader();
          throw new TerrainHorizonError(
            "invalid-tile",
            "Terrain payload exceeds the size limit.",
          );
        }
        chunks.push(next.value);
      }
    } else {
      const bytes = new Uint8Array(await response.arrayBuffer());
      byteLength = bytes.byteLength;
      chunks.push(bytes);
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    validateTerrainTilePayload(contentType, declaredLength, bytes);
    return bytes.buffer;
  } catch (error) {
    if (error instanceof TerrainHorizonError) throw error;
    if (controller.signal.aborted || timedOut) {
      throw new TerrainHorizonError(
        externalSignal.aborted ? "aborted" : "network",
        externalSignal.aborted
          ? "Terrain calculation was cancelled."
          : "The terrain service did not respond before the timeout.",
      );
    }
    throw new TerrainHorizonError(
      "network",
      error instanceof Error ? error.message : "Terrain tile request failed.",
    );
  } finally {
    window.clearTimeout(timeout);
    externalSignal.removeEventListener("abort", abortFromParent);
  }
}

async function loadTileUncached(address: PixelAddress, signal: AbortSignal) {
  const buffer = await fetchTerrainTilePayload(
    terrainTileUrl(address),
    signal,
  );

  let image: ImageBitmap;
  try {
    image = await createImageBitmap(new Blob([buffer], { type: "image/png" }));
  } catch {
    throw new TerrainHorizonError(
      "invalid-tile",
      "Terrain payload could not be decoded as PNG.",
    );
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new TerrainHorizonError(
        "invalid-tile",
        "Canvas decoding is unavailable in this browser.",
      );
    }
    context.drawImage(image, 0, 0);
    const tile = {
      pixels: context.getImageData(0, 0, image.width, image.height).data,
      width: image.width,
      height: image.height,
    } satisfies ElevationTile;
    validateElevationTile(tile);
    return tile;
  } finally {
    image.close();
  }
}

async function loadTile(address: PixelAddress, signal: AbortSignal) {
  if (signal.aborted) {
    throw new TerrainHorizonError(
      "aborted",
      "Terrain calculation was cancelled.",
    );
  }
  const key = terrainTileKey(address);
  const cached = decodedTileCache.get(key);
  if (cached) {
    decodedTileCache.delete(key);
    decodedTileCache.set(key, cached);
    return cached;
  }

  const tile = await loadTileUncached(address, signal);
  decodedTileCache.set(key, tile);
  while (decodedTileCache.size > MAX_CACHED_TILES) {
    const oldestKey = decodedTileCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    decodedTileCache.delete(oldestKey);
  }
  return tile;
}

export function terrainElevationAt(
  address: PixelAddress,
  tiles: ReadonlyMap<string, ElevationTile>,
) {
  const tile = tiles.get(terrainTileKey(address));
  if (!tile) {
    throw new TerrainHorizonError(
      "invalid-tile",
      "A required terrain tile was not decoded.",
    );
  }
  validateElevationTile(tile);
  const offset = (address.pixelY * tile.width + address.pixelX) * 4;
  if (tile.pixels[offset + 3] !== 255) {
    throw new TerrainHorizonError(
      "invalid-tile",
      "Terrain tile contains a transparent or partially transparent no-data pixel.",
    );
  }
  const elevationMetres = decodeTerrainRgb(
    tile.pixels[offset],
    tile.pixels[offset + 1],
    tile.pixels[offset + 2],
  );
  if (
    elevationMetres < MIN_SUPPORTED_GROUND_ELEVATION_METRES ||
    elevationMetres > MAX_SUPPORTED_GROUND_ELEVATION_METRES
  ) {
    throw new TerrainHorizonError(
      "invalid-tile",
      "Terrain tile contains an invalid or no-data elevation at the requested pixel.",
    );
  }
  return elevationMetres;
}

function assertTerrainCoverage(latitude: number, longitude: number) {
  if (!isSupportedTerrainCoordinate(latitude, longitude)) {
    throw new TerrainHorizonError(
      "outside-coverage",
      "The coordinate is outside the configured IGN/CNIG TerrainRGB request envelopes.",
    );
  }
}

export async function calculateTerrainElevation(
  latitude: number,
  longitude: number,
  signal: AbortSignal,
): Promise<TerrainElevation> {
  assertTerrainCoverage(latitude, longitude);
  const address = terrainPixelAddress(latitude, longitude, TERRAIN_ZOOM);
  const tile = await loadTile(address, signal);
  const elevationMetres = terrainElevationAt(
    address,
    new Map([[terrainTileKey(address), tile]]),
  );
  return {
    elevationMetres: Math.round(elevationMetres * 10) / 10,
    source: "IGN/CNIG TerrainRGB",
    zoom: TERRAIN_ZOOM,
    address,
  };
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function normaliseAzimuth(value: number) {
  return ((value % 360) + 360) % 360;
}

function signedAzimuthOffsetDegrees(azimuth: number, centre: number) {
  return ((azimuth - centre + 540) % 360) - 180;
}

export function solarDiscAzimuthHalfWidthDegrees(
  geometry: SolarDiscGeometry,
) {
  const altitude = degreesToRadians(geometry.centreAltitudeDegrees);
  const radius = degreesToRadians(geometry.angularRadiusDegrees);
  const ratio = Math.sin(radius) / Math.cos(altitude);
  if (!Number.isFinite(ratio) || Math.abs(ratio) > 1) {
    throw new RangeError("Solar disc geometry is outside the supported range.");
  }
  return radiansToDegrees(Math.asin(ratio));
}

export function terrainAzimuthRangeForSolarTrack(
  track: readonly Readonly<{
    sunAltitudeDegrees: number;
    sunAzimuthDegrees: number;
    sunAngularRadiusDegrees: number;
  }>[],
  centreAzimuthDegrees: number,
): TerrainProfileAzimuthRange {
  if (track.length < 2) {
    throw new RangeError("A terrain sweep requires at least two solar samples.");
  }
  const edges = track.flatMap((sample) => {
    const halfWidth = solarDiscAzimuthHalfWidthDegrees({
      centreAltitudeDegrees: sample.sunAltitudeDegrees,
      centreAzimuthDegrees: sample.sunAzimuthDegrees,
      angularRadiusDegrees: sample.sunAngularRadiusDegrees,
    });
    const centreOffset = signedAzimuthOffsetDegrees(
      sample.sunAzimuthDegrees,
      centreAzimuthDegrees,
    );
    return [centreOffset - halfWidth, centreOffset + halfWidth];
  });
  const minimumOffsetDegrees =
    Math.min(
      -TERRAIN_AZIMUTH_HALF_SWEEP_DEGREES,
      Math.floor(
        (Math.min(...edges) - TERRAIN_TRACK_PADDING_DEGREES) /
          TERRAIN_AZIMUTH_STEP_DEGREES,
      ) * TERRAIN_AZIMUTH_STEP_DEGREES,
    );
  const maximumOffsetDegrees =
    Math.max(
      TERRAIN_AZIMUTH_HALF_SWEEP_DEGREES,
      Math.ceil(
        (Math.max(...edges) + TERRAIN_TRACK_PADDING_DEGREES) /
        TERRAIN_AZIMUTH_STEP_DEGREES,
      ) * TERRAIN_AZIMUTH_STEP_DEGREES,
    );
  if (
    minimumOffsetDegrees < -90 ||
    maximumOffsetDegrees > 90 ||
    minimumOffsetDegrees >= maximumOffsetDegrees
  ) {
    throw new RangeError("The solar track exceeds the supported terrain sweep.");
  }
  return { minimumOffsetDegrees, maximumOffsetDegrees };
}

export function solarDiscAltitudeBoundsAtAzimuth(
  geometry: SolarDiscGeometry,
  azimuthDegrees: number,
): { lowerDegrees: number; upperDegrees: number } | null {
  const altitude = degreesToRadians(geometry.centreAltitudeDegrees);
  const radius = degreesToRadians(geometry.angularRadiusDegrees);
  const offset = degreesToRadians(
    signedAzimuthOffsetDegrees(
      normaliseAzimuth(azimuthDegrees),
      normaliseAzimuth(geometry.centreAzimuthDegrees),
    ),
  );
  const halfWidth = degreesToRadians(solarDiscAzimuthHalfWidthDegrees(geometry));
  if (Math.abs(offset) > halfWidth + 1e-12) return null;

  const a = Math.sin(altitude);
  const b = Math.cos(altitude) * Math.cos(offset);
  const q = Math.sqrt(a * a + b * b);
  const phase = Math.atan2(a, b);
  const ratio = Math.max(-1, Math.min(1, Math.cos(radius) / q));
  const verticalHalfSpan = Math.acos(ratio);
  return {
    lowerDegrees: radiansToDegrees(phase - verticalHalfSpan),
    upperDegrees: radiansToDegrees(phase + verticalHalfSpan),
  };
}

function createSolarDiscOffsets(geometry: SolarDiscGeometry) {
  const halfWidth = solarDiscAzimuthHalfWidthDegrees(geometry);
  const offsets = new Set<number>([-halfWidth, 0, halfWidth]);
  for (
    let offset = -halfWidth + SOLAR_DISC_AZIMUTH_STEP_DEGREES;
    offset < halfWidth;
    offset += SOLAR_DISC_AZIMUTH_STEP_DEGREES
  ) {
    offsets.add(Math.round(offset * 1e9) / 1e9);
  }
  return [...offsets].sort((left, right) => left - right);
}

export function createTerrainSamplePlan(
  latitude: number,
  longitude: number,
  {
    centreAzimuthDegrees,
    solarDisc,
    viewpointHeightAboveGroundMetres,
    profileAzimuthRange,
  }: {
    centreAzimuthDegrees: number;
    solarDisc: SolarDiscGeometry | null;
    viewpointHeightAboveGroundMetres: number;
    profileAzimuthRange?: TerrainProfileAzimuthRange;
  },
): TerrainSamplePlan {
  assertTerrainCoverage(latitude, longitude);
  resolveObserverElevation({
    groundElevationMetres: 0,
    viewpointHeightAboveGroundMetres,
  });
  const observerAddress = terrainPixelAddress(
    latitude,
    longitude,
    TERRAIN_ZOOM,
  );
  const profileRays: TerrainSampleRay[] = [];
  const minimumProfileAzimuthOffsetDegrees =
    profileAzimuthRange?.minimumOffsetDegrees ??
    -TERRAIN_AZIMUTH_HALF_SWEEP_DEGREES;
  const maximumProfileAzimuthOffsetDegrees =
    profileAzimuthRange?.maximumOffsetDegrees ??
    TERRAIN_AZIMUTH_HALF_SWEEP_DEGREES;
  if (
    !Number.isFinite(minimumProfileAzimuthOffsetDegrees) ||
    !Number.isFinite(maximumProfileAzimuthOffsetDegrees) ||
    minimumProfileAzimuthOffsetDegrees > 0 ||
    maximumProfileAzimuthOffsetDegrees < 0 ||
    minimumProfileAzimuthOffsetDegrees >= maximumProfileAzimuthOffsetDegrees ||
    minimumProfileAzimuthOffsetDegrees < -90 ||
    maximumProfileAzimuthOffsetDegrees > 90
  ) {
    throw new RangeError("Terrain profile azimuth range is invalid.");
  }

  const createRay = (azimuthDegrees: number): TerrainSampleRay => ({
    azimuthDegrees: normaliseAzimuth(azimuthDegrees),
    samples: TERRAIN_SAMPLE_DISTANCES_KILOMETRES.map(
      (distanceKilometres): TerrainSample => {
        const destination = destinationPoint(
          latitude,
          longitude,
          azimuthDegrees,
          distanceKilometres,
        );
        return {
          ...terrainPixelAddress(
            destination.latitude,
            destination.longitude,
            TERRAIN_ZOOM,
          ),
          azimuthDegrees: normaliseAzimuth(azimuthDegrees),
          distanceKilometres,
        };
      },
    ),
  });

  for (
    let offset = minimumProfileAzimuthOffsetDegrees;
    offset <= maximumProfileAzimuthOffsetDegrees + 1e-9;
    offset += TERRAIN_AZIMUTH_STEP_DEGREES
  ) {
    profileRays.push(createRay(centreAzimuthDegrees + offset));
  }

  const solarDiscRays = solarDisc
    ? createSolarDiscOffsets(solarDisc).map((offset) =>
        createRay(solarDisc.centreAzimuthDegrees + offset),
      )
    : [];

  const requiredAddresses = new Map<string, PixelAddress>();
  [
    observerAddress,
    ...profileRays.flatMap((ray) => ray.samples),
    ...solarDiscRays.flatMap((ray) => ray.samples),
  ].forEach((address) => {
    requiredAddresses.set(terrainTileKey(address), address);
  });

  return {
    observerAddress,
    centreAzimuthDegrees: normaliseAzimuth(centreAzimuthDegrees),
    minimumProfileAzimuthOffsetDegrees,
    maximumProfileAzimuthOffsetDegrees,
    profileRays,
    solarDiscRays,
    solarDisc,
    viewpointHeightAboveGroundMetres,
    requiredAddresses: [...requiredAddresses.values()],
  };
}

export function calculateTerrainHorizonFromTiles(
  plan: TerrainSamplePlan,
  decodedTiles: ReadonlyMap<string, ElevationTile>,
): TerrainHorizon {
  const groundElevationMetres = terrainElevationAt(
    plan.observerAddress,
    decodedTiles,
  );
  const observerElevation = resolveObserverElevation({
    groundElevationMetres,
    viewpointHeightAboveGroundMetres:
      plan.viewpointHeightAboveGroundMetres,
  });
  const calculateProfile = (rays: TerrainSampleRay[]) => rays.map(
    ({ azimuthDegrees, samples }): TerrainProfilePoint => {
      let horizonAltitudeDegrees = -90;
      let limitingDistanceKilometres = 0;
      samples.forEach((sample) => {
        const angle = apparentTerrainAngle({
          observerGroundElevationMetres: groundElevationMetres,
          viewpointHeightAboveGroundMetres:
            plan.viewpointHeightAboveGroundMetres,
          targetGroundElevationMetres: terrainElevationAt(sample, decodedTiles),
          distanceKilometres: sample.distanceKilometres,
        });
        if (angle > horizonAltitudeDegrees) {
          horizonAltitudeDegrees = angle;
          limitingDistanceKilometres = sample.distanceKilometres;
        }
      });
      return {
        azimuthDegrees,
        // Classification and verification consume the unrounded angle. Formatting
        // belongs at the report/UI boundary so a near-tangent ray cannot change class.
        horizonAltitudeDegrees,
        limitingDistanceKilometres,
      };
    },
  );
  const profile = calculateProfile(plan.profileRays);
  const solarDiscProfile = calculateProfile(plan.solarDiscRays);
  const centre = profile.reduce((nearest, point) =>
    Math.abs(
      signedAzimuthOffsetDegrees(
        point.azimuthDegrees,
        plan.centreAzimuthDegrees,
      ),
    ) <
    Math.abs(
      signedAzimuthOffsetDegrees(
        nearest.azimuthDegrees,
        plan.centreAzimuthDegrees,
      ),
    )
      ? point
      : nearest,
  );
  const solarDiscAssessment = plan.solarDisc
    ? assessSolarDiscTerrain(
        plan.solarDisc,
        centre,
        solarDiscProfile,
      )
    : null;

  return {
    groundElevationMetres: Math.round(groundElevationMetres * 10) / 10,
    viewpointHeightAboveGroundMetres:
      plan.viewpointHeightAboveGroundMetres,
    observerElevationMetres:
      Math.round(observerElevation.observerElevationMetres * 10) / 10,
    profile,
    solarDiscProfile,
    solarDisc: plan.solarDisc,
    solarDiscAssessment,
    horizonAtSunDegrees: centre.horizonAltitudeDegrees,
    source: "IGN/CNIG TerrainRGB",
    zoom: TERRAIN_ZOOM,
    maximumDistanceKilometres: 100,
    refractionCoefficient: STANDARD_REFRACTION_COEFFICIENT,
    samplesPerRay: TERRAIN_SAMPLE_DISTANCES_KILOMETRES.length,
    profileAzimuthStepDegrees: TERRAIN_AZIMUTH_STEP_DEGREES,
    solarDiscAzimuthStepDegrees: SOLAR_DISC_AZIMUTH_STEP_DEGREES,
  };
}

export function assessSolarDiscTerrain(
  solarDisc: SolarDiscGeometry,
  centreTerrain: TerrainProfilePoint,
  solarDiscProfile: TerrainProfilePoint[],
): SolarDiscTerrainAssessment {
  if (solarDiscProfile.length === 0) {
    throw new RangeError("Solar disc terrain assessment requires local rays.");
  }
  const margins = solarDiscProfile.map((point) => {
    const bounds = solarDiscAltitudeBoundsAtAzimuth(
      solarDisc,
      point.azimuthDegrees,
    );
    if (!bounds) {
      throw new RangeError("A terrain ray lies outside the solar disc geometry.");
    }
    return {
      point,
      offsetDegrees: signedAzimuthOffsetDegrees(
        point.azimuthDegrees,
        solarDisc.centreAzimuthDegrees,
      ),
      lowerMargin: bounds.lowerDegrees - point.horizonAltitudeDegrees,
      upperMargin: bounds.upperDegrees - point.horizonAltitudeDegrees,
    };
  });
  const limiting = margins.reduce((current, item) =>
    item.lowerMargin < current.lowerMargin ? item : current,
  );
  const fullDiscClearanceDegrees = Math.min(
    ...margins.map((item) => item.lowerMargin),
  );
  const anyDiscVisibilityMarginDegrees = Math.max(
    ...margins.map((item) => item.upperMargin),
  );

  return {
    centreClearanceDegrees: Math.round(
      (solarDisc.centreAltitudeDegrees -
        centreTerrain.horizonAltitudeDegrees) * 1_000,
    ) / 1_000,
    fullDiscClearanceDegrees:
      Math.round(fullDiscClearanceDegrees * 1_000) / 1_000,
    anyDiscVisibilityMarginDegrees:
      Math.round(anyDiscVisibilityMarginDegrees * 1_000) / 1_000,
    intersection:
      fullDiscClearanceDegrees > 0
        ? "fully-clear"
        : anyDiscVisibilityMarginDegrees <= 0
          ? "fully-blocked"
          : "partially-obscured",
    raysEvaluated: margins.length,
    limitingDiscAzimuthOffsetDegrees:
      Math.round(limiting.offsetDegrees * 1_000) / 1_000,
    limitingTerrainAzimuthDegrees:
      Math.round(limiting.point.azimuthDegrees * 1_000) / 1_000,
    limitingDistanceKilometres:
      limiting.point.limitingDistanceKilometres,
  };
}

export async function calculateTerrainHorizon(
  latitude: number,
  longitude: number,
  solarDisc: SolarDiscGeometry,
  viewpointHeightAboveGroundMetres: number,
  signal: AbortSignal,
  profileAzimuthRange?: TerrainProfileAzimuthRange,
): Promise<TerrainHorizon> {
  const plan = createTerrainSamplePlan(
    latitude,
    longitude,
    {
      centreAzimuthDegrees: solarDisc.centreAzimuthDegrees,
      solarDisc,
      viewpointHeightAboveGroundMetres,
      profileAzimuthRange,
    },
  );
  const decodedTiles = new Map<string, ElevationTile>();
  const addresses = plan.requiredAddresses;
  for (let index = 0; index < addresses.length; index += 6) {
    if (signal.aborted) {
      throw new TerrainHorizonError(
        "aborted",
        "Terrain calculation was cancelled.",
      );
    }
    const batch = addresses.slice(index, index + 6);
    const tiles = await Promise.all(
      batch.map(
        async (address) =>
          [terrainTileKey(address), await loadTile(address, signal)] as const,
      ),
    );
    tiles.forEach(([key, tile]) => decodedTiles.set(key, tile));
  }

  return calculateTerrainHorizonFromTiles(plan, decodedTiles);
}
