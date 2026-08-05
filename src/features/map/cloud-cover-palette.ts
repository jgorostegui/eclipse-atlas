export const CLOUD_COVER_COLOR_STOPS = [
  { percent: 0, color: "#edf8fb" },
  { percent: 25, color: "#b9dce7" },
  { percent: 50, color: "#75adc5" },
  { percent: 75, color: "#456f98" },
  { percent: 100, color: "#243f65" },
] as const;

export const UNKNOWN_CLOUD_COVER_COLOR = "#52616c";

export const CLOUD_COVER_LEGEND_GRADIENT = `linear-gradient(90deg, ${CLOUD_COVER_COLOR_STOPS.map(
  ({ percent, color }) => `${color} ${percent}%`,
).join(", ")})`;

type Rgb = readonly [red: number, green: number, blue: number];

function clampPercent(percent: number) {
  return Math.min(100, Math.max(0, percent));
}

function hexToRgb(hex: string): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex([red, green, blue]: Rgb) {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function interpolateColor(start: string, end: string, progress: number) {
  const startRgb = hexToRgb(start);
  const endRgb = hexToRgb(end);
  return rgbToHex([
    startRgb[0] + (endRgb[0] - startRgb[0]) * progress,
    startRgb[1] + (endRgb[1] - startRgb[1]) * progress,
    startRgb[2] + (endRgb[2] - startRgb[2]) * progress,
  ]);
}

function relativeLuminance(hex: string) {
  const channels = hexToRgb(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * (channels[0] ?? 0) +
    0.7152 * (channels[1] ?? 0) +
    0.0722 * (channels[2] ?? 0)
  );
}

export function cloudCoverColor(percent: number) {
  const clamped = clampPercent(percent);
  const upperIndex = CLOUD_COVER_COLOR_STOPS.findIndex(
    ({ percent: stopPercent }) => stopPercent >= clamped,
  );
  if (upperIndex <= 0) return CLOUD_COVER_COLOR_STOPS[0].color;

  const lower = CLOUD_COVER_COLOR_STOPS[upperIndex - 1];
  const upper = CLOUD_COVER_COLOR_STOPS[upperIndex];
  if (!lower || !upper) {
    return CLOUD_COVER_COLOR_STOPS.at(-1)?.color ?? "#243f65";
  }
  const progress = (clamped - lower.percent) / (upper.percent - lower.percent);
  return interpolateColor(lower.color, upper.color, progress);
}

export function cloudCoverTextColor(background: string) {
  const backgroundLuminance = relativeLuminance(background);
  const darkText = "#000000";
  const darkContrast =
    (backgroundLuminance + 0.05) / (relativeLuminance(darkText) + 0.05);
  const lightContrast = 1.05 / (backgroundLuminance + 0.05);
  return darkContrast >= lightContrast ? darkText : "#ffffff";
}
