import { useState } from "react";

export function OutputPanel({ svg }: { svg: string }) {
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const note = (txt: string): void => {
    setFlash(txt);
    window.setTimeout(() => setFlash(null), 1300);
  };

  const download = (): void => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "vektorisiert.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copy = async (): Promise<void> => {
    if (!svg) return;
    try {
      await navigator.clipboard.writeText(svg);
      note("Kopiert ✓");
    } catch {
      note("Zugriff verweigert");
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="font-mono text-[11px] uppercase tracking-widest text-ink-300 hover:text-ink-100"
        >
          {open ? "▾" : "▸"} SVG-Ausgabe
        </button>
        <div className="flex items-center gap-2">
          {flash ? (
            <span className="font-mono text-[11px] text-accent-400">{flash}</span>
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
            className="rounded bg-accent-500 px-2 py-1 text-[12px] font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-40"
          >
            SVG herunterladen
          </button>
        </div>
      </div>
      {open ? (
        <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all border-t border-ink-700 bg-ink-950 p-3 font-mono text-[11px] text-ink-300">
          {svg || "—"}
        </pre>
      ) : null}
    </div>
  );
}
