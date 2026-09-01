import type { EclipseAnimationSample } from "../../domain/eclipse";
import type {
  TerrainHorizon,
  TerrainProfilePoint,
} from "../../domain/terrain-horizon";

export function signedAzimuthDifference(azimuth: number, origin: number) {
  return ((azimuth - origin + 540) % 360) - 180;
}

export function mergeAnimationTerrainProfile(horizon: TerrainHorizon) {
  const points = new Map<string, TerrainProfilePoint>();
  [...horizon.profile, ...horizon.solarDiscProfile].forEach((point) => {
    const key = point.azimuthDegrees.toFixed(9);
    const current = points.get(key);
    if (!current || point.horizonAltitudeDegrees > current.horizonAltitudeDegrees) {
      points.set(key, point);
    }
  });
  return [...points.values()];
}

export function terrainAltitudeAtAzimuth(
  profile: TerrainProfilePoint[],
  azimuthDegrees: number,
) {
  return createTerrainAltitudeLookup(profile)(azimuthDegrees);
}

export function createTerrainAltitudeLookup(profile: TerrainProfilePoint[]) {
  if (profile.length === 0) return () => null;
  const origin = profile[Math.floor(profile.length / 2)].azimuthDegrees;
  const points = profile
    .map((point) => ({
      x: signedAzimuthDifference(point.azimuthDegrees, origin),
      y: point.horizonAltitudeDegrees,
    }))
    .sort((left, right) => left.x - right.x);
  return (azimuthDegrees: number) => {
    const target = signedAzimuthDifference(azimuthDegrees, origin);
    if (target < points[0].x || target > points.at(-1)!.x) return null;

    const upperIndex = points.findIndex((point) => point.x >= target);
    if (upperIndex <= 0) return points[0].y;
    const lower = points[upperIndex - 1];
    const upper = points[upperIndex];
    const fraction = (target - lower.x) / (upper.x - lower.x || 1);
    return lower.y + (upper.y - lower.y) * fraction;
  };
}

export function lowerSolarEdgeTerrainMargin(
  horizon: TerrainHorizon,
  sample: EclipseAnimationSample,
) {
  const terrainAltitude = terrainAltitudeAtAzimuth(
    mergeAnimationTerrainProfile(horizon),
    sample.sunAzimuthDegrees,
  );
  return terrainAltitude === null
    ? null
    : sample.sunAltitudeDegrees -
        sample.sunAngularRadiusDegrees -
        terrainAltitude;
}
