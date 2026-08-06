import candidateReferencePoints from "./candidate-reference-points.json" with {
  type: "json",
};
import nationalPlanningPoints from "./national-planning-points.json" with {
  type: "json",
};
import officialObservationPoints from "./official-observation-points.json" with {
  type: "json",
};
import publicPlaceCatalog from "./public-place-catalog.json" with {
  type: "json",
};

export const CUSTOM_COORDINATE_DECIMAL_PLACES = 6;

export function formatCustomCoordinate(value: number) {
  const rounded = Number(value.toFixed(CUSTOM_COORDINATE_DECIMAL_PLACES));
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(
    CUSTOM_COORDINATE_DECIMAL_PLACES,
  );
}

export type CandidateKind =
  | "administrative-centre"
  | "astronomy-reference"
  | "landscape-reference"
  | "official-site"
  | "user-selected";

export type CandidateCategory =
  | "totality-city"
  | "candidate-viewpoint"
  | "city-reference"
  | "astronomy-site"
  | "official-observation"
  | "partial-context"
  | "local-reference"
  | "custom";

export type CoordinateReferenceKind =
  | "approximate"
  | "mapped"
  | "named"
  | "published"
  | "reference"
  | "user-selected";

export type OperationalStatus =
  | "official-network"
  | "official-recommended"
  | "verify-with-organizer"
  | "municipal-programme"
  | "unverified";

export type CandidateLocation = {
  id: string;
  name: string;
  shortName: string;
  municipality?: string;
  region: string;
  latitude: number;
  longitude: number;
  kind: CandidateKind;
  category: CandidateCategory;
  defaultVisible: boolean;
  mapVisibleByDefault?: boolean;
  atmosphereReference: boolean;
  description: string;
  limitations: string[];
  coordinate: {
    kind: CoordinateReferenceKind;
    label: string;
    sourceName: string;
    sourceUrl?: string;
    retrievedAt: string;
  };
  operations: {
    status: OperationalStatus;
    label: string;
    sourceName?: string;
    sourceUrl?: string;
    reviewedAt?: string;
  };
};

