import { DatabaseSync } from "node:sqlite";
import {
  parseGeoPackageMultiPolygon,
  simplifyClosedRing,
  type DurationBand,
  type UmbraFrame,
} from "./official-eclipse-geopackage.mts";

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function featureTable(
  database: DatabaseSync,
  prefix: "durtot_" | "shadows_",
) {
  const result = database
    .prepare(
      "SELECT table_name FROM gpkg_contents WHERE data_type = 'features' AND table_name LIKE ?",
    )
    .get(`${prefix}%`) as { table_name?: string } | undefined;
  if (!result?.table_name) throw new Error(`Missing ${prefix} GeoPackage layer.`);
  return result.table_name;
}

function assertLayerMetadata(database: DatabaseSync, tableName: string) {
  const result = database
    .prepare(
      "SELECT geometry_type_name, srs_id FROM gpkg_geometry_columns WHERE table_name = ?",
    )
    .get(tableName) as
    | { geometry_type_name?: string; srs_id?: number }
    | undefined;
  if (result?.geometry_type_name !== "MULTIPOLYGON" || result.srs_id !== 4326) {
    throw new Error("Official GeoPackage layer is not EPSG:4326 MULTIPOLYGON.");
  }
}

function assertPolygonLayerMetadata(database: DatabaseSync, tableName: string) {
  const result = database
    .prepare(
      "SELECT geometry_type_name, srs_id FROM gpkg_geometry_columns WHERE table_name = ?",
    )
    .get(tableName) as
    | { geometry_type_name?: string; srs_id?: number }
    | undefined;
  if (
    !["POLYGON", "MULTIPOLYGON"].includes(result?.geometry_type_name ?? "") ||
    result?.srs_id !== 4326
  ) {
    throw new Error("Official GeoPackage layer is not an EPSG:4326 polygon layer.");
  }
}

export type OfficialEventGeoPackageOptions = Readonly<{
  durationStepSeconds: number;
  expectedDurationContourCount: number;
  expectedShadowFrameCount: number;
  expectedShadowStartUtcHours: number;
  expectedShadowEndUtcHours: number;
  shadowStepHours: number;
}>;

export function readOfficialEventGeoPackage(
  filePath: string,
  options: OfficialEventGeoPackageOptions,
) {
  const database = new DatabaseSync(filePath, { readOnly: true });
  try {
    const durationTable = featureTable(database, "durtot_");
    const shadowTable = featureTable(database, "shadows_");
    assertPolygonLayerMetadata(database, durationTable);
    assertPolygonLayerMetadata(database, shadowTable);

    const durationRows = database
      .prepare(
        `SELECT geom, DuracionTotalSeg AS seconds FROM ${quoteIdentifier(durationTable)} ORDER BY seconds`,
      )
      .all() as Array<{ geom: Uint8Array; seconds: number }>;
    if (durationRows.length !== options.expectedDurationContourCount) {
      throw new Error("Official GeoPackage duration contour count differs from the frozen source.");
    }
    const durationBands = durationRows.map((row, index) => {
      const expectedSeconds = index * options.durationStepSeconds;
      if (row.seconds !== expectedSeconds) {
        throw new Error("Official duration contours are not in the expected sequence.");
      }
      return {
        minimumSeconds: row.seconds,
        maximumSeconds: row.seconds + options.durationStepSeconds,
        polygons: parseGeoPackageMultiPolygon(row.geom),
      } satisfies DurationBand;
    });

    const columns = database
      .prepare(`PRAGMA table_info(${quoteIdentifier(shadowTable)})`)
      .all() as Array<{ name: string }>;
    const timeColumns = columns
      .map((column) => column.name)
      .filter((name) => name.startsWith("mancha_ut_"));
    if (timeColumns.length !== options.expectedShadowFrameCount) {
      throw new Error("Official GeoPackage shadow timestamp count differs from the frozen source.");
    }
    const shadowRows = database
      .prepare(`SELECT * FROM ${quoteIdentifier(shadowTable)} ORDER BY fid`)
      .all() as Array<Record<string, unknown> & { geom: Uint8Array }>;
    if (shadowRows.length !== options.expectedShadowFrameCount) {
      throw new Error("Official GeoPackage shadow frame count differs from the frozen source.");
    }
    const shadowFrames = shadowRows.map((row, index) => {
      const populatedColumns = timeColumns.filter((column) => row[column] !== null);
      if (populatedColumns.length !== 1) {
        throw new Error("Each official shadow frame must have one timestamp flag.");
      }
      const utcHours = Number(populatedColumns[0].slice("mancha_ut_".length));
      const expectedUtcHours =
        options.expectedShadowStartUtcHours + index * options.shadowStepHours;
      if (Math.abs(utcHours - expectedUtcHours) > 1e-9) {
        throw new Error("Official central-shadow sampling interval differs from the frozen source.");
      }
      return {
        utcHours,
        polygons: parseGeoPackageMultiPolygon(row.geom).map((polygon) =>
          polygon.map((ring) => simplifyClosedRing(ring, 1 / 120)),
        ),
      } satisfies UmbraFrame;
    });
    if (
      Math.abs(
        (shadowFrames.at(-1)?.utcHours ?? Number.NaN) -
          options.expectedShadowEndUtcHours,
      ) > 1e-9
    ) {
      throw new Error("Official central-shadow end time differs from the frozen source.");
    }
    return {
      durationTable,
      shadowTable,
      durationBands,
      shadowFrames,
    };
  } finally {
    database.close();
  }
}

