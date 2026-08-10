// Clock calibration and arbitration for the live eclipse mode. Framework-free
// and dependency-injected so every path is testable with fake clocks.
//
// The device wall clock and the monotonic clock cover each other's failure
// mode: the monotonic anchor survives civil-clock steps (a user changing the
// time, an NTP jump), while the wall clock plus the calibrated offset survives
// monotonic suspension (mobile browsers freeze `performance.now()` while the
// device sleeps). Neither is trusted alone; reads arbitrate between them.

export type MonotonicClock = Readonly<{
  /** Device wall clock, UTC milliseconds (Date.now). */
  deviceNow: () => number;
  /** Monotonic milliseconds (performance.now). */
  monotonicNow: () => number;
}>;

export type TimeProbeResponse = Readonly<{ xTimer: string | null }>;

export type ClockProbe = MonotonicClock &
  Readonly<{
    /** One same-origin request to the time source; rejects on network failure. */
    fetchTimeSource: (signal?: AbortSignal) => Promise<TimeProbeResponse>;
  }>;

export type ClockSample = Readonly<{
  /** Server UTC minus device wall clock at the sample midpoint. */
  offsetMs: number;
  roundTripMs: number;
  serverElapsedMs: number;
}>;

export type ClockCalibration = Readonly<{
  offsetMs: number;
  /** Spread between the kept samples' offsets. */
  dispersionMs: number;
  /** Rough error bound: half the best round trip plus half the dispersion. */
  uncertaintyMs: number;
  sampleCount: number;
  calibratedAtDeviceMs: number;
}>;

export type CalibrationResult =
  | Readonly<{ ok: true; calibration: ClockCalibration }>
  | Readonly<{ ok: false; reason: "no-network" | "no-time-source" | "aborted" }>;

/**
 * The "synchronized" state requires this many kept samples; a calibration
 * with fewer still improves the clock but is presented as partial and is not
 * persisted.
 */
export const MINIMUM_TRUSTED_SAMPLES = 3;

/**
 * Parses a Fastly X-Timer header such as "S1786312962.153831,VS0,VE132" into
 * the request's arrival time at the edge (microsecond precision) and the
 * milliseconds the edge spent before responding.
 */
export function parseXTimerHeader(
  value: string | null,
): Readonly<{ serverStartUtcMs: number; serverElapsedMs: number }> | null {
  if (!value) return null;
  const start = /(?:^|[,\s])S(\d+(?:\.\d+)?)(?:$|[,\s])/.exec(value);
  if (!start) return null;
  const seconds = Number(start[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const elapsed = /(?:^|[,\s])VE(\d+)(?:$|[,\s])/.exec(value);
  return {
    serverStartUtcMs: seconds * 1000,
    serverElapsedMs: elapsed ? Number(elapsed[1]) : 0,
  };
}

/**
 * One calibration sample. Returns null when the response carries no usable
 * timing header; network failures reject.
 */
export async function sampleClockOffset(
  probe: ClockProbe,
  signal?: AbortSignal,
): Promise<ClockSample | null> {
  const monotonicStart = probe.monotonicNow();
  const deviceStart = probe.deviceNow();
  const response = await probe.fetchTimeSource(signal);
  const roundTripMs = probe.monotonicNow() - monotonicStart;
  const parsed = parseXTimerHeader(response.xTimer);
  if (!parsed) return null;
  const serverElapsedMs = Math.max(
    0,
    Math.min(parsed.serverElapsedMs, roundTripMs),
  );
  // The edge stamps its start time one uplink after the request left the
  // device; the uplink is estimated as half the round trip net of the time
  // the edge itself spent producing the response.
  const uplinkMs = (roundTripMs - serverElapsedMs) / 2;
  return {
    offsetMs: parsed.serverStartUtcMs - (deviceStart + uplinkMs),
    roundTripMs,
    serverElapsedMs,
  };
}

const DEFAULT_SAMPLE_COUNT = 7;
const MINIMUM_KEPT_SAMPLES = 3;

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Multi-sample calibration: one warm-up request (so connection setup is not
 * measured as latency), several timed samples, then the offset is the median
 * of the lowest-latency half.
 */
export async function calibrateClock(
  probe: ClockProbe,
  options: Readonly<{ sampleCount?: number; signal?: AbortSignal }> = {},
): Promise<CalibrationResult> {
  const sampleCount = options.sampleCount ?? DEFAULT_SAMPLE_COUNT;
  const signal = options.signal;
  let anyResponse = false;
  if (signal?.aborted) return { ok: false, reason: "aborted" };
  try {
    await probe.fetchTimeSource(signal);
    anyResponse = true;
  } catch {
    // The warm-up result is discarded either way.
  }
  const samples: ClockSample[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    if (signal?.aborted) return { ok: false, reason: "aborted" };
    try {
      const sample = await sampleClockOffset(probe, signal);
      anyResponse = true;
      if (sample) samples.push(sample);
    } catch {
      // A failed request is simply a missing sample.
    }
  }
  if (signal?.aborted) return { ok: false, reason: "aborted" };
  if (samples.length === 0) {
    return { ok: false, reason: anyResponse ? "no-time-source" : "no-network" };
  }
  const byLatency = [...samples].sort((a, b) => a.roundTripMs - b.roundTripMs);
  const keepCount = Math.max(
    Math.min(MINIMUM_KEPT_SAMPLES, byLatency.length),
    Math.ceil(byLatency.length / 2),
  );
  const kept = byLatency.slice(0, keepCount);
  const offsets = kept.map((sample) => sample.offsetMs).sort((a, b) => a - b);
  const dispersionMs = offsets[offsets.length - 1] - offsets[0];
  return {
    ok: true,
    calibration: {
      offsetMs: median(offsets),
      dispersionMs,
      uncertaintyMs: kept[0].roundTripMs / 2 + dispersionMs / 2,
      sampleCount: kept.length,
      calibratedAtDeviceMs: probe.deviceNow(),
    },
  };
}

export const CLOCK_CALIBRATION_STORAGE_KEY = "eclipse-atlas.clock-calibration";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function readStoredCalibration(
  storage: StorageLike | null,
): ClockCalibration | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CLOCK_CALIBRATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1) return null;
    const numbers = [
      record.offsetMs,
      record.dispersionMs,
      record.uncertaintyMs,
      record.sampleCount,
      record.calibratedAtDeviceMs,
    ];
    if (!numbers.every((value) => typeof value === "number" && Number.isFinite(value))) {
      return null;
    }
    return {
      offsetMs: record.offsetMs as number,
      dispersionMs: record.dispersionMs as number,
      uncertaintyMs: record.uncertaintyMs as number,
      sampleCount: record.sampleCount as number,
      calibratedAtDeviceMs: record.calibratedAtDeviceMs as number,
    };
  } catch {
    return null;
  }
}