const localCandidates: CandidateLocation[] = [
  {
    id: "arguedas",
    name: "Arguedas planning area",
    shortName: "Arguedas",
    municipality: "Arguedas",
    region: "Navarra",
    latitude: candidateReferencePoints.references.arguedas.latitude,
    longitude: candidateReferencePoints.references.arguedas.longitude,
    kind: "administrative-centre",
    category: "local-reference",
    defaultVisible: false,
    atmosphereReference: false,
    description:
      "A practical base for exploring the southern Navarra eclipse programme and the Bardenas landscape.",
    limitations: [
      "The marker is the OpenStreetMap administrative centre, not an official viewing enclosure.",
      "Access, tickets, capacity and the final observation position must be checked with the organizer.",
    ],
    coordinate: {
      kind: "approximate",
      label: "Approximate administrative centre",
      sourceName: "OpenStreetMap relation 346194",
      sourceUrl: "https://www.openstreetmap.org/relation/346194",
      retrievedAt: "2026-08-02",
    },
    operations: {
      status: "verify-with-organizer",
      label: "Check the official Navarra event page",
      sourceName: "Eklipse Navarra",
      sourceUrl:
        "https://eklipsenavarra.com/es/puntos-de-observaci%C3%B3n/arguedas",
      reviewedAt: "2026-08-02",
    },
  },
  {
    id: "el-ferial",
    name: "El Ferial landscape reference",
    shortName: "El Ferial",
    region: "Bardenas Reales",
    latitude: candidateReferencePoints.references["el-ferial"].latitude,
    longitude: candidateReferencePoints.references["el-ferial"].longitude,
    kind: "landscape-reference",
    category: "local-reference",
    defaultVisible: false,
    atmosphereReference: false,
    description:
      "A Bardenas reference point centred on the reservoir, useful for comparing eclipse geometry and western terrain.",
    limitations: [
      "The marker identifies the reservoir feature, not the official event entrance or viewing enclosure.",
      "The protected landscape has access controls; the organizer remains the authority for admission and parking.",
    ],
    coordinate: {
      kind: "approximate",
      label: "Approximate landscape feature",
      sourceName: "OpenStreetMap way 22986591",
      sourceUrl: "https://www.openstreetmap.org/way/22986591",
      retrievedAt: "2026-08-02",
    },
    operations: {
      status: "verify-with-organizer",
      label: "Check the official El Ferial event page",
      sourceName: "Eklipse Navarra",
      sourceUrl:
        "https://eklipsenavarra.com/es/puntos-de-observaci%C3%B3n/bardenas-reales-el-ferial",
      reviewedAt: "2026-08-02",
    },
  },
  {
    id: "medina-de-pomar",
    name: "Medina de Pomar planning reference",
    shortName: "Medina de Pomar",
    municipality: "Medina de Pomar",
    region: "Burgos",
    latitude: candidateReferencePoints.references["medina-de-pomar"].latitude,
    longitude: candidateReferencePoints.references["medina-de-pomar"].longitude,
    kind: "administrative-centre",
    category: "local-reference",
    defaultVisible: false,
    atmosphereReference: false,
    description:
      "A municipality-level reference for examining local eclipse geometry and western terrain, pending an exact field position.",
    limitations: [
      "The marker is the OpenStreetMap town centre, not an observation venue.",
      "Access, capacity, nearby obstacles and eclipse operations remain unverified.",
    ],
    coordinate: {
      kind: "approximate",
      label: "Approximate administrative centre",
      sourceName: "OpenStreetMap relation 340077",
      sourceUrl: "https://www.openstreetmap.org/relation/340077",
      retrievedAt: "2026-08-02",
    },
    operations: {
      status: "unverified",
      label: "No eclipse operations verified",
    },
  },
  {
    id: "alto-de-rosales",
    name: "Alto de Rosales viewpoint reference",
    shortName: "Alto de Rosales",
    municipality: "Medina de Pomar",
    region: "Burgos",
    latitude: candidateReferencePoints.references["alto-de-rosales"].latitude,
    longitude: candidateReferencePoints.references["alto-de-rosales"].longitude,
    kind: "landscape-reference",
    category: "local-reference",
    defaultVisible: false,
    atmosphereReference: false,
    description:
      "An elevated mountain-pass reference near Medina de Pomar for comparing eclipse geometry and the western horizon, pending an exact field position.",
    limitations: [
      "The marker is the OpenStreetMap mountain-pass node, not a prepared observation venue.",
      "Access, parking, capacity, nearby terrain obstacles and eclipse operations remain unverified.",
    ],
    coordinate: {
      kind: "mapped",
      label: "Mapped mountain pass",
      sourceName: "OpenStreetMap node 11914361210",
      sourceUrl: "https://www.openstreetmap.org/node/11914361210",
      retrievedAt: "2026-08-06",
    },
    operations: {
      status: "unverified",
      label: "No eclipse operations verified",
    },
  },
];

