import { describe, expect, it } from "vitest";
import {
  clampDesktopRailWidth,
  defaultDesktopRailWidth,
  desktopRailWidthBounds,
} from "./responsive";

describe("desktop inspector sizing", () => {
  it.each([
    { name: "compact desktop", width: 1024, height: 656 },
    { name: "common laptop", width: 1366, height: 656 },
    { name: "full HD desktop", width: 1920, height: 968 },
    { name: "wide desktop", width: 2048, height: 1040 },
    { name: "maintainer ultrawide capture", width: 2351, height: 1157 },
    { name: "WQHD ultrawide", width: 3440, height: 1328 },
  ])("keeps the map primary on a $name", ({ width, height }) => {
    const inspectorWidth = defaultDesktopRailWidth({ width, height });

    expect(inspectorWidth).toBeGreaterThanOrEqual(
      Math.min(420, width * 0.42),
    );
    expect(inspectorWidth / width).toBeLessThanOrEqual(0.42);
    expect(width - inspectorWidth - 10).toBeGreaterThan(inspectorWidth);
  });

  it.each([
    { name: "wide desktop", width: 2048, height: 1040 },
    { name: "maintainer ultrawide capture", width: 2351, height: 1157 },
    { name: "WQHD ultrawide", width: 3440, height: 1328 },
  ])("keeps the inspector fluid on a $name", ({ width, height }) => {
    const inspectorWidth = defaultDesktopRailWidth({ width, height });

    expect(inspectorWidth / width).toBeCloseTo(0.36, 6);
  });

  it("does not change the automatic width when only workspace height changes", () => {
    const tall = defaultDesktopRailWidth(
      { width: 1920, height: 1200 },
    );
    const wide = defaultDesktopRailWidth(
      { width: 1920, height: 760 },
    );

    expect(tall).toBe(wide);
    expect(tall / 1920).toBeCloseTo(0.36, 6);
  });

  it.each([
    { name: "common laptop", width: 1366, height: 656 },
    { name: "WQHD ultrawide", width: 3440, height: 1328 },
  ])(
    "bounds manual resizing on a $name without allowing the inspector to take half the workspace",
    ({ width, height }) => {
      const workspace = { width, height };
      const bounds = desktopRailWidthBounds(workspace);

      expect(clampDesktopRailWidth(0, workspace)).toBe(bounds.minimum);
      expect(clampDesktopRailWidth(2000, workspace)).toBe(bounds.maximum);
      expect(bounds.maximum / workspace.width).toBeCloseTo(0.42, 6);
    },
  );
});
