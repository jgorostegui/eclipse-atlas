import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EclipseAnimationSample } from "../../domain/eclipse";
import type { TerrainHorizon } from "../../domain/terrain-horizon";
import {
  createHorizonCanvasScene,
  paintHorizonCanvas,
  type HorizonNumberFormatter,
  type HorizonPhase,
} from "./horizon-canvas-renderer";

type HorizonCanvasViewProps = {
  track: EclipseAnimationSample[];
  sample: EclipseAnimationSample;
  horizon: TerrainHorizon;
  accessibleTitle: string;
  accessibleDescription: string;
  discInsetLabel: string;
  phase: HorizonPhase;
  isMaximum: boolean;
  formatNumber: HorizonNumberFormatter;
};

export function HorizonCanvasView({
  track,
  sample,
  horizon,
  accessibleTitle,
  accessibleDescription,
  discInsetLabel,
  phase,
  isMaximum,
  formatNumber,
}: HorizonCanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 960, height: 540 });
  const scene = useMemo(
    () =>
      createHorizonCanvasScene({
        track,
        sample,
        horizon,
        width: dimensions.width,
        height: dimensions.height,
        isMaximum,
      }),
    [dimensions.height, dimensions.width, horizon, isMaximum, sample, track],
  );

  useLayoutEffect(() => {
    const container = canvasRef.current?.parentElement;
    if (!container || typeof ResizeObserver === "undefined") return;
    const update = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      setDimensions((current) => {
        const next = {
          width: Math.round(width),
          height: Math.round(height),
        };
        return current.width === next.width && current.height === next.height
          ? current
          : next;
      });
    };
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      update(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(container);
    update(container.clientWidth, container.clientHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext("2d");
    } catch {
      canvas.dataset.renderState = "unavailable";
      return;
    }
    if (!context) {
      canvas.dataset.renderState = "unavailable";
      return;
    }
    const density = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(scene.width * density);
    canvas.height = Math.round(scene.height * density);
    context.setTransform(density, 0, 0, density, 0, 0);
    paintHorizonCanvas(context, scene, {
      phase,
      discInsetLabel,
      formatNumber,
    });
    canvas.dataset.renderState = "ready";
  }, [discInsetLabel, formatNumber, phase, scene]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="horizon-canvas"
        role="img"
        aria-label={`${accessibleTitle}. ${accessibleDescription}`}
        data-renderer="canvas-2d"
        data-render-state="initialising"
        data-terrain-signature={scene.terrainSignature}
        data-sun-x={scene.sun.x.toFixed(3)}
        data-inset-offset={(scene.inset.moonX - scene.inset.centreX).toFixed(3)}
        data-exposed-solar-limb={Math.max(
          0,
          Math.hypot(
            scene.inset.moonX - scene.inset.centreX,
            scene.inset.moonY - scene.inset.centreY,
          ) +
            scene.inset.sunRadius -
            scene.inset.moonRadius,
        ).toFixed(3)}
        data-sky-upper={scene.atmosphere.skyUpper}
        data-phase={phase}
        data-clearance-bracket={scene.bracket ? "visible" : "hidden"}
        data-clearance-state={
          scene.bracket?.intersection ??
          horizon.solarDiscAssessment?.intersection ??
          "unavailable"
        }
      />
      <span className="sr-only">{discInsetLabel}</span>
    </>
  );
}