const officialNetworkCandidates: CandidateLocation[] = [
  {
    id: "navarra-virgen-del-yugo",
    name: "Arguedas · Virgen del Yugo",
    shortName: "Virgen del Yugo",
    municipality: "Arguedas",
    region: "Navarra",
    latitude: 42.2064755,
    longitude: -1.5854887,
    kind: "official-site",
    category: "official-observation",
    defaultVisible: true,
    atmosphereReference: false,
    description:
      "The official Arguedas observation programme, represented by the independently mapped Virgen del Yugo chapel feature.",
    limitations: [
      "The marker is the OpenStreetMap chapel centroid, not the organizer's surveyed enclosure boundary.",
      "Admission, capacity, traffic controls and access remain live operational information.",
    ],
    coordinate: {
      kind: "mapped",
      label: "Mapped venue reference",
      sourceName: "OpenStreetMap way 366086441",
      sourceUrl: "https://www.openstreetmap.org/way/366086441",
      retrievedAt: "2026-08-03",
    },
    operations: {
      status: "official-network",
      label: "Official Eklipse Navarra point",
      sourceName: "Government of Navarra / NICDO",
      sourceUrl:
        "https://eklipsenavarra.com/es/puntos-de-observaci%C3%B3n/arguedas",
      reviewedAt: "2026-08-03",
    },
  },
  {
    id: "navarra-bardenas-aguilares",
    name: "Bardenas Reales · Aguilares",
    shortName: "Bardenas Aguilares",
    municipality: "Arguedas",
    region: "Navarra",
    latitude: 42.1796923,
    longitude: -1.5335418,
    kind: "official-site",
    category: "official-observation",
    defaultVisible: true,
    atmosphereReference: false,
    description:
      "The official Aguilares observation point, represented by the independently mapped Bardenas Reales visitor centre beside the programme area.",
    limitations: [
      "The marker is the OpenStreetMap visitor-centre feature, not the organizer's enclosure boundary.",
      "Bardenas access restrictions, admission and traffic controls must be checked on the official pages.",
    ],
    coordinate: {
      kind: "mapped",
      label: "Mapped venue reference",
      sourceName: "OpenStreetMap node 4772327122",
      sourceUrl: "https://www.openstreetmap.org/node/4772327122",
      retrievedAt: "2026-08-03",
    },
    operations: {
      status: "official-network",
      label: "Official Eklipse Navarra point",
      sourceName: "Government of Navarra / NICDO",
      sourceUrl:
        "https://eklipsenavarra.com/es/puntos-de-observaci%C3%B3n/bardenas-reales-aguilares",
      reviewedAt: "2026-08-03",
    },
  },
  {
    id: "navarra-bardenas-el-ferial",
    name: "Bardenas Reales · El Ferial",
    shortName: "Bardenas El Ferial",
    region: "Navarra",
    latitude: candidateReferencePoints.references["el-ferial"].latitude,
    longitude: candidateReferencePoints.references["el-ferial"].longitude,
    kind: "official-site",
    category: "official-observation",
    defaultVisible: true,
    atmosphereReference: false,
    description:
      "The official El Ferial observation point, represented by the independently mapped reservoir feature.",
    limitations: [
      "The marker is the OpenStreetMap reservoir centroid, not the organizer's enclosure or entrance.",
      "Bardenas access restrictions, admission and traffic controls must be checked on the official pages.",
    ],
    coordinate: {
      kind: "mapped",
      label: "Mapped venue reference",
      sourceName: "OpenStreetMap way 22986591",
      sourceUrl: "https://www.openstreetmap.org/way/22986591",
      retrievedAt: "2026-08-03",
    },
    operations: {
      status: "official-network",
      label: "Official Eklipse Navarra point",
      sourceName: "Government of Navarra / NICDO",
      sourceUrl:
        "https://eklipsenavarra.com/es/puntos-de-observaci%C3%B3n/bardenas-reales-el-ferial",
      reviewedAt: "2026-08-03",
    },
  },
  {
    id: "navarra-sendaviva",
    name: "Sendaviva",
    shortName: "Sendaviva",
    municipality: "Arguedas",
    region: "Navarra",
    latitude: 42.1926551,
    longitude: -1.5732573,
    kind: "official-site",
    category: "official-observation",
    defaultVisible: true,
    atmosphereReference: false,
    description:
      "The official Sendaviva observation programme, represented by the independently mapped park feature.",
    limitations: [
      "The marker is the OpenStreetMap park centroid, not a gate or observation-enclosure coordinate.",
      "Admission, capacity, traffic controls and access remain live operational information.",
    ],
    coordinate: {
      kind: "mapped",
      label: "Mapped venue reference",
      sourceName: "OpenStreetMap way 130702199",
      sourceUrl: "https://www.openstreetmap.org/way/130702199",
      retrievedAt: "2026-08-03",
    },
    operations: {
      status: "official-network",
      label: "Official Eklipse Navarra point",
      sourceName: "Government of Navarra / NICDO",
      sourceUrl:
        "https://eklipsenavarra.com/es/puntos-de-observaci%C3%B3n/sendaviva",
      reviewedAt: "2026-08-03",
    },
  },
  {
    id: "aragon-javalambre",
    name: "Aramón Javalambre",
    shortName: "Javalambre",
    municipality: "Camarena de la Sierra",
    region: "Teruel · Aragón",
    latitude: 40.1156677,
    longitude: -1.017161,
    kind: "official-site",
    category: "official-observation",
    defaultVisible: true,
    atmosphereReference: false,
    description:
      "A Government of Aragón official observation point, represented by the mapped Javalambre station parking feature.",
    limitations: [
      "The marker is an OpenStreetMap parking centroid within the named station, not an enclosure boundary.",
      "Reservation, access and traffic instructions remain live operational information.",
    ],
    coordinate: {
      kind: "mapped",
      label: "Mapped venue reference",
      sourceName: "OpenStreetMap way 430718354",
      sourceUrl: "https://www.openstreetmap.org/way/430718354",
      retrievedAt: "2026-08-03",
    },
    operations: {
      status: "official-network",
      label: "Official Aragón observation point",
      sourceName: "Government of Aragón",
      sourceUrl:
        "https://www.turismodearagon.com/ficha/punto-de-observacion-del-eclipse-javalambre/",
      reviewedAt: "2026-08-03",
    },
  },
  {
    id: "aragon-calamocha",
    name: "Calamocha official observation point",
    shortName: "Calamocha",
    municipality: "Calamocha",
    region: "Teruel · Aragón",
    latitude: 40.9198824,
    longitude: -1.299434,
    kind: "official-site",
    category: "official-observation",
    defaultVisible: true,
    atmosphereReference: false,
    description:
      "A Government of Aragón official observation programme, shown at an OpenStreetMap municipality reference until an independent venue feature is resolved.",
    limitations: [
      "The marker is the OpenStreetMap municipality coordinate, not the official enclosure.",
      "Use the official page for the current observation and parking location.",
    ],
    coordinate: {
      kind: "approximate",
      label: "Approximate municipality coordinate",
      sourceName: "OpenStreetMap relation 341405",
      sourceUrl: "https://www.openstreetmap.org/relation/341405",
      retrievedAt: "2026-08-03",
    },
    operations: {
      status: "official-network",
      label: "Official Aragón observation point",
      sourceName: "Government of Aragón",
      sourceUrl:
        "https://www.turismodearagon.com/ficha/punto-de-observacion-del-eclipse-calamocha/",
      reviewedAt: "2026-08-03",
    },
  },
  {
    id: "aragon-epila",
    name: "Épila official observation point",
    shortName: "Épila",
    municipality: "Épila",
    region: "Zaragoza · Aragón",
    latitude: 41.5984995,
    longitude: -1.2796166,
    kind: "official-site",
    category: "official-observation",
    defaultVisible: true,
    atmosphereReference: false,
    description:
      "A Government of Aragón official observation programme, shown at an OpenStreetMap municipality reference until an independent venue feature is resolved.",
    limitations: [
      "The marker is the OpenStreetMap municipality coordinate, not the official enclosure.",
      "Use the official page for the current observation and parking location.",
    ],
    coordinate: {
      kind: "approximate",
      label: "Approximate municipality coordinate",
      sourceName: "OpenStreetMap relation 344217",
      sourceUrl: "https://www.openstreetmap.org/relation/344217",
      retrievedAt: "2026-08-03",
    },
    operations: {
      status: "official-network",
      label: "Official Aragón observation point",
      sourceName: "Government of Aragón",
      sourceUrl:
        "https://www.turismodearagon.com/ficha/punto-de-observacion-del-eclipse-epila/",
      reviewedAt: "2026-08-03",
    },
  },
  {
    id: "aragon-motorland",
    name: "MotorLand Aragón",
    shortName: "MotorLand",
    municipality: "Alcañiz",
    region: "Teruel · Aragón",
    latitude: 41.0778164,
    longitude: -0.1949688,
    kind: "official-site",
    category: "official-observation",
    defaultVisible: true,
    atmosphereReference: false,
    description:
      "A Government of Aragón official observation point, represented by the independently mapped MotorLand complex.",
    limitations: [
      "The marker is the OpenStreetMap complex centroid, not an observation-enclosure coordinate.",
      "Reservation, access and traffic instructions remain live operational information.",
    ],
    coordinate: {
      kind: "mapped",
      label: "Mapped venue reference",
      sourceName: "OpenStreetMap relation 2609655",
      sourceUrl: "https://www.openstreetmap.org/relation/2609655",
      retrievedAt: "2026-08-03",
    },
    operations: {
      status: "official-network",
      label: "Official Aragón observation point",
      sourceName: "Government of Aragón",
      sourceUrl:
        "https://www.turismodearagon.com/ficha/punto-de-observacion-del-eclipse-alcaniz-motorland/",
      reviewedAt: "2026-08-03",
    },
  },
];

