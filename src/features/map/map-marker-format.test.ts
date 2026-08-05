import { describe, expect, it } from "vitest";
import { formatCompactTotalityDuration } from "./map-marker-format";

describe("map marker duration", () => {
  it("always includes explicit minute and second units", () => {
    expect(formatCompactTotalityDuration(87)).toBe("1m 27s");
    expect(formatCompactTotalityDuration(27)).toBe("27s");
  });
});
