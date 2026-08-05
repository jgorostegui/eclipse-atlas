export type ReferenceTerrainAngleInput = Readonly<{
  observerGroundElevationMetres: number;
  viewpointHeightAboveGroundMetres: number;
  targetGroundElevationMetres: number;
  distanceKilometres: number;
}>;

export function referenceDestinationPoint(
  latitude: number,
  longitude: number,
  bearingDegrees: number,
  distanceKilometres: number,
): { latitude: number; longitude: number };

export function referenceApparentTerrainAngle(
  input: ReferenceTerrainAngleInput,
): number;

export const REFERENCE_GEOMETRY: Readonly<{
  geodesic: string;
  semiMajorAxisMetres: number;
  flattening: number;
  apparentTerrainAngle: string;
  terrainReferenceRadiusMetres: number;
}>;
