export const HORIZON_REVEAL_DURATION_MS = 7_200;
export const HORIZON_REVEAL_CONTEXT_MINUTES = 18;

export type HorizonRevealTimeline = Readonly<{
  startProgress: number;
  centralBeginProgress: number | null;
  peakProgress: number;
  centralEndProgress: number | null;
  endProgress: number;
}>;

type RevealKeyframe = Readonly<{
  fraction: number;
  progress: number;
}>;

function interpolateMonotoneKeyframes(
  fraction: number,
  keyframes: readonly RevealKeyframe[],
) {
  const segmentIndex = Math.min(
    keyframes.length - 2,
    Math.max(
      0,
      keyframes.findIndex((keyframe) => keyframe.fraction >= fraction) - 1,
    ),
  );
  const widths = keyframes.slice(0, -1).map(
    (keyframe, index) => keyframes[index + 1].fraction - keyframe.fraction,
  );
  const secants = keyframes.slice(0, -1).map(
    (keyframe, index) =>
      (keyframes[index + 1].progress - keyframe.progress) / widths[index],
  );
  const tangents = keyframes.map((_, index) => {
    if (index === 0) return secants[0];
    if (index === keyframes.length - 1) return secants.at(-1)!;
    const previous = secants[index - 1];
    const next = secants[index];
    if (previous * next <= 0) return 0;
    const previousWidth = widths[index - 1];
    const nextWidth = widths[index];
    const previousWeight = 2 * nextWidth + previousWidth;
    const nextWeight = nextWidth + 2 * previousWidth;
    return (
      (previousWeight + nextWeight) /
      (previousWeight / previous + nextWeight / next)
    );
  });
  const start = keyframes[segmentIndex];
  const end = keyframes[segmentIndex + 1];
  const width = widths[segmentIndex];
  const local = (fraction - start.fraction) / width;
  const localSquared = local * local;
  const localCubed = localSquared * local;
  return (
    (2 * localCubed - 3 * localSquared + 1) * start.progress +
    (localCubed - 2 * localSquared + local) * width * tangents[segmentIndex] +
    (-2 * localCubed + 3 * localSquared) * end.progress +
    (localCubed - localSquared) * width * tangents[segmentIndex + 1]
  );
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
  if (
    timeline.centralBeginProgress !== null &&
    timeline.centralEndProgress !== null
  ) {
    return interpolateMonotoneKeyframes(fraction, [
      { fraction: 0, progress: timeline.startProgress },
      { fraction: 0.28, progress: timeline.centralBeginProgress },
      { fraction: 0.5, progress: timeline.peakProgress },
      { fraction: 0.72, progress: timeline.centralEndProgress },
      { fraction: 1, progress: timeline.endProgress },
    ]);
  }
  return interpolateMonotoneKeyframes(fraction, [
    { fraction: 0, progress: timeline.startProgress },
    { fraction: 0.5, progress: timeline.peakProgress },
    { fraction: 1, progress: timeline.endProgress },
  ]);
}
