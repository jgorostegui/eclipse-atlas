import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MINIMUM_TRUSTED_SAMPLES,
  calibrateClock,
  createLiveClock,
  readStoredCalibration,
  writeStoredCalibration,
  type ClockProbe,
  type LiveClockStatus,
} from "./clock-sync";

export type LiveClockSyncState = Readonly<{
  /** Corrected UTC milliseconds, re-evaluated on every animation frame. */
  nowUtcMs: number;
  status: LiveClockStatus;
  calibrating: boolean;
  /** Last calibration attempt found no usable network time source. */
  calibrationUnavailable: boolean;
  offline: boolean;
  recalibrate: () => void;
}>;

const RECALIBRATION_THROTTLE_MS = 60_000;
const RECALIBRATION_INTERVAL_MS = 15 * 60_000;
const PROBE_TIMEOUT_MS = 4_000;

function defaultProbe(): ClockProbe {
  return {
    deviceNow: () => Date.now(),
    monotonicNow: () => performance.now(),
    async fetchTimeSource(signal) {
      // Same-origin probe: the deployment edge answers with an X-Timer stamp.
      // The query marker keeps every cache (browser, service worker) out of
      // the timing path, and the timeout keeps a black-holed network from
      // hanging the calibration.
      const url = `${import.meta.env.BASE_URL}favicon.svg?clock-probe=${Math.random()
        .toString(36)
        .slice(2)}`;
      const timeout = AbortSignal.timeout(PROBE_TIMEOUT_MS);
      const response = await fetch(url, {
        method: "HEAD",
        cache: "no-store",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      return { xTimer: response.headers.get("x-timer") };
    },
  };
}

function storageOrNull(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function sameStatus(left: LiveClockStatus, right: LiveClockStatus) {
  return (
    left.source === right.source &&
    left.divergent === right.divergent &&
    left.suspect === right.suspect &&
    left.calibration === right.calibration
  );
}

/**
 * The live clock: calibrated against the deployment edge when the network
 * allows it, anchored on the monotonic clock between calibrations, and
 * re-arbitrated on every lifecycle event that can move either clock.
 */
export function useLiveClock(active: boolean): LiveClockSyncState {
  const probe = useMemo(() => defaultProbe(), []);
  const clock = useMemo(() => {
    const created = createLiveClock(probe);
    const stored = readStoredCalibration(storageOrNull());
    if (stored) created.restoreCalibration(stored);
    return created;
  }, [probe]);

  const [nowUtcMs, setNowUtcMs] = useState(() => clock.nowUtcMs());
  const [status, setStatus] = useState<LiveClockStatus>(() => clock.status());
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationUnavailable, setCalibrationUnavailable] = useState(false);
  const [offline, setOffline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine === false : false,
  );
  const inFlightRef = useRef<AbortController | null>(null);
  const lastCalibrationAttemptMs = useRef(0);

  const runCalibration = useCallback(
    (
      options: Readonly<{
        /** Urgent triggers (suspect clock, network back) skip the throttle. */
        bypassThrottle?: boolean;
        /** Only the manual button replaces a calibration already in flight. */
        replaceInFlight?: boolean;
      }> = {},
    ) => {
      if (!active) return;
      if (inFlightRef.current && !options.replaceInFlight) return;
      const monotonicNow = probe.monotonicNow();
      if (
        !options.bypassThrottle &&
        lastCalibrationAttemptMs.current !== 0 &&
        monotonicNow - lastCalibrationAttemptMs.current <
          RECALIBRATION_THROTTLE_MS
      ) {
        return;
      }
      // Replacing aborts whatever is in flight, so a calibration hung on a
      // dead network can always be cut short from the button.
      inFlightRef.current?.abort();
      const controller = new AbortController();
      inFlightRef.current = controller;
      lastCalibrationAttemptMs.current = monotonicNow;
      setCalibrating(true);
      void calibrateClock(probe, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          if (result.ok) {
            clock.applyCalibration(result.calibration);
            // A thin calibration still improves the clock, but only a
            // redundant one is worth trusting across sessions.
            if (result.calibration.sampleCount >= MINIMUM_TRUSTED_SAMPLES) {
              writeStoredCalibration(storageOrNull(), result.calibration);
            }
            setCalibrationUnavailable(false);
          } else if (result.reason !== "aborted") {
            setCalibrationUnavailable(true);
          }
        })
        .finally(() => {
          if (inFlightRef.current === controller) {
            inFlightRef.current = null;
            setCalibrating(false);
          }
          setStatus(clock.status());
          setNowUtcMs(clock.nowUtcMs());
        });
    },
    [active, clock, probe],
  );

  useEffect(() => {
    if (!active) return;
    // Throttled: re-activating the view inside the throttle window (for
    // example switching evidence tabs back and forth) does not re-probe.
    runCalibration();
  }, [active, runCalibration]);

  useEffect(() => {
    if (!active) return;
    // A calibration ages even when nothing eventful happens: the monotonic
    // anchor drifts with the device crystal, so a long-running mode renews
    // its offset periodically.
    const interval = window.setInterval(
      () => runCalibration(),
      RECALIBRATION_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, [active, runCalibration]);

  useEffect(() => {
    if (!active) return;
    return () => inFlightRef.current?.abort();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      setNowUtcMs(clock.nowUtcMs());
      const nextStatus = clock.status();
      setStatus((current) => (sameStatus(current, nextStatus) ? current : nextStatus));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active, clock]);

  useEffect(() => {
    if (!active) return;
    const resume = () => {
      // Reading the clock runs the civil/monotonic arbitration, which
      // re-anchors after a suspension; a divergent or suspect result then
      // asks for a fresh calibration to confirm the offset.
      setNowUtcMs(clock.nowUtcMs());
      const nextStatus = clock.status();
      setStatus(nextStatus);
      if (nextStatus.divergent || nextStatus.suspect) {
        runCalibration({ bypassThrottle: true });
      }
    };
    const online = () => {
      setOffline(false);
      runCalibration({ bypassThrottle: true });
    };
    const offlineListener = () => setOffline(true);
    const visibility = () => {
      if (document.visibilityState === "visible") resume();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineListener);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineListener);
    };
  }, [active, clock, runCalibration]);

  const recalibrate = useCallback(
    () => runCalibration({ bypassThrottle: true, replaceInFlight: true }),
    [runCalibration],
  );

  return {
    nowUtcMs,
    status,
    calibrating,
    calibrationUnavailable,
    offline,
    recalibrate,
  };
}