type NationalPlanningPoint = (typeof nationalPlanningPoints.points)[number];

function nationalCategory(value: string): CandidateCategory {
  switch (value) {
    case "totality-city":
    case "candidate-viewpoint":
    case "partial-context":
      return value;
    default:
      throw new RangeError(`Unsupported national point category: ${value}`);
  }
}

function nationalCandidate(point: NationalPlanningPoint): CandidateLocation {
  const category = nationalCategory(point.category);
  const isViewpoint = category === "candidate-viewpoint";
  const isTotalityCity = category === "totality-city";
  const sourceName =
    point.source === "openstreetmap"
      ? `OpenStreetMap feature ${point.sourceFeatureId}`
      : `GeoNames feature ${point.sourceFeatureId}`;

  return {
    id: point.id,
    name: point.name,
    shortName: point.shortName,
    ...(!isViewpoint ? { municipality: point.name } : {}),
    region: point.region,
    latitude: point.latitude,
    longitude: point.longitude,
    kind: isViewpoint ? "landscape-reference" : "administrative-centre",
    category,
    defaultVisible: true,
    atmosphereReference: true,
    description: isViewpoint
      ? "A mapped viewpoint with west-facing direction metadata, included as a place to investigate rather than a viewing recommendation."
      : isTotalityCity
        ? "A city anchor identified by IGN/OAN as crossed by totality."
        : "A city anchor included to show the partial eclipse beyond the path of totality.",
    limitations: isViewpoint
      ? [
          "The mapped viewpoint has not been field-checked for the eclipse.",
          "Access, capacity, nearby obstacles and event operations remain unverified.",
        ]
      : [
          "The marker is a city centre, not an observation venue.",
          "Local horizon, access and event operations depend on the exact viewing position.",
        ],
    coordinate: {
      kind: isViewpoint ? "mapped" : "reference",
      label: isViewpoint ? "Mapped viewpoint" : "City reference coordinate",
      sourceName,
      sourceUrl: point.sourceUrl,
      retrievedAt: nationalPlanningPoints.snapshot.createdAt,
    },
    operations: {
      status: "unverified",
      label: "No eclipse operations verified",
    },
  };
}

