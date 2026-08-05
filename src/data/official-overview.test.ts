import { describe, expect, it } from "vitest";
import {
  officialUtcHoursToDate,
  parseOfficialOverviewManifest,
  parseOfficialUmbraArtifact,
} from "./official-overview";

const output = (
  id:
    | "solar-altitude-at-maximum"
    | "maximum-obscuration"
    | "totality-duration",
) => ({
  id,
  file: `${id}.png`,
    unit:
      id === "solar-altitude-at-maximum"
        ? "degrees"
        : id === "totality-duration"
          ? "seconds"
          : "percent",
    legendTicks: [0, 1],
    palette: ["#ffe8c7", "#6f1d3c"],
    width: 10,
  height: 10,
  sha256: "a".repeat(64),
});

const manifest = {
  schemaVersion: 2,
  artifactVersion: "2.0.0",
  source: { requiredAttribution: "IGN/OAN", nativeCellSizeMetres: 1222.99 },
  vectorSource: { requiredAttribution: "IGN/OAN" },
  crop: { leafletBounds: { south: 27, west: -19, north: 45, east: 5 } },
  outputs: [
    output("solar-altitude-at-maximum"),
    output("maximum-obscuration"),
    output("totality-duration"),
  ],
  animation: {
    id: "umbra-passage",
    file: "official-umbra-passage-v1.json",
    frameCount: 277,
    startUtcHours: 18.293,
    endUtcHours: 18.569,
    stepSeconds: 3.6,
    sha256: "b".repeat(64),
  },
  useConstraints: {
    visualizationOnly: true,
    pixelQueryEnabled: false,
    usedForRecommendation: false,
  },
};

describe("official overview manifest", () => {
  it("accepts both physical layers with visualization-only constraints", () => {
    expect(parseOfficialOverviewManifest(manifest).outputs).toHaveLength(3);
  });

  it("rejects a manifest that enables pixel querying", () => {
    expect(() =>
      parseOfficialOverviewManifest({
        ...manifest,
        useConstraints: { ...manifest.useConstraints, pixelQueryEnabled: true },
      }),
    ).toThrow();
  });

  it("requires every umbra frame at the official 3.6-second cadence", () => {
    const artifact = {
      schemaVersion: 1,
      artifactVersion: "2.0.0",
      sourceSha256: "c".repeat(64),
      coordinateReferenceSystem: "EPSG:4326",
      sampling: {
        startUtcHours: 18.293,
        endUtcHours: 18.569,
        stepSeconds: 3.6,
        frameCount: 277,
        geometryInterpolation: "none",
      },
      frames: Array.from({ length: 277 }, (_, index) => ({
        utcHours: Number((18.293 + index * 0.001).toFixed(3)),
        polygons: [[[[index, 40], [index + 1, 40], [index, 41], [index, 40]]]],
      })),
    };
    expect(parseOfficialUmbraArtifact(artifact).frames).toHaveLength(277);
    expect(officialUtcHoursToDate("2026", 18.293).toISOString()).toBe(
      "2026-08-12T18:17:34.800Z",
    );
    artifact.frames[100].utcHours += 0.001;
    expect(() => parseOfficialUmbraArtifact(artifact)).toThrow(/evenly spaced/);
  });

  it("accepts an event-specific annular manifest", () => {
    const eventManifest = {
      ...manifest,
      schemaVersion: 3,
      event: {
        id: "2028",
        date: "2028-01-26",
        centralPhaseKind: "annular",
        centralShadowKind: "antumbra",
      },
      animation: { ...manifest.animation, shadowKind: "antumbra" },
    };

    const parsed = parseOfficialOverviewManifest(eventManifest, "2028");
    expect(parsed.event.centralPhaseKind).toBe("annular");
    expect(parsed.animation.shadowKind).toBe("antumbra");
    expect(officialUtcHoursToDate("2028", 16.5).toISOString()).toBe(
      "2028-01-26T16:30:00.000Z",
    );
  });
});
