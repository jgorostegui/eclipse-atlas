import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  evaluateRecommendationReadiness,
  evaluateScientificReport,
  verifyStoredScientificReport,
} from "../scripts/scientific-verification.mjs";

const root = new URL("../", import.meta.url);

async function acceptance() {
  return JSON.parse(
    await readFile(new URL("verification/acceptance.json", root), "utf8"),
  );
}

test("checks one stable, checksum-protected report and derives publication readiness", async () => {
  const policy = await acceptance();
  const { report, result } = await verifyStoredScientificReport();

  assert.equal(report.schemaVersion, 2);
  assert.equal(report.reportVersion, "2.1.0");
  assert.equal(result.reportIntegrity, "valid");
  assert.equal(result.recommendationReadiness.status, "not-ready");
  assert.equal(result.recommendationReadiness.permitted, false);
  assert.equal(result.recommendationReadiness.requirements.validationSample, true);
  assert.equal(result.recommendationReadiness.requirements.terrainRgbDecodeAndAddressing, true);
  assert.equal(result.recommendationReadiness.requirements.terrainRgbToMdt05Horizon, true);
  assert.equal(result.recommendationReadiness.requirements.nearbyHorizonDifferential, true);
  assert.equal(result.recommendationReadiness.requirements.astronomyNumericalThresholds, false);
  assert.equal(result.recommendationReadiness.requirements.secondIndependentEphemeris, false);
  assert.ok(
    result.metrics.maximumContactResidualSeconds <=
      policy.numericalThresholds.contactTimeAbsoluteSeconds,
  );
  assert.ok(
    result.metrics.maximumTotalityDurationResidualSeconds >
      policy.numericalThresholds.totalityDurationAbsoluteSeconds,
  );
  assert.ok(
    result.metrics.maximumObscurationResidual <=
      policy.numericalThresholds.obscurationAbsoluteFraction,
  );
  assert.ok(
    result.metrics.maximumMdt05HorizonResidualDegrees <=
      policy.numericalThresholds.terrainRgbToMdt05HorizonAbsoluteDegrees,
  );
  assert.ok(
    result.metrics.maximumNearbyHorizonDifferentialResidualDegrees <=
      policy.numericalThresholds.nearbyHorizonDifferentialAbsoluteDegrees,
  );
});

test("keeps decisions out of the stored evidence document", async () => {
  const reportText = await readFile(
    new URL("verification/scientific-verification.json", root),
    "utf8",
  );
  const report = JSON.parse(reportText);
  for (const field of [
    "reportIntegrity",
    "recommendationReadiness",
    "verificationStatus",
    "releaseDecision",
    "recommendationPermitted",
    "gateEvidence",
    "gates",
    "releaseCriteria",
  ]) {
    assert.equal(field in report, false, `${field} must be derived at check time`);
  }
});

test("rejects a report that tries to publish its own gate result", async () => {
  const { report } = await verifyStoredScientificReport();
  const forged = structuredClone(report);
  forged.gates = { scientificIntegrity: true };
  await assert.rejects(
    () => evaluateScientificReport(forged),
    /must not contain derived release field gates/,
  );
});

test("fails closed instead of counting arbitrary release-evidence files", async () => {
  const { report } = await verifyStoredScientificReport();
  const forged = structuredClone(report);
  forged.releaseEvidence.exactVenues.push({
    id: "opaque-file",
    path: "verification/evidence/opaque.json",
    sha256: "0".repeat(64),
  });
  await assert.rejects(
    () => evaluateScientificReport(forged),
    /fail-closed until a category-specific validator is implemented/,
  );
});

test("rejects forged residuals instead of trusting stored measurements", async () => {
  const { report } = await verifyStoredScientificReport();
  const forged = structuredClone(report);
  forged.astronomy.comparisons.forEach((comparison) => {
    comparison.classification.match = true;
    Object.keys(comparison.residuals.seconds).forEach((contact) => {
      comparison.residuals.seconds[contact] = 0;
    });
    comparison.residuals.totalityDurationSeconds = 0;
    comparison.residuals.solarAltitudeDegrees = 0;
    comparison.residuals.solarAzimuthDegrees = 0;
  });
  forged.horizons.comparisons = Array.from(
    { length: 3 },
    () => structuredClone(forged.horizons.comparisons[0]),
  );

  await assert.rejects(
    () => evaluateScientificReport(forged),
    /Stored astronomy residuals do not match/,
  );

  const forgedHorizon = structuredClone(report);
  forgedHorizon.horizons.comparisons[0].residuals.horizonDegrees = 0;
  await assert.rejects(
    () => evaluateScientificReport(forgedHorizon),
    /Stored horizon residuals do not match/,
  );
});

test("rejects null, non-finite, and incoherent raw horizon measurements", async () => {
  const { report } = await verifyStoredScientificReport();
  for (const invalidValue of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
    const forged = structuredClone(report);
    forged.horizons.comparisons[0].terrainRgb.horizonAltitudeDegrees =
      invalidValue;
    forged.horizons.comparisons[0].mdt05.horizonAltitudeDegrees = invalidValue;
    forged.horizons.comparisons[0].residuals.horizonDegrees = 0;
    await assert.rejects(
      () => evaluateScientificReport(forged),
      /invalid raw values/,
    );
  }

  const incoherentObserver = structuredClone(report);
  incoherentObserver.horizons.comparisons[0].terrainRgb.observerElevationMetres +=
    10;
  await assert.rejects(
    () => evaluateScientificReport(incoherentObserver),
    /invalid raw values/,
  );
});

