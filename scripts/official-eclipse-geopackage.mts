import { renderTotalityDurationBandPixel, type Rgba } from "./official-overview-renderer.mts";

export type Position = readonly [longitude: number, latitude: number];
export type PolygonCoordinates = Position[][];
export type MultiPolygonCoordinates = PolygonCoordinates[];

export type DurationBand = {
  minimumSeconds: number;
  maximumSeconds: number;
  polygons: MultiPolygonCoordinates;
};

export type UmbraFrame = {
  utcHours: number;
  polygons: MultiPolygonCoordinates;
};

const envelopeDoubleCounts = [0, 4, 6, 6, 8] as const;

function geometryBodyOffset(buffer: Buffer) {
  if (buffer.length < 8 || buffer.toString("ascii", 0, 2) !== "GP") {
    throw new Error("GeoPackage geometry header is missing.");
  }
  const envelopeCode = (buffer.readUInt8(3) >> 1) & 0b111;
  const envelopeDoubles = envelopeDoubleCounts[envelopeCode];
  if (envelopeDoubles === undefined) {
    throw new Error("Unsupported GeoPackage geometry envelope.");
  }
  return 8 + envelopeDoubles * 8;
}

export function parseGeoPackageMultiPolygon(value: Uint8Array) {
  const buffer = Buffer.from(value);
  let offset = geometryBodyOffset(buffer);

  type ParsedGeometry =
    | { type: "polygon"; coordinates: PolygonCoordinates }
    | { type: "multipolygon"; coordinates: MultiPolygonCoordinates };

  function parseGeometry(): ParsedGeometry {
    const littleEndian = buffer.readUInt8(offset) === 1;
    offset += 1;
    const readUint32 = () => {
      const result = littleEndian
        ? buffer.readUInt32LE(offset)
        : buffer.readUInt32BE(offset);
      offset += 4;
      return result;
    };
    const readDouble = () => {
      const result = littleEndian
        ? buffer.readDoubleLE(offset)
        : buffer.readDoubleBE(offset);
      offset += 8;
      return result;
    };
    const geometryType = readUint32() % 1000;
    if (geometryType === 6) {
      const polygonCount = readUint32();
      const coordinates = Array.from({ length: polygonCount }, () => {
        const polygon = parseGeometry();
        if (polygon.type !== "polygon") {
          throw new Error("Invalid polygon member.");
        }
        return polygon.coordinates;
      });
      return { type: "multipolygon", coordinates };
    }
    if (geometryType === 3) {
      const ringCount = readUint32();
      const coordinates = Array.from({ length: ringCount }, () => {
        const pointCount = readUint32();
        return Array.from(
          { length: pointCount },
          () => [readDouble(), readDouble()] as const,
        );
      });
      return { type: "polygon", coordinates };
    }
    throw new Error(`Unsupported GeoPackage WKB geometry type ${geometryType}.`);
  }

  const parsed = parseGeometry();
  if (offset !== buffer.length) {
    throw new Error("GeoPackage geometry contains trailing bytes.");
  }
  return parsed.type === "multipolygon"
    ? parsed.coordinates
    : [parsed.coordinates];
}

function distanceToSegmentSquared(point: Position, start: Position, end: Position) {
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  if (deltaX === 0 && deltaY === 0) {
    return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
  }
  const position = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * deltaX +
        (point[1] - start[1]) * deltaY) /
        (deltaX ** 2 + deltaY ** 2),
    ),
  );
  const projectedX = start[0] + position * deltaX;
  const projectedY = start[1] + position * deltaY;
  return (point[0] - projectedX) ** 2 + (point[1] - projectedY) ** 2;
}

function simplifyOpenLine(points: Position[], toleranceSquared: number): Position[] {
  if (points.length <= 2) return points;
  let maximumDistance = -1;
  let splitIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegmentSquared(
      points[index],
      points[0],
      points.at(-1)!,
    );
    if (distance > maximumDistance) {
      maximumDistance = distance;
      splitIndex = index;
    }
  }
  if (maximumDistance <= toleranceSquared) {
    return [points[0], points.at(-1)!];
  }
  const left = simplifyOpenLine(points.slice(0, splitIndex + 1), toleranceSquared);
  const right = simplifyOpenLine(points.slice(splitIndex), toleranceSquared);
  return [...left.slice(0, -1), ...right];
}

export function ringArea(ring: readonly Position[]) {
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    twiceArea +=
      ring[index][0] * ring[index + 1][1] -
      ring[index + 1][0] * ring[index][1];
  }
  return Math.abs(twiceArea / 2);
}

