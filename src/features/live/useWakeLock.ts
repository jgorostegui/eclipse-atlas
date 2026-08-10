import { useCallback, useEffect, useRef, useState } from "react";

export type WakeLockState =
  | "unsupported"
  | "idle"
  | "active"
  | "unavailable";

/**
 * Screen wake lock for the live mode. It is only requested after a user
 * gesture, re-acquired when the page becomes visible again, and released when
 * the mode closes.
 */
export function useWakeLock(active: boolean): Readonly<{
  state: WakeLockState;
  enable: () => void;
}> {
  const supported =
    typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [state, setState] = useState<WakeLockState>(
    supported ? "idle" : "unsupported",
  );
  const wantedRef = useRef(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  const acquire = useCallback(() => {
    if (!supported || !wantedRef.current) return;
    void navigator.wakeLock
      .request("screen")
      .then((sentinel) => {
        if (!wantedRef.current) {
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        setState("active");
        sentinel.addEventListener("release", () => {
          sentinelRef.current = null;
          setState("idle");
        });
      })
      .catch(() => {
        setState("unavailable");
      });
  }, [supported]);

  const enable = useCallback(() => {
    wantedRef.current = true;
    acquire();
  }, [acquire]);

  useEffect(() => {
    if (!active || !supported) return;
    const visibility = () => {
      if (
        document.visibilityState === "visible" &&
        wantedRef.current &&
        sentinelRef.current === null
      ) {
        acquire();
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [acquire, active, supported]);

  useEffect(() => {
    if (!active) return;
    return () => {
      // Releasing fires the sentinel's "release" listener, which resets the
      // state; no direct setState is needed here.
      wantedRef.current = false;
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel) void sentinel.release();
    };
  }, [active]);

  return { state, enable };
}
