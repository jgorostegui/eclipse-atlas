import type { EclipseAnimationSample } from "../../domain/eclipse";
import {
  solarDiscAzimuthHalfWidthDegrees,
  type TerrainHorizon,
} from "../../domain/terrain-horizon";
import {
  createTerrainAltitudeLookup,
  mergeAnimationTerrainProfile,
  signedAzimuthDifference,
} from "./horizon-animation-model";
import { horizonAtmosphereAtSolarAltitude } from "./horizon-atmosphere";
import {
  createHorizonSceneModel,
  horizonChartViewBounds,
  horizonTerrainSignature,
  type OrthographicViewBounds,
} from "./horizon-scene-model";
import type { CalculatedCelestialObject } from "./celestial-context";

export type HorizonPhase = "partial" | "total" | "annular";

export type HorizonNumberFormatter = (
  value: number,
  options?: Intl.NumberFormatOptions,
) => string;

type CanvasPoint = { x: number; y: number };
type CanvasDisc = CanvasPoint & { radiusX: number; radiusY: number };
type CanvasTerrainPoint = CanvasPoint & { distanceKilometres: number };
type CanvasTrackPoint = CanvasPoint & { terrainVisible: boolean };
type CanvasCelestialObject = CanvasPoint &
  CalculatedCelestialObject & { label: string };

export type LabelledCelestialObject = CalculatedCelestialObject & {
  label: string;
};

export type HorizonCanvasScene = {
  width: number;
  height: number;
  bounds: OrthographicViewBounds;
  terrain: CanvasTerrainPoint[];
  track: CanvasTrackPoint[];
  celestialObjects: CanvasCelestialObject[];
  sun: CanvasDisc;
  moon: CanvasDisc;
  displaySun: CanvasDisc;
  displayMoon: CanvasDisc;
  displayMagnification: number;
  inset: {
    x: number;
    y: number;
    width: number;
    height: number;
    centreX: number;
    centreY: number;
    sunRadius: number;
    moonX: number;
    moonY: number;
    moonRadius: number;
  };
  bracket: {
    x: number;
    terrainY: number;
    lowerSolarEdgeY: number;
    intersection: NonNullable<TerrainHorizon["solarDiscAssessment"]>["intersection"];
  } | null;
  atmosphere: ReturnType<typeof horizonAtmosphereAtSolarAltitude>;
  terrainSignature: string;
  minimumAzimuthDegrees: number;
  maximumAzimuthDegrees: number;
};

