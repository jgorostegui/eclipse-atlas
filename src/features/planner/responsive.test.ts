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
  ])("keeps the map primary on a $name", ({ width, height }) => {
    const inspectorWidth = defaultDesktopRailWidth(
      { width, height },
      true,
    );

    expect(inspectorWidth).toBeGreaterThanOrEqual(
      Math.min(420, width * 0.42),
    );
    expect(inspectorWidth / width).toBeLessThanOrEqual(0.42);
    expect(width - inspectorWidth - 10).toBeGreaterThan(inspectorWidth);
  });

  it("uses the available aspect ratio instead of a fixed percentage", () => {
    const tall = defaultDesktopRailWidth(
      { width: 1920, height: 1200 },
      true,
    );
    const wide = defaultDesktopRailWidth(
      { width: 1920, height: 760 },
      true,
    );

    expect(tall).toBeGreaterThan(wide);
    expect(wide).toBeGreaterThanOrEqual(420);
  });

  it("bounds manual resizing without allowing the inspector to take half the workspace", () => {
    const workspace = { width: 1366, height: 656 };
    const bounds = desktopRailWidthBounds(workspace, true);

    expect(clampDesktopRailWidth(0, workspace, true)).toBe(bounds.minimum);
    expect(clampDesktopRailWidth(2000, workspace, true)).toBe(bounds.maximum);
    expect(bounds.maximum / workspace.width).toBeCloseTo(0.42, 6);
  });
});
