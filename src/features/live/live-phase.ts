import type { EclipseCircumstances } from "../../domain/eclipse";

export type LiveContactKey = "c1" | "c2" | "maximum" | "c3" | "c4";

export type LivePhaseId =
  | "before"
  | "partialIn"
  | "central"
  | "partialOut"
  | "after";

export type LiveContactRow = Readonly<{
  key: LiveContactKey;
  timeMs: number;
  aboveApparentHorizon: boolean;
  status: "past" | "next" | "future";
}>;

export type LiveSnapshot = Readonly<{
  phase: LivePhaseId;
  /** The next contact ahead of `nowUtcMs`, or null once C4 has passed. */
  next: Readonly<{ key: LiveContactKey; timeMs: number }> | null;
  msToNext: number | null;
  /** Position inside the C2..C3 window, 0..1, only during the central phase. */
  centralProgress: number | null;
  /** Negative before maximum (T-), positive after (T+). */
  msFromMaximum: number;
  contacts: readonly LiveContactRow[];
}>;

type LiveContacts = EclipseCircumstances["contacts"];

const CONTACT_ORDER = ["c1", "c2", "maximum", "c3", "c4"] as const;

export function liveSnapshot(
  contacts: LiveContacts,
  nowUtcMs: number,
): LiveSnapshot {
  const present = CONTACT_ORDER.flatMap((key) => {
    const contact = contacts[key];
    return contact
      ? [
          {
            key,
            timeMs: contact.time.getTime(),
            aboveApparentHorizon: contact.aboveApparentHorizon,
          },
        ]
      : [];
  });
  const next = present.find((contact) => contact.timeMs > nowUtcMs) ?? null;
  const rows: LiveContactRow[] = present.map((contact) => ({
    ...contact,
    status:
      contact.timeMs <= nowUtcMs
        ? "past"
        : contact === next
          ? "next"
          : "future",
  }));

  const c1Ms = contacts.c1.time.getTime();
  const c2Ms = contacts.c2 ? contacts.c2.time.getTime() : null;
  const c3Ms = contacts.c3 ? contacts.c3.time.getTime() : null;
  const c4Ms = contacts.c4.time.getTime();
  const maximumMs = contacts.maximum.time.getTime();

  let phase: LivePhaseId;
  let centralProgress: number | null = null;
  if (nowUtcMs < c1Ms) {
    phase = "before";
  } else if (nowUtcMs >= c4Ms) {
    phase = "after";
  } else if (c2Ms !== null && c3Ms !== null) {
    if (nowUtcMs < c2Ms) {
      phase = "partialIn";
    } else if (nowUtcMs < c3Ms) {
      phase = "central";
      centralProgress = c3Ms > c2Ms ? (nowUtcMs - c2Ms) / (c3Ms - c2Ms) : 1;
    } else {
      phase = "partialOut";
    }
  } else {
    // A partial-only geometry has no central window; the maximum splits the
    // ingress and egress halves.
    phase = nowUtcMs < maximumMs ? "partialIn" : "partialOut";
  }

  return {
    phase,
    next: next ? { key: next.key, timeMs: next.timeMs } : null,
    msToNext: next ? next.timeMs - nowUtcMs : null,
    centralProgress,
    msFromMaximum: nowUtcMs - maximumMs,
    contacts: rows,
  };
}

export type CountdownParts = Readonly<{
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  centiseconds: number;
}>;

/** Splits a non-negative duration into display fields. Negative input clamps to zero. */
export function countdownParts(durationMs: number): CountdownParts {
  const total = Math.max(0, durationMs);
  const totalCentiseconds = Math.floor(total / 10);
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  return {
    days: Math.floor(totalHours / 24),
    hours: totalHours % 24,
    minutes: totalMinutes % 60,
    seconds: totalSeconds % 60,
    centiseconds: totalCentiseconds % 100,
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * Digital countdown text: "HH:MM:SS" by default, with centiseconds appended
 * inside the final ten minutes, and a day prefix beyond 24 hours.
 */
export function formatCountdown(durationMs: number): string {
  const parts = countdownParts(durationMs);
  const clock = `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
  if (parts.days > 0) {
    return `${parts.days} d ${clock}`;
  }
  if (durationMs < 10 * 60 * 1000) {
    return `${clock}.${pad(parts.centiseconds)}`;
  }
  return clock;
}
