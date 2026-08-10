import { describe, expect, it } from "vitest";
import type { EclipseCircumstances } from "../../domain/eclipse";
import { countdownParts, formatCountdown, liveSnapshot } from "./live-phase";

function contact(iso: string, aboveApparentHorizon = true) {
  return {
    time: new Date(iso),
    apparentSolarCentreAltitudeDegrees: 10,
    aboveApparentHorizon,
  };
}

const C1 = "2026-08-12T17:35:00.000Z";
const C2 = "2026-08-12T18:27:10.000Z";
const MAXIMUM = "2026-08-12T18:27:52.000Z";
const C3 = "2026-08-12T18:28:34.000Z";
const C4 = "2026-08-12T19:20:00.000Z";

const totalContacts: EclipseCircumstances["contacts"] = {
  c1: contact(C1),
  c2: contact(C2),
  maximum: contact(MAXIMUM),
  c3: contact(C3),
  c4: contact(C4, false),
};

const partialContacts: EclipseCircumstances["contacts"] = {
  c1: contact(C1),
  c2: null,
  maximum: contact(MAXIMUM),
  c3: null,
  c4: contact(C4),
};

describe("liveSnapshot", () => {
  it("counts down to C1 before the eclipse", () => {
    const now = Date.parse(C1) - 90 * 60 * 1000;
    const snapshot = liveSnapshot(totalContacts, now);

    expect(snapshot.phase).toBe("before");
    expect(snapshot.next).toEqual({ key: "c1", timeMs: Date.parse(C1) });
    expect(snapshot.msToNext).toBe(90 * 60 * 1000);
    expect(snapshot.centralProgress).toBeNull();
    expect(snapshot.msFromMaximum).toBeLessThan(0);
    expect(snapshot.contacts.map((row) => row.status)).toEqual([
      "next",
      "future",
      "future",
      "future",
      "future",
    ]);
  });

  it("targets C2 during the incoming partial phase", () => {
    const snapshot = liveSnapshot(totalContacts, Date.parse(C1) + 1000);

    expect(snapshot.phase).toBe("partialIn");
    expect(snapshot.next?.key).toBe("c2");
  });

  it("tracks progress through the central phase", () => {
    const c2 = Date.parse(C2);
    const c3 = Date.parse(C3);
    const midpoint = liveSnapshot(totalContacts, (c2 + c3) / 2);

    expect(midpoint.phase).toBe("central");
    expect(midpoint.centralProgress).toBeCloseTo(0.5, 6);

    const beforeMaximum = liveSnapshot(totalContacts, c2 + 10_000);
    expect(beforeMaximum.next?.key).toBe("maximum");

    const afterMaximum = liveSnapshot(totalContacts, Date.parse(MAXIMUM) + 1);
    expect(afterMaximum.next?.key).toBe("c3");
    expect(afterMaximum.msFromMaximum).toBe(1);
  });

  it("enters the central phase exactly at C2", () => {
    const snapshot = liveSnapshot(totalContacts, Date.parse(C2));

    expect(snapshot.phase).toBe("central");
    expect(snapshot.centralProgress).toBe(0);
  });

  it("leaves the central phase exactly at C3", () => {
    const snapshot = liveSnapshot(totalContacts, Date.parse(C3));

    expect(snapshot.phase).toBe("partialOut");
    expect(snapshot.next?.key).toBe("c4");
  });

  it("ends exactly at C4 with no further target", () => {
    const snapshot = liveSnapshot(totalContacts, Date.parse(C4));

    expect(snapshot.phase).toBe("after");
    expect(snapshot.next).toBeNull();
    expect(snapshot.msToNext).toBeNull();
    expect(snapshot.contacts.every((row) => row.status === "past")).toBe(true);
  });

  it("splits a partial-only eclipse around its maximum", () => {
    const ingress = liveSnapshot(partialContacts, Date.parse(C1) + 1000);
    expect(ingress.phase).toBe("partialIn");
    expect(ingress.next?.key).toBe("maximum");
    expect(ingress.contacts).toHaveLength(3);

    const egress = liveSnapshot(partialContacts, Date.parse(MAXIMUM) + 1000);
    expect(egress.phase).toBe("partialOut");
    expect(egress.next?.key).toBe("c4");
    expect(egress.centralProgress).toBeNull();
  });

  it("keeps the per-contact horizon flag on the rows", () => {
    const snapshot = liveSnapshot(totalContacts, Date.parse(C1) - 1000);
    const c4Row = snapshot.contacts.find((row) => row.key === "c4");

    expect(c4Row?.aboveApparentHorizon).toBe(false);
  });
});

describe("countdownParts", () => {
  it("splits a duration into display fields", () => {
    expect(countdownParts(((26 * 60 + 2) * 60 + 3) * 1000 + 450)).toEqual({
      days: 1,
      hours: 2,
      minutes: 2,
      seconds: 3,
      centiseconds: 45,
    });
  });

  it("clamps negative durations to zero", () => {
    expect(countdownParts(-500)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      centiseconds: 0,
    });
  });
});

describe("formatCountdown", () => {
  it("shows a plain clock above ten minutes", () => {
    expect(formatCountdown(3_723_000)).toBe("01:02:03");
  });

  it("adds centiseconds inside the final ten minutes", () => {
    expect(formatCountdown(83_120)).toBe("00:01:23.12");
  });

  it("prefixes days beyond twenty-four hours", () => {
    expect(formatCountdown(86_400_000 + 3_661_000)).toBe("1 d 01:01:01");
  });
});
