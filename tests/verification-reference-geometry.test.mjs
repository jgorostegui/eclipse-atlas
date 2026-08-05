import assert from "node:assert/strict";
import test from "node:test";
import {
  referenceApparentTerrainAngle,
  referenceDestinationPoint,
} from "../scripts/verification-reference-geometry.mjs";

test("solves the published Vincenty direct example on WGS84", () => {
  const destination = referenceDestinationPoint(
    -37.95103,
    144.42487,
    306.86816,
    54.972271,
  );
  assert.ok(Math.abs(destination.latitude - -37.6528) < 0.00003);
  assert.ok(Math.abs(destination.longitude - 143.9265) < 0.00003);
});

test("keeps level terrain below the apparent horizon as distance grows", () => {
  const near = referenceApparentTerrainAngle({
    observerGroundElevationMetres: 100,
    viewpointHeightAboveGroundMetres: 1.5,
    targetGroundElevationMetres: 100,
    distanceKilometres: 1,
  });
  const far = referenceApparentTerrainAngle({
    observerGroundElevationMetres: 100,
    viewpointHeightAboveGroundMetres: 1.5,
    targetGroundElevationMetres: 100,
    distanceKilometres: 100,
  });
  assert.ok(near < 0);
  assert.ok(far < near);
});
