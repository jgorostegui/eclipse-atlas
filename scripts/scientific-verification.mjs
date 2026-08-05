import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REFERENCE_GEOMETRY } from "./verification-reference-geometry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPORT_PATH = "verification/scientific-verification.json";
export const CHECKSUM_PATH = "verification/scientific-verification.sha256";

export const SCIENTIFIC_INPUT_PATHS = [
  "package.json",
  "package-lock.json",
  "scripts/scientific-verification.mjs",
  "scripts/required-input-path.mts",
  "scripts/verification-reference-geometry.mjs",
  "scripts/verification-reference-geometry.d.mts",
  "tests/verification-reference-geometry.test.mjs",
  "verification/acceptance.json",
  "public/sources.json",
  "src/domain/astronomy.ts",
  "src/domain/besselian-eclipse.ts",
  "src/domain/besselian-eclipse.test.ts",
  "src/domain/eclipse.ts",
  "src/domain/eclipse.test.ts",
  "src/domain/observer.ts",
  "src/domain/terrain-coverage.ts",
  "src/domain/terrain-horizon.ts",
  "src/domain/terrain-horizon.test.ts",
  "src/features/horizon/horizon-animation-model.ts",
  "src/features/horizon/horizon-animation-model.test.ts",
  "src/features/horizon/horizon-scene-model.ts",
  "src/features/horizon/horizon-scene-model.test.ts",
  "src/features/horizon/HorizonAnimation.tsx",
  "src/features/horizon/HorizonCanvasView.tsx",
];

const evidenceCategories = [
  "independentAstronomyComparisons",
  "fieldHorizonComparisons",
  "independentReviews",
  "exactVenues",
  "currentWeatherArtifacts",
  "freshOperationsReviews",
  "documentedClearances",
];

const derivedReleaseFields = [
  "reportIntegrity",
  "recommendationReadiness",
  "verificationStatus",
  "releaseDecision",
  "recommendationPermitted",
  "gateEvidence",
  "gates",
  "releaseCriteria",
  "recommendationRequirements",
  "productSemantics",
];

const EXPECTED_EVENT_TIME_SCALE = {
  sourceId: "iers-bulletin-a-xxxix-031",
  producer: "IERS Rapid Service/Prediction Center",
  bulletin: "IERS Bulletin A XXXIX-031",
  sourceUrl: "https://datacenter.iers.org/data/6/bulletina-xxxix-031.txt",
  issuedAt: "2026-07-30",
  retrievedAt: "2026-08-02",
  referenceMjd: 61_264,
  valueStatus: "prediction",
  taiMinusUtcSeconds: 37,
  ttMinusTaiSeconds: 32.184,
  ttMinusUtcSeconds: 69.184,
  ut1MinusUtcSeconds: 0.01091,
  deltaTSeconds: 69.17309,
  derivation: "Delta T = (TAI-UTC) + (TT-TAI) - (UT1-UTC)",
  bulletinSha256:
    "d5915dd3f5e9b82fbbaab0b77021374425b2e2fc0b908c7bbbb0b6a62a379aea",
};

