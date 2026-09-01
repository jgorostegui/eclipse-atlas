export const HORIZON_REVEAL_DURATION_MS = 3_200;

export type HorizonRevealTimeline = Readonly<{
  startProgress: number;
  peakProgress: number;
  endProgress: number;
}>;

function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value ** 3
    : 1 - (-2 * value + 2) ** 3 / 2;
}

export function horizonRevealProgress(
  elapsedMilliseconds: number,
  timeline: HorizonRevealTimeline,
) {
  if (!Number.isFinite(elapsedMilliseconds)) {
    throw new RangeError("Reveal time must be finite.");
  }
  const fraction = Math.min(
    1,
    Math.max(0, elapsedMilliseconds / HORIZON_REVEAL_DURATION_MS),
  );
  if (fraction <= 0.46) {
    const local = easeInOutCubic(fraction / 0.46);
    return (
      timeline.startProgress +
      (timeline.peakProgress - timeline.startProgress) * local
    );
  }
  if (fraction < 0.58) return timeline.peakProgress;
  const local = easeInOutCubic((fraction - 0.58) / 0.42);
  return (
    timeline.peakProgress +
    (timeline.endProgress - timeline.peakProgress) * local
  );
}
