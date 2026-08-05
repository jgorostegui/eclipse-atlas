import { describe, expect, it } from "vitest";
import type { EclipseAnimationSample } from "../../domain/eclipse";
import type { TerrainHorizon } from "../../domain/terrain-horizon";
import {
  createHorizonSceneModel,
  fitHorizonBoundsToAspect,
  horizonTerrainSignature,
  horizonChartViewBounds,
  orthographicViewBounds,
} from "./horizon-scene-model";

const sample = (azimuth: number, altitude: number): EclipseAnimationSample => ({
  time: new Date("2026-08-12T18:30:00Z"),
  sunAltitudeDegrees: altitude,
  sunAzimuthDegrees: azimuth,
  sunAngularRadiusDegrees: 0.266,
  moonAltitudeDegrees: altitude + 0.1,
  moonAzimuthDegrees: azimuth + 0.1,
  moonAngularRadiusDegrees: 0.28,
});

const horizon = {
  profile: [
    { azimuthDegrees: 350, horizonAltitudeDegrees: 1, limitingDistanceKilometres: 2 },
    { azimuthDegrees: 0, horizonAltitudeDegrees: 3, limitingDistanceKilometres: 20 },
    { azimuthDegrees: 10, horizonAltitudeDegrees: 1, limitingDistanceKilometres: 5 },
  ],
  solarDiscProfile: [
    { azimuthDegrees: 0.05, horizonAltitudeDegrees: 4, limitingDistanceKilometres: 8 },
  ],
} as TerrainHorizon;

describe("angular horizon scene model", () => {
  it("keeps the dense crest and handles the 0/360-degree crossing", () => {
    const model = createHorizonSceneModel(
      [sample(355, 8), sample(5, 6)],
      horizon,
    );
    expect(model.terrain.map((point) => point.altitudeDegrees)).toContain(4);
    const denseCrest = model.terrain.find(
      (point) => point.limitingDistanceKilometres === 8,
    );
    expect(denseCrest?.altitudeDegrees).toBe(4);
    expect(denseCrest?.relativeAzimuthDegrees).toBeCloseTo(-4.95, 10);
    expect(model.minimumRelativeAzimuthDegrees).toBeCloseTo(-15, 10);
    expect(model.maximumRelativeAzimuthDegrees).toBeCloseTo(5, 10);
    expect(horizonTerrainSignature(model)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("changes its terrain signature when either height or limiting distance changes", () => {
    const original = createHorizonSceneModel(
      [sample(355, 8), sample(5, 6)],
      horizon,
    );
    const changedHeight = createHorizonSceneModel(
      [sample(355, 8), sample(5, 6)],
      {
        ...horizon,
        profile: horizon.profile.map((point, index) =>
          index === 1
            ? { ...point, horizonAltitudeDegrees: point.horizonAltitudeDegrees + 0.1 }
            : point,
        ),
      },
    );
    const changedDistance = createHorizonSceneModel(
      [sample(355, 8), sample(5, 6)],
      {
        ...horizon,
        profile: horizon.profile.map((point, index) =>
          index === 1
            ? { ...point, limitingDistanceKilometres: point.limitingDistanceKilometres + 1 }
            : point,
        ),
      },
    );

    expect(horizonTerrainSignature(changedHeight)).not.toBe(
      horizonTerrainSignature(original),
    );
    expect(horizonTerrainSignature(changedDistance)).not.toBe(
      horizonTerrainSignature(original),
    );
  });

  it("fits a fixed angular orthographic view without inventing perspective depth", () => {
    const model = createHorizonSceneModel(
      [sample(355, 8), sample(5, 6)],
      horizon,
    );
    const bounds = orthographicViewBounds(model, 1.7);
    expect(bounds.right - bounds.left).toBeCloseTo(
      (bounds.top - bounds.bottom) * 1.7,
      10,
    );
    expect(bounds.left).toBeLessThanOrEqual(
      model.minimumRelativeAzimuthDegrees,
    );
    expect(bounds.right).toBeGreaterThanOrEqual(
      model.maximumRelativeAzimuthDegrees,
    );
  });

  it("keeps the calculated terrain sweep wide across the full C1–C4 altitude range", () => {
    const centreAzimuthDegrees = 282.585;
    const wideHorizon = {
      ...horizon,
      solarDisc: {
        centreAltitudeDegrees: 8.291,
        centreAzimuthDegrees,
        angularRadiusDegrees: 0.266,
      },
      profile: Array.from({ length: 61 }, (_, index) => ({
        azimuthDegrees: centreAzimuthDegrees - 15 + index * 0.5,
        horizonAltitudeDegrees: 5 + Math.sin(index / 7) * 0.8,
        limitingDistanceKilometres: 8,
      })),
      solarDiscProfile: [],
    } as TerrainHorizon;
    const model = createHorizonSceneModel(
      [sample(273.495, 18.461), sample(282.585, 8.291), sample(291.255, -0.444)],
      wideHorizon,
    );
    const bounds = horizonChartViewBounds(model, 0.45, 0.45);
    const terrainWidthFraction =
      (model.maximumRelativeAzimuthDegrees -
        model.minimumRelativeAzimuthDegrees) /
      (bounds.right - bounds.left);

    expect(terrainWidthFraction).toBeGreaterThan(0.85);
    expect(model.minimumRelativeAzimuthDegrees).toBeCloseTo(-15, 10);
    expect(model.maximumRelativeAzimuthDegrees).toBeCloseTo(15, 10);
  });

  it("rejects invalid independent chart padding", () => {
    const model = createHorizonSceneModel(
      [sample(355, 8), sample(5, 6)],
      horizon,
    );
    expect(() => horizonChartViewBounds(model, -1)).toThrow(RangeError);
    expect(() => horizonChartViewBounds(model, 0.45, Number.NaN)).toThrow(
      RangeError,
    );
  });

  it("expands the angular field without distorting it in a tall viewport", () => {
    const model = createHorizonSceneModel(
      [sample(355, 8), sample(5, 6)],
      horizon,
    );
    const original = horizonChartViewBounds(model);
    const fitted = fitHorizonBoundsToAspect(original, 0.7);

    expect(fitted.right - fitted.left).toBeCloseTo(
      (fitted.top - fitted.bottom) * 0.7,
      10,
    );
    expect(fitted.left).toBeCloseTo(original.left, 10);
    expect(fitted.right).toBeCloseTo(original.right, 10);
    expect(fitted.top).toBeGreaterThan(original.top);
    expect(fitted.bottom).toBeLessThan(original.bottom);
  });
});
