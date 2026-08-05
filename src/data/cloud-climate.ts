import { z } from "zod";
import nationalPlanningPoints from "./national-planning-points.json" with {
  type: "json",
};

const coordinateSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

const cloudClimatePointSchema = z.object({
  candidateId: z.string().min(1),
  requestedCoordinate: coordinateSchema,
  era5GridCoordinate: coordinateSchema,
  sampleCount: z.literal(930),
  meanCloudCoverPercent: z.number().finite().min(0).max(100),
  percentile25CloudCoverPercent: z.number().finite().min(0).max(100),
  medianCloudCoverPercent: z.number().finite().min(0).max(100),
  percentile75CloudCoverPercent: z.number().finite().min(0).max(100),
});

const cloudClimateArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  artifactVersion: z.literal("era5-august-evening-v1"),
  generatedAt: z.string().datetime(),
  source: z.object({
    producer: z.literal("Copernicus Climate Change Service / ECMWF"),
    dataset: z.literal("ERA5 hourly data on single levels"),
    doi: z.literal("10.24381/cds.adbb2d47"),
    deliveryService: z.literal("Open-Meteo Historical Weather API"),
    deliveryUrl: z.string().url(),
    modelParameter: z.literal("era5"),
    variable: z.literal("cloud_cover"),
    sourceVariable: z.literal("total_cloud_cover"),
    unit: z.literal("percent"),
  }),
  sampling: z.object({
    period: z.object({ startYear: z.literal(1991), endYear: z.literal(2020) }),
    month: z.literal(8),
    utcHour: z.literal(18),
    samplesPerPoint: z.literal(930),
    referencePointCount: z.literal(41),
    nativeGridDegrees: z.literal(0.25),
    cellSelection: z.literal("nearest"),
    statisticalDownscaling: z.literal(false),
  }),
  generation: z.object({
    tool: z.literal("scripts/generate-cloud-climate.mts"),
    rawInputAggregateSha256: z.string().regex(/^[a-f0-9]{64}$/),
    rawInputCount: z.literal(30),
    parameters: z.string().min(1),
  }),
  points: z.array(cloudClimatePointSchema).length(41),
  limitations: z.array(z.string().min(1)).min(3),
});

export type CloudClimatePoint = z.infer<typeof cloudClimatePointSchema>;
export type CloudClimateArtifact = z.infer<
  typeof cloudClimateArtifactSchema
>;

export function parseCloudClimateArtifact(value: unknown) {
  const artifact = cloudClimateArtifactSchema.parse(value);
  const candidateIds = new Set<string>();
  for (const [index, point] of artifact.points.entries()) {
    if (candidateIds.has(point.candidateId)) {
      throw new TypeError(`Duplicate climate point ${point.candidateId}.`);
    }
    candidateIds.add(point.candidateId);
    const reference = nationalPlanningPoints.points[index];
    if (
      !reference ||
      point.candidateId !== reference.id ||
      point.requestedCoordinate.latitude !== reference.latitude ||
      point.requestedCoordinate.longitude !== reference.longitude
    ) {
      throw new TypeError(`Climate point ${index} does not match its national reference.`);
    }
    if (
      point.percentile25CloudCoverPercent >
        point.medianCloudCoverPercent ||
      point.medianCloudCoverPercent >
        point.percentile75CloudCoverPercent
    ) {
      throw new RangeError(
        `Climate percentiles are out of order for ${point.candidateId}.`,
      );
    }
  }
  return artifact;
}

export function cloudClimateAssetUrl() {
  return `${import.meta.env.BASE_URL}climate/v1/august-cloud-cover-era5-v1.json`;
}
