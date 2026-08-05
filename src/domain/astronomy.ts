import { SetDeltaTFunction } from "astronomy-engine";
import { eclipseEvents } from "./eclipse-events.ts";

/**
 * Event-specific time-scale inputs from IERS Bulletin A XXXIX-031.
 *
 * At MJD 61264: TT - UTC = (TAI - UTC) + (TT - TAI), and
 * Delta T = TT - UT1 = (TT - UTC) - (UT1 - UTC).
 */
export const EVENT_TIME_SCALE = Object.freeze({
  sourceId: "iers-bulletin-a-xxxix-031",
  producer: "IERS Rapid Service/Prediction Center",
  bulletin: "IERS Bulletin A XXXIX-031",
  sourceUrl:
    "https://datacenter.iers.org/data/6/bulletina-xxxix-031.txt",
  issuedAt: "2026-07-30",
  retrievedAt: "2026-08-02",
  referenceMjd: 61_264,
  valueStatus: "prediction",
  taiMinusUtcSeconds: 37,
  ttMinusTaiSeconds: 32.184,
  ttMinusUtcSeconds: 69.184,
  ut1MinusUtcSeconds: 0.01091,
  deltaTSeconds: 69.17309,
  derivation: "Delta T = (TAI-UTC) + (TT-TAI) - (UT1-UTC)",
  bulletinSha256:
    "d5915dd3f5e9b82fbbaab0b77021374425b2e2fc0b908c7bbbb0b6a62a379aea",
});

// Astronomy Engine's Delta T hook is module-global. Configure it once, before
// any owned calculation creates an AstroTime, so positions and contacts use the
// same event-specific time scale throughout the application.
const J2000_UTC_MILLISECONDS = Date.UTC(2000, 0, 1, 12);
const DAY_MILLISECONDS = 86_400_000;

SetDeltaTFunction((utDaysSinceJ2000) => {
  const utcMilliseconds =
    J2000_UTC_MILLISECONDS + utDaysSinceJ2000 * DAY_MILLISECONDS;
  for (const event of Object.values(eclipseEvents)) {
    const eventMilliseconds = Date.UTC(
      event.year,
      event.monthIndex,
      event.day,
      event.besselian.referenceTdtHours,
    );
    if (Math.abs(utcMilliseconds - eventMilliseconds) <= 4 * DAY_MILLISECONDS) {
      return event.timeScale.deltaTSeconds;
    }
  }
  return EVENT_TIME_SCALE.deltaTSeconds;
});

export * from "astronomy-engine";
