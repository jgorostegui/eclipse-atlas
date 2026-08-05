import type { EclipseCircumstances } from "../../domain/eclipse";

type NumberFormatter = (
  value: number,
  options?: Intl.NumberFormatOptions,
) => string;

export function formatObscurationPercent(
  eclipse: Pick<EclipseCircumstances, "kind" | "obscuration">,
  formatNumber: NumberFormatter,
) {
  if (eclipse.kind === "total") return `${formatNumber(100)}%`;

  const percent = eclipse.obscuration * 100;
  if (percent >= 99.995) return "<100%";

  return `${formatNumber(percent, {
    minimumFractionDigits: 1,
    maximumFractionDigits: percent >= 99 ? 2 : 1,
  })}%`;
}