const EXPECTED_BESSELIAN_MODEL = {
  implementation: "owned-besselian-local-circumstances-v1",
  sourceId: "nasa-gsfc-2026-besselian-elements",
  producer: "Fred Espenak / NASA Goddard Space Flight Center",
  sourceUrl: "https://eclipse.gsfc.nasa.gov/SEsearch/SEdata.php?Ecl=20260812",
  retrievedAt: "2026-08-02",
  acknowledgment: "Eclipse Predictions by Fred Espenak, NASA's GSFC",
  sourceEphemerides: "VSOP87/ELP2000-82",
  sourceDeltaTSeconds: 75.4,
  referenceTdtHours: 18,
  validityStartTdtHours: 15,
  validityEndTdtHours: 21,
  x: [0.47551399, 0.51892489, -0.0000773, -0.00000804],
  y: [0.77118301, -0.230168, -0.0001246, 0.00000377],
  declinationDegrees: [14.79666996, -0.012065, -0.000003],
  muDegrees: [88.74778748, 15.0030899, 0],
  penumbraRadius: [0.53795499, 0.0000939, -0.0000121],
  umbraRadius: [-0.008142, 0.0000935, -0.0000121],
  tanPenumbraConeAngle: 0.0046141,
  tanUmbraConeAngle: 0.0045911,
};

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function commandOutput(command, arguments_) {
  try {
    return execFileSync(command, arguments_, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

let terrainFailureTestsPassCache;
function terrainFailureTestsPass() {
  if (terrainFailureTestsPassCache === undefined) {
    terrainFailureTestsPassCache =
      commandOutput(process.execPath, [
        "node_modules/vitest/vitest.mjs",
        "run",
        "src/domain/terrain-horizon.test.ts",
      ]) !== null;
  }
  return terrainFailureTestsPassCache;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

function maximumAbsolute(values) {
  return values.length === 0
    ? Number.POSITIVE_INFINITY
    : Math.max(...values.map((value) => Math.abs(value)));
}

function round(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function pearson(left, right) {
  if (left.length < 3 || left.length !== right.length) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquares += leftDelta ** 2;
    rightSquares += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftSquares * rightSquares);
  return denominator === 0 ? null : round(numerator / denominator);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function distanceMetres(leftLatitude, leftLongitude, rightLatitude, rightLongitude) {
  const latitudeDelta = ((rightLatitude - leftLatitude) * Math.PI) / 180;
  const longitudeDelta = ((rightLongitude - leftLongitude) * Math.PI) / 180;
  const leftRadians = (leftLatitude * Math.PI) / 180;
  const rightRadians = (rightLatitude * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftRadians) *
      Math.cos(rightRadians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
}

function validHorizonMeasurement(measurement, maximumDistanceKilometres) {
  return (
    measurement &&
    isFiniteNumber(measurement.groundElevationMetres) &&
    measurement.groundElevationMetres >= -500 &&
    measurement.groundElevationMetres <= 10_000 &&
    isFiniteNumber(measurement.viewpointHeightAboveGroundMetres) &&
    measurement.viewpointHeightAboveGroundMetres >= 0 &&
    measurement.viewpointHeightAboveGroundMetres <= 100 &&
    isFiniteNumber(measurement.observerElevationMetres) &&
    Math.abs(
      measurement.observerElevationMetres -
        measurement.groundElevationMetres -
        measurement.viewpointHeightAboveGroundMetres,
    ) < 1e-8 &&
    isFiniteNumber(measurement.horizonAltitudeDegrees) &&
    measurement.horizonAltitudeDegrees >= -90 &&
    measurement.horizonAltitudeDegrees <= 90 &&
    isFiniteNumber(measurement.limitingDistanceKilometres) &&
    measurement.limitingDistanceKilometres > 0 &&
    measurement.limitingDistanceKilometres <= maximumDistanceKilometres
  );
}

function hasExactJsonValue(actual, expected) {
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === expected.length &&
      actual.every((value, index) => hasExactJsonValue(value, expected[index]))
    );
  }
  if (
    actual === null ||
    expected === null ||
    typeof actual !== "object" ||
    typeof expected !== "object"
  ) {
    return false;
  }
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every(
      (key, index) =>
        key === expectedKeys[index] &&
        hasExactJsonValue(actual[key], expected[key]),
    )
  );
}

function requireArray(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array.`);
  return value;
}

function countVerifiedArtifacts(evidence, category) {
  return requireArray(evidence[category], `releaseEvidence.${category}`).length;
}

export function evaluateRecommendationReadiness(evidence, acceptance) {
  const requirements = {
    reproducibleFrozenBuild: evidence.reproducibleFrozenBuild,
    validationSample: evidence.validationSample,
    productReferenceCoverage: evidence.productReferenceCoverage,
    astronomyNumericalThresholds: evidence.astronomyNumericalThresholds,
    astronomyExactInputAlignment: evidence.astronomyExactInputAlignment,
    secondIndependentEphemeris:
      evidence.independentAstronomySourceCount >=
      acceptance.requiredEvidenceCounts.independentAstronomySources,
    terrainRgbDecodeAndAddressing: evidence.terrainRgbDecodeAndAddressing,
    terrainRgbToMdt05Horizon: evidence.terrainRgbToMdt05Horizon,
    nearbyHorizonDifferential: evidence.nearbyHorizonDifferential,
    fieldHorizon:
      evidence.fieldHorizonComparisonCount >=
      acceptance.requiredEvidenceCounts.fieldHorizonComparisons,
    independentReview:
      evidence.independentReviewCount >=
      acceptance.requiredEvidenceCounts.independentReviews,
    exactVenues:
      evidence.exactVenueCount >= acceptance.requiredEvidenceCounts.exactVenues,
    currentWeather:
      evidence.currentWeatherArtifactCount >=
      acceptance.requiredEvidenceCounts.currentWeatherArtifacts,
    operationsFreshness:
      evidence.freshOperationsReviewCount >=
      acceptance.requiredEvidenceCounts.freshOperationsReviews,
    documentedClearance:
      evidence.documentedClearanceCount >=
      acceptance.requiredEvidenceCounts.documentedClearances,
  };
  const unmetRequirements = Object.entries(requirements)
    .filter(([, passed]) => passed !== true)
    .map(([gate]) => gate);
  return {
    status: unmetRequirements.length === 0 ? "ready" : "not-ready",
    permitted: unmetRequirements.length === 0,
    requirements,
    unmetRequirements,
  };
}

async function verifyReleaseEvidence(report) {
  const evidence = report.releaseEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new TypeError("releaseEvidence must be an object.");
  }
  if (
    Object.keys(evidence).length !== evidenceCategories.length ||
    evidenceCategories.some((category) => !(category in evidence))
  ) {
    throw new Error("releaseEvidence categories do not match the acceptance model.");
  }

  for (const category of evidenceCategories) {
    if (requireArray(evidence[category], category).length !== 0) {
      throw new Error(
        `Release evidence category ${category} is fail-closed until a category-specific validator is implemented.`,
      );
    }
  }
  return evidence;
}

function terrainPixelAddress(latitude, longitude) {
  const tileSize = 512;
  const zoom = 11;
  const worldSize = 2 ** zoom * tileSize;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const worldX = ((longitude + 180) / 360) * worldSize;
  const worldY =
    ((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2) * worldSize;
  return {
    tileX: Math.floor(worldX / tileSize),
    tileY: Math.floor(worldY / tileSize),
    pixelX: Math.max(0, Math.min(tileSize - 1, Math.floor(worldX % tileSize))),
    pixelY: Math.max(0, Math.min(tileSize - 1, Math.floor(worldY % tileSize))),
  };
}

function contactResidualSeconds(product, official) {
  if (product === null && official === null) return 0;
  if (typeof product !== "string" || typeof official !== "string") {
    return Number.POSITIVE_INFINITY;
  }
  const productTime = Date.parse(product);
  const officialTime = Date.parse(official);
  return Number.isFinite(productTime) && Number.isFinite(officialTime)
    ? (productTime - officialTime) / 1000
    : Number.POSITIVE_INFINITY;
}

function storedContactResidualSeconds(product, official) {
  if (product === null && official === null) return null;
  const residual = contactResidualSeconds(product, official);
  return isFiniteNumber(residual) ? round(residual) : residual;
}

function validEclipseMeasurements(measurement, classification, eventDate) {
  if (!measurement || typeof measurement !== "object") return false;
  if (classification !== "total" && classification !== "partial") return false;
  const partialBegin = Date.parse(measurement.partialBegin);
  const maximum = Date.parse(measurement.maximum);
  const partialEnd = Date.parse(measurement.partialEnd);
  const eventStart = Date.parse(`${eventDate}T00:00:00Z`);
  const eventEnd = eventStart + 24 * 60 * 60 * 1000;
  const requiredTimes = [partialBegin, maximum, partialEnd];
  if (
    requiredTimes.some(
      (time) => !Number.isFinite(time) || time < eventStart || time >= eventEnd,
    ) ||
    !(partialBegin < maximum && maximum < partialEnd)
  ) {
    return false;
  }

  const totalBegin =
    measurement.totalBegin === null
      ? null
      : Date.parse(measurement.totalBegin);
  const totalEnd =
    measurement.totalEnd === null ? null : Date.parse(measurement.totalEnd);
  if (classification === "total") {
    if (
      !Number.isFinite(totalBegin) ||
      !Number.isFinite(totalEnd) ||
      !(partialBegin < totalBegin && totalBegin <= maximum) ||
      !(maximum <= totalEnd && totalEnd < partialEnd) ||
      !isFiniteNumber(measurement.totalityDurationSeconds) ||
      measurement.totalityDurationSeconds < 0 ||
      Math.abs(
        measurement.totalityDurationSeconds - (totalEnd - totalBegin) / 1000,
      ) > 0.01
    ) {
      return false;
    }
  } else if (
    totalBegin !== null ||
    totalEnd !== null ||
    measurement.totalityDurationSeconds !== null
  ) {
    return false;
  }

  return (
    isFiniteNumber(measurement.obscuration) &&
    measurement.obscuration >= 0 &&
    measurement.obscuration <= 1 &&
    isFiniteNumber(measurement.solarAltitudeDegrees) &&
    measurement.solarAltitudeDegrees >= -90 &&
    measurement.solarAltitudeDegrees <= 90 &&
    isFiniteNumber(measurement.solarAzimuthDegrees) &&
    measurement.solarAzimuthDegrees >= 0 &&
    measurement.solarAzimuthDegrees < 360
  );
}

export async function evaluateScientificReport(report) {
  if (
    report?.schemaVersion !== 2 ||
    report.reportVersion !== "2.1.0" ||
    report.event?.date !== "2026-08-12" ||
    report.event?.timeStandard !== "UTC" ||
    typeof report.generatedAt !== "string"
  ) {
    throw new Error("Scientific verification report schema is invalid.");
  }
  for (const field of derivedReleaseFields) {
    if (field in report) {
      throw new Error(`Stored report must not contain derived release field ${field}.`);
    }
  }

  const [acceptance, fixtureManifest, validationPoints, productReferences] =
    await Promise.all([
      readJson("verification/acceptance.json"),
      readJson("verification/fixtures/v2/fixture-manifest.json"),
      readJson("verification/fixtures/v2/validation-points.json"),
      readJson("src/data/candidate-reference-points.json"),
    ]);
  if (acceptance.schemaVersion !== 1) {
    throw new Error("Scientific acceptance schema is invalid.");
  }

  const fixtureManifestBytes = await readFile(
    path.join(root, "verification/fixtures/v2/fixture-manifest.json"),
  );
  const validationPointsBytes = await readFile(
    path.join(root, "verification/fixtures/v2/validation-points.json"),
  );
  const generatorBytes = await readFile(
    path.join(root, "scripts/run-scientific-verification.mts"),
  );
  const storedScientificInputs = report.environment?.scientificInputSha256;
  if (
    !storedScientificInputs ||
    typeof storedScientificInputs !== "object" ||
    Array.isArray(storedScientificInputs) ||
    Object.keys(storedScientificInputs).length !== SCIENTIFIC_INPUT_PATHS.length
  ) {
    throw new Error("Scientific report input binding is missing or invalid.");
  }
  const currentScientificInputs = Object.fromEntries(
    await Promise.all(
      SCIENTIFIC_INPUT_PATHS.map(async (relativePath) => [
        relativePath,
        sha256(await readFile(path.join(root, relativePath))),
      ]),
    ),
  );
  if (
    report.environment?.generatorSha256 !== sha256(generatorBytes) ||
    report.fixtures?.fixtureManifestSha256 !== sha256(fixtureManifestBytes) ||
    report.fixtures?.validationPointManifestSha256 !==
      sha256(validationPointsBytes) ||
    report.environment?.acceptanceSha256 !==
      currentScientificInputs["verification/acceptance.json"] ||
    SCIENTIFIC_INPUT_PATHS.some(
      (relativePath) =>
        storedScientificInputs[relativePath] !==
        currentScientificInputs[relativePath],
    )
  ) {
    throw new Error(
      "Scientific report does not match the current harness, implementation, dependencies, or manifests.",
    );
  }

  const fixtureChecks = [
    ...requireArray(report.fixtures?.official, "fixtures.official"),
    ...requireArray(report.fixtures?.acquired, "fixtures.acquired"),
  ];
  const fixturesPass =
    fixtureChecks.length > 0 &&
    fixtureChecks.every(
      (fixture) =>
        /^[a-f0-9]{64}$/.test(fixture.expectedSha256 ?? "") &&
        fixture.actualSha256 === fixture.expectedSha256 &&
        fixture.bytes > 0,
    );

  const points = requireArray(validationPoints.points, "validation points");
  const validationSample =
    fixturesPass &&
    typeof validationPoints.selectionFrozenAt === "string" &&
    typeof validationPoints.selectionRule === "string" &&
    points.length >= acceptance.minimumValidationPointCount &&
    new Set(points.map((point) => point.id)).size === points.length &&
    points.every(
      (point) => Array.isArray(point.strata) && point.strata.length > 0,
    );
  const referenceCoordinates = acceptance.requiredProductReferenceIds.map(
    (id) => {
      const reference = productReferences.references?.[id];
      if (!reference) throw new Error(`Missing product reference ${id}.`);
      return reference;
    },
  );
  const productReferenceCoverage = referenceCoordinates.every((reference) =>
    points.some(
      (point) =>
        point.latitude === reference.latitude &&
        point.longitude === reference.longitude,
    ),
  );

  const astronomyComparisons = requireArray(
    report.astronomy?.comparisons,
    "astronomy.comparisons",
  );
  const validationPointsById = new Map(
    points.map((point) => [point.id, point]),
  );
  const astronomyComparisonIds = new Set(
    astronomyComparisons.map((comparison) => comparison.pointId),
  );
  const productModel = report.astronomy?.model;
  const timeScale = productModel?.eventTimeScale;
  const besselianElements = productModel?.eclipseCircumstances;
  const validTimeScale =
    hasExactJsonValue(timeScale, EXPECTED_EVENT_TIME_SCALE) &&
    Math.abs(
      timeScale.ttMinusUtcSeconds -
        (timeScale.taiMinusUtcSeconds + timeScale.ttMinusTaiSeconds),
    ) < 1e-12 &&
    Math.abs(
      timeScale.deltaTSeconds -
        (timeScale.ttMinusUtcSeconds - timeScale.ut1MinusUtcSeconds),
    ) < 1e-12;
  const validBesselianElements = hasExactJsonValue(
    besselianElements,
    EXPECTED_BESSELIAN_MODEL,
  );
  if (!validTimeScale || !validBesselianElements) {
    throw new Error(
      "Scientific model provenance or constants do not match the owned implementation.",
    );
  }
  const storedAstronomyResidualsValid = astronomyComparisons.every(
    (comparison) => {
      const expectedContactResiduals = {
        c1: storedContactResidualSeconds(
          comparison.product?.partialBegin,
          comparison.official?.partialBegin,
        ),
        c2: storedContactResidualSeconds(
          comparison.product?.totalBegin,
          comparison.official?.totalBegin,
        ),
        maximum: storedContactResidualSeconds(
          comparison.product?.maximum,
          comparison.official?.maximum,
        ),
        c3: storedContactResidualSeconds(
          comparison.product?.totalEnd,
          comparison.official?.totalEnd,
        ),
        c4: storedContactResidualSeconds(
          comparison.product?.partialEnd,
          comparison.official?.partialEnd,
        ),
      };
      const expectedDurationResidual =
        comparison.product?.totalityDurationSeconds === null &&
        comparison.official?.totalityDurationSeconds === null
          ? null
          : round(
              comparison.product?.totalityDurationSeconds -
                comparison.official?.totalityDurationSeconds,
            );
      return (
        Object.entries(expectedContactResiduals).every(
          ([contact, value]) => comparison.residuals?.seconds?.[contact] === value,
        ) &&
        comparison.residuals?.totalityDurationSeconds ===
          expectedDurationResidual &&
        comparison.residuals?.obscuration ===
          round(comparison.product?.obscuration - comparison.official?.obscuration) &&
        comparison.residuals?.solarAltitudeDegrees ===
          round(
            comparison.product?.solarAltitudeDegrees -
              comparison.official?.solarAltitudeDegrees,
          ) &&
        comparison.residuals?.solarAzimuthDegrees ===
          round(
            comparison.product?.solarAzimuthDegrees -
              comparison.official?.solarAzimuthDegrees,
          )
      );
    },
  );
  if (!storedAstronomyResidualsValid) {
    throw new Error(
      "Stored astronomy residuals do not match the raw product and reference values.",
    );
  }
  const astronomyCoverage =
    validTimeScale &&
    validBesselianElements &&
    astronomyComparisons.length === points.length &&
    astronomyComparisonIds.size === astronomyComparisons.length &&
    astronomyComparisons.every((comparison) => {
      const point = validationPointsById.get(comparison.pointId);
      return (
        point &&
        comparison.requestedCoordinate?.latitude === point.latitude &&
        comparison.requestedCoordinate?.longitude === point.longitude &&
        validEclipseMeasurements(
          comparison.product,
          comparison.classification?.product,
          fixtureManifest.eventDate,
        ) &&
        validEclipseMeasurements(
          comparison.official,
          comparison.classification?.official,
          fixtureManifest.eventDate,
        )
      );
    });
  const astronomyResiduals = astronomyComparisons.map((comparison) => ({
    contacts: [
      contactResidualSeconds(
        comparison.product?.partialBegin,
        comparison.official?.partialBegin,
      ),
      contactResidualSeconds(
        comparison.product?.totalBegin,
        comparison.official?.totalBegin,
      ),
      contactResidualSeconds(
        comparison.product?.maximum,
        comparison.official?.maximum,
      ),
      contactResidualSeconds(
        comparison.product?.totalEnd,
        comparison.official?.totalEnd,
      ),
      contactResidualSeconds(
        comparison.product?.partialEnd,
        comparison.official?.partialEnd,
      ),
    ],
    maximum: contactResidualSeconds(
      comparison.product?.maximum,
      comparison.official?.maximum,
    ),
    duration:
      comparison.product?.totalityDurationSeconds === null &&
      comparison.official?.totalityDurationSeconds === null
        ? 0
        : comparison.product?.totalityDurationSeconds -
          comparison.official?.totalityDurationSeconds,
    altitude:
      comparison.product?.solarAltitudeDegrees -
      comparison.official?.solarAltitudeDegrees,
    azimuth:
      comparison.product?.solarAzimuthDegrees -
      comparison.official?.solarAzimuthDegrees,
    classificationMatch:
      comparison.classification?.product === comparison.classification?.official,
  }));
  const contactResiduals = astronomyResiduals.flatMap(
    (comparison) => comparison.contacts,
  );
  const maximumResiduals = astronomyResiduals.map(
    (comparison) => comparison.maximum,
  );
  const durationResiduals = astronomyResiduals.map(
    (comparison) => comparison.duration,
  );
  const altitudeResiduals = astronomyResiduals.map(
    (comparison) => comparison.altitude,
  );
  const azimuthResiduals = astronomyResiduals.map(
    (comparison) => comparison.azimuth,
  );
  const obscurationResiduals = astronomyComparisons.map(
    (comparison) =>
      comparison.product?.obscuration - comparison.official?.obscuration,
  );
  const maximumContactResidualByPoint = astronomyResiduals.map(
    (comparison) =>
      Math.max(
        ...[...comparison.contacts, comparison.maximum].map((value) =>
          Math.abs(value),
        ),
      ),
  );
  const elevationEffects = requireArray(
    report.observerElevation?.zeroGroundElevationSensitivity?.points,
    "observerElevation.zeroGroundElevationSensitivity.points",
  );
  const elevationByPointId = new Map(
    elevationEffects.map((effect) => [effect.pointId, effect]),
  );
  const summary = report.astronomy?.summary;
  const expectedSummary = {
    classificationMatches: astronomyComparisons.filter(
      (comparison) =>
        comparison.classification?.product ===
        comparison.classification?.official,
    ).length,
    comparisonCount: astronomyComparisons.length,
    maximumAbsoluteContactResidualSeconds: round(
      maximumAbsolute(
        astronomyComparisons.flatMap((comparison) =>
          ["c1", "c2", "c3", "c4"]
            .map((contact) => comparison.residuals.seconds[contact])
            .filter(isFiniteNumber),
        ),
      ),
    ),
    maximumAbsoluteMaximumResidualSeconds: round(
      maximumAbsolute(maximumResiduals),
    ),
    maximumAbsoluteTotalityDurationResidualSeconds: round(
      maximumAbsolute(
        astronomyComparisons
          .map((comparison) => comparison.residuals.totalityDurationSeconds)
          .filter(isFiniteNumber),
      ),
    ),
    maximumAbsoluteSolarAltitudeResidualDegrees: round(
      maximumAbsolute(altitudeResiduals),
    ),
    maximumAbsoluteSolarAzimuthResidualDegrees: round(
      maximumAbsolute(azimuthResiduals),
    ),
    maximumAbsoluteObscurationResidual: round(
      maximumAbsolute(obscurationResiduals),
    ),
    maximumContactResidualCorrelationWithLatitude: pearson(
      maximumContactResidualByPoint,
      points.map((point) => point.latitude),
    ),
    maximumContactResidualCorrelationWithLongitude: pearson(
      maximumContactResidualByPoint,
      points.map((point) => point.longitude),
    ),
    maximumContactResidualCorrelationWithProductElevation: pearson(
      maximumContactResidualByPoint,
      points.map((point) => elevationByPointId.get(point.id)?.terrainElevationMetres),
    ),
  };
  if (
    Object.entries(expectedSummary).some(
      ([field, value]) => summary?.[field] !== value,
    )
  ) {
    throw new Error(
      "Stored astronomy summary does not match the raw comparison values.",
    );
  }
  const thresholds = acceptance.numericalThresholds;
  const astronomyNumericalThresholds =
    astronomyCoverage &&
    astronomyResiduals.every(
      (comparison) =>
        comparison.classificationMatch &&
        comparison.contacts.every(isFiniteNumber) &&
        isFiniteNumber(comparison.duration) &&
        isFiniteNumber(comparison.obscuration) &&
        isFiniteNumber(comparison.altitude) &&
        isFiniteNumber(comparison.azimuth),
    ) &&
    maximumAbsolute(contactResiduals) <= thresholds.contactTimeAbsoluteSeconds &&
    maximumAbsolute(maximumResiduals) <= thresholds.maximumTimeAbsoluteSeconds &&
    maximumAbsolute(durationResiduals) <=
      thresholds.totalityDurationAbsoluteSeconds &&
    maximumAbsolute(obscurationResiduals) <=
      thresholds.obscurationAbsoluteFraction &&
    maximumAbsolute(altitudeResiduals) <=
      thresholds.solarPositionAbsoluteDegrees &&
    maximumAbsolute(azimuthResiduals) <=
      thresholds.solarPositionAbsoluteDegrees;
  const astronomyExactInputAlignment =
    astronomyComparisons.length > 0 &&
    astronomyComparisons.every(
      (comparison) =>
        isFiniteNumber(comparison.observerElevation?.officialMetres) &&
        comparison.observerElevation.officialMetres ===
          comparison.observerElevation.effectiveObserverMetres &&
        comparison.comparisonCoordinate?.latitude ===
          comparison.officialRasterCell?.cellCentreLatitude &&
        comparison.comparisonCoordinate?.longitude ===
          comparison.officialRasterCell?.cellCentreLongitude,
    );

  const terrainControls = requireArray(
    report.terrainRgb?.coordinateControls,
    "terrainRgb.coordinateControls",
  );
  const terrainControlIds = new Set(terrainControls.map((control) => control.pointId));
  const terrainRgbDecodeAndAddressing =
    terrainControls.length === points.length &&
    terrainControlIds.size === terrainControls.length &&
    terrainControls.every(
      (control) => {
        const point = points.find((candidate) => candidate.id === control.pointId);
        if (
          !point ||
          point.latitude !== control.latitude ||
          point.longitude !== control.longitude
        ) {
          return false;
        }
        const [red, green, blue, alpha] = control.rgba ?? [];
        const decoded =
          -10_000 + (red * 65_536 + green * 256 + blue) * 0.1;
        const expectedAddress = terrainPixelAddress(
          control.latitude,
          control.longitude,
        );
        return (
          [red, green, blue, alpha].every(
            (value) => Number.isInteger(value) && value >= 0 && value <= 255,
          ) &&
          alpha === 255 &&
          decoded >= -500 &&
          decoded <= 10_000 &&
          isFiniteNumber(control.elevationMetres) &&
          control.elevationMetres >= -500 &&
          control.elevationMetres <= 10_000 &&
          Math.abs(decoded - control.elevationMetres) < 1e-8 &&
          Object.entries(expectedAddress).every(
            ([field, value]) => control.address?.[field] === value,
          )
        );
      },
    ) &&
    isFiniteNumber(
      report.terrainRgb?.minimumDecodedFixtureElevation?.elevationMetres,
    ) &&
    report.terrainRgb.minimumDecodedFixtureElevation.elevationMetres >= -500 &&
    report.terrainRgb.minimumDecodedFixtureElevation.elevationMetres < 0 &&
    terrainFailureTestsPass();

  const horizonComparisons = requireArray(
    report.horizons?.comparisons,
    "horizons.comparisons",
  );
  if (!hasExactJsonValue(report.horizons?.referenceGeometry, REFERENCE_GEOMETRY)) {
    throw new Error("Horizon reference geometry provenance does not match.");
  }
  const expectedHorizonPoints = new Map(
    points
      .filter((point) => point.horizonValidation)
      .map((point) => [point.id, point.horizonValidation]),
  );
  const horizonComparisonIds = new Set(
    horizonComparisons.map((comparison) => comparison.pointId),
  );
  const maximumHorizonDistanceKilometres =
    fixtureManifest.mdt05Fixture.maximumDistanceMetres / 1_000;
  const invalidRawHorizonPointIds = horizonComparisons
    .filter(
      (comparison) =>
        !(
      isFiniteNumber(comparison.azimuthDegrees) &&
      comparison.azimuthDegrees >= 0 &&
      comparison.azimuthDegrees < 360 &&
      validHorizonMeasurement(
        comparison.terrainRgb,
        maximumHorizonDistanceKilometres,
      ) &&
      Number.isInteger(comparison.terrainRgb.samplesPerRay) &&
      comparison.terrainRgb.samplesPerRay > 0 &&
      validHorizonMeasurement(
        comparison.mdt05,
        maximumHorizonDistanceKilometres,
      ) &&
      isFiniteNumber(comparison.mdt05.scheduledHorizonDegrees) &&
      comparison.mdt05.scheduledHorizonDegrees >= -90 &&
      comparison.mdt05.scheduledHorizonDegrees <= 90 &&
      isFiniteNumber(comparison.mdt05.scheduledLimitingDistanceKilometres) &&
      comparison.mdt05.scheduledLimitingDistanceKilometres > 0 &&
      comparison.mdt05.scheduledLimitingDistanceKilometres <=
        maximumHorizonDistanceKilometres &&
      isFiniteNumber(comparison.mdt05.samplingSensitivityDegrees) &&
      Math.abs(
        comparison.mdt05.samplingSensitivityDegrees -
          round(
            comparison.mdt05.scheduledHorizonDegrees -
              comparison.mdt05.horizonAltitudeDegrees,
          ),
      ) <= 0.000002
        ),
    )
    .map((comparison) => comparison.pointId);
  if (invalidRawHorizonPointIds.length > 0) {
    throw new Error(
      `Horizon comparison contains invalid raw values: ${invalidRawHorizonPointIds.join(", ")}.`,
    );
  }
  const derivedHorizonResiduals = horizonComparisons.map(
    (comparison) =>
      comparison.terrainRgb.horizonAltitudeDegrees -
      comparison.mdt05.horizonAltitudeDegrees,
  );
  const storedHorizonResidualsValid = horizonComparisons.every(
    (comparison, index) =>
      comparison.residuals?.groundElevationMetres ===
        round(
          comparison.terrainRgb.groundElevationMetres -
            comparison.mdt05.groundElevationMetres,
        ) &&
      comparison.residuals?.observerElevationMetres ===
        round(
          comparison.terrainRgb.observerElevationMetres -
            comparison.mdt05.observerElevationMetres,
        ) &&
      comparison.residuals?.horizonDegrees ===
        round(derivedHorizonResiduals[index]),
  );
  if (!storedHorizonResidualsValid) {
    throw new Error(
      "Stored horizon residuals do not match the raw comparison values.",
    );
  }
  const terrainRgbToMdt05Horizon =
    horizonComparisons.length >= acceptance.minimumMdt05ComparisonCount &&
    horizonComparisonIds.size === horizonComparisons.length &&
    horizonComparisons.length === expectedHorizonPoints.size &&
    horizonComparisons.every((comparison, index) => {
      const expected = expectedHorizonPoints.get(comparison.pointId);
      const residual = derivedHorizonResiduals[index];
      return (
        expected &&
        comparison.azimuthDegrees === expected.referenceAzimuthDegrees &&
        isFiniteNumber(residual) &&
        Math.abs(residual) <=
          thresholds.terrainRgbToMdt05HorizonAbsoluteDegrees
      );
    });

  const expectedNearbyPairs = new Map(
    requireArray(
      validationPoints.nearbyHorizonPairs,
      "validation points nearbyHorizonPairs",
    ).map((pair) => [pair.id, pair]),
  );
  const nearbyComparisons = requireArray(
    report.horizons?.nearbyComparisons,
    "horizons.nearbyComparisons",
  );
  const horizonComparisonByPointId = new Map(
    horizonComparisons.map((comparison) => [comparison.pointId, comparison]),
  );
  const validationPointById = new Map(
    points.map((point) => [point.id, point]),
  );
  const nearbyPairIds = new Set(
    nearbyComparisons.map((comparison) => comparison.pairId),
  );
  const nearbyHorizonDifferential =
    nearbyComparisons.length >= acceptance.minimumNearbyHorizonPairCount &&
    nearbyComparisons.length === expectedNearbyPairs.size &&
    nearbyPairIds.size === nearbyComparisons.length &&
    nearbyComparisons.every((comparison) => {
      const expected = expectedNearbyPairs.get(comparison.pairId);
      if (
        !expected ||
        comparison.leftPointId !== expected.leftPointId ||
        comparison.rightPointId !== expected.rightPointId
      ) {
        return false;
      }
      const leftPoint = validationPointById.get(expected.leftPointId);
      const rightPoint = validationPointById.get(expected.rightPointId);
      const left = horizonComparisonByPointId.get(expected.leftPointId);
      const right = horizonComparisonByPointId.get(expected.rightPointId);
      if (!leftPoint || !rightPoint || !left || !right) return false;
      const separationMetres = round(
        distanceMetres(
          leftPoint.latitude,
          leftPoint.longitude,
          rightPoint.latitude,
          rightPoint.longitude,
        ),
      );
      const terrainRgbDifferenceDegrees = round(
        right.terrainRgb.horizonAltitudeDegrees -
          left.terrainRgb.horizonAltitudeDegrees,
      );
      const mdt05DifferenceDegrees = round(
        right.mdt05.horizonAltitudeDegrees - left.mdt05.horizonAltitudeDegrees,
      );
      const differentialResidualDegrees = round(
        terrainRgbDifferenceDegrees - mdt05DifferenceDegrees,
      );
      return (
        isFiniteNumber(comparison.separationMetres) &&
        comparison.separationMetres === separationMetres &&
        separationMetres <= expected.maximumSeparationMetres &&
        isFiniteNumber(comparison.terrainRgbDifferenceDegrees) &&
        comparison.terrainRgbDifferenceDegrees === terrainRgbDifferenceDegrees &&
        isFiniteNumber(comparison.mdt05DifferenceDegrees) &&
        comparison.mdt05DifferenceDegrees === mdt05DifferenceDegrees &&
        isFiniteNumber(comparison.differentialResidualDegrees) &&
        comparison.differentialResidualDegrees === differentialResidualDegrees &&
        Math.abs(differentialResidualDegrees) <=
          thresholds.nearbyHorizonDifferentialAbsoluteDegrees
      );
    });

  const releaseEvidence = await verifyReleaseEvidence(report);
  const officialAstronomySourceCount =
    report.astronomy?.independentReference?.sha256 ===
      fixtureManifest.officialAstronomyFixture.sha256 &&
    fixtureChecks.some(
      (fixture) =>
        fixture.expectedSha256 === fixtureManifest.officialAstronomyFixture.sha256 &&
        fixture.actualSha256 === fixture.expectedSha256,
    )
      ? 1
      : 0;
  const evidence = {
    reproducibleFrozenBuild:
      typeof report.environment?.gitCommit === "string" &&
      report.environment.gitCommit.length > 0 &&
      commandOutput("git", [
        "merge-base",
        "--is-ancestor",
        report.environment.gitCommit,
        "HEAD",
      ]) !== null &&
      report.environment.gitClean === true &&
      commandOutput("git", ["status", "--porcelain=v1"]) === "",
    validationSample,
    productReferenceCoverage,
    astronomyNumericalThresholds,
    astronomyExactInputAlignment,
    independentAstronomySourceCount:
      officialAstronomySourceCount +
      countVerifiedArtifacts(
        releaseEvidence,
        "independentAstronomyComparisons",
      ),
    terrainRgbDecodeAndAddressing,
    terrainRgbToMdt05Horizon,
    nearbyHorizonDifferential,
    fieldHorizonComparisonCount: countVerifiedArtifacts(
      releaseEvidence,
      "fieldHorizonComparisons",
    ),
    independentReviewCount: countVerifiedArtifacts(
      releaseEvidence,
      "independentReviews",
    ),
    exactVenueCount: countVerifiedArtifacts(releaseEvidence, "exactVenues"),
    currentWeatherArtifactCount: countVerifiedArtifacts(
      releaseEvidence,
      "currentWeatherArtifacts",
    ),
    freshOperationsReviewCount: countVerifiedArtifacts(
      releaseEvidence,
      "freshOperationsReviews",
    ),
    documentedClearanceCount: countVerifiedArtifacts(
      releaseEvidence,
      "documentedClearances",
    ),
  };
  return {
    reportIntegrity: "valid",
    recommendationReadiness: evaluateRecommendationReadiness(
      evidence,
      acceptance,
    ),
    metrics: {
      validationPointCount: points.length,
      astronomyComparisonCount: astronomyComparisons.length,
      maximumContactResidualSeconds: maximumAbsolute(contactResiduals),
      maximumMaximumResidualSeconds: maximumAbsolute(maximumResiduals),
      maximumTotalityDurationResidualSeconds: maximumAbsolute(durationResiduals),
      maximumObscurationResidual: maximumAbsolute(obscurationResiduals),
      maximumSolarAltitudeResidualDegrees: maximumAbsolute(altitudeResiduals),
      maximumSolarAzimuthResidualDegrees: maximumAbsolute(azimuthResiduals),
      mdt05ComparisonCount: horizonComparisons.length,
      maximumMdt05HorizonResidualDegrees: maximumAbsolute(
        derivedHorizonResiduals.filter(isFiniteNumber),
      ),
      nearbyHorizonPairCount: nearbyComparisons.length,
      maximumNearbyHorizonDifferentialResidualDegrees: maximumAbsolute(
        nearbyComparisons
          .map((comparison) => comparison.differentialResidualDegrees)
          .filter(isFiniteNumber),
      ),
    },
  };
}

export async function verifyStoredScientificReport() {
  const reportBytes = await readFile(path.join(root, REPORT_PATH));
  const checksum = await readJson(CHECKSUM_PATH);
  if (
    checksum?.schemaVersion !== 2 ||
    checksum.file !== REPORT_PATH ||
    checksum.bytes !== reportBytes.byteLength ||
    checksum.sha256 !== sha256(reportBytes)
  ) {
    throw new Error("Scientific verification checksum is stale or invalid.");
  }
  const report = JSON.parse(reportBytes.toString("utf8"));
  return { report, result: await evaluateScientificReport(report) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { result } = await verifyStoredScientificReport();
  console.log(`Scientific verification report: ${result.reportIntegrity}`);
  console.log(
    `Recommendation readiness: ${result.recommendationReadiness.status.replace("-", " ")}`,
  );
  console.log(
    `Unmet requirements: ${result.recommendationReadiness.unmetRequirements.join(", ") || "none"}`,
  );
  if (
    process.argv.includes("--require-release") &&
    !result.recommendationReadiness.permitted
  ) {
    process.exitCode = 1;
  }
}