type OfficialObservationPoint =
  (typeof officialObservationPoints.points)[number];

function officialObservationCandidate(
  point: OfficialObservationPoint,
): CandidateLocation {
  return {
    id: point.id,
    name: point.name,
    shortName: point.shortName,
    municipality: point.municipality,
    region: point.region,
    latitude: point.latitude,
    longitude: point.longitude,
    kind: "official-site",
    category: "official-observation",
    defaultVisible: true,
    atmosphereReference: false,
    description:
      "A recommended observation location published by the Junta de Castilla y León.",
    limitations: [
      "The published coordinate is retained as supplied; it is not silently converted into a surveyed enclosure boundary.",
      "Current access, capacity, traffic and event operations must be checked on the official page.",
    ],
    coordinate: {
      kind: "published",
      label: "Published official coordinate",
      sourceName: `Junta de Castilla y León spreadsheet · ${point.sourceFeatureId}`,
      sourceUrl: point.sourceUrl,
      retrievedAt: officialObservationPoints.snapshot.createdAt,
    },
    operations: {
      status: "official-recommended",
      label: "Official recommended observation point",
      sourceName: "Junta de Castilla y León",
      sourceUrl: point.operationsUrl,
      reviewedAt: officialObservationPoints.snapshot.createdAt,
    },
  };
}

type PublicPlaceCatalogPoint = (typeof publicPlaceCatalog.points)[number];