export function readOfficialGeoPackage(filePath: string) {
  const database = new DatabaseSync(filePath, { readOnly: true });
  try {
    const durationTable = featureTable(database, "durtot_");
    const shadowTable = featureTable(database, "shadows_");
    assertLayerMetadata(database, durationTable);
    assertLayerMetadata(database, shadowTable);

    const durationRows = database
      .prepare(
        `SELECT geom, DuracionTotalSegMin AS minimumSeconds, DuracionTotalSegMax AS maximumSeconds FROM ${quoteIdentifier(durationTable)} ORDER BY minimumSeconds`,
      )
      .all() as Array<{
      geom: Uint8Array;
      minimumSeconds: number;
      maximumSeconds: number;
    }>;
    if (durationRows.length !== 13) {
      throw new Error("Official GeoPackage must contain 13 duration bands.");
    }
    const durationBands = durationRows.map((row, index) => {
      if (
        row.minimumSeconds !== (index === 12 ? 120 : index * 10) ||
        (index < 12 && row.maximumSeconds !== (index + 1) * 10) ||
        (index === 12 && Math.abs(row.maximumSeconds - 122.7997) > 1e-4)
      ) {
        throw new Error("Official duration bands are not contiguous or expected.");
      }
      return {
        minimumSeconds: row.minimumSeconds,
        maximumSeconds: row.maximumSeconds,
        polygons: parseGeoPackageMultiPolygon(row.geom),
      } satisfies DurationBand;
    });

    const columns = database
      .prepare(`PRAGMA table_info(${quoteIdentifier(shadowTable)})`)
      .all() as Array<{ name: string }>;
    const timeColumns = columns
      .map((column) => column.name)
      .filter((name) => name.startsWith("mancha_ut_"));
    if (timeColumns.length !== 277) {
      throw new Error("Official GeoPackage must contain 277 umbra timestamps.");
    }
    const shadowRows = database
      .prepare(`SELECT * FROM ${quoteIdentifier(shadowTable)} ORDER BY fid`)
      .all() as Array<Record<string, unknown> & { geom: Uint8Array }>;
    if (shadowRows.length !== 277) {
      throw new Error("Official GeoPackage must contain 277 umbra frames.");
    }
    const umbraFrames = shadowRows.map((row, index) => {
      const populatedColumns = timeColumns.filter((column) => row[column] !== null);
      if (populatedColumns.length !== 1 || row[populatedColumns[0]] !== 1) {
        throw new Error("Each official umbra frame must have one timestamp flag.");
      }
      const utcHours = Number(populatedColumns[0].slice("mancha_ut_".length));
      const expectedUtcHours = 18.293 + index * 0.001;
      if (Math.abs(utcHours - expectedUtcHours) > 1e-9) {
        throw new Error("Official umbra sampling interval is not 0.001 UTC hours.");
      }
      const polygons = parseGeoPackageMultiPolygon(row.geom).map((polygon) =>
        polygon.map((ring) => simplifyClosedRing(ring, 1 / 120)),
      );
      return { utcHours, polygons } satisfies UmbraFrame;
    });
    return { durationBands, umbraFrames };
  } finally {
    database.close();
  }
}
