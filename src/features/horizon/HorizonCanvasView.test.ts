import { describe, expect, it } from "vitest";
import type { EclipseAnimationSample } from "../../domain/eclipse";
import type { TerrainHorizon } from "../../domain/terrain-horizon";
import { createHorizonCanvasScene } from "./horizon-canvas-renderer";

const sample = (
  azimuth: number,
  moonAzimuth = azimuth,
): EclipseAnimationSample => ({
  time: new Date("2027-08-02T10:00:00Z"),
  sunAltitudeDegrees: 46,
  sunAzimuthDegrees: azimuth,
  sunAngularRadiusDegrees: 0.266,
  moonAltitudeDegrees: 46,
  moonAzimuthDegrees: moonAzimuth,
  moonAngularRadiusDegrees: 0.273,
});

const horizon = {
  profile: [
    { azimuthDegrees: 165, horizonAltitudeDegrees: 0, limitingDistanceKilometres: 2 },
    { azimuthDegrees: 180, horizonAltitudeDegrees: 0, limitingDistanceKilometres: 2 },
    { azimuthDegrees: 195, horizonAltitudeDegrees: 0, limitingDistanceKilometres: 2 },
  ],
  solarDiscProfile: [],
  solarDisc: {
    centreAltitudeDegrees: 46,
    centreAzimuthDegrees: 180,
    angularRadiusDegrees: 0.266,
  },
  solarDiscAssessment: null,
} as unknown as TerrainHorizon;

describe("Canvas horizon projection", () => {
  it("preserves spherical solar-disc width at high altitude", () => {
    const current = sample(180);
    const scene = createHorizonCanvasScene({
      track: [sample(175), current, sample(185)],
      sample: current,
      horizon,
      width: 960,
      height: 540,
      isMaximum: true,
    });

    expect(scene.sun.radiusX / scene.sun.radiusY).toBeGreaterThan(1.4);
    expect(scene.displaySun.radiusX).toBe(scene.displaySun.radiusY);
    expect(scene.displayMagnification).toBeGreaterThan(1);
    expect(scene.terrain).toHaveLength(3);
    expect(scene.terrain[0].x).toBeCloseTo(0, 10);
    expect(scene.terrain.at(-1)?.x).toBeCloseTo(960, 10);
  });

  it("keeps terrain stable while the lunar disc crosses the Sun", () => {
    const before = createHorizonCanvasScene({
      track: [sample(175), sample(180), sample(185)],
      sample: sample(180, 179.8),
      horizon,
      width: 720,
      height: 450,
      isMaximum: false,
    });
    const after = createHorizonCanvasScene({
      track: [sample(175), sample(180), sample(185)],
      sample: sample(180, 180.2),
      horizon,
      width: 720,
      height: 450,
      isMaximum: false,
    });

    expect(after.terrain).toEqual(before.terrain);
    expect(after.terrainSignature).toBe(before.terrainSignature);
    expect(
      (before.inset.moonX - before.inset.centreX) *
        (after.inset.moonX - after.inset.centreX),
    ).toBeLessThan(0);
  });

  it("fills a tall iPad panel with the complete calculated terrain sweep", () => {
    const current = sample(180);
    const scene = createHorizonCanvasScene({
      track: [sample(175), current, sample(185)],
      sample: current,
      horizon,
      width: 420,
      height: 720,
      isMaximum: true,
    });

    expect(scene.terrain[0].x).toBeCloseTo(0, 10);
    expect(scene.terrain.at(-1)?.x).toBeCloseTo(420, 10);
    expect(scene.terrain.every((point) => Number.isFinite(point.x + point.y)))
      .toBe(true);
  });
});
