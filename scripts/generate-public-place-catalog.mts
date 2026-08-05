import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { requiredInputPath } from "./required-input-path.mts";

const MINIMUM_CITY_POPULATION = 20_000;
const GENERATED_AT = "2026-08-05T20:00:00.000Z";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const outputPath = path.join(
  repositoryRoot,
  "src",
  "data",
  "public-place-catalog.json",
);

const geonamesPath = requiredInputPath("ECLIPSE_ATLAS_GEONAMES_ES_PATH");
const viewpointsPath = requiredInputPath(
  "ECLIPSE_ATLAS_OSM_VIEWPOINTS_PATH",
);
const astronomyPath = requiredInputPath("ECLIPSE_ATLAS_OSM_ASTRONOMY_PATH");
const spainBoundaryPath = requiredInputPath(
  "ECLIPSE_ATLAS_OSM_SPAIN_BOUNDARY_PATH",
);

const SPANISH_REGION_BY_GEONAMES_CODE: Readonly<Record<string, string>> = {
  "07": "Illes Balears",
  "27": "La Rioja",
  "29": "Comunidad de Madrid",
  "31": "Región de Murcia",
  "32": "Navarra",
  "34": "Asturias",
  "39": "Cantabria",
  "51": "Andalucía",
  "52": "Aragón",
  "53": "Canarias",
  "54": "Castilla-La Mancha",
  "55": "Castilla y León",
  "56": "Catalunya",
  "57": "Extremadura",
  "58": "Galicia",
  "59": "Euskadi",
  "60": "Comunitat Valenciana",
  CE: "Ceuta",
  ML: "Melilla",
};

type Position = readonly [number, number];
type PolygonCoordinates = Position[][];
type MultiPolygonCoordinates = PolygonCoordinates[];
type Bounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};
type RingEdge = {
  start: Position;
  end: Position;
  bounds: Bounds;
};
type PreparedRing = {
  bounds: Bounds;
  edgeBuckets: Map<number, RingEdge[]>;
};
type PreparedPolygon = {
  rings: PreparedRing[];
  bounds: Bounds;
};

const BOUNDARY_BUCKETS_PER_LATITUDE_DEGREE = 20;

type BoundaryFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    geometry: {
      type: "MultiPolygon";
      coordinates: MultiPolygonCoordinates;
    };
    properties: {
      osm_id?: number;
      osm_type?: string;
    };
  }>;
};

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type OsmSnapshot = {
  osm3s: {
    timestamp_osm_base: string;
    copyright: string;
  };
  elements: OsmElement[];
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function finiteCoordinate(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}

function normalizedName(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function pointOnSegment(point: Position, start: Position, end: Position) {
  const [x, y] = point;
  const [startX, startY] = start;
  const [endX, endY] = end;
  const lengthSquared =
    (endX - startX) ** 2 + (endY - startY) ** 2;
  if (lengthSquared <= Number.EPSILON) {
    return Math.hypot(x - startX, y - startY) <= 1e-10;
  }
  const cross =
    (x - startX) * (endY - startY) - (y - startY) * (endX - startX);
  if (Math.abs(cross) > 1e-10) return false;
  const dot =
    (x - startX) * (endX - startX) + (y - startY) * (endY - startY);
  if (dot < 0) return false;
  return dot <= lengthSquared;
}

function ringContainsPoint(point: Position, ring: PreparedRing) {
  const [x, y] = point;
  if (
    x < ring.bounds.west ||
    x > ring.bounds.east ||
    y < ring.bounds.south ||
    y > ring.bounds.north
  ) {
    return false;
  }
  let inside = false;
  const bucket = Math.floor(y * BOUNDARY_BUCKETS_PER_LATITUDE_DEGREE);
  for (const edge of ring.edgeBuckets.get(bucket) ?? []) {
    const [currentX, currentY] = edge.end;
    const [previousX, previousY] = edge.start;
    if (
      x >= edge.bounds.west &&
      x <= edge.bounds.east &&
      y >= edge.bounds.south &&
      y <= edge.bounds.north &&
      pointOnSegment(point, edge.start, edge.end)
    ) {
      return true;
    }
    const crosses =
      currentY > y !== previousY > y &&
      x <
        ((previousX - currentX) * (y - currentY)) /
          (previousY - currentY) +
          currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function polygonContainsPoint(point: Position, polygon: PreparedPolygon) {
  const outerRing = polygon.rings[0];
  if (!outerRing || !ringContainsPoint(point, outerRing)) return false;
  return polygon.rings
    .slice(1)
    .every((hole) => !ringContainsPoint(point, hole));
}

function boundaryContainsPoint(
  point: Position,
  polygons: PreparedPolygon[],
) {
  const [longitude, latitude] = point;
  return polygons.some(
    (polygon) =>
      longitude >= polygon.bounds.west &&
      longitude <= polygon.bounds.east &&
      latitude >= polygon.bounds.south &&
      latitude <= polygon.bounds.north &&
      polygonContainsPoint(point, polygon),
  );
}

function ringBounds(ring: Position[]): Bounds {
  const longitudes = ring.map(([longitude]) => longitude);
  const latitudes = ring.map(([, latitude]) => latitude);
  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes),
  };
}

function prepareRing(ring: Position[]): PreparedRing {
  if (ring.length < 4) {
    throw new RangeError("A boundary ring must contain at least four positions.");
  }
  const edgeBuckets = new Map<number, RingEdge[]>();
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index, index += 1
  ) {
    const start = ring[previous];
    const end = ring[index];
    if (!start || !end) continue;
    const bounds = {
      west: Math.min(start[0], end[0]),
      south: Math.min(start[1], end[1]),
      east: Math.max(start[0], end[0]),
      north: Math.max(start[1], end[1]),
    };
    const edge = { start, end, bounds };
    const firstBucket = Math.floor(
      bounds.south * BOUNDARY_BUCKETS_PER_LATITUDE_DEGREE,
    );
    const lastBucket = Math.floor(
      bounds.north * BOUNDARY_BUCKETS_PER_LATITUDE_DEGREE,
    );
    for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
      const edges = edgeBuckets.get(bucket) ?? [];
      edges.push(edge);
      edgeBuckets.set(bucket, edges);
    }
  }
  return { bounds: ringBounds(ring), edgeBuckets };
}

function prepareBoundary(coordinates: MultiPolygonCoordinates) {
  return coordinates.map((polygon) => {
    const rings = polygon.map(prepareRing);
    const outerRing = rings[0];
    if (!outerRing) {
      throw new RangeError("A Spain boundary polygon has no valid outer ring.");
    }
    return {
      rings,
      bounds: outerRing.bounds,
    };
  });
}

function parseBoundary(raw: string) {
  const parsed = JSON.parse(raw) as Partial<BoundaryFeatureCollection>;
  const feature = parsed.features?.[0];
  if (
    parsed.type !== "FeatureCollection" ||
    parsed.features?.length !== 1 ||
    feature?.geometry.type !== "MultiPolygon" ||
    !Array.isArray(feature.geometry.coordinates)
  ) {
    throw new TypeError("The Spain boundary must be one MultiPolygon feature.");
  }
  return {
    polygons: prepareBoundary(feature.geometry.coordinates),
    osmId: feature.properties.osm_id,
    osmType: feature.properties.osm_type,
  };
}

function parseOsmSnapshot(raw: string, label: string) {
  const parsed = JSON.parse(raw) as Partial<OsmSnapshot>;
  if (
    !Array.isArray(parsed.elements) ||
    typeof parsed.osm3s?.timestamp_osm_base !== "string" ||
    !parsed.osm3s.copyright?.includes("ODbL")
  ) {
    throw new TypeError(`${label} is not a source-bound Overpass snapshot.`);
  }
  return parsed as OsmSnapshot;
}

function osmCoordinate(element: OsmElement): Position {
  const longitude = finiteCoordinate(
    element.lon ?? element.center?.lon,
    `${element.type} ${element.id} longitude`,
  );
  const latitude = finiteCoordinate(
    element.lat ?? element.center?.lat,
    `${element.type} ${element.id} latitude`,
  );
  return [longitude, latitude];
}

function osmFeatureKey(element: OsmElement) {
  return `${element.type}/${element.id}`;
}

