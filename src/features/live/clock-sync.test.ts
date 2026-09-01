import { describe, expect, it } from "vitest";
import {
  CLOCK_CALIBRATION_STORAGE_KEY,
  calibrateClock,
  createLiveClock,
  parseXTimerHeader,
  readStoredCalibration,
  sampleClockOffset,
  writeStoredCalibration,
  type ClockCalibration,
  type ClockProbe,
} from "./clock-sync";

function fakeClock(startDeviceMs = 1_000_000_000, startMonotonicMs = 5_000) {
  let device = startDeviceMs;
  let monotonic = startMonotonicMs;
  return {
    clock: {
      deviceNow: () => device,
      monotonicNow: () => monotonic,
    },
    advance(ms: number) {
      device += ms;
      monotonic += ms;
    },
    advanceDeviceOnly(ms: number) {
      device += ms;
    },
    advanceMonotonicOnly(ms: number) {
      monotonic += ms;
    },
    device: () => device,
  };
}

describe("parseXTimerHeader", () => {
  it("parses a real Fastly header", () => {
    const parsed = parseXTimerHeader("S1786312962.153831,VS0,VE132");

    expect(parsed?.serverStartUtcMs).toBeCloseTo(1_786_312_962_153.831, 3);
    expect(parsed?.serverElapsedMs).toBe(132);
  });

  it("defaults the elapsed time when VE is absent", () => {
    expect(parseXTimerHeader("S1786312962.5,VS0")?.serverElapsedMs).toBe(0);
  });

  it("rejects headers without a start stamp", () => {
    expect(parseXTimerHeader("VS0,VE132")).toBeNull();
    expect(parseXTimerHeader("")).toBeNull();
    expect(parseXTimerHeader(null)).toBeNull();
  });
});

type ScriptedResponse =
  | Readonly<{ kind: "header"; offsetMs: number; roundTripMs: number; serverElapsedMs?: number }>
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "error" }>;

// A probe whose responses replay a script. Each sample advances the monotonic
// clock by the scripted round trip and stamps the header exactly where a
// perfectly symmetric network would, so the expected offset is exact.
function scriptedProbe(script: readonly ScriptedResponse[]) {
  const timer = fakeClock();
  let index = 0;
  const probe: ClockProbe = {
    ...timer.clock,
    async fetchTimeSource() {
      const step = script[index];
      index += 1;
      if (!step) throw new Error("script exhausted");
      if (step.kind === "error") throw new Error("network down");
      if (step.kind === "missing") return { xTimer: null };
      const serverElapsedMs = step.serverElapsedMs ?? 0;
      const uplinkMs = (step.roundTripMs - serverElapsedMs) / 2;
      const serverStartUtcMs = timer.clock.deviceNow() + uplinkMs + step.offsetMs;
      timer.advance(step.roundTripMs);
      return {
        xTimer: `S${(serverStartUtcMs / 1000).toFixed(6)},VS0,VE${serverElapsedMs}`,
      };
    },
  };
  return probe;
}

describe("sampleClockOffset", () => {
  it("recovers the scripted offset from a symmetric round trip", async () => {
    const probe = scriptedProbe([
      { kind: "header", offsetMs: 2_000, roundTripMs: 100, serverElapsedMs: 20 },
    ]);

    const sample = await sampleClockOffset(probe);

    expect(sample?.offsetMs).toBeCloseTo(2_000, 3);
    expect(sample?.roundTripMs).toBe(100);
    expect(sample?.serverElapsedMs).toBe(20);
  });

  it("returns null when the response has no timing header", async () => {
    expect(await sampleClockOffset(scriptedProbe([{ kind: "missing" }]))).toBeNull();
  });
});

