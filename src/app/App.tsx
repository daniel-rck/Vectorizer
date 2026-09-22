import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTraceWorker } from "./hooks/useTraceWorker";
import { LayerPanel } from "./components/LayerPanel";
import { OutputPanel } from "./components/OutputPanel";
import { ParameterRail } from "./components/ParameterRail";
import { StatsBar } from "./components/StatsBar";
import { Viewer, ViewTabs } from "./components/Viewer";
import { decodeImage } from "./lib/image";
import { makeSampleImage } from "./lib/sample";
import { loadSession, saveSession } from "./lib/session";
import { normalizeDisplay, normalizeSettings } from "./lib/settings";
import { takeSharedImage } from "./lib/share";
import { buildSvg, svgByteSize, svgFileName } from "./lib/svg";
import {
  DEFAULT_DISPLAY,
  DEFAULT_SETTINGS,
  type DisplayLayer,
  type DisplaySettings,
  type LayerOverride,
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
  const [overrides, setOverrides] = useState<Record<string, LayerOverride>>({});
  const [lockedPalette, setLockedPalette] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const versionRef = useRef(0);

  const applyImageData = useCallback(
    (data: ImageData, scaled: boolean, name: string) => {
      versionRef.current++;
      setLoadError(null);
      setOverrides({});
      setLockedPalette(null);
      setSheetOpen(false);
      worker.clear();
      worker.sendImage(data);
      setImage({ data, scaled, name, version: versionRef.current });
    },
    [worker],
  );

  const loadBlob = useCallback(
    async (blob: Blob, name = blob instanceof File ? blob.name : "bild") => {
      if (blob.type && !blob.type.startsWith("image/")) {
        setLoadError("Keine Bilddatei — unterstützt werden PNG, JPG und WEBP.");
        return;
      }
      if (blob.size > MAX_FILE_BYTES) {
        setLoadError(
          `Datei ist ${Math.round(blob.size / 1048576)} MB groß — maximal 64 MB.`,
        );
        return;
      }
      try {
        const { data, scaled } = await decodeImage(blob);
        applyImageData(data, scaled, name);
      } catch {
        setLoadError("Datei konnte nicht als Bild gelesen werden.");
      }
    },
    [applyImageData],
  );

  const pickFile = useCallback(() => fileInputRef.current?.click(), []);

  const loadSample = useCallback(() => {
    applyImageData(makeSampleImage(), false, "beispiel");
  }, [applyImageData]);

  // Parameteränderung / neues Bild -> debounced Trace (Job-Superseding im Hook)
  useEffect(() => {
    if (!image) return;
    const timer = window.setTimeout(
      () => worker.trace(settings, lockedPalette ?? undefined),
      TRACE_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [image, settings, lockedPalette, worker.trace]);

  // Busy-Indikator nur zeigen, wenn der Trace länger als BUSY_DELAY_MS läuft
  useEffect(() => {
    if (!worker.busy) {
      setShowBusy(false);
      return;
    }
    const timer = window.setTimeout(() => setShowBusy(true), BUSY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [worker.busy]);

  // Start-Intake: "Öffnen mit" (File Handling API), geteiltes Bild
  // (Share Target), sonst letzte Session wiederherstellen
  const intakeRan = useRef(false);
  useEffect(() => {
    if (intakeRan.current) return;
    intakeRan.current = true;
    window.launchQueue?.setConsumer((params) => {
      const handle = params.files?.[0];
      if (handle) void handle.getFile().then((f) => loadBlob(f));
    });
    void (async () => {
      if (new URLSearchParams(window.location.search).has("shared")) {
        const blob = await takeSharedImage();
        window.history.replaceState(null, "", "/");
        if (blob) {
          await loadBlob(blob);
          return;
        }
      }
      const saved = await loadSession();
      // Nur wiederherstellen, wenn nicht inzwischen etwas geladen wurde
      if (saved && versionRef.current === 0) {
        setSettings(normalizeSettings(saved.settings));
        setDisplay(normalizeDisplay(saved.display));
        const data = new ImageData(new Uint8ClampedArray(saved.buf), saved.w, saved.h);
        applyImageData(data, saved.scaled, saved.name ?? "bild");
      }
    })();
  }, [loadBlob, applyImageData]);

  // Session speichern (debounced) — letztes Bild + Parameter
  useEffect(() => {
    if (!image) return;
    const timer = window.setTimeout(() => {
      void saveSession({
        buf: image.data.data.buffer.slice(0) as ArrayBuffer,
        w: image.data.width,
        h: image.data.height,
        scaled: image.scaled,
        name: image.name,
        settings,
        display,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [image, settings, display]);

  // Ganzes Fenster als Dropzone (mit Overlay während des Ziehens)
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent): boolean =>
      e.dataTransfer?.types.includes("Files") ?? false;
    const onEnter = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const onOver = (e: DragEvent): void => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent): void => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) void loadBlob(file);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [loadBlob]);

  // Bild aus der Zwischenablage einfügen (Strg/⌘+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, [contenteditable]")
      )
        return;
      const item = [...(e.clipboardData?.items ?? [])].find(
        (i) => i.kind === "file" && i.type.startsWith("image/"),
      );
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      void loadBlob(
        file,
        file.name && file.name !== "image.png" ? file.name : "eingefuegt",
      );
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadBlob]);

  // Bottom-Sheet: Escape schließt, Seite dahinter scrollt nicht
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  const result = worker.result;
  // Mono liefert auch bei leerem Bitmap eine Ebene (d "") — nur sichtbare zählen
  // id = Originalfarbe; bei doppelten Farben (gepinnte Palette mit gleichen
  // Slots) eindeutig machen, damit Keys und Overrides nicht kollidieren
  const contentLayers = useMemo<DisplayLayer[]>(() => {
    const seen = new Set<string>();
    return (result?.layers ?? [])
      .filter((l) => l.d)
      .map((l, i) => {
        const id = seen.has(l.color) ? `${l.color}#${i}` : l.color;
        seen.add(l.color);
        return { ...l, id };
      });
  }, [result]);
  const emptyResult = result !== null && contentLayers.length === 0;

  // Ebenen-Overrides (Sichtbarkeit, Farbe) — reine Render-Operationen
  const displayLayers = useMemo<DisplayLayer[]>(
    () =>
      contentLayers
        .filter((l) => overrides[l.id]?.hidden !== true)
        .map((l) => ({ ...l, color: overrides[l.id]?.color ?? l.color })),
    [contentLayers, overrides],
  );
  const seam = settings.colorMode && displayLayers.length > 1;

  const svgString = useMemo(() => {
    if (!result || !displayLayers.length) return "";
    return buildSvg(displayLayers, result.w, result.h, { seam });
  }, [result, displayLayers, seam]);

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
            setOverrides({});
            setLockedPalette(null);
          }}
          title="Alle Parameter auf Standard zurücksetzen"
          className="shrink-0 whitespace-nowrap rounded border border-ink-600 px-3 py-1.5 text-[12px] hover:border-accent-500"
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
            paletteLocked={lockedPalette !== null}
            onSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            onDisplay={(patch) => setDisplay((d) => ({ ...d, ...patch }))}
            onPickFile={pickFile}
            onLoadSample={loadSample}
          />
        );
        return (
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            {/* Mobile: Viewer zuerst, Parameter im Bottom-Sheet */}
            <aside className="hidden lg:block">{rail}</aside>

            <main className="space-y-3 pb-16 lg:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ViewTabs
                  view={display.view}
                  onView={(v) => setDisplay((d) => ({ ...d, view: v }))}
                />
                {image ? (
                  <span
                    className="truncate font-mono text-[11px] text-ink-300"
                    title={image.name}
                  >
                    {image.name} · {dims}
                  </span>
                ) : null}
              </div>
              {worker.error || loadError ? (
                <div
                  role="alert"
                  className="flex items-start justify-between gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-300"
                >
                  <span>
                    {worker.error ? `Fehler beim Tracen: ${worker.error}` : loadError}
                  </span>
                  {loadError && !worker.error ? (
                    <button
                      type="button"
                      onClick={() => setLoadError(null)}
                      aria-label="Meldung schließen"
                      className="shrink-0 text-red-300 hover:text-red-100"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              ) : emptyResult ? (
                <p
                  role="status"
                  className="rounded border border-accent-500/40 bg-accent-500/10 px-3 py-2 text-[12px] text-accent-400"
                >
                  0 Ebenen — Schwellwert, Invertierung oder Fleckfilter prüfen.
                </p>
              ) : null}
              <Viewer
                image={image}
                layers={displayLayers}
                traced={result !== null}
                display={display}
                seam={seam}
                busy={showBusy}
                onPickFile={pickFile}
                onLoadSample={loadSample}
              />
              <StatsBar
                result={result}
                layerCount={displayLayers.length}
                svgBytes={svgBytes}
                colorMode={settings.colorMode}
              />
              {settings.colorMode ? (
                <LayerPanel
                  layers={contentLayers}
                  palette={result?.palette ?? []}
                  overrides={overrides}
                  lockedPalette={lockedPalette}
                  onOverride={(color, patch) =>
                    setOverrides((o) => ({ ...o, [color]: { ...o[color], ...patch } }))
                  }
                  onOmitBackground={() => {
                    const bg = contentLayers[0]?.id;
                    if (!bg) return;
                    setOverrides((o) => ({
                      ...o,
                      [bg]: { ...o[bg], hidden: o[bg]?.hidden !== true },
                    }));
                  }}
                  onLock={() =>
                    setLockedPalette(result?.palette.map((p) => p.hex) ?? null)
                  }
                  onUnlock={() => setLockedPalette(null)}
                  onLockedColor={(index, color) =>
                    setLockedPalette((lp) => {
                      if (!lp) return lp;
                      const next = [...lp];
                      next[index] = color;
                      return next;
                    })
                  }
                />
              ) : null}
              <OutputPanel
                svg={svgString}
                fileName={svgFileName(image?.name ?? "vektorisiert")}
              />
            </main>

            {/* Bottom-Sheet (nur mobil) */}
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 rounded-lg border border-ink-600 bg-ink-900/95 px-4 py-2.5 text-center text-[13px] font-medium shadow-lg backdrop-blur"
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
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Parameter"
                    className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-ink-600 bg-ink-950 p-4 pb-[calc(2rem+env(safe-area-inset-bottom))]"
                  >
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

      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-6">
          <div className="rounded-2xl border-2 border-dashed border-accent-500 px-10 py-12 text-center">
            <strong className="block text-lg text-ink-100">Bild hier ablegen</strong>
            <span className="font-mono text-[12px] text-ink-300">PNG · JPG · WEBP</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
