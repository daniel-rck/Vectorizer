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

export function App() {
  const worker = useTraceWorker();
  const [image, setImage] = useState<SourceImage | null>(null);
  const [settings, setSettings] = useState<TraceSettings>(DEFAULT_SETTINGS);
  const [display, setDisplay] = useState<DisplaySettings>(DEFAULT_DISPLAY);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const seam = settings.colorMode && (result?.layers.length ?? 0) > 1;

  const svgString = useMemo(() => {
    if (!result?.layers.length) return "";
    return buildSvg(result.layers, result.w, result.h, { seam });
  }, [result, seam]);

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

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside>
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
        </aside>

        <main className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <ViewTabs
              view={display.view}
              onView={(v) => setDisplay({ ...display, view: v })}
            />
            {worker.error ? (
              <span className="text-[12px] text-red-400">Fehler: {worker.error}</span>
            ) : loadError ? (
              <span className="text-[12px] text-red-400">{loadError}</span>
            ) : null}
          </div>
          <Viewer
            image={image}
            result={result}
            display={display}
            seam={seam}
            busy={worker.busy}
          />
          <StatsBar result={result} svgBytes={svgBytes} colorMode={settings.colorMode} />
          <OutputPanel svg={svgString} />
        </main>
      </div>
    </div>
  );
}
