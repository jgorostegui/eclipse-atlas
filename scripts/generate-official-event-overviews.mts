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
import { readOfficialEventGeoPackage } from "./official-eclipse-geopackage-reader.mts";
import { requiredInputPath } from "./required-input-path.mts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cropWindow = [620, 843, 2714, 2771] as const;
const expectedRaster = {
  width: 3328,
  height: 3328,
  samples: 10,
  epsg: 3857,
  noData: OFFICIAL_OVERVIEW_NODATA,
  resolutionMetres: 1222.99245256282,
};
const requiredAttribution =
  "Obra derivada de TrioEclipses_España 2026-2028 CC-BY 4.0 ign.es";

const events = [
  {
    id: "2027",
    date: "2027-08-02",
    centralPhaseKind: "total",
    centralShadowKind: "umbra",
    artifactVersion: "1.0.0",
    source: {
      path: requiredInputPath("ECLIPSE_ATLAS_IGN_2027_RASTER"),
      name: "EPHEMERIDES_2027.TIFF",
      detailId: 12643911,
      bytes: 137_737_061,
      sha256: "ab3df8197868e4348c8b924eb66f2f7c5c7a4a93445c2675296a87516ba0ae69",
    },
    vectorSource: {
      path: requiredInputPath("ECLIPSE_ATLAS_IGN_2027_VECTOR"),
      name: "ECLIPSES_2027.GPKG",
      detailId: 12643912,
      bytes: 23_134_208,
      sha256: "050547adca464254b10dcaa71deaed0153f86da9dc0767fcb315aaf5a047d053",
    },
    duration: { contourCount: 35, stepSeconds: 10, domainMaximum: 350 },
    shadow: { frameCount: 724, startUtcHours: 8.493, endUtcHours: 9.216 },
    altitudeDomainMaximum: 60,
    altitudeLegendTicks: [0, 15, 30, 45, 60],
    obscurationDomainMinimum: 0.5,
    obscurationLegendTicks: [50, 60, 70, 80, 90, 100],
    durationLegendTicks: [0, 60, 120, 180, 240, 300],
  },
  {
    id: "2028",
    date: "2028-01-26",
    centralPhaseKind: "annular",
    centralShadowKind: "antumbra",
    artifactVersion: "1.0.0",
    source: {
      path: requiredInputPath("ECLIPSE_ATLAS_IGN_2028_RASTER"),
      name: "EPHEMERIDES_2028.TIFF",
      detailId: 12643914,
      bytes: 133_014_547,
      sha256: "107f0bff3c7724413ae979277a0f01574478fa275908a3614aa370a130386f81",
    },
    vectorSource: {
      path: requiredInputPath("ECLIPSE_ATLAS_IGN_2028_VECTOR"),
      name: "ECLIPSES_2028.GPKG",
      detailId: 12643915,
      bytes: 33_366_016,
      sha256: "a44bd719ace45edcb60bd28ae75e6e78f2e9846498edb55ccb4d354f9d112b54",
    },
    duration: { contourCount: 48, stepSeconds: 10, domainMaximum: 480 },
    shadow: { frameCount: 353, startUtcHours: 16.655, endUtcHours: 17.007 },
    altitudeDomainMaximum: 25,
    altitudeLegendTicks: [0, 5, 10, 15, 20, 25],
    obscurationDomainMinimum: 0.5,
    obscurationLegendTicks: [50, 60, 70, 80, 90, 100],
    durationLegendTicks: [0, 120, 240, 360, 480],
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

function roundedPolygons(polygons: MultiPolygonCoordinates) {
  return polygons.map((polygon) =>
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
}

async function generatorSha256() {
  const files = [
    "scripts/generate-official-event-overviews.mts",
    "scripts/official-overview-renderer.mts",
    "scripts/official-eclipse-geopackage.mts",
    "scripts/official-eclipse-geopackage-reader.mts",
  ];
  const hash = createHash("sha256");
  for (const file of files) hash.update(await readFile(path.join(root, file)));
  return hash.digest("hex");
}

async function generate(event: (typeof events)[number]) {
  const sourcePath = event.source.path;
  const vectorSourcePath = event.vectorSource.path;
  const outputDirectory = path.join(root, "public/map-overlays", event.id);
  const [sourceStat, vectorStat, sourceHash, vectorHash] = await Promise.all([
    stat(sourcePath),
    stat(vectorSourcePath),
    sha256File(sourcePath),
    sha256File(vectorSourcePath),
  ]);
  if (
    sourceStat.size !== event.source.bytes ||
    vectorStat.size !== event.vectorSource.bytes ||
    sourceHash !== event.source.sha256 ||
    vectorHash !== event.vectorSource.sha256
  ) {
    throw new Error(`Official ${event.id} source files do not match their frozen checksums.`);
  }

  const geotiff = await fromFile(sourcePath);
  const image = await geotiff.getImage();
  const resolution = image.getResolution();
  if (
    image.getWidth() !== expectedRaster.width ||
    image.getHeight() !== expectedRaster.height ||
    image.getSamplesPerPixel() !== expectedRaster.samples ||
    image.getGeoKeys()?.ProjectedCSTypeGeoKey !== expectedRaster.epsg ||
    image.getGDALNoData() !== expectedRaster.noData ||
    Math.abs(resolution[0] - expectedRaster.resolutionMetres) > 1e-9 ||
    Math.abs(Math.abs(resolution[1]) - expectedRaster.resolutionMetres) > 1e-9
  ) {
    throw new Error(`Official ${event.id} GeoTIFF metadata differs from the frozen source.`);
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
  const width = cropWindow[2] - cropWindow[0];
  const height = cropWindow[3] - cropWindow[1];
  const rasters = await image.readRasters({
    window: [...cropWindow],
    samples: [0, 2, 4, 6],
  });
  const altitudePixels = new Uint8Array(width * height * 4);
  const obscurationPixels = new Uint8Array(width * height * 4);
  let obscurationClampedPixelCount = 0;
  for (let index = 0; index < width * height; index += 1) {
    const rawObscuration = Number(rasters[1][index]);
    if (rawObscuration !== expectedRaster.noData) {
      if (normaliseObscurationForColour(rawObscuration).clamped) {
        obscurationClampedPixelCount += 1;
      }
    }
    setPixel(
      altitudePixels,
      index,
      renderSolarAltitudePixel(
        Number(rasters[0][index]),
        Number(rasters[3][index]),
        Number(rasters[2][index]),
        event.altitudeDomainMaximum,
      ),
    );
    setPixel(
      obscurationPixels,
      index,
      renderMaximumObscurationPixel(
        rawObscuration,
        Number(rasters[3][index]),
        Number(rasters[2][index]),
        event.obscurationDomainMinimum,
      ),
    );
  }

  const { durationBands, durationTable, shadowFrames, shadowTable } =
    readOfficialEventGeoPackage(vectorSourcePath, {
      durationStepSeconds: event.duration.stepSeconds,
      expectedDurationContourCount: event.duration.contourCount,
      expectedShadowFrameCount: event.shadow.frameCount,
      expectedShadowStartUtcHours: event.shadow.startUtcHours,
      expectedShadowEndUtcHours: event.shadow.endUtcHours,
      shadowStepHours: 0.001,
    });
  const centralShadowMask = rasteriseUmbraEnvelope(
    shadowFrames,
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
      event.duration.domainMaximum,
    ),
    centralShadowMask,
  );

  await mkdir(outputDirectory, { recursive: true });
  const renderings = [
    {
      id: "solar-altitude-at-maximum",
      file: "solar-altitude-at-maximum.png",
      unit: "degrees",
      legendTicks: event.altitudeLegendTicks,
      palette: ALTITUDE_STOPS,
      pixels: altitudePixels,
    },
    {
      id: "maximum-obscuration",
      file: "maximum-obscuration.png",
      unit: "percent",
      legendTicks: event.obscurationLegendTicks,
      palette: OBSCURATION_STOPS,
      pixels: obscurationPixels,
    },
    {
      id: "totality-duration",
      file: "central-phase-duration.png",
      unit: "seconds",
      legendTicks: event.durationLegendTicks,
      palette: DURATION_STOPS,
      pixels: durationPixels,
    },
  ] as const;
  const outputs = [];
  for (const rendering of renderings) {
    const buffer = pngBuffer(width, height, rendering.pixels);
    await writeFile(path.join(outputDirectory, rendering.file), buffer);
    outputs.push({
      id: rendering.id,
      file: rendering.file,
      unit: rendering.unit,
      legendTicks: rendering.legendTicks,
      palette: rendering.palette,
      width,
      height,
      bytes: buffer.length,
      sha256: sha256(buffer),
    });
  }

  const shadowArtifact = {
    schemaVersion: 2,
    artifactVersion: event.artifactVersion,
    eventId: event.id,
    eventDate: event.date,
    shadowKind: event.centralShadowKind,
    sourceSha256: event.vectorSource.sha256,
    coordinateReferenceSystem: "EPSG:4326",
    sampling: {
      startUtcHours: event.shadow.startUtcHours,
      endUtcHours: event.shadow.endUtcHours,
      stepSeconds: 3.6,
      frameCount: event.shadow.frameCount,
      geometryInterpolation: "none; the UI selects the nearest official frame",
    },
    transformation: {
      additionalDouglasPeuckerToleranceDegrees: 1 / 120,
      maximumRelativeRingAreaError: 0.01,
      coordinateDecimalPlaces: 6,
    },
    frames: shadowFrames.map((frame) => ({
      utcHours: Number(frame.utcHours.toFixed(3)),
      polygons: roundedPolygons(frame.polygons),
    })),
  };
  const shadowFile = "official-central-shadow.json";
  const shadowText = `${JSON.stringify(shadowArtifact)}\n`;
  await writeFile(path.join(outputDirectory, shadowFile), shadowText);

  const manifest = {
    schemaVersion: 3,
    artifactVersion: event.artifactVersion,
    event: {
      id: event.id,
      date: event.date,
      centralPhaseKind: event.centralPhaseKind,
      centralShadowKind: event.centralShadowKind,
    },
    source: {
      name: event.source.name,
      producer: "Instituto Geográfico Nacional / Observatorio Astronómico Nacional",
      sourcePage: `https://centrodedescargas.cnig.es/CentroDescargas/detalleArchivo?sec=${event.source.detailId}`,
      retrievedAt: "2026-08-03",
      license: "CC BY 4.0-compatible IGN/CNIG data policy",
      requiredAttribution,
      sha256: event.source.sha256,
      bytes: event.source.bytes,
      epsg: 3857,
      noDataValue: expectedRaster.noData,
      nativeCellSizeMetres: expectedRaster.resolutionMetres,
      obscurationClampedPixelCount,
    },
    vectorSource: {
      name: event.vectorSource.name,
      producer: "Instituto Geográfico Nacional / Observatorio Astronómico Nacional",
      sourcePage: `https://centrodedescargas.cnig.es/CentroDescargas/detalleArchivo?sec=${event.vectorSource.detailId}`,
      retrievedAt: "2026-08-03",
      license: "CC BY 4.0-compatible IGN/CNIG data policy",
      requiredAttribution,
      sha256: event.vectorSource.sha256,
      bytes: event.vectorSource.bytes,
      epsg: 4326,
      durationLayer: durationTable,
      shadowLayer: shadowTable,
    },
    crop: {
      sourcePixelWindow: cropWindow,
      width,
      height,
      epsg: 3857,
      leafletBounds: {
        south: southWest.latitude,
        west: southWest.longitude,
        north: northEast.latitude,
        east: northEast.longitude,
      },
      resampling: "none; one source pixel to one output pixel",
    },
    generatorSha256: await generatorSha256(),
    outputs,
    animation: {
      id: "umbra-passage",
      file: shadowFile,
      shadowKind: event.centralShadowKind,
      frameCount: event.shadow.frameCount,
      startUtcHours: event.shadow.startUtcHours,
      endUtcHours: event.shadow.endUtcHours,
      stepSeconds: 3.6,
      sha256: sha256(shadowText),
    },
    useConstraints: {
      visualizationOnly: true,
      pixelQueryEnabled: false,
      usedForRecommendation: false,
    },
    limitations: [
      "Regional pixels are approximately 1.223 km and are not point values.",
      "Colour scales are contextual and must not be decoded as exact measurements.",
      "Central-shadow frames are discrete official samples every 3.6 seconds.",
    ],
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestFile = "official-eclipse-overlays.json";
  await writeFile(path.join(outputDirectory, manifestFile), manifestText);
  await writeFile(
    path.join(outputDirectory, "checksums.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        artifactVersion: event.artifactVersion,
        files: {
          [manifestFile]: sha256(manifestText),
          ...Object.fromEntries(outputs.map((output) => [output.file, output.sha256])),
          [shadowFile]: sha256(shadowText),
        },
      },
      null,
      2,
    )}\n`,
  );
}

for (const event of events) await generate(event);
