import { describe, expect, it } from "vitest";
import { candidates } from "../src/data/candidates";
import { localizeCandidate } from "../src/i18n/localize-candidate";
import type { MessageKey } from "../src/i18n/messages";

const translate = (key: MessageKey) => key;

describe("candidate localization", () => {
  it.each([
    ["approximate", "candidate.official.coordinateApproximate"],
    ["mapped", "candidate.official.coordinateMapped"],
    ["published", "candidate.official.coordinatePublished"],
  ] as const)(
    "uses typed %s coordinate provenance instead of parsing display copy",
    (coordinateKind, expectedKey) => {
      const candidate = candidates.find(
        (item) =>
          item.category === "official-observation" &&
          item.coordinate.kind === coordinateKind,
      );
      expect(candidate).toBeDefined();
      if (!candidate) return;

      const localized = localizeCandidate(
        {
          ...candidate,
          coordinate: {
            ...candidate.coordinate,
            label: "Display text that contains no provenance clues",
          },
        },
        translate,
      );

      expect(localized.coordinate.label).toBe(expectedKey);
    },
  );
});
