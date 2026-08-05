import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fromFile } from "geotiff";
import { PNG } from "pngjs";
import {
  ALTITUDE_STOPS,
  DURATION_STOPS,
  normaliseObscurationForColour,
  OBSCURATION_STOPS,
  OBSCURATION_RENDER_TOLERANCE_FRACTION,
  OFFICIAL_OVERVIEW_NODATA,
  renderMaximumObscurationPixel,
  renderSolarAltitudePixel,
  type Rgba,
} from "./official-overview-renderer.mts";
import {
  applyCoverageMask,
  rasteriseDurationBands,
  rasteriseUmbraEnvelope,
  type MultiPolygonCoordinates,
} from "./official-eclipse-geopackage.mts";
import { readOfficialGeoPackage } from "./official-eclipse-geopackage-reader.mts";
import { requiredInputPath } from "./required-input-path.mts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = requiredInputPath("ECLIPSE_ATLAS_IGN_2026_RASTER");
const vectorSourcePath = requiredInputPath("ECLIPSE_ATLAS_IGN_2026_VECTOR");
const outputDirectory = path.join(root, "public/map-overlays/v1");
const artifactVersion = "2.1.0";
const cropWindow = [620, 843, 2714, 2771] as const;
const expected = {
  bytes: 359_868_192,
  sha256: "547d772490b5080f6f423ccef382a78ba5a235791cd7234b5060724e77b4baa0",
  width: 3328,
  height: 3328,
  samples: 10,
  epsg: 3857,
  noData: OFFICIAL_OVERVIEW_NODATA,
  resolutionMetres: 1222.99245256282,
};
const expectedVectorSource = {
  bytes: 12_054_528,
  sha256: "4bc79c4c2e3692a1105cd9d415f5f10f1b4076af8ad14f9cf48169ec070b8944",
  durationBands: 13,
  umbraFrames: 277,
  umbraStartUtcHours: 18.293,
  umbraEndUtcHours: 18.569,
  umbraStepSeconds: 3.6,
};

const outputDefinitions = [
  {
    id: "solar-altitude-at-maximum",
    file: "solar-altitude-at-maximum.png",
    sourceBand: 1,
    quantity: "Apparent, refraction-adjusted solar-centre altitude at maximum",
    unit: "degrees",
    formula: "display value = source band 1 in degrees",
    colourDomain: [0, 25],
    legendTicks: [0, 5, 10, 15, 20, 25],
    palette: ALTITUDE_STOPS,
  },
  {
    id: "maximum-obscuration",
    file: "maximum-obscuration.png",
    sourceBand: 3,
    quantity: "Maximum obscured fraction of the apparent solar disc",
    unit: "percent",
    formula: "display percent = source band 3 fraction × 100",
    colourDomain: [80, 100],
    legendTicks: [80, 85, 90, 95, 100],
    palette: OBSCURATION_STOPS,
  },
  {
    id: "totality-duration",
    file: "totality-duration.png",
    sourceLayer: "durtot_estandard_2026 — contour",
    quantity: "Official totality-duration range",
    unit: "seconds",
    formula: "colour = midpoint of the containing official duration range",
    colourDomain: [0, 123],
    legendTicks: [0, 30, 60, 90, 120],
    palette: DURATION_STOPS,
  },
] as const;

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
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

function pngBuffer(width: number, height: number, pixels: Uint8Array) {
  const png = new PNG({
    width,
    height,
    colorType: 6,
    inputColorType: 6,
    inputHasAlpha: true,
  });
  png.data = Buffer.from(pixels);
  return PNG.sync.write(png, {
    colorType: 6,
    inputColorType: 6,
    inputHasAlpha: true,
    deflateLevel: 9,
    deflateStrategy: 3,
  });
}

function setPixel(target: Uint8Array, index: number, rgba: Rgba) {
  target.set(rgba, index * 4);
}

