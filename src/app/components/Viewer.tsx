/**
 * Viewer: Raster-Canvas bleibt im Fluss (Größengeber des Frames), das
 * SVG liegt als absolutes Overlay darüber; Ansichten schalten über
 * Opazität statt display (Fallstrick 4 der Architektur-Spec).
 */

import { useEffect, useRef } from "react";
import type { ResultMessage } from "../../lib/potrace/protocol";
import type { DisplaySettings, SourceImage, ViewMode } from "../types";

const ACCENT = "#fbbf24";

const VIEWS: readonly { key: ViewMode; label: string }[] = [
  { key: "orig", label: "Original" },
  { key: "vector", label: "Vektor" },
  { key: "overlay", label: "Overlay" },
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
          className={`rounded px-3 py-1 text-[12px] transition-colors ${
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

export function Viewer({
  image,
  result,
  display,
  seam,
  busy,
}: {
  image: SourceImage | null;
  result: ResultMessage | null;
  display: DisplaySettings;
  /** Naht-Behandlung (Farbmodus, mehrere Ebenen): stroke = fill. */
  seam: boolean;
  busy: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    canvas.width = image.data.width;
    canvas.height = image.data.height;
    canvas.getContext("2d")?.putImageData(image.data, 0, 0);
  }, [image]);

  if (!image) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-ink-700 bg-ink-900 p-8 text-center text-[13px] text-ink-300">
        Kein Bild geladen — „Beispiel laden" oder eigenes Bild ins Fenster ziehen.
      </div>
    );
  }

  const view = display.view;
  const overlay = view === "overlay";
  const w = image.data.width;
  const h = image.data.height;

  return (
    <div className="relative flex items-start justify-center overflow-hidden rounded-lg border border-ink-700 bg-ink-800 p-3 [background-image:repeating-conic-gradient(#1b1f27_0%_25%,#20242e_0%_50%)] [background-size:16px_16px]">
      <div className="relative max-w-full">
        <canvas
          ref={canvasRef}
          className="block h-auto max-w-full"
          style={{ opacity: view === "orig" ? 1 : overlay ? 0.35 : 0 }}
        />
        {view !== "orig" && result ? (
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label="Vektorisiertes Ergebnis"
          >
            {!overlay ? (
              <rect x={0} y={0} width={w} height={h} fill={display.bg} />
            ) : null}
            {result.layers.map((layer) =>
              // Palettenfarben sind pro Result eindeutig -> stabiler Key
              overlay ? (
                <path
                  key={layer.color}
                  d={layer.d}
                  fill={layer.color}
                  fillOpacity={0.18}
                  stroke={ACCENT}
                  strokeWidth={0.8}
                />
              ) : (
                <path
                  key={layer.color}
                  d={layer.d}
                  fill={layer.color}
                  fillRule="evenodd"
                  {...(seam
                    ? {
                        stroke: layer.color,
                        strokeWidth: 0.5,
                        strokeLinejoin: "round" as const,
                      }
                    : {})}
                />
              ),
            )}
            {overlay && display.anchors
              ? result.layers.flatMap((layer) => {
                  const marks = [];
                  for (let i = 0; i < layer.anchors.length; i += 2) {
                    marks.push(
                      <circle
                        key={`${layer.color}:${i}`}
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
      {busy ? (
        <div className="absolute right-3 top-3 rounded bg-ink-950/80 px-2 py-1 font-mono text-[10px] tracking-widest text-accent-400">
          TRACING…
        </div>
      ) : null}
    </div>
  );
}