export function simplifyClosedRing(
  ring: Position[],
  toleranceDegrees: number,
  maximumRelativeAreaError = 0.01,
) {
  if (ring.length < 5 || toleranceDegrees <= 0) return ring;
  const openRing = ring.slice(0, -1);
  let oppositeIndex = 1;
  let maximumDistance = -1;
  for (let index = 1; index < openRing.length; index += 1) {
    const distance =
      (openRing[index][0] - openRing[0][0]) ** 2 +
      (openRing[index][1] - openRing[0][1]) ** 2;
    if (distance > maximumDistance) {
      maximumDistance = distance;
      oppositeIndex = index;
    }
  }
  const toleranceSquared = toleranceDegrees ** 2;
  const first = simplifyOpenLine(
    openRing.slice(0, oppositeIndex + 1),
    toleranceSquared,
  );
  const second = simplifyOpenLine(
    [...openRing.slice(oppositeIndex), openRing[0]],
    toleranceSquared,
  );
  const simplified = [...first.slice(0, -1), ...second.slice(0, -1)];
  if (simplified.length < 3) return ring;
  simplified.push(simplified[0]);
  const originalArea = ringArea(ring);
  const relativeAreaError =
    originalArea === 0
      ? 0
      : Math.abs(ringArea(simplified) - originalArea) / originalArea;
  return relativeAreaError <= maximumRelativeAreaError ? simplified : ring;
}

function webMercatorY(latitudeDegrees: number) {
  const latitudeRadians = (Math.max(-85.05112878, Math.min(85.05112878, latitudeDegrees)) * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2));
}

function setPixel(target: Uint8Array, index: number, colour: Rgba) {
  target.set(colour, index * 4);
}

function fillPolygonAtPixelCentres(
  polygon: PolygonCoordinates,
  width: number,
  height: number,
  project: (position: Position) => Position,
  fillPixel: (pixelIndex: number) => void,
) {
  const intersections = new Map<number, number[]>();
  for (const ring of polygon) {
    const projected = ring.map(project);
    for (let index = 0; index < projected.length - 1; index += 1) {
      const start = projected[index];
      const end = projected[index + 1];
      if (start[1] === end[1]) continue;
      const minimumY = Math.max(
        0,
        Math.ceil(Math.min(start[1], end[1]) - 0.5),
      );
      const maximumY = Math.min(
        height - 1,
        Math.ceil(Math.max(start[1], end[1]) - 0.5) - 1,
      );
      for (let y = minimumY; y <= maximumY; y += 1) {
        const scanY = y + 0.5;
        const fraction = (scanY - start[1]) / (end[1] - start[1]);
        const x = start[0] + fraction * (end[0] - start[0]);
        const row = intersections.get(y) ?? [];
        row.push(x);
        intersections.set(y, row);
      }
    }
  }
  for (const [y, rowIntersections] of intersections) {
    rowIntersections.sort((left, right) => left - right);
    if (rowIntersections.length % 2 !== 0) {
      throw new Error("Official polygon has an invalid scanline.");
    }
    for (let index = 0; index < rowIntersections.length; index += 2) {
      const minimumX = Math.max(
        0,
        Math.ceil(rowIntersections[index] - 0.5),
      );
      const maximumX = Math.min(
        width - 1,
        Math.floor(rowIntersections[index + 1] - 0.5),
      );
      for (let x = minimumX; x <= maximumX; x += 1) {
        fillPixel(y * width + x);
      }
    }
  }
}

function createProjector(
  width: number,
  height: number,
  bounds: { west: number; south: number; east: number; north: number },
) {
  const northY = webMercatorY(bounds.north);
  const southY = webMercatorY(bounds.south);
  return ([longitude, latitude]: Position): Position => [
    ((longitude - bounds.west) / (bounds.east - bounds.west)) * width,
    ((northY - webMercatorY(latitude)) / (northY - southY)) * height,
  ];
}

export function rasteriseDurationBands(
  bands: DurationBand[],
  width: number,
  height: number,
  bounds: { west: number; south: number; east: number; north: number },
  domainMaximumSeconds = 123,
) {
  const pixels = new Uint8Array(width * height * 4);
  const project = createProjector(width, height, bounds);

  for (const band of bands) {
    const colour = renderTotalityDurationBandPixel(
      band.minimumSeconds,
      band.maximumSeconds,
      domainMaximumSeconds,
    );
    for (const polygon of band.polygons) {
      fillPolygonAtPixelCentres(polygon, width, height, project, (pixelIndex) =>
        setPixel(pixels, pixelIndex, colour),
      );
    }
  }
  return pixels;
}

export function rasteriseUmbraEnvelope(
  frames: readonly UmbraFrame[],
  width: number,
  height: number,
  bounds: { west: number; south: number; east: number; north: number },
) {
  const mask = new Uint8Array(width * height);
  const project = createProjector(width, height, bounds);
  for (const frame of frames) {
    for (const polygon of frame.polygons) {
      fillPolygonAtPixelCentres(
        polygon,
        width,
        height,
        project,
        (pixelIndex) => {
          mask[pixelIndex] = 1;
        },
      );
    }
  }
  return mask;
}

export function applyCoverageMask(
  rgbaPixels: Uint8Array,
  coverageMask: Uint8Array,
) {
  if (rgbaPixels.length !== coverageMask.length * 4) {
    throw new RangeError("RGBA pixels and coverage mask dimensions do not match.");
  }
  for (let index = 0; index < coverageMask.length; index += 1) {
    if (coverageMask[index] === 0) rgbaPixels[index * 4 + 3] = 0;
  }
  return rgbaPixels;
}
