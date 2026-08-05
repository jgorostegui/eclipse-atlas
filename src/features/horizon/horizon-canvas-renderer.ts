import type { EclipseAnimationSample } from "../../domain/eclipse";
import {
  solarDiscAzimuthHalfWidthDegrees,
  type TerrainHorizon,
} from "../../domain/terrain-horizon";
import {
  mergeAnimationTerrainProfile,
  signedAzimuthDifference,
  terrainAltitudeAtAzimuth,
} from "./horizon-animation-model";
import { horizonAtmosphereAtSolarAltitude } from "./horizon-atmosphere";
import {
  createHorizonSceneModel,
  fitHorizonBoundsToAspect,
  horizonChartViewBounds,
  horizonTerrainSignature,
  type OrthographicViewBounds,
} from "./horizon-scene-model";

export type HorizonPhase = "partial" | "total" | "annular";

export type HorizonNumberFormatter = (
  value: number,
  options?: Intl.NumberFormatOptions,
) => string;

type CanvasPoint = { x: number; y: number };
type CanvasDisc = CanvasPoint & { radiusX: number; radiusY: number };

export type HorizonCanvasScene = {
  width: number;
  height: number;
  bounds: OrthographicViewBounds;
  terrain: CanvasPoint[];
  track: CanvasPoint[];
  sun: CanvasDisc;
  moon: CanvasDisc;
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
}: {
  track: EclipseAnimationSample[];
  sample: EclipseAnimationSample;
  horizon: TerrainHorizon;
  width: number;
  height: number;
  isMaximum: boolean;
}): HorizonCanvasScene {
  if (width <= 0 || height <= 0) {
    throw new RangeError("Canvas dimensions must be positive.");
  }
  const model = createHorizonSceneModel(track, horizon);
  const bounds = fitHorizonBoundsToAspect(
    horizonChartViewBounds(model, 0.45, 0.45),
    width / height,
  );
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
  const insetWidth = compact
    ? Math.min(126, width * 0.32)
    : Math.min(164, width * 0.23);
  const insetHeight = compact ? 108 : 138;
  const insetX = width - insetWidth - (compact ? 10 : 16);
  const insetY = compact ? 10 : 16;
  const insetSunRadius = Math.min(insetWidth * 0.3, insetHeight * 0.34);
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
    ? terrainAltitudeAtAzimuth(
        mergeAnimationTerrainProfile(horizon),
        assessment.limitingTerrainAzimuthDegrees,
      )
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
    })),
    track: track.map((point) => ({
      x: x(
        signedAzimuthDifference(
          point.sunAzimuthDegrees,
          model.centreAzimuthDegrees,
        ),
      ),
      y: y(point.sunAltitudeDegrees),
    })),
    sun: projectDisc(
      sample.sunAltitudeDegrees,
      sample.sunAzimuthDegrees,
      sample.sunAngularRadiusDegrees,
    ),
    moon: projectDisc(
      sample.moonAltitudeDegrees,
      sample.moonAzimuthDegrees,
      sample.moonAngularRadiusDegrees,
    ),
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
    formatNumber,
  }: {
    phase: HorizonPhase;
    discInsetLabel: string;
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

  drawEllipseGlow(
    context,
    scene.sun.x,
    scene.sun.y,
    Math.max(90, width * 0.16),
    Math.max(58, height * 0.16),
    atmosphere.sunGlow,
    atmosphere.glowOpacity,
  );

  context.save();
  context.font = `600 ${width < 560 ? 10 : 11}px "IBM Plex Mono", monospace`;
  context.textBaseline = "middle";
  for (
    let altitude = Math.ceil(scene.bounds.bottom / 4) * 4;
    altitude <= scene.bounds.top;
    altitude += 4
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
    if (y > 14 && y < height - 16) {
      context.fillStyle = "rgba(242,246,247,0.78)";
      context.fillText(`${formatNumber(altitude)}°`, 9, y - 9);
    }
  }
  context.restore();

  if (scene.track.length > 1) {
    context.save();
    context.beginPath();
    context.setLineDash([3, 6]);
    context.strokeStyle = "rgba(255,218,148,0.64)";
    context.lineWidth = 1.3;
    scene.track.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();
    context.restore();
  }

  context.save();
  context.fillStyle = "#ffd46d";
  context.strokeStyle = "rgba(255,244,204,0.9)";
  context.lineWidth = 1;
  context.beginPath();
  context.ellipse(
    scene.sun.x,
    scene.sun.y,
    scene.sun.radiusX,
    scene.sun.radiusY,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.stroke();
  context.fillStyle = "#07111f";
  context.strokeStyle = "rgba(220,231,238,0.44)";
  context.beginPath();
  context.ellipse(
    scene.moon.x,
    scene.moon.y,
    scene.moon.radiusX,
    scene.moon.radiusY,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.stroke();
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
  context.restore();

  if (scene.bracket) {
    const blocked = scene.bracket.intersection !== "fully-clear";
    context.save();
    context.strokeStyle = blocked ? "#ff8d7b" : "rgba(240,245,246,0.88)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(scene.bracket.x, scene.bracket.terrainY);
    context.lineTo(scene.bracket.x, scene.bracket.lowerSolarEdgeY);
    context.moveTo(scene.bracket.x - 6, scene.bracket.terrainY);
    context.lineTo(scene.bracket.x + 6, scene.bracket.terrainY);
    context.moveTo(scene.bracket.x - 6, scene.bracket.lowerSolarEdgeY);
    context.lineTo(scene.bracket.x + 6, scene.bracket.lowerSolarEdgeY);
    context.stroke();
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
  context.fillText(
    discInsetLabel,
    inset.centreX,
    inset.y + inset.height - 9,
    inset.width - 12,
  );
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
