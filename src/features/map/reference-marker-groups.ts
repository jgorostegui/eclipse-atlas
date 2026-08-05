export type ProjectedReference = {
  x: number;
  y: number;
};

function overlaps(
  first: ProjectedReference,
  second: ProjectedReference,
  collisionDistancePixels: number,
) {
  return Math.hypot(second.x - first.x, second.y - first.y) < collisionDistancePixels;
}

/**
 * Groups references whose rendered marker footprints would overlap.
 *
 * The caller supplies map-projected pixel coordinates so clustering remains
 * visually stable across latitude and changes naturally with zoom. Connected
 * collisions belong to the same group, independent of input order.
 */
export function groupCollidingReferences<T>(
  references: T[],
  project: (reference: T) => ProjectedReference,
  collisionDistancePixels: number,
) {
  if (!Number.isFinite(collisionDistancePixels) || collisionDistancePixels <= 0) {
    throw new RangeError("Collision distance must be a positive number of pixels.");
  }

  const projected = references.map(project);
  const bucketKey = (x: number, y: number) =>
    `${Math.floor(x / collisionDistancePixels)}:${Math.floor(y / collisionDistancePixels)}`;
  const buckets = new Map<string, number[]>();
  projected.forEach(({ x, y }, index) => {
    const key = bucketKey(x, y);
    const bucket = buckets.get(key) ?? [];
    bucket.push(index);
    buckets.set(key, bucket);
  });
  const visited = new Set<number>();
  const groups: T[][] = [];

  references.forEach((reference, startIndex) => {
    if (visited.has(startIndex)) return;

    const group: T[] = [];
    const pending = [startIndex];
    visited.add(startIndex);

    while (pending.length > 0) {
      const index = pending.shift();
      if (index === undefined) break;
      const current = references[index];
      const currentProjection = projected[index];
      if (!current || !currentProjection) continue;
      group.push(current);

      const cellX = Math.floor(
        currentProjection.x / collisionDistancePixels,
      );
      const cellY = Math.floor(
        currentProjection.y / collisionDistancePixels,
      );
      const nearbyIndexes: number[] = [];
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
          nearbyIndexes.push(
            ...(buckets.get(`${cellX + xOffset}:${cellY + yOffset}`) ?? []),
          );
        }
      }
      nearbyIndexes.sort((left, right) => left - right);
      nearbyIndexes.forEach((candidateIndex) => {
        const candidateProjection = projected[candidateIndex];
        if (!candidateProjection) return;
        if (
          !visited.has(candidateIndex) &&
          overlaps(
            currentProjection,
            candidateProjection,
            collisionDistancePixels,
          )
        ) {
          visited.add(candidateIndex);
          pending.push(candidateIndex);
        }
      });
    }

    groups.push(group);
  });

  return groups;
}
