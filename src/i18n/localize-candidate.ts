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
  "burgos-neutral-control": {
    name: "candidate.burgosControl.name",
    description: "candidate.burgosControl.description",
    limitations: ["candidate.burgosControl.limit1", "candidate.burgosControl.limit2"],
    coordinate: "candidate.burgosControl.coordinate",
    operations: "candidate.burgosControl.operations",
  },
  "soria-neutral-control": {
    name: "candidate.soriaTerrain.name",
    description: "candidate.soriaTerrain.description",
    limitations: ["candidate.soriaTerrain.limit1", "candidate.soriaTerrain.limit2"],
    coordinate: "candidate.soriaTerrain.coordinate",
    operations: "candidate.soriaTerrain.operations",
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
    const coordinateKey = candidate.coordinate.kind === "approximate"
      ? "candidate.official.coordinateApproximate"
      : candidate.coordinate.kind === "published"
        ? "candidate.official.coordinatePublished"
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