function osmFeatureUrl(element: OsmElement) {
  return `https://www.openstreetmap.org/${element.type}/${element.id}`;
}

function parseCities(raw: string) {
  const seenIds = new Set<string>();
  const cities = raw
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const fields = line.split("\t");
      if (fields.length < 19) {
        throw new TypeError("A GeoNames row has fewer than 19 fields.");
      }
      const [featureId, name, , , latitudeText, longitudeText, featureClass, featureCode, countryCode, , admin1Code, , , , populationText] = fields;
      const population = Number(populationText);
      if (
        featureClass !== "P" ||
        countryCode !== "ES" ||
        !Number.isFinite(population) ||
        population < MINIMUM_CITY_POPULATION
      ) {
        return [];
      }
      if (!featureId || !name || !featureCode || !admin1Code) {
        throw new TypeError("A selected GeoNames city is missing an identity field.");
      }
      const region = SPANISH_REGION_BY_GEONAMES_CODE[admin1Code];
      if (!region) {
        throw new RangeError(`Unsupported GeoNames Spain region: ${admin1Code}`);
      }
      if (seenIds.has(featureId)) {
        throw new RangeError(`Duplicate GeoNames feature id: ${featureId}`);
      }
      seenIds.add(featureId);
      const latitude = finiteCoordinate(
        Number(latitudeText),
        `GeoNames ${featureId} latitude`,
      );
      const longitude = finiteCoordinate(
        Number(longitudeText),
        `GeoNames ${featureId} longitude`,
      );
      return [
        {
          id: `geonames-${featureId}`,
          name,
          shortName: name,
          region,
          latitude,
          longitude,
          category: "city-reference" as const,
          source: "geonames" as const,
          sourceFeatureId: featureId,
          sourceUrl: `https://www.geonames.org/${featureId}/`,
          featureCode,
          population,
        },
      ];
    });
  return cities.sort(
    (left, right) =>
      right.population - left.population ||
      left.name.localeCompare(right.name, "es"),
  );
}

function astronomyKind(element: OsmElement) {
  const tags = element.tags ?? {};
  if (tags.amenity === "planetarium") return "planetarium" as const;
  if (tags["observatory:type"] === "astronomical") {
    return "observatory" as const;
  }
  const name = normalizedName(tags.name)?.toLocaleLowerCase("es") ?? "";
  const excluded =
    /meteor|metereol|geof[ií]sic|ave|bird|fauna|forestal|atmosf[eé]ric|geomagn[eé]tic|oiseaux|m[eé]t[eé]o/.test(
      name,
    );
  const astronomical =
    /astron|astrof[ií]sic|planetari|estelar|stellarium|telescop|radioastron|starlight/.test(
      `${name} ${tags.operator ?? ""} ${tags.alt_name ?? ""}`.toLocaleLowerCase(
        "es",
      ),
    );
  const linkedAstronomicalRecord = Boolean(tags.wikidata || tags.wikipedia);
  return (astronomical || linkedAstronomicalRecord) && !excluded
    ? ("observatory" as const)
    : null;
}

function parseOsmPlaces(
  viewpointSnapshot: OsmSnapshot,
  astronomySnapshot: OsmSnapshot,
  boundary: PreparedPolygon[],
) {
  const points = new Map<
    string,
    {
      id: string;
      name: string;
      shortName: string;
      region: "Spain";
      latitude: number;
      longitude: number;
      category: "candidate-viewpoint" | "astronomy-site";
      placeKind: "viewpoint" | "observatory" | "planetarium";
      source: "openstreetmap";
      sourceFeatureId: string;
      sourceUrl: string;
    }
  >();

  const retain = (
    element: OsmElement,
    category: "candidate-viewpoint" | "astronomy-site",
    placeKind: "viewpoint" | "observatory" | "planetarium",
  ) => {
    const name = normalizedName(element.tags?.name);
    if (!name) return;
    const [longitude, latitude] = osmCoordinate(element);
    if (!boundaryContainsPoint([longitude, latitude], boundary)) return;
    const sourceFeatureId = osmFeatureKey(element);
    points.set(sourceFeatureId, {
      id: `osm-${placeKind}-${element.type}-${element.id}`,
      name,
      shortName: name,
      region: "Spain",
      latitude,
      longitude,
      category,
      placeKind,
      source: "openstreetmap",
      sourceFeatureId,
      sourceUrl: osmFeatureUrl(element),
    });
  };

  for (const element of viewpointSnapshot.elements) {
    if (element.tags?.tourism === "viewpoint") {
      retain(element, "candidate-viewpoint", "viewpoint");
    }
  }
  for (const element of astronomySnapshot.elements) {
    const kind = astronomyKind(element);
    if (kind) retain(element, "astronomy-site", kind);
  }

  return [...points.values()].sort(
    (left, right) =>
      left.category.localeCompare(right.category) ||
      left.name.localeCompare(right.name, "es") ||
      left.sourceFeatureId.localeCompare(right.sourceFeatureId),
  );
}

