/**
 * Viewer: Raster-Canvas bleibt im Fluss (Größengeber des Frames), das
 * SVG liegt als absolutes Overlay darüber; Ansichten schalten über
 * Opazität statt display (Fallstrick 4 der Architektur-Spec).
 *
 * P4: Ein gemeinsamer CSS-Transform auf dem Frame wirkt synchron auf
 * Raster und SVG — Wheel/Pinch-Zoom auf Cursorposition, Drag-Pan,
 * Doppelklick/Doppeltipp = fit. Vierte Ansicht "Vergleich": vertikaler
 * Split mit ziehbarem Griff, links Original / rechts Vektor.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { DisplayLayer, DisplaySettings, SourceImage, ViewMode } from "../types";

const ACCENT = "#fbbf24";
const MIN_SCALE = 0.2;
const MAX_SCALE = 32;

const VIEWS: readonly { key: ViewMode; label: string }[] = [
  { key: "orig", label: "Original" },
  { key: "vector", label: "Vektor" },
  { key: "overlay", label: "Overlay" },
  { key: "compare", label: "Vergleich" },
];

export function ViewTabs({
  view,
  onView,
}: {
  view: ViewMode;
  onView: (v: ViewMode) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-ink-700 bg-ink-900 p-0.5">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => onView(v.key)}
          aria-pressed={view === v.key}
          className={`rounded px-2 py-1 text-[12px] transition-colors sm:px-3 ${
            view === v.key
              ? "bg-ink-700 text-accent-400"
              : "text-ink-300 hover:text-ink-100"
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const FIT: Transform = { scale: 1, x: 0, y: 0 };

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

export function Viewer({
  image,
  layers,
  traced,
  display,
  seam,
  busy,
  onPickFile,
  onLoadSample,
}: {
  image: SourceImage | null;
  /** Sichtbare Ebenen (nach Overrides), größte zuerst. */
  layers: readonly DisplayLayer[];
  /** true, sobald ein Trace-Ergebnis vorliegt (auch mit 0 Ebenen). */
  traced: boolean;
  display: DisplaySettings;
  /** Naht-Behandlung (Farbmodus, mehrere Ebenen): stroke = fill. */
  seam: boolean;
  busy: boolean;
  onPickFile: () => void;
  onLoadSample: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compareCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState<Transform>(FIT);
  const [split, setSplit] = useState(0.5);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef<number | null>(null);
  const [panning, setPanning] = useState(false);

  const view = display.view;
  const compare = view === "compare";

  // Raster in beide Canvases zeichnen (Vergleichs-Canvas nur wenn gemountet)
  // biome-ignore lint/correctness/useExhaustiveDependencies(compare): Vergleichs-Canvas mountet erst mit der Ansicht und muss dann gezeichnet werden
  useEffect(() => {
    for (const ref of [canvasRef, compareCanvasRef]) {
      const canvas = ref.current;
      if (!canvas || !image) continue;
      canvas.width = image.data.width;
      canvas.height = image.data.height;
      canvas.getContext("2d")?.putImageData(image.data, 0, 0);
    }
  }, [image, compare]);

  // Neues Bild -> Transform zurücksetzen
  const version = image?.version;
  // biome-ignore lint/correctness/useExhaustiveDependencies(version): Reset genau dann, wenn ein neues Bild geladen wurde
  useEffect(() => {
    setTf(FIT);
  }, [version]);

  // Wheel-Zoom auf Cursorposition (passive:false wegen preventDefault).
  // Der Container existiert erst, sobald ein Bild geladen ist.
  const hasImage = image !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies(hasImage): Listener anhängen, sobald der Container gerendert wurde
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setTf((t) => {
        const scale = clampScale(t.scale * Math.exp(-e.deltaY * 0.0015));
        const r = scale / t.scale;
        return { scale, x: px - r * (px - t.x), y: py - r * (py - t.y) };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasImage]);

  // Zoom-Leiste: um die Mitte des Viewers zoomen
  const zoomBy = useCallback((factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    setTf((t) => {
      const scale = clampScale(t.scale * factor);
      const r = scale / t.scale;
      return { scale, x: cx - r * (cx - t.x), y: cy - r * (cy - t.y) };
    });
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Pan nur mit Primärtaste bzw. Touch/Stift; Klicks auf Bedienelemente durchlassen
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPanning(true);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);

    if (pointers.current.size === 2 && pinchDist.current !== null) {
      // Pinch: Zoom um den Mittelpunkt
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - rect.left;
      const my = (a.y + b.y) / 2 - rect.top;
      const ratio = dist / pinchDist.current;
      pinchDist.current = dist;
      setTf((t) => {
        const scale = clampScale(t.scale * ratio);
        const r = scale / t.scale;
        return { scale, x: mx - r * (mx - t.x), y: my - r * (my - t.y) };
      });
    } else if (pointers.current.size === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      setTf((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
    }
  }, []);

  const onPointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
    if (pointers.current.size === 0) setPanning(false);
  }, []);

  // Griff des Vergleichs-Splits ziehen (kein Pan dabei)
  const onHandleDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent): void => {
      const rect = container.getBoundingClientRect();
      const f = (ev.clientX - rect.left) / rect.width;
      setSplit(Math.min(0.95, Math.max(0.05, f)));
    };
    const up = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }, []);

  if (!image) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-ink-600 bg-ink-900 p-8 text-center text-[13px] text-ink-300">
        <div>
          <strong className="block text-[15px] text-ink-100">
            Noch kein Bild geladen
          </strong>
          <span>
            <span className="hidden sm:inline">Ins Fenster ziehen, </span>mit Strg/⌘+V
            einfügen oder auswählen.
          </span>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onPickFile}
            className="rounded bg-accent-500 px-4 py-2 text-[13px] font-medium text-ink-950 hover:bg-accent-400"
          >
            Bild wählen
          </button>
          <button
            type="button"
            onClick={onLoadSample}
            className="rounded border border-ink-600 px-4 py-2 text-[13px] text-ink-100 hover:border-accent-500"
          >
            Beispiel laden
          </button>
        </div>
        <span className="font-mono text-[11px]">
          PNG · JPG · WEBP — bleibt auf deinem Gerät
        </span>
      </div>
    );
  }

  const overlay = view === "overlay";
  const w = image.data.width;
  const h = image.data.height;
  const transform = `translate(${tf.x}px, ${tf.y}px) scale(${tf.scale})`;
  const showVector = view !== "orig" && traced;

  const vectorPaths = layers.map((layer) =>
    overlay ? (
      <path
        key={layer.id}
        d={layer.d}
        fill={layer.color}
        fillOpacity={0.18}
        stroke={ACCENT}
        strokeWidth={0.8}
      />
    ) : (
      <path
        key={layer.id}
        d={layer.d}
        fill={layer.color}
        fillRule="evenodd"
        {...(seam
          ? { stroke: layer.color, strokeWidth: 0.5, strokeLinejoin: "round" as const }
          : {})}
      />
    ),
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Pan/Pinch-Fläche; Ansichten sind über die Tabs tastaturbedienbar
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={(e) => {
        // schnelles Klicken auf die Zoom-Buttons soll nicht einpassen
        if (!(e.target as HTMLElement).closest("button")) setTf(FIT);
      }}
      className="relative flex touch-none select-none items-start justify-center overflow-hidden rounded-lg border border-ink-700 bg-ink-800 p-3 [background-image:repeating-conic-gradient(#1b1f27_0%_25%,#20242e_0%_50%)] [background-size:16px_16px]"
      style={{ cursor: panning ? "grabbing" : "grab" }}
      title="Ziehen = verschieben · Rad/Pinch = zoomen · Doppelklick = einpassen"
    >
      <div className="relative max-w-full" style={{ transform, transformOrigin: "0 0" }}>
        <canvas
          ref={canvasRef}
          className="block h-auto max-w-full"
          style={{ opacity: view === "orig" ? 1 : overlay ? 0.35 : 0 }}
        />
        {showVector ? (
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label="Vektorisiertes Ergebnis"
          >
            {!overlay ? (
              <rect x={0} y={0} width={w} height={h} fill={display.bg} />
            ) : null}
            {vectorPaths}
            {overlay && display.anchors
              ? layers.flatMap((layer) => {
                  const marks = [];
                  for (let i = 0; i < layer.anchors.length; i += 2) {
                    marks.push(
                      <circle
                        key={`${layer.id}:${i}`}
                        cx={layer.anchors[i]}
                        cy={layer.anchors[i + 1]}
                        r={1.6}
                        fill={ACCENT}
                      />,
                    );
                  }
                  return marks;
                })
              : null}
          </svg>
        ) : null}
      </div>

      {compare ? (
        <>
          {/* Linke Seite: Original, in Container-Koordinaten geclippt */}
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden p-3"
            style={{ clipPath: `inset(0 ${(1 - split) * 100}% 0 0)` }}
          >
            <div className="flex h-full items-start justify-center">
              <div
                className="relative max-w-full"
                style={{ transform, transformOrigin: "0 0" }}
              >
                <canvas ref={compareCanvasRef} className="block h-auto max-w-full" />
              </div>
            </div>
          </div>
          {/* Griff */}
          <div
            role="slider"
            aria-label="Vergleichs-Split"
            aria-valuenow={Math.round(split * 100)}
            aria-valuemin={5}
            aria-valuemax={95}
            tabIndex={0}
            onPointerDown={onHandleDown}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setSplit((f) => Math.max(0.05, f - 0.02));
              if (e.key === "ArrowRight") setSplit((f) => Math.min(0.95, f + 0.02));
            }}
            className="absolute inset-y-0 z-10 w-4 -translate-x-1/2 cursor-ew-resize"
            style={{ left: `${split * 100}%` }}
          >
            <div className="mx-auto h-full w-[2px] bg-accent-500" />
            <div className="absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent-500 bg-ink-950 text-center text-[11px] leading-6 text-accent-400">
              ⇔
            </div>
          </div>
        </>
      ) : null}

      {/* Zoom-Leiste */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-0.5 rounded-md border border-ink-700 bg-ink-950/85 p-0.5 font-mono text-[11px] text-ink-100 backdrop-blur">
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.5)}
          aria-label="Verkleinern"
          className="h-7 w-7 rounded hover:bg-ink-700"
        >
          −
        </button>
        <span className="w-12 text-center tabular-nums" aria-live="polite">
          {Math.round(tf.scale * 100)} %
        </span>
        <button
          type="button"
          onClick={() => zoomBy(1.5)}
          aria-label="Vergrößern"
          className="h-7 w-7 rounded hover:bg-ink-700"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setTf(FIT)}
          title="Einpassen (Doppelklick)"
          className="h-7 rounded px-2 hover:bg-ink-700"
        >
          Fit
        </button>
      </div>

      {busy ? (
        <div className="absolute right-3 top-3 rounded bg-ink-950/80 px-2 py-1 font-mono text-[10px] tracking-widest text-accent-400">
          TRACING…
        </div>
      ) : null}
    </div>
  );
}
