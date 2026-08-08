export const SCIENTIFIC_INPUT_PATHS: readonly string[];

export const SCIENCE_DEPENDENCY_ROOTS: readonly string[];

export function computeScienceDependencyDigest(
  lock: unknown,
  roots?: readonly string[],
): string;

export function scienceDependencyDigest(): Promise<string>;

export type ScientificVerificationResult = {
  reportIntegrity: "valid";
  recommendationReadiness: {
    status: "ready" | "not-ready";
    permitted: boolean;
    requirements: Record<string, boolean>;
    unmetRequirements: string[];
  };
  metrics: {
    validationPointCount: number;
    astronomyComparisonCount: number;
    maximumContactResidualSeconds: number;
    maximumMaximumResidualSeconds: number;
    maximumTotalityDurationResidualSeconds: number;
    maximumObscurationResidual: number;
    maximumSolarAltitudeResidualDegrees: number;
    maximumSolarAzimuthResidualDegrees: number;
    mdt05ComparisonCount: number;
    maximumMdt05HorizonResidualDegrees: number;
    nearbyHorizonPairCount: number;
    maximumNearbyHorizonDifferentialResidualDegrees: number;
  };
};

export function evaluateScientificReport(
  report: unknown,
): Promise<ScientificVerificationResult>;
