export const PLANNING_VIEWPOINT_HEIGHT_METRES = 1.5;

const MIN_GROUND_ELEVATION_METRES = -500;
const MAX_GROUND_ELEVATION_METRES = 10_000;
const MAX_VIEWPOINT_HEIGHT_ABOVE_GROUND_METRES = 100;

export type ObserverElevationInput = {
  groundElevationMetres: number;
  viewpointHeightAboveGroundMetres: number;
};

export type ObserverElevation = ObserverElevationInput & {
  observerElevationMetres: number;
};

export function resolveObserverElevation(
  input: ObserverElevationInput,
): ObserverElevation {
  if (
    !Number.isFinite(input.groundElevationMetres) ||
    input.groundElevationMetres < MIN_GROUND_ELEVATION_METRES ||
    input.groundElevationMetres > MAX_GROUND_ELEVATION_METRES
  ) {
    throw new RangeError("Ground elevation is outside the supported range.");
  }
  if (
    !Number.isFinite(input.viewpointHeightAboveGroundMetres) ||
    input.viewpointHeightAboveGroundMetres < 0 ||
    input.viewpointHeightAboveGroundMetres >
      MAX_VIEWPOINT_HEIGHT_ABOVE_GROUND_METRES
  ) {
    throw new RangeError(
      "Viewpoint height above ground is outside the supported range.",
    );
  }

  return {
    ...input,
    observerElevationMetres:
      input.groundElevationMetres + input.viewpointHeightAboveGroundMetres,
  };
}
