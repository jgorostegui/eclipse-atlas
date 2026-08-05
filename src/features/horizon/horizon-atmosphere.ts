export type HorizonAtmosphere = {
  skyUpper: string;
  skyMiddle: string;
  skyLower: string;
  ridgeLight: string;
  sunGlow: string;
  ridgeOpacity: number;
  glowOpacity: number;
};

type AtmosphereStop = HorizonAtmosphere & {
  altitudeDegrees: number;
};

const ATMOSPHERE_STOPS: readonly AtmosphereStop[] = [
  {
    altitudeDegrees: -4,
    skyUpper: "#071323",
    skyMiddle: "#18243a",
    skyLower: "#8c4c43",
    ridgeLight: "#d58958",
    sunGlow: "#ed9b5a",
    ridgeOpacity: 0.38,
    glowOpacity: 0.32,
  },
  {
    altitudeDegrees: 0,
    skyUpper: "#0d2038",
    skyMiddle: "#31465d",
    skyLower: "#c87554",
    ridgeLight: "#efaa68",
    sunGlow: "#f7b86f",
    ridgeOpacity: 0.58,
    glowOpacity: 0.46,
  },
  {
    altitudeDegrees: 8,
    skyUpper: "#153b5d",
    skyMiddle: "#547793",
    skyLower: "#d49b69",
    ridgeLight: "#f0bd83",
    sunGlow: "#f5c988",
    ridgeOpacity: 0.48,
    glowOpacity: 0.38,
  },
  {
    altitudeDegrees: 18,
    skyUpper: "#47789a",
    skyMiddle: "#8faebe",
    skyLower: "#e5b881",
    ridgeLight: "#f1c895",
    sunGlow: "#f8d99d",
    ridgeOpacity: 0.34,
    glowOpacity: 0.24,
  },
] as const;

function parseHexColour(value: string) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (!match) throw new Error(`Invalid horizon colour: ${value}`);
  return match.slice(1).map((channel) => Number.parseInt(channel, 16));
}

function interpolateColour(from: string, to: string, ratio: number) {
  const start = parseHexColour(from);
  const end = parseHexColour(to);
  const channels = start.map((channel, index) =>
    Math.round(channel + (end[index] - channel) * ratio),
  );
  return `#${channels
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function interpolateNumber(from: number, to: number, ratio: number) {
  return from + (to - from) * ratio;
}

export function horizonAtmosphereAtSolarAltitude(
  altitudeDegrees: number,
): HorizonAtmosphere {
  if (!Number.isFinite(altitudeDegrees)) {
    throw new RangeError("Solar altitude must be finite.");
  }

  const first = ATMOSPHERE_STOPS[0];
  const last = ATMOSPHERE_STOPS.at(-1)!;
  if (altitudeDegrees <= first.altitudeDegrees) return { ...first };
  if (altitudeDegrees >= last.altitudeDegrees) return { ...last };

  const upperIndex = ATMOSPHERE_STOPS.findIndex(
    (stop) => stop.altitudeDegrees >= altitudeDegrees,
  );
  const lower = ATMOSPHERE_STOPS[upperIndex - 1];
  const upper = ATMOSPHERE_STOPS[upperIndex];
  const ratio =
    (altitudeDegrees - lower.altitudeDegrees) /
    (upper.altitudeDegrees - lower.altitudeDegrees);

  return {
    skyUpper: interpolateColour(lower.skyUpper, upper.skyUpper, ratio),
    skyMiddle: interpolateColour(lower.skyMiddle, upper.skyMiddle, ratio),
    skyLower: interpolateColour(lower.skyLower, upper.skyLower, ratio),
    ridgeLight: interpolateColour(
      lower.ridgeLight,
      upper.ridgeLight,
      ratio,
    ),
    sunGlow: interpolateColour(lower.sunGlow, upper.sunGlow, ratio),
    ridgeOpacity: interpolateNumber(
      lower.ridgeOpacity,
      upper.ridgeOpacity,
      ratio,
    ),
    glowOpacity: interpolateNumber(
      lower.glowOpacity,
      upper.glowOpacity,
      ratio,
    ),
  };
}