function normaliseAzimuth(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

function hexToRgba(hex: string, alpha: number) {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function createHorizonCanvasScene({
  track,
  sample,
  horizon,
  width,
  height,
  isMaximum,
  celestialObjects = [],
}: {
  track: EclipseAnimationSample[];
  sample: EclipseAnimationSample;
  horizon: TerrainHorizon;
  width: number;
  height: number;
  isMaximum: boolean;
  celestialObjects?: readonly LabelledCelestialObject[];
}): HorizonCanvasScene {
  if (width <= 0 || height <= 0) {
    throw new RangeError("Canvas dimensions must be positive.");
  }
  const model = createHorizonSceneModel(track, horizon);
  const mergedTerrain = mergeAnimationTerrainProfile(horizon);
  const terrainAltitudeAt = createTerrainAltitudeLookup(mergedTerrain);
  // This is a fitted planning chart rather than a literal camera field of
  // view. Independent axes let the complete calculated terrain sweep occupy
  // the available width while the full C1-C4 altitude range remains visible.
  const bounds = horizonChartViewBounds(model, 0, 0.45);
  const x = (relativeAzimuthDegrees: number) =>
    ((relativeAzimuthDegrees - bounds.left) / (bounds.right - bounds.left)) *
    width;
  const y = (altitudeDegrees: number) =>
    ((bounds.top - altitudeDegrees) / (bounds.top - bounds.bottom)) * height;
  const verticalRadius = (radiusDegrees: number) =>
    (radiusDegrees / (bounds.top - bounds.bottom)) * height;
  const horizontalRadius = (
    altitudeDegrees: number,
    azimuthDegrees: number,
    radiusDegrees: number,
  ) =>
    (solarDiscAzimuthHalfWidthDegrees({
      centreAltitudeDegrees: altitudeDegrees,
      centreAzimuthDegrees: azimuthDegrees,
      angularRadiusDegrees: radiusDegrees,
    }) /
      (bounds.right - bounds.left)) *
    width;
  const projectDisc = (
    altitudeDegrees: number,
    azimuthDegrees: number,
    radiusDegrees: number,
  ): CanvasDisc => ({
    x: x(signedAzimuthDifference(azimuthDegrees, model.centreAzimuthDegrees)),
    y: y(altitudeDegrees),
    radiusX: horizontalRadius(
      altitudeDegrees,
      azimuthDegrees,
      radiusDegrees,
    ),
    radiusY: verticalRadius(radiusDegrees),
  });
  const compact = width < 560;
  const sun = projectDisc(
    sample.sunAltitudeDegrees,
    sample.sunAzimuthDegrees,
    sample.sunAngularRadiusDegrees,
  );
  const moon = projectDisc(
    sample.moonAltitudeDegrees,
    sample.moonAzimuthDegrees,
    sample.moonAngularRadiusDegrees,
  );
  // The true half-degree discs are illegible beside the full eclipse path.
  // Magnify the pair around the Sun's exact chart centre, preserving their
  // angular size ratio and relative phase geometry. The UI labels this
  // presentation explicitly; terrain clearance still uses the raw model.
  const displaySunRadius = compact ? 12 : 15;
  const displayMagnification =
    displaySunRadius / Math.max(0.000_001, sun.radiusY);
  const displayAngularScale =
    displaySunRadius / sample.sunAngularRadiusDegrees;
  const displaySun: CanvasDisc = {
    x: sun.x,
    y: sun.y,
    radiusX: displaySunRadius,
    radiusY: displaySunRadius,
  };
  const displayMoon: CanvasDisc = {
    x:
      sun.x +
      signedAzimuthDifference(
        sample.moonAzimuthDegrees,
        sample.sunAzimuthDegrees,
      ) *
        Math.cos((sample.sunAltitudeDegrees * Math.PI) / 180) *
        displayAngularScale,
    y:
      sun.y -
      (sample.moonAltitudeDegrees - sample.sunAltitudeDegrees) *
        displayAngularScale,
    radiusX: sample.moonAngularRadiusDegrees * displayAngularScale,
    radiusY: sample.moonAngularRadiusDegrees * displayAngularScale,
  };
  const shortChart = height < 220;
  const insetWidth = shortChart
    ? Math.min(82, width * 0.23)
    : compact
      ? Math.min(108, width * 0.29)
      : Math.min(146, width * 0.21);
  const insetHeight = shortChart ? 70 : compact ? 92 : 120;
  const insetX = width - insetWidth - (shortChart ? 7 : compact ? 10 : 16);
  const insetY = shortChart ? 7 : compact ? 10 : 16;
  const insetSunRadius = Math.min(insetWidth * 0.28, insetHeight * 0.3);
  const insetCentreX = insetX + insetWidth / 2;
  const insetCentreY = insetY + insetHeight * 0.42;
  const insetScale = insetSunRadius / sample.sunAngularRadiusDegrees;
  const insetMoonX =
    insetCentreX +
    signedAzimuthDifference(
      sample.moonAzimuthDegrees,
      sample.sunAzimuthDegrees,
    ) *
      Math.cos((sample.sunAltitudeDegrees * Math.PI) / 180) *
      insetScale;
  const insetMoonY =
    insetCentreY -
    (sample.moonAltitudeDegrees - sample.sunAltitudeDegrees) * insetScale;
  const assessment = horizon.solarDiscAssessment;
  const limitingTerrainAltitude = assessment
    ? terrainAltitudeAt(assessment.limitingTerrainAzimuthDegrees)
    : null;
  const bracket =
    isMaximum && assessment && limitingTerrainAltitude !== null
      ? {
          x: x(
            signedAzimuthDifference(
              assessment.limitingTerrainAzimuthDegrees,
              model.centreAzimuthDegrees,
            ),
          ),
          terrainY: y(limitingTerrainAltitude),
          lowerSolarEdgeY: y(
            limitingTerrainAltitude + assessment.fullDiscClearanceDegrees,
          ),
          intersection: assessment.intersection,
        }
      : null;

  return {
    width,
    height,
    bounds,
    terrain: model.terrain.map((point) => ({
      x: x(point.relativeAzimuthDegrees),
      y: y(point.altitudeDegrees),
      distanceKilometres: point.limitingDistanceKilometres,
    })),
    track: track.map((point) => ({
      x: x(
        signedAzimuthDifference(
          point.sunAzimuthDegrees,
          model.centreAzimuthDegrees,
        ),
      ),
      y: y(point.sunAltitudeDegrees),
      terrainVisible: (() => {
        const terrainAltitude = terrainAltitudeAt(point.sunAzimuthDegrees);
        return (
          terrainAltitude !== null &&
          point.sunAltitudeDegrees + point.sunAngularRadiusDegrees > terrainAltitude
        );
      })(),
    })),
    celestialObjects: celestialObjects.map((object) => ({
      ...object,
      x: x(
        signedAzimuthDifference(
          object.azimuthDegrees,
          model.centreAzimuthDegrees,
        ),
      ),
      y: y(object.altitudeDegrees),
    })),
    sun,
    moon,
    displaySun,
    displayMoon,
    displayMagnification,
    inset: {
      x: insetX,
      y: insetY,
      width: insetWidth,
      height: insetHeight,
      centreX: insetCentreX,
      centreY: insetCentreY,
      sunRadius: insetSunRadius,
      moonX: insetMoonX,
      moonY: insetMoonY,
      moonRadius: sample.moonAngularRadiusDegrees * insetScale,
    },
    bracket,
    atmosphere: horizonAtmosphereAtSolarAltitude(sample.sunAltitudeDegrees),
    terrainSignature: horizonTerrainSignature(model),
    minimumAzimuthDegrees: normaliseAzimuth(
      model.centreAzimuthDegrees + model.minimumRelativeAzimuthDegrees,
    ),
    maximumAzimuthDegrees: normaliseAzimuth(
      model.centreAzimuthDegrees + model.maximumRelativeAzimuthDegrees,
    ),
  };
}

function roundedRectangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const boundedRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + boundedRadius, y);
  context.arcTo(x + width, y, x + width, y + height, boundedRadius);
  context.arcTo(
    x + width,
    y + height,
    x,
    y + height,
    boundedRadius,
  );
  context.arcTo(x, y + height, x, y, boundedRadius);
  context.arcTo(x, y, x + width, y, boundedRadius);
  context.closePath();
}

