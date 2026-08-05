import { describe, expect, it } from "vitest";
import { formatObscurationPercent } from "./eclipse-presentation";

const formatEnglish = (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat("en", options).format(value);
const formatSpanish = (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat("es", options).format(value);

describe("formatObscurationPercent", () => {
  it("shows an exact total eclipse without a score-like decimal", () => {
    expect(
      formatObscurationPercent(
        { kind: "total", obscuration: 0.999999 },
        formatEnglish,
      ),
    ).toBe("100%");
  });

  it("does not round a near-total partial eclipse to totality", () => {
    expect(
      formatObscurationPercent(
        { kind: "partial", obscuration: 0.99997 },
        formatEnglish,
      ),
    ).toBe("<100%");
    expect(
      formatObscurationPercent(
        { kind: "partial", obscuration: 0.9994 },
        formatSpanish,
      ),
    ).toBe("99,94%");
  });

  it("keeps annular obscuration distinct from central-phase duration", () => {
    expect(
      formatObscurationPercent(
        { kind: "annular", obscuration: 0.8724 },
        formatEnglish,
      ),
    ).toBe("87.2%");
  });
});
