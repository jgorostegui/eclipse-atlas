import { describe, expect, it } from "vitest";
import { groupCollidingReferences } from "./reference-marker-groups";

const reference = (id: string, x: number, y: number) => ({
  id,
  x,
  y,
});

describe("groupCollidingReferences", () => {
  it("groups references whose projected marker footprints collide", () => {
    const groups = groupCollidingReferences(
      [
        reference("first", 0, 0),
        reference("second", 20, 0),
        reference("third", 80, 0),
      ],
      (point) => point,
      28,
    );

    expect(groups.map((group) => group.map((point) => point.id))).toEqual([
      ["first", "second"],
      ["third"],
    ]);
  });

  it("keeps 44 pixel targets from obscuring one another", () => {
    const groups = groupCollidingReferences(
      [reference("first", 0, 0), reference("second", 44, 0)],
      (point) => point,
      48,
    );

    expect(groups.map((group) => group.map((point) => point.id))).toEqual([
      ["first", "second"],
    ]);
  });

  it("treats connected collisions as one group regardless of the first anchor", () => {
    const groups = groupCollidingReferences(
      [
        reference("first", 0, 0),
        reference("second", 20, 0),
        reference("third", 40, 0),
      ],
      (point) => point,
      28,
    );

    expect(groups.map((group) => group.map((point) => point.id))).toEqual([
      ["first", "second", "third"],
    ]);
  });

  it("rejects invalid collision thresholds", () => {
    expect(() =>
      groupCollidingReferences([reference("first", 0, 0)], (point) => point, 0),
    ).toThrow(RangeError);
  });
});
