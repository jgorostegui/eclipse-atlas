import type { EclipseAnimationSample } from "../../domain/eclipse";
import type { TerrainHorizon } from "../../domain/terrain-horizon";
import {
  mergeAnimationTerrainProfile,
  signedAzimuthDifference,
} from "./horizon-animation-model";

export type HorizonSceneTerrainPoint = {
  relativeAzimuthDegrees: number;
  altitudeDegrees: number;
  limitingDistanceKilometres: number;
};

export type HorizonSceneModel = {
  centreAzimuthDegrees: number;
  minimumRelativeAzimuthDegrees: number;
  maximumRelativeAzimuthDegrees: number;
  minimumAltitudeDegrees: number;
  maximumAltitudeDegrees: number;
  terrain: HorizonSceneTerrainPoint[];
};

export function horizonTerrainSignature(model: HorizonSceneModel) {
  let hash = 2166136261;
  const encoded = model.terrain
    .map((point) =>
      [
        point.relativeAzimuthDegrees.toFixed(6),
        point.altitudeDegrees.toFixed(6),
        point.limitingDistanceKilometres.toFixed(6),
      ].join(":"),
    )
    .join("|");
  for (let index = 0; index < encoded.length; index += 1) {
    hash ^= encoded.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export type OrthographicViewBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function interpolateTerrainPoint(
  points: HorizonSceneTerrainPoint[],
  targetAzimuthDegrees: number,
) {
  const upperIndex = points.findIndex(
    (point) => point.relativeAzimuthDegrees >= targetAzimuthDegrees,
  );
  if (upperIndex === -1) return points.at(-1)!;
  if (upperIndex === 0) return points[0];
  const lower = points[upperIndex - 1];
  const upper = points[upperIndex];
  const fraction =
    (targetAzimuthDegrees - lower.relativeAzimuthDegrees) /
    (upper.relativeAzimuthDegrees - lower.relativeAzimuthDegrees || 1);
  return {
    relativeAzimuthDegrees: targetAzimuthDegrees,
    altitudeDegrees:
      lower.altitudeDegrees +
      (upper.altitudeDegrees - lower.altitudeDegrees) * fraction,
    limitingDistanceKilometres:
      lower.limitingDistanceKilometres +
      (upper.limitingDistanceKilometres - lower.limitingDistanceKilometres) *
        fraction,
  };
}

export function createHorizonSceneModel(
  track: EclipseAnimationSample[],
  horizon: TerrainHorizon,
): HorizonSceneModel {
  if (track.length < 2) {
    throw new RangeError("A horizon scene requires at least two eclipse samples.");
  }
  const merged = mergeAnimationTerrainProfile(horizon);
  if (merged.length < 2) {
    throw new RangeError("A horizon scene requires at least two terrain points.");
  }
  const centreAzimuthDegrees =
    horizon.solarDisc?.centreAzimuthDegrees ??
    track[Math.floor(track.length / 2)].sunAzimuthDegrees;
  const allTerrain = merged
    .map((point) => ({
      relativeAzimuthDegrees: signedAzimuthDifference(
        point.azimuthDegrees,
        centreAzimuthDegrees,
      ),
      altitudeDegrees: point.horizonAltitudeDegrees,
      limitingDistanceKilometres: point.limitingDistanceKilometres,
    }))
    .sort(
      (left, right) =>
        left.relativeAzimuthDegrees - right.relativeAzimuthDegrees,
    );
  // Keep the complete calculated sweep. The former ±8° crop was only wide
  // enough for the C2–C3 view. With a C1–C4 vertical range, preserving equal
  // angular scale widened the viewport after the terrain had already been
  // discarded, leaving an isolated block with artificial vertical sides.
  const minimumRelativeAzimuthDegrees = allTerrain[0].relativeAzimuthDegrees;
  const maximumRelativeAzimuthDegrees =
    allTerrain.at(-1)!.relativeAzimuthDegrees;
  const terrain = [
    interpolateTerrainPoint(allTerrain, minimumRelativeAzimuthDegrees),
    ...allTerrain.filter(
      (point) =>
        point.relativeAzimuthDegrees > minimumRelativeAzimuthDegrees &&
        point.relativeAzimuthDegrees < maximumRelativeAzimuthDegrees,
    ),
    interpolateTerrainPoint(allTerrain, maximumRelativeAzimuthDegrees),
  ];
  const altitudes = [
    ...terrain.map((point) => point.altitudeDegrees),
    ...track.flatMap((sample) => [
      sample.sunAltitudeDegrees - sample.sunAngularRadiusDegrees,
      sample.sunAltitudeDegrees + sample.sunAngularRadiusDegrees,
      sample.moonAltitudeDegrees - sample.moonAngularRadiusDegrees,
      sample.moonAltitudeDegrees + sample.moonAngularRadiusDegrees,
    ]),
  ];
  return {
    centreAzimuthDegrees,
    minimumRelativeAzimuthDegrees,
    maximumRelativeAzimuthDegrees,
    minimumAltitudeDegrees: Math.min(-0.5, ...altitudes) - 0.5,
    maximumAltitudeDegrees: Math.max(...altitudes) + 0.8,
    terrain,
  };
}

export function orthographicViewBounds(
  model: HorizonSceneModel,
  aspectRatio: number,
  paddingDegrees = 0.5,
): OrthographicViewBounds {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new RangeError("Scene aspect ratio must be positive and finite.");
  }
  if (!Number.isFinite(paddingDegrees) || paddingDegrees < 0) {
    throw new RangeError("Scene padding must be non-negative and finite.");
  }
  const centreX =
    (model.minimumRelativeAzimuthDegrees +
      model.maximumRelativeAzimuthDegrees) /
    2;
  const centreY =
    (model.minimumAltitudeDegrees + model.maximumAltitudeDegrees) / 2;
  let width =
    model.maximumRelativeAzimuthDegrees -
    model.minimumRelativeAzimuthDegrees +
    paddingDegrees * 2;
  let height =
    model.maximumAltitudeDegrees -
    model.minimumAltitudeDegrees +
    paddingDegrees * 2;
  if (width / height > aspectRatio) {
    height = width / aspectRatio;
  } else {
    width = height * aspectRatio;
  }
  return {
    left: centreX - width / 2,
    right: centreX + width / 2,
    top: centreY + height / 2,
    bottom: centreY - height / 2,
  };
}

export function horizonChartViewBounds(
  model: HorizonSceneModel,
  horizontalPaddingDegrees = 0.45,
  verticalPaddingDegrees = 0.45,
): OrthographicViewBounds {
  if (
    !Number.isFinite(horizontalPaddingDegrees) ||
    horizontalPaddingDegrees < 0 ||
    !Number.isFinite(verticalPaddingDegrees) ||
    verticalPaddingDegrees < 0
  ) {
    throw new RangeError("Scene padding must be non-negative and finite.");
  }
  return {
    left: model.minimumRelativeAzimuthDegrees - horizontalPaddingDegrees,
    right: model.maximumRelativeAzimuthDegrees + horizontalPaddingDegrees,
    top: model.maximumAltitudeDegrees + verticalPaddingDegrees,
    bottom: model.minimumAltitudeDegrees - verticalPaddingDegrees,
  };
}

export function fitHorizonBoundsToAspect(
  bounds: OrthographicViewBounds,
  aspectRatio: number,
): OrthographicViewBounds {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new RangeError("Scene aspect ratio must be positive and finite.");
  }
  const centreX = (bounds.left + bounds.right) / 2;
  const centreY = (bounds.top + bounds.bottom) / 2;
  let width = bounds.right - bounds.left;
  let height = bounds.top - bounds.bottom;
  if (width / height > aspectRatio) {
    height = width / aspectRatio;
  } else {
    width = height * aspectRatio;
  }
  return {
    left: centreX - width / 2,
    right: centreX + width / 2,
    top: centreY + height / 2,
    bottom: centreY - height / 2,
  };
}