const [geonamesRaw, viewpointsRaw, astronomyRaw, boundaryRaw] =
  await Promise.all([
    readFile(geonamesPath, "utf8"),
    readFile(viewpointsPath, "utf8"),
    readFile(astronomyPath, "utf8"),
    readFile(spainBoundaryPath, "utf8"),
  ]);
const viewpoints = parseOsmSnapshot(viewpointsRaw, "OSM viewpoints");
const astronomy = parseOsmSnapshot(astronomyRaw, "OSM astronomy places");
const boundary = parseBoundary(boundaryRaw);
const cities = parseCities(geonamesRaw);
const osmPlaces = parseOsmPlaces(viewpoints, astronomy, boundary.polygons);
const points = [...cities, ...osmPlaces];

if (cities.length < 500) {
  throw new RangeError(`Expected at least 500 city references; found ${cities.length}.`);
}
if (osmPlaces.filter(({ category }) => category === "candidate-viewpoint").length < 300) {
  throw new RangeError("The OSM snapshot produced too few named viewpoints in Spain.");
}
if (new Set(points.map(({ id }) => id)).size !== points.length) {
  throw new RangeError("The generated place catalog contains duplicate identifiers.");
}

const artifact = {
  schemaVersion: 1,
  generatedAt: GENERATED_AT,
  coordinateReferenceSystem: "WGS 84 (EPSG:4326)",
  selection: {
    cities: `Every GeoNames Spain feature-class P record with a published population of at least ${MINIMUM_CITY_POPULATION}.`,
    viewpoints:
      "Every named tourism=viewpoint feature from the captured request envelope whose representative point falls inside the OSM Spain boundary.",
    astronomy:
      "Named OpenStreetMap objects identified as astronomical observatories or planetariums. Multiple objects can describe one facility. Weather, geophysical, atmospheric, forestry and wildlife observatories are excluded.",
  },
  sources: {
    geonames: {
      txtSha256: sha256(geonamesRaw),
      minimumPopulation: MINIMUM_CITY_POPULATION,
      license: {
        name: "Creative Commons Attribution 4.0",
        url: "https://creativecommons.org/licenses/by/4.0/",
        attribution: "Place coordinates: GeoNames, licensed under CC BY 4.0.",
      },
    },
    openstreetmap: {
      license: {
        name: "Open Data Commons Open Database License 1.0",
        url: "https://opendatacommons.org/licenses/odbl/1-0/",
        attribution: "© OpenStreetMap contributors.",
      },
      viewpoints: {
        snapshotTimestamp: viewpoints.osm3s.timestamp_osm_base,
        sha256: sha256(viewpointsRaw),
      },
      astronomy: {
        snapshotTimestamp: astronomy.osm3s.timestamp_osm_base,
        sha256: sha256(astronomyRaw),
      },
      spainBoundary: {
        osmType: boundary.osmType,
        osmId: boundary.osmId,
        sha256: sha256(boundaryRaw),
      },
    },
  },
  counts: {
    cities: cities.length,
    viewpoints: osmPlaces.filter(
      ({ category }) => category === "candidate-viewpoint",
    ).length,
    astronomyObjects: osmPlaces.filter(
      ({ category }) => category === "astronomy-site",
    ).length,
    total: points.length,
  },
  points,
};

await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(
  `Wrote ${artifact.counts.total} public place references to ${path.relative(repositoryRoot, outputPath)}.\n`,
);
