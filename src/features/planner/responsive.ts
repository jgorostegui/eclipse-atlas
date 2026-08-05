export const STACKED_LAYOUT_MEDIA_QUERY = "(max-width: 900px)";

export function matchesStackedLayout() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(STACKED_LAYOUT_MEDIA_QUERY).matches
  );
}