export function writeStoredCalibration(
  storage: StorageLike | null,
  calibration: ClockCalibration,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      CLOCK_CALIBRATION_STORAGE_KEY,
      JSON.stringify({ version: 1, ...calibration }),
    );
  } catch {
    // Storage being unavailable (private mode, quota) only loses persistence.
  }
}

/** How far the two estimates may drift apart before arbitration steps in. */
export const CLOCK_DIVERGENCE_TOLERANCE_MS = 250;

export type LiveClockSource = "device" | "restored" | "calibrated";

export type LiveClockStatus = Readonly<{
  source: LiveClockSource;
  calibration: ClockCalibration | null;
  /**
   * The device clock stepped backwards against the monotonic anchor, so the
   * stored offset no longer describes it. A recalibration is needed.
   */
  divergent: boolean;
  /**
   * The clock re-anchored on the civil estimate after the monotonic clock
   * fell behind. A suspension and a forward civil-clock step look identical
   * here, so the calibration is under suspicion until a fresh one confirms
   * the offset.
   */
  suspect: boolean;
}>;

export type LiveClock = Readonly<{
  nowUtcMs: () => number;
  status: () => LiveClockStatus;
  applyCalibration: (calibration: ClockCalibration) => void;
  restoreCalibration: (calibration: ClockCalibration) => void;
}>;

export function createLiveClock(clock: MonotonicClock): LiveClock {
  let calibration: ClockCalibration | null = null;
  let source: LiveClockSource = "device";
  let divergent = false;
  let suspect = false;
  let anchor: { utcMs: number; monotonicMs: number } | null = null;

  const anchorNow = (offsetMs: number) => {
    anchor = {
      utcMs: clock.deviceNow() + offsetMs,
      monotonicMs: clock.monotonicNow(),
    };
  };

  return {
    applyCalibration(next) {
      calibration = next;
      source = "calibrated";
      divergent = false;
      suspect = false;
      anchorNow(next.offsetMs);
    },
    restoreCalibration(next) {
      calibration = next;
      source = "restored";
      divergent = false;
      suspect = false;
      anchorNow(next.offsetMs);
    },
    status() {
      return { source, calibration, divergent, suspect };
    },
    nowUtcMs() {
      if (!calibration || !anchor) {
        return clock.deviceNow();
      }
      const monotonicEstimate =
        anchor.utcMs + (clock.monotonicNow() - anchor.monotonicMs);
      const civilEstimate = clock.deviceNow() + calibration.offsetMs;
      const drift = civilEstimate - monotonicEstimate;
      if (Math.abs(drift) <= CLOCK_DIVERGENCE_TOLERANCE_MS) {
        return monotonicEstimate;
      }
      if (drift > 0) {
        // The civil estimate ran ahead: either the monotonic clock froze
        // during a device suspension or the wall clock was set forward. The
        // two are indistinguishable from here, so the civil estimate is
        // adopted for continuity but the calibration is put under suspicion
        // until a fresh one confirms the offset.
        suspect = true;
        anchorNow(calibration.offsetMs);
        return civilEstimate;
      }
      // The civil estimate fell behind: the wall clock stepped backwards. The
      // monotonic anchor stays authoritative and the offset is flagged stale.
      divergent = true;
      return monotonicEstimate;
    },
  };
}
