import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTraceWorker } from "./hooks/useTraceWorker";
import { OutputPanel } from "./components/OutputPanel";
import { ParameterRail } from "./components/ParameterRail";
import { StatsBar } from "./components/StatsBar";
import { Viewer, ViewTabs } from "./components/Viewer";
import { decodeImage } from "./lib/image";
import { makeSampleImage } from "./lib/sample";
import { buildSvg, svgByteSize } from "./lib/svg";
import {
  DEFAULT_DISPLAY,
  DEFAULT_SETTINGS,
  type DisplaySettings,
  type SourceImage,
  type TraceSettings,
} from "./types";

const TRACE_DEBOUNCE_MS = 110;
/** Busy-Indikator erst ab dieser Latenz zeigen — kein Flackern bei schnellen Traces. */
const BUSY_DELAY_MS = 150;
/** Ablehnungsgrenze für absurd große Dateien (Decode-Versuch lohnt nicht). */
const MAX_FILE_BYTES = 64 * 1024 * 1024;

export function App() {
  const worker = useTraceWorker();
  const [image, setImage] = useState<SourceImage | null>(null);
  const [settings, setSettings] = useState<TraceSettings>(DEFAULT_SETTINGS);
  const [display, setDisplay] = useState<DisplaySettings>(DEFAULT_DISPLAY);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showBusy, setShowBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const versionRef = useRef(0);

  const applyImageData = useCallback(
    (data: ImageData, scaled: boolean) => {
      versionRef.current++;
      setLoadError(null);
      worker.clear();
      worker.sendImage(data);
      setImage({ data, scaled, version: versionRef.current });
    },
    [worker],
  );

  const loadBlob = useCallback(
    async (blob: Blob) => {
      if (blob.size > MAX_FILE_BYTES) {
        setLoadError(
          `Datei ist ${Math.round(blob.size / 1048576)} MB groß — maximal 64 MB.`,
        );
        return;
      }
      try {
        const { data, scaled } = await decodeImage(blob);
        applyImageData(data, scaled);
      } catch {
        setLoadError("Datei konnte nicht als Bild gelesen werden.");
      }
    },
    [applyImageData],
  );

  const loadSample = useCallback(() => {
    applyImageData(makeSampleImage(), false);
  }, [applyImageData]);

  // Parameteränderung / neues Bild -> debounced Trace (Job-Superseding im Hook)
  useEffect(() => {
    if (!image) return;
    const timer = window.setTimeout(() => worker.trace(settings), TRACE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [image, settings, worker.trace]);

  // Busy-Indikator nur zeigen, wenn der Trace länger als BUSY_DELAY_MS läuft
  useEffect(() => {
    if (!worker.busy) {
      setShowBusy(false);
      return;
    }
    const timer = window.setTimeout(() => setShowBusy(true), BUSY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [worker.busy]);

  // Ganzes Fenster als Dropzone
  useEffect(() => {
    const prevent = (e: DragEvent): void => e.preventDefault();
    const onDrop = (e: DragEvent): void => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) void loadBlob(file);
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", onDrop);
    };
  }, [loadBlob]);

  const result = worker.result;
  // Mono liefert auch bei leerem Bitmap eine Ebene (d "") — nur sichtbare zählen
  const contentLayers = useMemo(() => result?.layers.filter((l) => l.d) ?? [], [result]);
  const emptyResult = result !== null && contentLayers.length === 0;
  const seam = settings.colorMode && contentLayers.length > 1;

  const svgString = useMemo(() => {
    if (!result || !contentLayers.length) return "";
    return buildSvg(contentLayers, result.w, result.h, { seam });
  }, [result, contentLayers, seam]);

  const svgBytes = useMemo(() => (svgString ? svgByteSize(svgString) : 0), [svgString]);

  const dims = image
    ? `${image.data.width}×${image.data.height}${image.scaled ? " (skaliert)" : ""}`
    : null;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-accent-400">
            Raster → Vektor
          </p>
          <h1 className="text-xl font-semibold">vektor</h1>
          <p className="text-[12px] text-ink-300">
            Potrace-Tracing, vollständig im Browser — keine Uploads.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSettings({ ...DEFAULT_SETTINGS, params: { ...DEFAULT_SETTINGS.params } });
            setDisplay(DEFAULT_DISPLAY);
          }}
          title="Alle Parameter auf Standard zurücksetzen"
          className="rounded border border-ink-600 px-3 py-1.5 text-[12px] hover:border-accent-500"
        >
          ↺ Zurücksetzen
        </button>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void loadBlob(file);
          e.target.value = "";
        }}
      />

      {(() => {
        const rail = (
          <ParameterRail
            settings={settings}
            display={display}
            palette={settings.colorMode ? (result?.palette ?? []) : []}
            usedThreshold={result?.usedThreshold ?? null}
            dims={dims}
            onSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            onDisplay={(patch) => setDisplay((d) => ({ ...d, ...patch }))}
            onPickFile={() => fileInputRef.current?.click()}
            onLoadSample={loadSample}
          />
        );
        return (
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            {/* Mobile: Viewer zuerst, Parameter im Bottom-Sheet */}
            <aside className="hidden lg:block">{rail}</aside>

            <main className="space-y-3 pb-16 lg:pb-0">
              <div className="flex items-center justify-between gap-2">
                <ViewTabs
                  view={display.view}
                  onView={(v) => setDisplay({ ...display, view: v })}
                />
                {worker.error ? (
                  <span className="text-[12px] text-red-400">Fehler: {worker.error}</span>
                ) : loadError ? (
                  <span className="text-[12px] text-red-400">{loadError}</span>
                ) : emptyResult ? (
                  <span className="text-[12px] text-accent-400">
                    0 Ebenen — Schwellwert, Invertierung oder Fleckfilter prüfen.
                  </span>
                ) : null}
              </div>
              <Viewer
                image={image}
                result={result}
                display={display}
                seam={seam}
                busy={showBusy}
              />
              <StatsBar
                result={result}
                layerCount={contentLayers.length}
                svgBytes={svgBytes}
                colorMode={settings.colorMode}
              />
              <OutputPanel svg={svgString} />
            </main>

            {/* Bottom-Sheet (nur mobil) */}
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="fixed inset-x-4 bottom-4 z-20 rounded-lg border border-ink-600 bg-ink-900/95 px-4 py-2.5 text-center text-[13px] font-medium shadow-lg backdrop-blur"
              >
                ⚙ Parameter
              </button>
              {sheetOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Parameter schließen"
                    onClick={() => setSheetOpen(false)}
                    className="fixed inset-0 z-30 bg-ink-950/60"
                  />
                  <div className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-ink-600 bg-ink-950 p-4 pb-8">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="mx-auto h-1 w-10 rounded-full bg-ink-600" />
                      <button
                        type="button"
                        onClick={() => setSheetOpen(false)}
                        className="absolute right-4 top-3 text-ink-300 hover:text-ink-100"
                        aria-label="Schließen"
                      >
                        ✕
                      </button>
                    </div>
                    {rail}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
