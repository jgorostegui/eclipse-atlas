import { z } from "zod";
import {
  eclipseEvent,
  isEclipseEventId,
  type EclipseEventId,
} from "../domain/eclipse-events";

export const officialOverviewLayerIds = [
  "solar-altitude-at-maximum",
  "maximum-obscuration",
  "totality-duration",
] as const;

export const officialOverviewSelectionIds = [
  ...officialOverviewLayerIds,
  "umbra-passage",
] as const;

export type OfficialOverviewLayerId =
  (typeof officialOverviewLayerIds)[number];
export type OfficialOverviewSelection =
  | "none"
  | (typeof officialOverviewSelectionIds)[number];

const outputSchema = z.object({
  id: z.enum(officialOverviewLayerIds),
  file: z.string().endsWith(".png"),
  unit: z.enum(["degrees", "percent", "seconds"]),
  legendTicks: z.array(z.number()).min(2),
  palette: z.array(z.string().regex(/^#[a-f0-9]{6}$/i)).min(2),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const sourceSchema = z.object({
  requiredAttribution: z.string().min(1),
  nativeCellSizeMetres: z.number().positive(),
});

const vectorSourceSchema = z.object({
  requiredAttribution: z.string().min(1),
});

const cropSchema = z.object({
  leafletBounds: z.object({
    south: z.number(),
    west: z.number(),
    north: z.number(),
    east: z.number(),
  }),
});

const animationSchema = z.object({
  id: z.literal("umbra-passage"),
  file: z.string().endsWith(".json"),
  shadowKind: z.enum(["umbra", "antumbra"]).optional(),
  frameCount: z.number().int().positive(),
  startUtcHours: z.number().min(0).max(24),
  endUtcHours: z.number().min(0).max(24),
  stepSeconds: z.number().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const legacyManifestSchema = z.object({
  schemaVersion: z.literal(2),
  artifactVersion: z.string().min(1),
  source: sourceSchema,
  vectorSource: vectorSourceSchema,
  crop: cropSchema,
  outputs: z.array(outputSchema).length(3),
  animation: animationSchema,
  useConstraints: z.object({
    visualizationOnly: z.literal(true),
    pixelQueryEnabled: z.literal(false),
    usedForRecommendation: z.literal(false),
  }),
});

const eventManifestSchema = z.object({
  schemaVersion: z.literal(3),
  artifactVersion: z.string().min(1),
  event: z.object({
    id: z.string().refine(isEclipseEventId),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    centralPhaseKind: z.enum(["total", "annular"]),
    centralShadowKind: z.enum(["umbra", "antumbra"]),
  }),
  source: sourceSchema,
  vectorSource: vectorSourceSchema,
  crop: cropSchema,
  outputs: z.array(outputSchema).length(3),
  animation: animationSchema,
  useConstraints: z.object({
    visualizationOnly: z.literal(true),
    pixelQueryEnabled: z.literal(false),
    usedForRecommendation: z.literal(false),
  }),
});

export type OfficialOverviewManifest = Readonly<{
  artifactVersion: string;
  event: Readonly<{
    id: EclipseEventId;
    date: string;
    centralPhaseKind: "total" | "annular";
    centralShadowKind: "umbra" | "antumbra";
  }>;
  source: z.infer<typeof sourceSchema>;
  vectorSource: z.infer<typeof vectorSourceSchema>;
  crop: z.infer<typeof cropSchema>;
  outputs: z.infer<typeof outputSchema>[];
  animation: z.infer<typeof animationSchema>;
}>;

const positionSchema = z.tuple([z.number(), z.number()]);
const frameSchema = z.object({
  utcHours: z.number(),
  polygons: z.array(z.array(z.array(positionSchema))),
});
const shadowArtifactSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  artifactVersion: z.string().min(1),
  eventId: z.string().refine(isEclipseEventId).optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  shadowKind: z.enum(["umbra", "antumbra"]).optional(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  coordinateReferenceSystem: z.literal("EPSG:4326"),
  sampling: z.object({
    startUtcHours: z.number().min(0).max(24),
    endUtcHours: z.number().min(0).max(24),
    stepSeconds: z.number().positive(),
    frameCount: z.number().int().positive(),
    geometryInterpolation: z.string().min(1),
  }),
  frames: z.array(frameSchema).min(1),
});

export type OfficialUmbraArtifact = Readonly<{
  artifactVersion: string;
  eventId: EclipseEventId;
  eventDate: string;
  shadowKind: "umbra" | "antumbra";
  sourceSha256: string;
  coordinateReferenceSystem: "EPSG:4326";
  sampling: z.infer<typeof shadowArtifactSchema>["sampling"];
  frames: z.infer<typeof frameSchema>[];
}>;
export type OfficialUmbraFrame = OfficialUmbraArtifact["frames"][number];

export function parseOfficialOverviewManifest(
  value: unknown,
  expectedEventId: EclipseEventId = "2026",
): OfficialOverviewManifest {
  const legacy = legacyManifestSchema.safeParse(value);
  if (legacy.success) {
    if (expectedEventId !== "2026") {
      throw new Error("Legacy official overview data only belongs to the 2026 event.");
    }
    return {
      artifactVersion: legacy.data.artifactVersion,
      event: {
        id: "2026",
        date: "2026-08-12",
        centralPhaseKind: "total",
        centralShadowKind: "umbra",
      },
      source: legacy.data.source,
      vectorSource: legacy.data.vectorSource,
      crop: legacy.data.crop,
      outputs: legacy.data.outputs,
      animation: { ...legacy.data.animation, shadowKind: "umbra" },
    };
  }

  const manifest = eventManifestSchema.parse(value);
  if (manifest.event.id !== expectedEventId) {
    throw new Error("Official overview event does not match the selected eclipse.");
  }
  return manifest;
}

export function parseOfficialUmbraArtifact(
  value: unknown,
  expectedEventId: EclipseEventId = "2026",
): OfficialUmbraArtifact {
  const artifact = shadowArtifactSchema.parse(value);
  const event = eclipseEvent(expectedEventId);
  const eventId = artifact.eventId ?? "2026";
  if (eventId !== expectedEventId) {
    throw new Error("Official central-shadow event does not match the selected eclipse.");
  }
  if (artifact.frames.length !== artifact.sampling.frameCount) {
    throw new Error("Official central-shadow frame count does not match its metadata.");
  }
  artifact.frames.forEach((frame, index) => {
    const expectedUtcHours =
      artifact.sampling.startUtcHours +
      index * (artifact.sampling.stepSeconds / 3_600);
    if (Math.abs(frame.utcHours - expectedUtcHours) > 1e-9) {
      throw new Error("Official central-shadow frames are not evenly spaced.");
    }
  });
  return {
    artifactVersion: artifact.artifactVersion,
    eventId,
    eventDate: artifact.eventDate ?? event.date,
    shadowKind: artifact.shadowKind ?? event.centralShadowKind,
    sourceSha256: artifact.sourceSha256,
    coordinateReferenceSystem: artifact.coordinateReferenceSystem,
    sampling: artifact.sampling,
    frames: artifact.frames,
  };
}

export function officialUtcHoursToDate(
  eventId: EclipseEventId,
  utcHours: number,
) {
  if (!Number.isFinite(utcHours) || utcHours < 0 || utcHours >= 24) {
    throw new RangeError("Decimal UTC hours must be inside [0, 24).");
  }
  const event = eclipseEvent(eventId);
  return new Date(
    Date.UTC(event.year, event.monthIndex, event.day) + utcHours * 3_600_000,
  );
}

export function officialOverviewAssetUrl(
  eventId: EclipseEventId,
  file: string,
) {
  const event = eclipseEvent(eventId);
  return `${import.meta.env.BASE_URL}${event.officialOverview.directory}/${file}`;
}

export function officialOverviewSourceUrl(eventId: EclipseEventId) {
  const event = eclipseEvent(eventId);
  return `https://centrodedescargas.cnig.es/CentroDescargas/detalleArchivo?sec=${event.officialOverview.sourceDetailId}`;
}