function drawEllipseGlow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  colour: string,
  opacity: number,
) {
  context.save();
  context.translate(x, y);
  context.scale(radiusX, radiusY);
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, hexToRgba(colour, opacity));
  gradient.addColorStop(0.28, hexToRgba(colour, opacity * 0.7));
  gradient.addColorStop(1, hexToRgba(colour, 0));
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, 1, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function paintHorizonCanvas(
  context: CanvasRenderingContext2D,
  scene: HorizonCanvasScene,
  {
    phase,
    discInsetLabel,
    limitingTerrainLabel,
    formatNumber,
  }: {
    phase: HorizonPhase;
    discInsetLabel: string;
    limitingTerrainLabel: string | null;
    formatNumber: HorizonNumberFormatter;
  },
) {
  const { width, height, atmosphere } = scene;
  context.clearRect(0, 0, width, height);

  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, atmosphere.skyUpper);
  sky.addColorStop(0.58, atmosphere.skyMiddle);
  sky.addColorStop(1, atmosphere.skyLower);
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const zeroAltitudeY =
    ((scene.bounds.top - 0) / (scene.bounds.top - scene.bounds.bottom)) *
    height;
  const horizonHaze = context.createLinearGradient(
    0,
    Math.max(0, zeroAltitudeY - Math.max(70, height * 0.18)),
    0,
    Math.min(height, zeroAltitudeY + 18),
  );
  horizonHaze.addColorStop(0, "rgba(244,185,64,0)");
  horizonHaze.addColorStop(0.72, "rgba(244,185,64,0.08)");
  horizonHaze.addColorStop(1, "rgba(255,217,145,0.18)");
  context.fillStyle = horizonHaze;
  context.fillRect(0, 0, width, height);

  drawEllipseGlow(
    context,
    scene.displaySun.x,
    scene.displaySun.y,
    Math.max(90, width * 0.16),
    Math.max(58, height * 0.16),
    atmosphere.sunGlow,
    atmosphere.glowOpacity,
  );

  context.save();
  context.font = `600 ${width < 560 ? 10 : 11}px "IBM Plex Mono", monospace`;
  context.textBaseline = "middle";
  const altitudeStep = height < 220 ? 8 : 4;
  for (
    let altitude = Math.ceil(scene.bounds.bottom / altitudeStep) * altitudeStep;
    altitude <= scene.bounds.top;
    altitude += altitudeStep
  ) {
    const y =
      ((scene.bounds.top - altitude) /
        (scene.bounds.top - scene.bounds.bottom)) *
      height;
    context.beginPath();
    context.strokeStyle =
      altitude === 0 ? "rgba(245,247,246,0.46)" : "rgba(236,242,244,0.13)";
    context.lineWidth = altitude === 0 ? 1.25 : 1;
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
    if (y > 14 && y < height - (altitude === 0 ? 4 : 16)) {
      context.fillStyle = "rgba(242,246,247,0.78)";
      context.fillText(
        `${formatNumber(altitude === 0 ? 0 : altitude)}°`,
        9,
        y - (altitude === 0 ? 22 : 9),
      );
    }
  }
  context.restore();

  if (scene.track.length > 1) {
    context.save();
    context.beginPath();
    scene.track.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.setLineDash([3, 6]);
    context.strokeStyle = "rgba(202,214,220,0.34)";
    context.lineWidth = 1.2;
    context.stroke();
    context.beginPath();
    for (let index = 1; index < scene.track.length; index += 1) {
      const previous = scene.track[index - 1];
      const current = scene.track[index];
      if (!previous.terrainVisible || !current.terrainVisible) continue;
      context.moveTo(previous.x, previous.y);
      context.lineTo(current.x, current.y);
    }
    context.setLineDash([]);
    context.strokeStyle = "rgba(255,194,85,0.14)";
    context.lineWidth = width < 560 ? 5 : 7;
    context.shadowColor = "rgba(255,190,73,0.3)";
    context.shadowBlur = width < 560 ? 8 : 13;
    context.stroke();
    context.shadowBlur = 0;
    context.setLineDash([3, 6]);
    context.strokeStyle = "rgba(255,226,166,0.82)";
    context.lineWidth = 1.4;
    context.stroke();
    context.restore();
  }

  if (scene.celestialObjects.length > 0) {
    context.save();
    context.textBaseline = "middle";
    context.font = `400 ${width < 560 ? 9 : 10}px Manrope, sans-serif`;
    const occupiedLabels: Array<{
      left: number;
      right: number;
      top: number;
      bottom: number;
    }> = [
      { left: 0, right: width < 560 ? 100 : 112, top: 0, bottom: 54 },
      {
        left: scene.inset.x - 4,
        right: scene.inset.x + scene.inset.width + 4,
        top: scene.inset.y - 4,
        bottom: scene.inset.y + scene.inset.height + 4,
      },
      {
        left: scene.displaySun.x - scene.displaySun.radiusX - 9,
        right: scene.displaySun.x + scene.displaySun.radiusX + 9,
        top: scene.displaySun.y - scene.displaySun.radiusY - 9,
        bottom: scene.displaySun.y + scene.displaySun.radiusY + 9,
      },
    ];
    for (const object of scene.celestialObjects) {
      if (
        object.x < 12 ||
        object.x > width - 12 ||
        object.y < 12 ||
        object.y > height - 18
      ) {
        continue;
      }
      const radius =
        object.kind === "star"
          ? 1.7
          : Math.max(
              2.1,
              Math.min(4.2, 3.3 - (object.magnitude ?? 1) * 0.35),
            );
      context.beginPath();
      context.arc(object.x, object.y, radius, 0, Math.PI * 2);
      context.fillStyle = object.kind === "star" ? "#f3f6ff" : "#ffd46d";
      context.shadowColor = context.fillStyle;
      context.shadowBlur = object.kind === "star" ? 5 : 8;
      context.fill();
      context.shadowBlur = 0;
      const measuredWidth = context.measureText(object.label).width;
      const sidePlacements = [
        { x: object.x + radius + 5, y: object.y },
        { x: object.x - measuredWidth - radius - 5, y: object.y },
      ];
      const verticalPlacements = [
        { x: object.x - measuredWidth / 2, y: object.y - 12 },
        { x: object.x - measuredWidth / 2, y: object.y + 12 },
      ];
      const placements =
        object.kind === "star"
          ? [...verticalPlacements, ...sidePlacements]
          : [...sidePlacements, ...verticalPlacements];
      const placement = placements.find(({ x: labelX, y: labelY }) => {
        const labelBox = {
          left: labelX - 5,
          right: labelX + measuredWidth + 5,
          top: labelY - 7,
          bottom: labelY + 7,
        };
        return (
          labelBox.left >= 5 &&
          labelBox.right <= width - 5 &&
          labelBox.top >= 5 &&
          labelBox.bottom <= height - 5 &&
          !occupiedLabels.some(
            (box) =>
              labelBox.left < box.right &&
              labelBox.right > box.left &&
              labelBox.top < box.bottom &&
              labelBox.bottom > box.top,
          )
        );
      });
      if (!placement) continue;
      const labelX = placement.x;
      const labelY = placement.y;
      const labelBox = {
        left: labelX - 5,
        right: labelX + measuredWidth + 5,
        top: labelY - 7,
        bottom: labelY + 7,
      };
      occupiedLabels.push(labelBox);
      context.lineWidth = 1.5;
      context.strokeStyle = "rgba(7,17,31,0.5)";
      context.strokeText(object.label, labelX, labelY);
      context.fillStyle =
        object.kind === "star"
          ? "rgba(241,245,252,0.86)"
          : "rgba(255,239,198,0.95)";
      context.fillText(object.label, labelX, labelY);
    }
    context.restore();
  }

  const displaySun = scene.displaySun;
  const displayMoon = scene.displayMoon;
  if (phase === "total") {
    drawEllipseGlow(
      context,
      displaySun.x,
      displaySun.y,
      displaySun.radiusX * 3.2,
      displaySun.radiusY * 3.2,
      "#f7ecce",
      0.72,
    );
  }
  context.save();
  const sunFill = context.createRadialGradient(
    displaySun.x - displaySun.radiusX * 0.28,
    displaySun.y - displaySun.radiusY * 0.3,
    displaySun.radiusX * 0.08,
    displaySun.x,
    displaySun.y,
    displaySun.radiusX,
  );
  sunFill.addColorStop(0, "#fff4ba");
  sunFill.addColorStop(0.58, "#ffd46d");
  sunFill.addColorStop(1, "#e99a24");
  context.fillStyle = sunFill;
  context.strokeStyle = "rgba(255,244,204,0.9)";
  context.lineWidth = 1.2;
  context.shadowColor = "rgba(255,190,74,0.88)";
  context.shadowBlur = width < 560 ? 12 : 18;
  context.beginPath();
  context.ellipse(
    displaySun.x,
    displaySun.y,
    displaySun.radiusX,
    displaySun.radiusY,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.stroke();
  context.shadowBlur = 0;
  context.fillStyle = "#07111f";
  context.strokeStyle = "rgba(229,238,244,0.68)";
  context.beginPath();
  context.ellipse(
    displayMoon.x,
    displayMoon.y,
    displayMoon.radiusX,
    displayMoon.radiusY,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.stroke();
  if (phase === "total") {
    const coronaRadius =
      Math.max(displaySun.radiusX, displayMoon.radiusX) + 2.5;
    context.beginPath();
    context.arc(displaySun.x, displaySun.y, coronaRadius, 0, Math.PI * 2);
    context.strokeStyle = "rgba(255,247,220,0.94)";
    context.lineWidth = 1.8;
    context.shadowColor = "rgba(235,241,255,0.92)";
    context.shadowBlur = width < 560 ? 10 : 15;
    context.stroke();
  }
  context.restore();

  context.save();
  context.beginPath();
  context.moveTo(scene.terrain[0].x, height);
  scene.terrain.forEach((point) => context.lineTo(point.x, point.y));
  context.lineTo(scene.terrain.at(-1)!.x, height);
  context.closePath();
  const terrain = context.createLinearGradient(0, 0, 0, height);
  terrain.addColorStop(0, "#182638");
  terrain.addColorStop(1, "#050b13");
  context.fillStyle = terrain;
  context.fill();
  context.beginPath();
  scene.terrain.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.strokeStyle = "#03080e";
  context.lineWidth = 3;
  context.stroke();
  context.strokeStyle = hexToRgba(
    atmosphere.ridgeLight,
    atmosphere.ridgeOpacity,
  );
  context.lineWidth = 1.15;
  context.stroke();
  for (let index = 1; index < scene.terrain.length; index += 1) {
    const previous = scene.terrain[index - 1];
    const current = scene.terrain[index];
    const distanceFraction = Math.min(
      1,
      Math.max(
        0,
        (previous.distanceKilometres + current.distanceKilometres) / 200,
      ),
    );
    const red = Math.round(232 - distanceFraction * 48);
    const green = Math.round(180 + distanceFraction * 30);
    const blue = Math.round(105 + distanceFraction * 96);
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(current.x, current.y);
    context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${0.72 - distanceFraction * 0.24})`;
    context.lineWidth = 1.25;
    context.stroke();
  }
  context.restore();

  if (scene.bracket) {
    const blocked = scene.bracket.intersection !== "fully-clear";
    const bracketOffset = scene.displaySun.radiusX + 8;
    const bracketDirection =
      scene.bracket.x + bracketOffset <= width - 10 ? 1 : -1;
    const measurementX = Math.min(
      width - 10,
      Math.max(
        10,
        scene.bracket.x + bracketOffset * bracketDirection,
      ),
    );
    context.save();
    context.strokeStyle = blocked ? "#ff8d7b" : "rgba(240,245,246,0.66)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(measurementX, scene.bracket.terrainY);
    context.lineTo(measurementX, scene.bracket.lowerSolarEdgeY);
    context.moveTo(measurementX - 6, scene.bracket.terrainY);
    context.lineTo(measurementX + 6, scene.bracket.terrainY);
    context.moveTo(measurementX - 6, scene.bracket.lowerSolarEdgeY);
    context.lineTo(measurementX + 6, scene.bracket.lowerSolarEdgeY);
    context.stroke();
    if (limitingTerrainLabel) {
      context.font = `700 ${width < 560 ? 9 : 10}px "IBM Plex Mono", monospace`;
      const labelWidth = Math.min(
        width - 20,
        context.measureText(limitingTerrainLabel).width + 14,
      );
      const labelX = Math.min(
        width - labelWidth - 8,
        Math.max(8, scene.bracket.x - labelWidth / 2),
      );
      const labelY = Math.max(8, scene.bracket.terrainY - 31);
      context.beginPath();
      context.moveTo(scene.bracket.x, scene.bracket.terrainY - 2);
      context.lineTo(scene.bracket.x, labelY + 20);
      context.strokeStyle = "rgba(239,244,246,0.7)";
      context.lineWidth = 1;
      context.stroke();
      roundedRectangle(context, labelX, labelY, labelWidth, 20, 5);
      context.fillStyle = "rgba(5,13,25,0.86)";
      context.fill();
      context.fillStyle = "rgba(247,249,250,0.96)";
      context.textBaseline = "middle";
      context.fillText(limitingTerrainLabel, labelX + 7, labelY + 10);
    }
    context.restore();
  }

  const inset = scene.inset;
  context.save();
  roundedRectangle(
    context,
    inset.x,
    inset.y,
    inset.width,
    inset.height,
    9,
  );
  context.fillStyle = "rgba(5,13,25,0.93)";
  context.fill();
  context.clip();
  if (phase === "total") {
    drawEllipseGlow(
      context,
      inset.centreX,
      inset.centreY,
      inset.sunRadius * 1.75,
      inset.sunRadius * 1.75,
      "#e7f2ff",
      0.46,
    );
  }
  context.fillStyle = "#f7d57f";
  context.beginPath();
  context.arc(
    inset.centreX,
    inset.centreY,
    inset.sunRadius,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.fillStyle = "#07111f";
  context.strokeStyle = "rgba(226,235,241,0.38)";
  context.lineWidth = 1.25;
  context.beginPath();
  context.arc(
    inset.moonX,
    inset.moonY,
    inset.moonRadius,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.stroke();
  context.restore();

  context.save();
  roundedRectangle(
    context,
    inset.x,
    inset.y,
    inset.width,
    inset.height,
    9,
  );
  context.strokeStyle = "rgba(184,199,210,0.72)";
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = "rgba(245,247,248,0.94)";
  context.font = `700 ${width < 560 ? 9 : 11}px Manrope, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  if (width >= 350) {
    context.fillText(
      discInsetLabel,
      inset.centreX,
      inset.y + inset.height - 9,
      inset.width - 12,
    );
  }
  context.restore();

  context.save();
  context.fillStyle = "rgba(239,244,246,0.84)";
  context.font = `600 ${width < 560 ? 10 : 11}px "IBM Plex Mono", monospace`;
  context.textBaseline = "bottom";
  context.textAlign = "left";
  context.fillText(
    `${formatNumber(scene.minimumAzimuthDegrees, { maximumFractionDigits: 1 })}°`,
    9,
    height - 9,
  );
  context.textAlign = "right";
  context.fillText(
    `${formatNumber(scene.maximumAzimuthDegrees, { maximumFractionDigits: 1 })}°`,
    width - 9,
    height - 9,
  );
  context.restore();
}