test("derives the nearby coastal differential from raw horizon measurements", async () => {
  const { report } = await verifyStoredScientificReport();
  const forged = structuredClone(report);
  forged.horizons.nearbyComparisons[0].differentialResidualDegrees = 0;
  assert.equal(
    (await evaluateScientificReport(forged)).recommendationReadiness.requirements
      .nearbyHorizonDifferential,
    false,
  );
});

test("rejects forged astronomy summaries", async () => {
  const { report } = await verifyStoredScientificReport();
  const forged = structuredClone(report);
  forged.astronomy.summary.maximumAbsoluteContactResidualSeconds = 0;
  await assert.rejects(
    () => evaluateScientificReport(forged),
    /Stored astronomy summary does not match/,
  );
});

test("rejects altered scientific model constants", async () => {
  const { report } = await verifyStoredScientificReport();
  const forgedTimeScale = structuredClone(report);
  forgedTimeScale.astronomy.model.eventTimeScale.deltaTSeconds += 0.001;
  await assert.rejects(
    () => evaluateScientificReport(forgedTimeScale),
    /Scientific model provenance or constants do not match/,
  );

  const forgedElements = structuredClone(report);
  forgedElements.astronomy.model.eclipseCircumstances.x[0] += 0.000001;
  await assert.rejects(
    () => evaluateScientificReport(forgedElements),
    /Scientific model provenance or constants do not match/,
  );
});

test("rejects duplicated or out-of-event astronomy rows", async () => {
  const { report } = await verifyStoredScientificReport();
  const duplicated = structuredClone(report);
  const zeroResidual = structuredClone(duplicated.astronomy.comparisons[0]);
  zeroResidual.official = structuredClone(zeroResidual.product);
  zeroResidual.classification.official = zeroResidual.classification.product;
  duplicated.astronomy.comparisons = Array.from(
    { length: duplicated.astronomy.comparisons.length },
    () => structuredClone(zeroResidual),
  );
  await assert.rejects(
    () => evaluateScientificReport(duplicated),
    /Stored astronomy residuals do not match/,
  );

  const wrongDate = structuredClone(report);
  wrongDate.astronomy.comparisons.forEach((comparison) => {
    comparison.official = structuredClone(comparison.product);
    comparison.classification.official = comparison.classification.product;
    for (const field of [
      "partialBegin",
      "totalBegin",
      "maximum",
      "totalEnd",
      "partialEnd",
    ]) {
      if (comparison.product[field] !== null) {
        comparison.product[field] = comparison.product[field].replace(
          "2026-08-12",
          "2000-01-01",
        );
        comparison.official[field] = comparison.product[field];
      }
    }
  });
  await assert.rejects(
    () => evaluateScientificReport(wrongDate),
    /Stored astronomy residuals do not match/,
  );
});

test("rejects out-of-range TerrainRGB channels", async () => {
  const { report } = await verifyStoredScientificReport();
  const forged = structuredClone(report);
  forged.terrainRgb.coordinateControls[0].rgba = [256, 0, 0, 255];
  forged.terrainRgb.coordinateControls[0].elevationMetres = 1_667_721.6;
  assert.equal(
    (await evaluateScientificReport(forged)).recommendationReadiness.requirements.terrainRgbDecodeAndAddressing,
    false,
  );

  const stringElevation = structuredClone(report);
  stringElevation.terrainRgb.coordinateControls[0].elevationMetres = String(
    stringElevation.terrainRgb.coordinateControls[0].elevationMetres,
  );
  assert.equal(
    (await evaluateScientificReport(stringElevation)).recommendationReadiness.requirements
      .terrainRgbDecodeAndAddressing,
    false,
  );

  const stringMinimum = structuredClone(report);
  stringMinimum.terrainRgb.minimumDecodedFixtureElevation.elevationMetres =
    "-1";
  assert.equal(
    (await evaluateScientificReport(stringMinimum)).recommendationReadiness.requirements
      .terrainRgbDecodeAndAddressing,
    false,
  );
});

test("requires every acceptance gate without embedding policy numbers in code", async () => {
  const policy = await acceptance();
  const counts = policy.requiredEvidenceCounts;
  const passingEvidence = {
    reproducibleFrozenBuild: true,
    validationSample: true,
    productReferenceCoverage: true,
    astronomyNumericalThresholds: true,
    astronomyExactInputAlignment: true,
    independentAstronomySourceCount: counts.independentAstronomySources,
    terrainRgbDecodeAndAddressing: true,
    terrainRgbToMdt05Horizon: true,
    nearbyHorizonDifferential: true,
    fieldHorizonComparisonCount: counts.fieldHorizonComparisons,
    independentReviewCount: counts.independentReviews,
    exactVenueCount: counts.exactVenues,
    currentWeatherArtifactCount: counts.currentWeatherArtifacts,
    freshOperationsReviewCount: counts.freshOperationsReviews,
    documentedClearanceCount: counts.documentedClearances,
  };

  assert.equal(
    evaluateRecommendationReadiness(passingEvidence, policy).permitted,
    true,
  );
  for (const booleanGate of [
    "reproducibleFrozenBuild",
    "validationSample",
    "productReferenceCoverage",
    "astronomyNumericalThresholds",
    "astronomyExactInputAlignment",
    "terrainRgbDecodeAndAddressing",
    "terrainRgbToMdt05Horizon",
    "nearbyHorizonDifferential",
  ]) {
    const result = evaluateRecommendationReadiness(
      { ...passingEvidence, [booleanGate]: false },
      policy,
    );
    assert.equal(result.permitted, false, booleanGate);
  }
});