describe("calibrateClock", () => {
  it("keeps the lowest-latency half and takes the median offset", async () => {
    const probe = scriptedProbe([
      { kind: "header", offsetMs: 0, roundTripMs: 30 }, // warm-up, discarded
      { kind: "header", offsetMs: 1_000, roundTripMs: 20 },
      { kind: "header", offsetMs: 1_006, roundTripMs: 24 },
      { kind: "header", offsetMs: 994, roundTripMs: 22 },
      { kind: "header", offsetMs: 1_002, roundTripMs: 26 },
      // Slow relays with badly asymmetric paths: latency filtering drops them.
      { kind: "header", offsetMs: 6_000, roundTripMs: 400 },
      { kind: "header", offsetMs: -4_000, roundTripMs: 380 },
      { kind: "header", offsetMs: 5_000, roundTripMs: 420 },
    ]);

    const result = await calibrateClock(probe);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.calibration.sampleCount).toBe(4);
    expect(result.calibration.offsetMs).toBeCloseTo(1_001, 3);
    expect(result.calibration.dispersionMs).toBeCloseTo(12, 3);
    expect(result.calibration.uncertaintyMs).toBeCloseTo(20 / 2 + 12 / 2, 3);
  });

  it("reports a missing time source distinctly from a missing network", async () => {
    const noHeader = await calibrateClock(
      scriptedProbe(Array.from({ length: 8 }, () => ({ kind: "missing" as const }))),
    );
    expect(noHeader).toEqual({ ok: false, reason: "no-time-source" });

    const offline = await calibrateClock(
      scriptedProbe(Array.from({ length: 8 }, () => ({ kind: "error" as const }))),
    );
    expect(offline).toEqual({ ok: false, reason: "no-network" });
  });

  it("stops early when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await calibrateClock(
      scriptedProbe(
        Array.from({ length: 8 }, () => ({
          kind: "header" as const,
          offsetMs: 100,
          roundTripMs: 10,
        })),
      ),
      { signal: controller.signal },
    );

    expect(result).toEqual({ ok: false, reason: "aborted" });
  });

  it("bounds the whole calibration when the time source stops responding", async () => {
    const timer = fakeClock();
    const probe: ClockProbe = {
      ...timer.clock,
      fetchTimeSource: (signal) =>
        new Promise((_, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    };

    await expect(calibrateClock(probe, { timeoutMs: 10 })).resolves.toEqual({
      ok: false,
      reason: "timed-out",
    });
  });

  it("rejects an invalid calibration timeout", async () => {
    await expect(calibrateClock(scriptedProbe([]), { timeoutMs: 0 })).rejects
      .toThrow(RangeError);
  });

  it("survives a mix of failures as long as one sample lands", async () => {
    const result = await calibrateClock(
      scriptedProbe([
        { kind: "error" }, // warm-up
        { kind: "error" },
        { kind: "missing" },
        { kind: "header", offsetMs: 500, roundTripMs: 40 },
        { kind: "error" },
        { kind: "missing" },
        { kind: "error" },
        { kind: "error" },
      ]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.calibration.sampleCount).toBe(1);
    expect(result.calibration.offsetMs).toBeCloseTo(500, 3);
  });
});

const calibration: ClockCalibration = {
  offsetMs: 1_500,
  dispersionMs: 8,
  uncertaintyMs: 14,
  sampleCount: 4,
  calibratedAtDeviceMs: 1_000_000_000,
};

describe("createLiveClock", () => {
  it("falls back to the device clock while uncalibrated", () => {
    const timer = fakeClock();
    const clock = createLiveClock(timer.clock);

    expect(clock.nowUtcMs()).toBe(timer.device());
    expect(clock.status()).toEqual({
      source: "device",
      calibration: null,
      divergent: false,
      suspect: false,
    });
  });

  it("applies the calibrated offset through the monotonic anchor", () => {
    const timer = fakeClock();
    const clock = createLiveClock(timer.clock);
    clock.applyCalibration(calibration);
    timer.advance(10_000);

    expect(clock.nowUtcMs()).toBe(timer.device() + 1_500);
    expect(clock.status().source).toBe("calibrated");
  });

  it("re-anchors on the civil clock after a monotonic suspension", () => {
    const timer = fakeClock();
    const clock = createLiveClock(timer.clock);
    clock.applyCalibration(calibration);
    // The device sleeps 40 s: the wall clock keeps running, the monotonic
    // clock freezes. A naive monotonic countdown would now lag 40 s.
    timer.advanceDeviceOnly(40_000);

    expect(clock.nowUtcMs()).toBe(timer.device() + 1_500);
    expect(clock.status().divergent).toBe(false);
    // A suspension and a forward clock step look identical, so the state
    // demands a confirming calibration instead of staying green.
    expect(clock.status().suspect).toBe(true);

    // After re-anchoring, normal ticking resumes from the corrected value.
    timer.advance(2_000);
    expect(clock.nowUtcMs()).toBe(timer.device() + 1_500);
  });

  it("puts a forward clock step under suspicion until recalibrated", () => {
    const timer = fakeClock();
    const clock = createLiveClock(timer.clock);
    clock.applyCalibration(calibration);
    timer.advance(5_000);
    // The user sets the device clock one hour ahead: indistinguishable from
    // a suspension, so the jumped value is adopted but flagged.
    timer.advanceDeviceOnly(3_600_000);

    expect(clock.nowUtcMs()).toBe(timer.device() + 1_500);
    expect(clock.status().suspect).toBe(true);

    // A fresh calibration measures the new civil clock and clears the flag.
    clock.applyCalibration({ ...calibration, offsetMs: 1_500 - 3_600_000 });
    expect(clock.status().suspect).toBe(false);
    timer.advance(1_000);
    expect(clock.nowUtcMs()).toBe(timer.device() + 1_500 - 3_600_000);
  });

  it("keeps the monotonic anchor when the wall clock steps backwards", () => {
    const timer = fakeClock();
    const clock = createLiveClock(timer.clock);
    clock.applyCalibration(calibration);
    timer.advance(5_000);
    const expected = timer.device() + 1_500;
    // The user drags the device clock an hour back: the corrected time must
    // not jump with it, and the state must demand a recalibration.
    timer.advanceDeviceOnly(-3_600_000);

    expect(clock.nowUtcMs()).toBe(expected);
    expect(clock.status().divergent).toBe(true);
  });

  it("tolerates ordinary jitter without re-anchoring", () => {
    const timer = fakeClock();
    const clock = createLiveClock(timer.clock);
    clock.applyCalibration(calibration);
    timer.advance(1_000);
    timer.advanceDeviceOnly(100);

    expect(clock.nowUtcMs()).toBe(timer.device() - 100 + 1_500);
    expect(clock.status().divergent).toBe(false);
  });
});

describe("calibration storage", () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const map = new Map(Object.entries(initial));
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    };
  }

  it("round-trips a calibration", () => {
    const storage = memoryStorage();
    writeStoredCalibration(storage, calibration);

    expect(readStoredCalibration(storage)).toEqual(calibration);
  });

  it("rejects corrupt or foreign payloads", () => {
    expect(
      readStoredCalibration(
        memoryStorage({ [CLOCK_CALIBRATION_STORAGE_KEY]: "not json" }),
      ),
    ).toBeNull();
    expect(
      readStoredCalibration(
        memoryStorage({
          [CLOCK_CALIBRATION_STORAGE_KEY]: JSON.stringify({ version: 2 }),
        }),
      ),
    ).toBeNull();
    expect(readStoredCalibration(null)).toBeNull();
  });
});