function publicPlaceCategory(value: string): CandidateCategory {
  switch (value) {
    case "city-reference":
    case "candidate-viewpoint":
    case "astronomy-site":
      return value;
    default:
      throw new RangeError(`Unsupported public place category: ${value}`);
  }
}

function publicPlaceCatalogCandidate(
  point: PublicPlaceCatalogPoint,
): CandidateLocation {
  const category = publicPlaceCategory(point.category);
  const isCity = category === "city-reference";
  const isViewpoint = category === "candidate-viewpoint";
  return {
    id: point.id,
    name: point.name,
    shortName: point.shortName,
    ...(isCity ? { municipality: point.name } : {}),
    region: point.region,
    latitude: point.latitude,
    longitude: point.longitude,
    kind: isCity
      ? "administrative-centre"
      : isViewpoint
        ? "landscape-reference"
        : "astronomy-reference",
    category,
    defaultVisible: false,
    mapVisibleByDefault: true,
    atmosphereReference: false,
    description: isCity
      ? "A populated-place reference included for geographic discovery across the three supported eclipses."
      : isViewpoint
        ? "A named mapped viewpoint included as a place to investigate, not as an eclipse recommendation."
        : "A named astronomical observatory or planetarium included as a geographic reference.",
    limitations: isCity
      ? [
          "The marker is a populated-place coordinate, not an observation venue.",
          "Eclipse geometry, terrain, access and operations depend on the exact selected position.",
        ]
      : isViewpoint
        ? [
            "The mapped viewpoint has not been field-checked for any supported eclipse.",
            "Orientation, terrain clearance, access, capacity and operations remain unverified.",
          ]
        : [
            "An astronomy facility is not necessarily open to the public or suitable for solar observation.",
            "Opening, access, capacity, local obstacles and event operations remain unverified.",
          ],
    coordinate: {
      kind: point.source === "geonames" ? "reference" : "mapped",
      label: point.source === "geonames" ? "City reference coordinate" : "Mapped feature",
      sourceName:
        point.source === "geonames"
          ? `GeoNames feature ${point.sourceFeatureId}`
          : `OpenStreetMap feature ${point.sourceFeatureId}`,
      sourceUrl: point.sourceUrl,
      retrievedAt:
        point.source === "geonames"
          ? "2026-08-02"
          : publicPlaceCatalog.generatedAt,
    },
    operations: {
      status: "unverified",
      label: "No eclipse operations verified",
    },
  };
}

const retainedSourceUrls = new Set<string>(
  nationalPlanningPoints.points.map(({ sourceUrl }) => sourceUrl),
);
const expandedPublicPlaceCandidates = publicPlaceCatalog.points
  .filter(({ sourceUrl }) => !retainedSourceUrls.has(sourceUrl))
  .map(publicPlaceCatalogCandidate);

export const candidates: CandidateLocation[] = [
  ...nationalPlanningPoints.points.map(nationalCandidate),
  ...officialObservationPoints.points.map(officialObservationCandidate),
  ...officialNetworkCandidates,
  ...expandedPublicPlaceCandidates,
  ...localCandidates,
];

export function createUserCandidate(
  id: string,
  latitude: number,
  longitude: number,
): CandidateLocation {
  return {
    id,
    name: `Custom point ${formatCustomCoordinate(latitude)}, ${formatCustomCoordinate(longitude)}`,
    shortName: "Custom point",
    region: "User-selected coordinate",
    latitude,
    longitude,
    kind: "user-selected",
    category: "custom",
    defaultVisible: true,
    atmosphereReference: false,
    description:
      "A coordinate selected in Eclipse Atlas. Only eclipse geometry and the IGN/CNIG terrain model are evaluated.",
    limitations: [
      "This is not an official viewing site.",
      "Land ownership, access, parking, safety, vegetation and buildings have not been verified.",
    ],
    coordinate: {
      kind: "user-selected",
      label: "User-selected coordinate",
      sourceName: "Eclipse Atlas",
      retrievedAt: new Date().toISOString(),
    },
    operations: {
      status: "unverified",
      label: "No operational information verified",
    },
  };
}
