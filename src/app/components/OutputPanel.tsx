import { useEffect, useRef, useState } from "react";
import { formatBytes } from "../lib/svg";

/** Größere SVGs im Code-Panel kürzen — sonst friert das Aufklappen ein. */
const PREVIEW_CHARS = 200_000;

export function OutputPanel({ svg, fileName }: { svg: string; fileName: string }) {
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const note = (txt: string): void => {
    window.clearTimeout(flashTimer.current);
    setFlash(txt);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1600);
  };

  const download = (): void => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Sofortiges Revoke bricht den Download in Firefox/Safari ab
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const copy = async (): Promise<void> => {
    if (!svg) return;
    try {
      await navigator.clipboard.writeText(svg);
      note("Kopiert ✓");
    } catch {
      note("Zwischenablage nicht verfügbar");
    }
  };

  const truncated = svg.length > PREVIEW_CHARS;

  return (
    <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="font-mono text-[11px] uppercase tracking-widest text-ink-300 hover:text-ink-100"
        >
          {open ? "▾" : "▸"} SVG-Ausgabe
        </button>
        <div className="flex items-center gap-2">
          {flash ? (
            <span role="status" className="font-mono text-[11px] text-accent-400">
              {flash}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!svg}
            className="rounded border border-ink-600 px-2 py-1 text-[12px] hover:border-accent-500 disabled:opacity-40"
          >
            Kopieren
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!svg}
            title={svg ? `${fileName} speichern` : undefined}
            className="rounded bg-accent-500 px-2 py-1 text-[12px] font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-40"
          >
            SVG herunterladen
          </button>
        </div>
      </div>
      {open ? (
        <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all border-t border-ink-700 bg-ink-950 p-3 font-mono text-[11px] text-ink-300">
          {svg ? (truncated ? `${svg.slice(0, PREVIEW_CHARS)}…` : svg) : "—"}
          {truncated ? (
            <span className="mt-2 block text-accent-400">
              Vorschau gekürzt ({formatBytes(svg.length)}) — vollständig über Kopieren
              oder Download.
            </span>
          ) : null}
        </pre>
      ) : null}
    </div>
  );
}
