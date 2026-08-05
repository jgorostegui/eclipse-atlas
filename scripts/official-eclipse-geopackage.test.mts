import { describe, expect, it } from "vitest";
import {
  applyCoverageMask,
  parseGeoPackageMultiPolygon,
  rasteriseDurationBands,
  rasteriseUmbraEnvelope,
  ringArea,
  simplifyClosedRing,
  type Position,
} from "./official-eclipse-geopackage.mts";

function syntheticGeoPackageMultiPolygon() {
  const points: Position[] = [
    [-4, 40],
    [-3, 40],
    [-3, 41],
    [-4, 41],
    [-4, 40],
  ];
  const bodyBytes = 1 + 4 + 4 + 1 + 4 + 4 + 4 + points.length * 16;
  const buffer = Buffer.alloc(8 + bodyBytes);
  buffer.write("GP", 0, "ascii");
  buffer.writeUInt8(0, 2);
  buffer.writeUInt8(1, 3);
  buffer.writeInt32LE(4326, 4);
  let offset = 8;
  const byteOrder = () => buffer.writeUInt8(1, offset++);
  const uint32 = (value: number) => {
    buffer.writeUInt32LE(value, offset);
    offset += 4;
  };
  byteOrder();
  uint32(6);
  uint32(1);
  byteOrder();
  uint32(3);
  uint32(1);
  uint32(points.length);
  for (const [longitude, latitude] of points) {
    buffer.writeDoubleLE(longitude, offset);
    offset += 8;
    buffer.writeDoubleLE(latitude, offset);
    offset += 8;
  }
  return buffer;
}

function syntheticGeoPackagePolygon() {
  const multipolygon = syntheticGeoPackageMultiPolygon();
  const polygonBody = multipolygon.subarray(8 + 1 + 4 + 4);
  const buffer = Buffer.alloc(8 + polygonBody.length);
  multipolygon.copy(buffer, 0, 0, 8);
  polygonBody.copy(buffer, 8);
  return buffer;
}

describe("official eclipse GeoPackage transforms", () => {
  it("parses an EPSG:4326 GeoPackage MULTIPOLYGON without retaining attributes", () => {
    expect(parseGeoPackageMultiPolygon(syntheticGeoPackageMultiPolygon())).toEqual([
      [[[-4, 40], [-3, 40], [-3, 41], [-4, 41], [-4, 40]]],
    ]);
  });

  it("normalizes an EPSG:4326 GeoPackage POLYGON to a multipolygon", () => {
    expect(parseGeoPackageMultiPolygon(syntheticGeoPackagePolygon())).toEqual([
      [[[-4, 40], [-3, 40], [-3, 41], [-4, 41], [-4, 40]]],
    ]);
  });

  it("simplifies closed rings only inside the declared area-error guard", () => {
    const ring: Position[] = [
      [0, 0],
      [0.25, 0.001],
      [0.5, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    const simplified = simplifyClosedRing(ring, 0.01);
    expect(simplified.length).toBeLessThan(ring.length);
    expect(
      Math.abs(ringArea(simplified) - ringArea(ring)) / ringArea(ring),
    ).toBeLessThanOrEqual(0.01);
  });

  it("rasterises declared duration bands with transparent no-data pixels", () => {
    const pixels = rasteriseDurationBands(
      [
        {
          minimumSeconds: 60,
          maximumSeconds: 70,
          polygons: [[[[-4, 40], [-3, 40], [-3, 41], [-4, 41], [-4, 40]]]],
        },
      ],
      20,
      20,
      { west: -5, south: 39, east: -2, north: 42 },
    );
    const alpha = [...pixels].filter((_, index) => index % 4 === 3);
    expect(alpha).toContain(0);
    expect(alpha).toContain(220);
  });

  it("masks the zero-duration exterior with the sampled official umbra envelope", () => {
    const bounds = { west: -5, south: 39, east: -2, north: 42 };
    const duration = rasteriseDurationBands(
      [
        {
          minimumSeconds: 0,
          maximumSeconds: 10,
          polygons: [[[[-5, 39], [-2, 39], [-2, 42], [-5, 42], [-5, 39]]]],
        },
      ],
      30,
      30,
      bounds,
    );
    const envelope = rasteriseUmbraEnvelope(
      [
        {
          utcHours: 18.468,
          polygons: [[[[-4, 40], [-3, 40], [-3, 41], [-4, 41], [-4, 40]]]],
        },
      ],
      30,
      30,
      bounds,
    );
    applyCoverageMask(duration, envelope);
    const alpha = [...duration].filter((_, index) => index % 4 === 3);
    expect(alpha.filter((value) => value === 220).length).toBeGreaterThan(0);
    expect(alpha.filter((value) => value === 0).length).toBeGreaterThan(0);
    expect(alpha.filter((value) => value === 220).length).toBeLessThan(
      alpha.length / 2,
    );
  });
});
