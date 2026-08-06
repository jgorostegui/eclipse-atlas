import {
  formatCustomCoordinate,
  type CandidateLocation,
} from "../data/candidates";
import type { MessageKey, MessageValues } from "./messages";

type Translate = (key: MessageKey, values?: MessageValues) => string;

const candidateKeys = {
  soria: {
    name: "candidate.soria.name",
    description: "candidate.soria.description",
    limitations: ["candidate.soria.limit1", "candidate.soria.limit2"],
    coordinate: "candidate.soria.coordinate",
    operations: "candidate.soria.operations",
  },
  arguedas: {
    name: "candidate.arguedas.name",
    description: "candidate.arguedas.description",
    limitations: ["candidate.arguedas.limit1", "candidate.arguedas.limit2"],
    coordinate: "candidate.arguedas.coordinate",
    operations: "candidate.arguedas.operations",
  },
  "el-ferial": {
    name: "candidate.ferial.name",
    description: "candidate.ferial.description",
    limitations: ["candidate.ferial.limit1", "candidate.ferial.limit2"],
    coordinate: "candidate.ferial.coordinate",
    operations: "candidate.ferial.operations",
  },
  "medina-de-pomar": {
    name: "candidate.medina.name",
    description: "candidate.medina.description",
    limitations: ["candidate.medina.limit1", "candidate.medina.limit2"],
    coordinate: "candidate.medina.coordinate",
    operations: "candidate.medina.operations",
  },
  "alto-de-rosales": {
    name: "candidate.rosales.name",
    description: "candidate.rosales.description",
    limitations: ["candidate.rosales.limit1", "candidate.rosales.limit2"],
    coordinate: "candidate.rosales.coordinate",
    operations: "candidate.rosales.operations",
  },
} as const satisfies Record<
  string,
  {
    name: MessageKey;
    description: MessageKey;
    limitations: readonly [MessageKey, MessageKey];
    coordinate: MessageKey;
    operations: MessageKey;
  }
>;

export function localizeCandidate(
  candidate: CandidateLocation,
  t: Translate,
): CandidateLocation {
  if (candidate.kind === "user-selected") {
    const values = {
      latitude: formatCustomCoordinate(candidate.latitude),
      longitude: formatCustomCoordinate(candidate.longitude),
    };
    return {
      ...candidate,
      name: t("candidate.custom.name", values),
      shortName: t("candidate.custom.shortCoordinates", values),
      region: t("candidate.custom.region"),
      description: t("candidate.custom.description"),
      limitations: [
        t("candidate.custom.limit1"),
        t("candidate.custom.limit2"),
      ],
      coordinate: {
        ...candidate.coordinate,
        label: t("candidate.custom.coordinate"),
      },
      operations: {
        ...candidate.operations,
        label: t("candidate.custom.operations"),
      },
    };
  }

  if (candidate.category === "official-observation") {
    const network = candidate.operations.status === "official-network";
    const coordinateKey =
      candidate.coordinate.kind === "approximate"
        ? "candidate.official.coordinateApproximate"
        : candidate.coordinate.kind === "published"
          ? "candidate.official.coordinatePublished"
          : candidate.coordinate.kind === "reference"
            ? "candidate.official.coordinateReference"
            : "candidate.official.coordinateMapped";
    return {
      ...candidate,
      description: t(
        network
          ? "candidate.official.networkDescription"
          : "candidate.official.recommendedDescription",
      ),
      limitations: [
        t("candidate.official.limit1"),
        t("candidate.official.limit2"),
      ],
      coordinate: {
        ...candidate.coordinate,
        label: t(coordinateKey),
      },
      operations: {
        ...candidate.operations,
        label: t(
          network
            ? "candidate.official.networkOperations"
            : "candidate.official.recommendedOperations",
        ),
      },
    };
  }

  const catalogKeys: {
    description: MessageKey;
    limitations: readonly [MessageKey, MessageKey];
    coordinate: MessageKey;
  } | null =
    candidate.category === "city-reference" ||
    candidate.category === "totality-city" ||
    candidate.category === "partial-context"
      ? {
          description: "candidate.catalog.cityDescription",
          limitations: [
            "candidate.catalog.cityLimit1",
            "candidate.catalog.cityLimit2",
          ],
          coordinate: "candidate.catalog.cityCoordinate",
        }
      : candidate.category === "candidate-viewpoint"
        ? {
            description: "candidate.catalog.viewpointDescription",
            limitations: [
              "candidate.catalog.viewpointLimit1",
              "candidate.catalog.viewpointLimit2",
            ],
            coordinate: "candidate.catalog.mappedCoordinate",
          }
        : candidate.category === "astronomy-site"
          ? {
              description: "candidate.catalog.astronomyDescription",
              limitations: [
                "candidate.catalog.astronomyLimit1",
                "candidate.catalog.astronomyLimit2",
              ],
              coordinate: "candidate.catalog.mappedCoordinate",
            }
          : null;
  if (catalogKeys) {
    return {
      ...candidate,
      region:
        candidate.region === "Spain"
          ? t("candidate.catalog.spainRegion")
          : candidate.region,
      description: t(catalogKeys.description),
      limitations: catalogKeys.limitations.map((key) => t(key)),
      coordinate: {
        ...candidate.coordinate,
        label: t(catalogKeys.coordinate),
      },
      operations: {
        ...candidate.operations,
        label: t("candidate.catalog.operations"),
      },
    };
  }

  const keys = candidateKeys[candidate.id as keyof typeof candidateKeys];
  if (!keys) return candidate;
  return {
    ...candidate,
    name: t(keys.name),
    description: t(keys.description),
    limitations: keys.limitations.map((key) => t(key)),
    coordinate: { ...candidate.coordinate, label: t(keys.coordinate) },
    operations: { ...candidate.operations, label: t(keys.operations) },
  };
}
