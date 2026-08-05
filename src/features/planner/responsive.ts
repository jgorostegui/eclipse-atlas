export const STACKED_LAYOUT_MEDIA_QUERY = "(max-width: 900px)";

export type WorkspaceSize = Readonly<{
  width: number;
  height: number;
}>;

const STANDARD_RAIL_WIDTH = 448;
const MINIMUM_RAIL_WIDTH = 384;
const MINIMUM_DETAIL_RAIL_WIDTH = 420;
const MAXIMUM_RAIL_WIDTH = 600;
const MAXIMUM_RAIL_WIDTH_RATIO = 0.42;
const MINIMUM_MAP_WIDTH = 420;
const SPLITTER_WIDTH = 10;

function preferredDetailRailRatio({ width, height }: WorkspaceSize) {
  const aspectRatio = width / Math.max(height, 1);
  return Math.min(0.36, Math.max(0.28, 0.5 - aspectRatio * 0.105));
}

export function desktopRailWidthBounds(
  workspace: WorkspaceSize,
  detailMode: boolean,
) {
  const minimum = Math.min(
    detailMode ? MINIMUM_DETAIL_RAIL_WIDTH : MINIMUM_RAIL_WIDTH,
    Math.max(300, workspace.width * 0.42),
  );
  const maximum = Math.max(
    minimum,
    Math.min(
      MAXIMUM_RAIL_WIDTH,
      workspace.width * MAXIMUM_RAIL_WIDTH_RATIO,
      workspace.width - MINIMUM_MAP_WIDTH - SPLITTER_WIDTH,
    ),
  );
  return { minimum, maximum };
}

export function clampDesktopRailWidth(
  width: number,
  workspace: WorkspaceSize,
  detailMode: boolean,
) {
  const { minimum, maximum } = desktopRailWidthBounds(workspace, detailMode);
  return Math.min(maximum, Math.max(minimum, width));
}

export function defaultDesktopRailWidth(
  workspace: WorkspaceSize,
  detailMode: boolean,
) {
  const preferredWidth = detailMode
    ? workspace.width * preferredDetailRailRatio(workspace)
    : STANDARD_RAIL_WIDTH;
  return clampDesktopRailWidth(preferredWidth, workspace, detailMode);
}

export function matchesStackedLayout() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(STACKED_LAYOUT_MEDIA_QUERY).matches
  );
}
