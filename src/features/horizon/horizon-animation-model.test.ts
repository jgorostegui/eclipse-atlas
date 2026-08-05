import { describe, expect, it } from "vitest";
import type { EclipseAnimationSample } from "../../domain/eclipse";
import type { TerrainHorizon } from "../../domain/terrain-horizon";
import {
  lowerSolarEdgeTerrainMargin,
  mergeAnimationTerrainProfile,
} from "./horizon-animation-model";

const point = (
  azimuthDegrees: number,
  horizonAltitudeDegrees: number,
) => ({
  azimuthDegrees,
  horizonAltitudeDegrees,
  limitingDistanceKilometres: 10,
});

function horizon(): TerrainHorizon {
  return {
    groundElevationMetres: 500,
    viewpointHeightAboveGroundMetres: 1.5,
    observerElevationMetres: 501.5,
    profile: [point(280, 1), point(282, 1), point(284, 1)],
    solarDiscProfile: [point(281.9, 1.1), point(282, 4), point(282.1, 1.2)],
    solarDisc: null,
    solarDiscAssessment: null,
    horizonAtSunDegrees: 1,
    source: "IGN/CNIG TerrainRGB",
    zoom: 11,
    maximumDistanceKilometres: 100,
    refractionCoefficient: 0.13,
    samplesPerRay: 360,
    profileAzimuthStepDegrees: 0.5,
    solarDiscAzimuthStepDegrees: 0.05,
  };
}

describe("horizon animation terrain model", () => {
  it("preserves a narrow crest from the dense solar-disc profile", () => {
    const merged = mergeAnimationTerrainProfile(horizon());
    expect(
      merged.find((sample) => sample.azimuthDegrees === 282)
        ?.horizonAltitudeDegrees,
    ).toBe(4);
  });

  it("reports the lower solar edge against terrain at the current azimuth", () => {
    const sample = {
      time: new Date("2026-08-12T18:28:09Z"),
      sunAltitudeDegrees: 8.5,
      sunAzimuthDegrees: 282,
      sunAngularRadiusDegrees: 0.25,
      moonAltitudeDegrees: 8.5,
      moonAzimuthDegrees: 282,
      moonAngularRadiusDegrees: 0.27,
    } satisfies EclipseAnimationSample;
    expect(lowerSolarEdgeTerrainMargin(horizon(), sample)).toBe(4.25);
  });
});
