const WGS84_SEMI_MAJOR_AXIS_METRES = 6_378_137;
const WGS84_FLATTENING = 1 / 298.257_223_563;
const WGS84_SEMI_MINOR_AXIS_METRES =
  WGS84_SEMI_MAJOR_AXIS_METRES * (1 - WGS84_FLATTENING);
const TERRAIN_REFRACTION_COEFFICIENT = 0.13;
const TERRAIN_REFERENCE_RADIUS_METRES =
  6_371_000 / (1 - TERRAIN_REFRACTION_COEFFICIENT);

function radians(degrees) {
  return (degrees * Math.PI) / 180;
}

function degrees(radiansValue) {
  return (radiansValue * 180) / Math.PI;
}

export function referenceDestinationPoint(
  latitude,
  longitude,
  bearingDegrees,
  distanceKilometres,
) {
  if (
    ![latitude, longitude, bearingDegrees, distanceKilometres].every(
      Number.isFinite,
    ) ||
    latitude < -90 ||
    latitude > 90 ||
    distanceKilometres < 0
  ) {
    throw new RangeError("Reference geodesic input is outside its supported range.");
  }
  if (distanceKilometres === 0) return { latitude, longitude };

  const alpha1 = radians(bearingDegrees);
  const phi1 = radians(latitude);
  const sinAlpha1 = Math.sin(alpha1);
  const cosAlpha1 = Math.cos(alpha1);
  const tanU1 = (1 - WGS84_FLATTENING) * Math.tan(phi1);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const sinU1 = tanU1 * cosU1;
  const sigma1 = Math.atan2(tanU1, cosAlpha1);
  const sinAlpha = cosU1 * sinAlpha1;
  const cosSquaredAlpha = 1 - sinAlpha * sinAlpha;
  const uSquared =
    (cosSquaredAlpha *
      (WGS84_SEMI_MAJOR_AXIS_METRES ** 2 -
        WGS84_SEMI_MINOR_AXIS_METRES ** 2)) /
    WGS84_SEMI_MINOR_AXIS_METRES ** 2;
  const coefficientA =
    1 +
    (uSquared / 16_384) *
      (4_096 + uSquared * (-768 + uSquared * (320 - 175 * uSquared)));
  const coefficientB =
    (uSquared / 1_024) *
    (256 + uSquared * (-128 + uSquared * (74 - 47 * uSquared)));
  const distanceMetres = distanceKilometres * 1_000;
  let sigma =
    distanceMetres / (WGS84_SEMI_MINOR_AXIS_METRES * coefficientA);
  let previousSigma = Number.POSITIVE_INFINITY;
  let cosTwoSigmaM = 0;
  let sinSigma = 0;
  let cosSigma = 0;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    cosTwoSigmaM = Math.cos(2 * sigma1 + sigma);
    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    const deltaSigma =
      coefficientB *
      sinSigma *
      (cosTwoSigmaM +
        (coefficientB / 4) *
          (cosSigma * (-1 + 2 * cosTwoSigmaM ** 2) -
            (coefficientB / 6) *
              cosTwoSigmaM *
              (-3 + 4 * sinSigma ** 2) *
              (-3 + 4 * cosTwoSigmaM ** 2)));
    previousSigma = sigma;
    sigma =
      distanceMetres / (WGS84_SEMI_MINOR_AXIS_METRES * coefficientA) +
      deltaSigma;
    if (Math.abs(sigma - previousSigma) < 1e-13) break;
    if (iteration === 19) {
      throw new Error("Reference WGS84 direct solution did not converge.");
    }
  }

  const temporary =
    sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
  const phi2 = Math.atan2(
    sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
    (1 - WGS84_FLATTENING) *
      Math.sqrt(sinAlpha ** 2 + temporary ** 2),
  );
  const lambda = Math.atan2(
    sinSigma * sinAlpha1,
    cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1,
  );
  const coefficientC =
    (WGS84_FLATTENING / 16) *
    cosSquaredAlpha *
    (4 + WGS84_FLATTENING * (4 - 3 * cosSquaredAlpha));
  const longitudeDelta =
    lambda -
    (1 - coefficientC) *
      WGS84_FLATTENING *
      sinAlpha *
      (sigma +
        coefficientC *
          sinSigma *
          (cosTwoSigmaM +
            coefficientC *
              cosSigma *
              (-1 + 2 * cosTwoSigmaM ** 2)));
  const longitudeDegrees =
    ((longitude + degrees(longitudeDelta) + 540) % 360) - 180;
  return { latitude: degrees(phi2), longitude: longitudeDegrees };
}

export function referenceApparentTerrainAngle({
  observerGroundElevationMetres,
  viewpointHeightAboveGroundMetres,
  targetGroundElevationMetres,
  distanceKilometres,
}) {
  if (
    ![
      observerGroundElevationMetres,
      viewpointHeightAboveGroundMetres,
      targetGroundElevationMetres,
      distanceKilometres,
    ].every(Number.isFinite) ||
    distanceKilometres <= 0
  ) {
    throw new RangeError("Reference terrain-angle input is invalid.");
  }
  const observerElevationMetres =
    observerGroundElevationMetres + viewpointHeightAboveGroundMetres;
  const centralAngle =
    (distanceKilometres * 1_000) / TERRAIN_REFERENCE_RADIUS_METRES;
  const targetRadius =
    TERRAIN_REFERENCE_RADIUS_METRES + targetGroundElevationMetres;
  const horizontalMetres = targetRadius * Math.sin(centralAngle);
  const verticalMetres =
    targetRadius * Math.cos(centralAngle) -
    (TERRAIN_REFERENCE_RADIUS_METRES + observerElevationMetres);
  return degrees(Math.atan2(verticalMetres, horizontalMetres));
}

export const REFERENCE_GEOMETRY = Object.freeze({
  geodesic: "WGS84 ellipsoidal direct solution (Vincenty)",
  semiMajorAxisMetres: WGS84_SEMI_MAJOR_AXIS_METRES,
  flattening: WGS84_FLATTENING,
  apparentTerrainAngle:
    "exact effective-Earth-radius chord geometry with k=0.13",
  terrainReferenceRadiusMetres: TERRAIN_REFERENCE_RADIUS_METRES,
});
