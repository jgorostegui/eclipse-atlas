export const STACKED_LAYOUT_MEDIA_QUERY = "(max-width: 900px)";

export type WorkspaceSize = Readonly<{
  width: number;
  height: number;
}>;

const DEFAULT_RAIL_WIDTH_RATIO = 0.36;
const MINIMUM_RAIL_WIDTH = 420;
const MAXIMUM_RAIL_WIDTH_RATIO = 0.42;
const MINIMUM_MAP_WIDTH = 420;
const SPLITTER_WIDTH = 10;

export function desktopRailWidthBounds(workspace: WorkspaceSize) {
  const minimum = Math.min(
    MINIMUM_RAIL_WIDTH,
    Math.max(300, workspace.width * 0.42),
  );
  const maximum = Math.max(
    minimum,
    Math.min(
      workspace.width * MAXIMUM_RAIL_WIDTH_RATIO,
      workspace.width - MINIMUM_MAP_WIDTH - SPLITTER_WIDTH,
    ),
  );
  return { minimum, maximum };
}

export function clampDesktopRailWidth(
  width: number,
  workspace: WorkspaceSize,
) {
  const { minimum, maximum } = desktopRailWidthBounds(workspace);
  return Math.min(maximum, Math.max(minimum, width));
}

export function defaultDesktopRailWidth(workspace: WorkspaceSize) {
  return clampDesktopRailWidth(
    workspace.width * DEFAULT_RAIL_WIDTH_RATIO,
    workspace,
  );
}

export function matchesStackedLayout() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(STACKED_LAYOUT_MEDIA_QUERY).matches
  );
}