async function generatorSha256() {
  const paths = [
    "scripts/generate-official-overview.mts",
    "scripts/official-overview-renderer.mts",
    "scripts/official-eclipse-geopackage.mts",
    "scripts/official-eclipse-geopackage-reader.mts",
  ];
  const hash = createHash("sha256");
  for (const relativePath of paths) {
    const content = await readFile(path.join(root, relativePath));
    hash.update(`${relativePath.length}:${relativePath}${content.length}:`);
    hash.update(content);
  }
  return hash.digest("hex");
}

async function main() {
  const [sourceStat, vectorSourceStat] = await Promise.all([
    stat(sourcePath),
    stat(vectorSourcePath),
  ]);
  if (sourceStat.size !== expected.bytes) {
    throw new Error("Official COG byte size does not match the frozen fixture.");
  }
  if (vectorSourceStat.size !== expectedVectorSource.bytes) {
    throw new Error("Official GeoPackage byte size does not match the frozen fixture.");
  }
  const [sourceSha256, vectorSourceSha256] = await Promise.all([
    sha256File(sourcePath),
    sha256File(vectorSourcePath),
  ]);
  if (sourceSha256 !== expected.sha256) {
    throw new Error("Official COG checksum does not match the frozen fixture.");
  }
  if (vectorSourceSha256 !== expectedVectorSource.sha256) {
    throw new Error("Official GeoPackage checksum does not match the frozen fixture.");
  }

  const geotiff = await fromFile(sourcePath);
  const image = await geotiff.getImage();
  const geoKeys = image.getGeoKeys();
  const resolution = image.getResolution();
  if (
    image.getWidth() !== expected.width ||
    image.getHeight() !== expected.height ||
    image.getSamplesPerPixel() !== expected.samples ||
    geoKeys?.ProjectedCSTypeGeoKey !== expected.epsg ||
    image.getGDALNoData() !== expected.noData ||
    Math.abs(resolution[0] - expected.resolutionMetres) > 1e-9 ||
    Math.abs(Math.abs(resolution[1]) - expected.resolutionMetres) > 1e-9
  ) {
    throw new Error("Official COG metadata does not match the frozen fixture.");
  }

  const [sourceMinimumX, , , sourceMaximumY] = image.getBoundingBox();
  const west = sourceMinimumX + cropWindow[0] * resolution[0];
  const east = sourceMinimumX + cropWindow[2] * resolution[0];
  const north = sourceMaximumY + cropWindow[1] * resolution[1];
  const south = sourceMaximumY + cropWindow[3] * resolution[1];
  const southWest = inverseWebMercator(west, south);
  const northEast = inverseWebMercator(east, north);
  const geographicBounds = {
    west: southWest.longitude,
    south: southWest.latitude,
    east: northEast.longitude,
    north: northEast.latitude,
  };

  const rasters = await image.readRasters({
    window: [...cropWindow],
    samples: [0, 2, 4, 6],
  });
  const altitude = rasters[0];
  const obscuration = rasters[1];
  const sunset = rasters[2];
  const maximum = rasters[3];
  const width = cropWindow[2] - cropWindow[0];
  const height = cropWindow[3] - cropWindow[1];
  const altitudePixels = new Uint8Array(width * height * 4);
  const obscurationPixels = new Uint8Array(width * height * 4);
  const obscurationAudit = {
    observedRawMinimum: Number.POSITIVE_INFINITY,
    observedRawMaximum: Number.NEGATIVE_INFINITY,
    abovePhysicalDomainCount: 0,
    belowPhysicalDomainCount: 0,
    noDataCount: 0,
    upperClampCount: 0,
    lowerClampCount: 0,
    colourClampCount: 0,
    outOfToleranceCount: 0,
  };
  for (let index = 0; index < width * height; index += 1) {
    const rawObscuration = Number(obscuration[index]);
    if (rawObscuration !== expected.noData) {
      try {
        const normalised = normaliseObscurationForColour(rawObscuration);
        obscurationAudit.observedRawMinimum = Math.min(
          obscurationAudit.observedRawMinimum,
          rawObscuration,
        );
        obscurationAudit.observedRawMaximum = Math.max(
          obscurationAudit.observedRawMaximum,
          rawObscuration,
        );
        if (rawObscuration > 1) {
          obscurationAudit.abovePhysicalDomainCount += 1;
          obscurationAudit.upperClampCount += 1;
        }
        if (rawObscuration < 0) {
          obscurationAudit.belowPhysicalDomainCount += 1;
          obscurationAudit.lowerClampCount += 1;
        }
        if (normalised.clamped) obscurationAudit.colourClampCount += 1;
      } catch (error) {
        obscurationAudit.outOfToleranceCount += 1;
        throw error;
      }
    } else obscurationAudit.noDataCount += 1;
    setPixel(
      altitudePixels,
      index,
      renderSolarAltitudePixel(
        Number(altitude[index]),
        Number(maximum[index]),
        Number(sunset[index]),
      ),
    );
    setPixel(
      obscurationPixels,
      index,
      renderMaximumObscurationPixel(
        rawObscuration,
        Number(maximum[index]),
        Number(sunset[index]),
      ),
    );
  }
  if (
    obscurationAudit.upperClampCount !== 2669 ||
    obscurationAudit.lowerClampCount !== 0 ||
    obscurationAudit.outOfToleranceCount !== 0
  ) {
    throw new Error(
      "Official obscuration normalization audit differs from the frozen source expectation.",
    );
  }

  const { durationBands, umbraFrames } = readOfficialGeoPackage(vectorSourcePath);
  if (
    durationBands.length !== expectedVectorSource.durationBands ||
    umbraFrames.length !== expectedVectorSource.umbraFrames ||
    umbraFrames[0]?.utcHours !== expectedVectorSource.umbraStartUtcHours ||
    umbraFrames.at(-1)?.utcHours !== expectedVectorSource.umbraEndUtcHours
  ) {
    throw new Error("Official GeoPackage evidence differs from the frozen expectation.");
  }
  const durationCoverageMask = rasteriseUmbraEnvelope(
    umbraFrames,
    width,
    height,
    geographicBounds,
  );
  const durationPixels = applyCoverageMask(
    rasteriseDurationBands(
      durationBands,
      width,
      height,
      geographicBounds,
    ),
    durationCoverageMask,
  );
  const durationCoveragePixelCount = durationCoverageMask.reduce(
    (sum, value) => sum + value,
    0,
  );

  await mkdir(outputDirectory, { recursive: true });
  const buffers = {
    "solar-altitude-at-maximum.png": pngBuffer(width, height, altitudePixels),
    "maximum-obscuration.png": pngBuffer(width, height, obscurationPixels),
    "totality-duration.png": pngBuffer(width, height, durationPixels),
  };
  const outputs = [];
  for (const definition of outputDefinitions) {
    const buffer = buffers[definition.file];
    await writeFile(path.join(outputDirectory, definition.file), buffer);
    outputs.push({
      ...definition,
      noDataAlpha: 0,
      width,
      height,
      bytes: buffer.length,
      sha256: sha256(buffer),
      ...(definition.id === "totality-duration"
        ? {
            rasterisation:
              "EPSG:4326 official range polygons filled at EPSG:3857 output pixel centres",
          }
        : {
            colourClampOnly: true,
            noDataValue: expected.noData,
            observableMaximumMask:
              "transparent when maximum UTC (band 7) is after sunset UTC (band 5), or either time is no-data",
          }),
      ...(definition.id === "maximum-obscuration"
        ? {
            sourceAudit: {
              physicalDomain: [0, 1],
              declaredRawDomain: [0, 1],
              renderToleranceFraction:
                OBSCURATION_RENDER_TOLERANCE_FRACTION,
              renderNormalization: "clamp-only-for-colour",
              unexpectedOutOfTolerancePolicy: "abort generation",
              scientificValuesModified: false,
              pixelQueryEnabled: false,
              displayTransform:
                "clamp(raw, 0, 1) × 100 for colour only; raw values are retained in audit statistics",
              maximumUpperExcess: Math.max(
                0,
                obscurationAudit.observedRawMaximum - 1,
              ),
              ...obscurationAudit,
            },
          }
        : definition.id === "totality-duration"
          ? {
              sourceAudit: {
                bandCount: durationBands.length,
                minimumSeconds: durationBands[0].minimumSeconds,
                maximumSeconds: durationBands.at(-1)!.maximumSeconds,
                bandValuesModified: false,
                pixelQueryEnabled: false,
                coverageMask: {
                  source: "union of 277 official sampled umbra footprints",
                  includedPixelCount: durationCoveragePixelCount,
                  excludedPixelCount:
                    durationCoverageMask.length - durationCoveragePixelCount,
                  sameLineageDisplayTransform: true,
                },
                displayTransform:
                  "Pixels inside the official sampled-umbra union receive the colour of their containing official duration range; pixels outside are transparent and no point value is exposed.",
              },
            }
          : {}),
    });
  }

  const config = {
    cropWindow,
    outputWidth: width,
    outputHeight: height,
    resampling: "none; one source pixel to one output pixel",
    palettes: {
      altitude: ALTITUDE_STOPS,
      obscuration: OBSCURATION_STOPS,
      duration: DURATION_STOPS,
    },
    layerDefinitions: outputDefinitions,
    durationRasterisation: {
      sourceCrs: "EPSG:4326",
      targetCrs: "EPSG:3857",
      fillRule: "even-odd scanline at output pixel centres",
      totalityEnvelope:
        "union of all 277 official sampled umbra footprints at output pixel centres",
      antialiasing: "none",
    },
    umbraSimplification: {
      sourceSimplificationDegrees: 0.0001,
      additionalToleranceDegrees: 1 / 120,
      maximumRelativeRingAreaError: 0.01,
      coordinateDecimalPlaces: 6,
      temporalInterpolation: "none",
    },
  };

  const roundedPolygons = (polygons: MultiPolygonCoordinates) =>
    polygons.map((polygon) =>
      polygon.map((ring) =>
        ring.map(
          ([longitude, latitude]) =>
            [
              Number(longitude.toFixed(6)),
              Number(latitude.toFixed(6)),
            ] as const,
        ),
      ),
    );
  const umbraArtifact = {
    schemaVersion: 1,
    artifactVersion,
    sourceSha256: expectedVectorSource.sha256,
    coordinateReferenceSystem: "EPSG:4326",
    sampling: {
      startUtcHours: expectedVectorSource.umbraStartUtcHours,
      endUtcHours: expectedVectorSource.umbraEndUtcHours,
      stepSeconds: expectedVectorSource.umbraStepSeconds,
      frameCount: expectedVectorSource.umbraFrames,
      geometryInterpolation: "none; the UI selects the nearest official frame",
    },
    transformation: {
      upstreamSimplificationDegrees: 0.0001,
      additionalDouglasPeuckerToleranceDegrees: 1 / 120,
      maximumRelativeRingAreaError: 0.01,
      coordinateDecimalPlaces: 6,
      retainedProperties: ["utcHours", "polygons"],
      removedProperties: ["ID", "layer", "path", "mancha_ut_*"],
    },
    frames: umbraFrames.map((frame) => ({
      utcHours: Number(frame.utcHours.toFixed(3)),
      polygons: roundedPolygons(frame.polygons),
    })),
  };
  const umbraFile = "official-umbra-passage-v1.json";
  const umbraText = `${JSON.stringify(umbraArtifact)}\n`;
  await writeFile(path.join(outputDirectory, umbraFile), umbraText);
  const manifest = {
    schemaVersion: 2,
    artifactVersion,
    source: {
      name: "10BANDS_2026_3857_COG.TIFF",
      producer:
        "Instituto Geográfico Nacional / Observatorio Astronómico Nacional",
      sourcePage:
        "https://centrodedescargas.cnig.es/CentroDescargas/detalleArchivo?sec=12631995",
      retrievedAt: "2026-08-02",
      license: "CC BY 4.0-compatible IGN/CNIG data policy",
      requiredAttribution:
        "Información astronómica oficial ofrecida por el Instituto Geográfico Nacional siguiendo los cálculos realizados por el Observatorio Astronómico Nacional",
      sha256: expected.sha256,
      bytes: expected.bytes,
      epsg: expected.epsg,
      noDataValue: expected.noData,
      nativeCellSizeMetres: expected.resolutionMetres,
      elevationModel: "GMTED2010 at 30 arc-second resolution",
    },
    vectorSource: {
      name: "ECLIPSES.GPKG",
      producer:
        "Instituto Geográfico Nacional / Observatorio Astronómico Nacional",
      sourcePage:
        "https://centrodedescargas.cnig.es/CentroDescargas/detalleArchivo?sec=12631995",
      retrievedAt: "2026-08-02",
      license: "CC BY 4.0-compatible IGN/CNIG data policy",
      requiredAttribution:
        "Información astronómica oficial ofrecida por el Instituto Geográfico Nacional siguiendo los cálculos realizados por el Observatorio Astronómico Nacional",
      sha256: expectedVectorSource.sha256,
      bytes: expectedVectorSource.bytes,
      epsg: 4326,
    },
    crop: {
      sourcePixelWindow: cropWindow,
      width,
      height,
      epsg: expected.epsg,
      projectedBounds: { west, south, east, north },
      leafletBounds: {
        south: southWest.latitude,
        west: southWest.longitude,
        north: northEast.latitude,
        east: northEast.longitude,
      },
      resampling: config.resampling,
    },
    generatorSha256: await generatorSha256(),
    configurationSha256: sha256(JSON.stringify(config)),
    outputs,
    animation: {
      id: "umbra-passage",
      file: umbraFile,
      frameCount: expectedVectorSource.umbraFrames,
      startUtcHours: expectedVectorSource.umbraStartUtcHours,
      endUtcHours: expectedVectorSource.umbraEndUtcHours,
      stepSeconds: expectedVectorSource.umbraStepSeconds,
      sha256: sha256(umbraText),
    },
    useConstraints: {
      visualizationOnly: true,
      pixelQueryEnabled: false,
      usedForRecommendation: false,
      sameLineageAsOfficialAstronomyFixture: true,
      terrainOrHorizonLayerAvailable: false,
    },
    limitations: [
      "The regional pixels are approximately 1.223 km and are not point values.",
      "The colour scale is contextual and must not be decoded as an exact measurement.",
      "The altitude is for the apparent solar centre, not a terrain-clearance margin.",
      "Totality duration is rendered as official ranges and must not be decoded as a point value.",
      "Umbra frames are discrete official samples every 3.6 seconds; polygon geometry is not interpolated.",
      "The umbra is the footprint of totality, not cloud, ambient brightness or terrain shadow.",
      "This source is already used by the verification harness and is not a second independent ephemeris.",
    ],
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestFile = "official-eclipse-overlays-v1.json";
  await writeFile(path.join(outputDirectory, manifestFile), manifestText);
  const checksums = {
    schemaVersion: 1,
    artifactVersion,
    files: {
      [manifestFile]: sha256(manifestText),
      ...Object.fromEntries(outputs.map((output) => [output.file, output.sha256])),
      [umbraFile]: sha256(umbraText),
    },
  };
  await writeFile(
    path.join(outputDirectory, "official-eclipse-overlays-v1.checksums.json"),
    `${JSON.stringify(checksums, null, 2)}\n`,
  );
}

await main();
