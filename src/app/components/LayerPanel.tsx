/**
 * Ebenen-Panel (P3): Chip, Hex, Flächen-%, Sichtbar-Toggle, Farb-Picker
 * (nur Render) — plus Paletten-Locking: Palette pinnen und Chip-Farben
 * editieren (löst Re-Trace mit fester Palette aus, kein Median-Cut).
 */

import type { PaletteEntry } from "../../lib/potrace/protocol";
import type { DisplayLayer, LayerOverride } from "../types";

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {open ? null : <path d="M3 3l18 18" />}
    </svg>
  );
}

export function LayerPanel({
  layers,
  palette,
  overrides,
  lockedPalette,
  onOverride,
  onOmitBackground,
  onLock,
  onUnlock,
  onLockedColor,
}: {
  /** Ebenen des letzten Results (größte zuerst), nur nicht-leere. */
  layers: readonly DisplayLayer[];
  /** Palette in Ebenen-Reihenfolge (Farbmodus). */
  palette: readonly PaletteEntry[];
  overrides: Record<string, LayerOverride>;
  lockedPalette: string[] | null;
  /** Schlüssel: Ebenen-id (Originalfarbe, bei Duplikaten eindeutig gemacht). */
  onOverride: (id: string, patch: LayerOverride) => void;
  /** Größte Ebene ein-/ausblenden (Ein-Klick "Hintergrund weglassen"). */
  onOmitBackground: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onLockedColor: (index: number, color: string) => void;
}) {
  if (!layers.length) return null;
  const totalArea = palette.reduce((a, p) => a + p.area, 0) || 1;
  const backgroundHidden = overrides[layers[0].id]?.hidden === true;

  return (
    <section className="rounded-lg border border-ink-700 bg-ink-900 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-ink-300">
          Ebenen
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOmitBackground}
            title="Größte Ebene (Hintergrund) aus Anzeige und Export entfernen"
            className="rounded border border-ink-600 px-2 py-1 text-[11px] hover:border-accent-500"
          >
            {backgroundHidden ? "Hintergrund zeigen" : "Hintergrund weglassen"}
          </button>
          <button
            type="button"
            onClick={lockedPalette ? onUnlock : onLock}
            title={
              lockedPalette
                ? "Pin lösen — Palette wieder frei bestimmen (Median-Cut)"
                : "Aktuelle Palette pinnen — Farben bleiben fix, nur Zuordnung wird gerechnet"
            }
            className={`rounded border px-2 py-1 text-[11px] ${
              lockedPalette
                ? "border-accent-500 text-accent-400"
                : "border-ink-600 hover:border-accent-500"
            }`}
          >
            {lockedPalette ? "Palette gepinnt · lösen" : "Palette pinnen"}
          </button>
        </div>
      </div>

      {lockedPalette ? (
        <div className="mb-3 rounded border border-ink-700 bg-ink-950 p-2">
          <p className="mb-2 text-[11px] text-ink-300">
            Gepinnte Palette — Chip-Farbe ändern rechnet die Zuordnung neu:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {lockedPalette.map((hex, i) => (
              <input
                // biome-ignore lint/suspicious/noArrayIndexKey: Slots der gepinnten Palette sind positionsfest
                key={i}
                type="color"
                value={hex}
                onChange={(e) => onLockedColor(i, e.target.value)}
                title={`${hex} — ändern und neu zuordnen`}
                className="h-7 w-7 cursor-pointer rounded border border-ink-600 bg-transparent"
              />
            ))}
          </div>
        </div>
      ) : null}

      <ul className="space-y-1.5">
        {layers.map((layer, i) => {
          const ov = overrides[layer.id] ?? {};
          const shown = ov.hidden !== true;
          const displayColor = ov.color ?? layer.color;
          const pct = palette[i] ? (palette[i].area / totalArea) * 100 : null;
          return (
            <li
              key={layer.id}
              className={`flex items-center gap-2 rounded border border-ink-700 px-2 py-1.5 ${
                shown ? "" : "opacity-45"
              }`}
            >
              <input
                type="color"
                value={displayColor}
                onChange={(e) => onOverride(layer.id, { color: e.target.value })}
                title="Ebenenfarbe ändern (nur Darstellung/Export, kein Re-Trace)"
                className="h-6 w-6 shrink-0 cursor-pointer rounded border border-ink-600 bg-transparent"
              />
              <span className="font-mono text-[12px]">{displayColor}</span>
              {ov.color && ov.color !== layer.color ? (
                <button
                  type="button"
                  onClick={() => onOverride(layer.id, { color: undefined })}
                  title={`Zurück zu ${layer.color}`}
                  aria-label={`Farbe auf ${layer.color} zurücksetzen`}
                  className="font-mono text-[10px] text-ink-300 hover:text-ink-100"
                >
                  ↺
                </button>
              ) : null}
              <span className="ml-auto font-mono text-[11px] text-ink-300">
                {pct !== null ? `${pct.toFixed(1)} %` : ""}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={shown}
                onClick={() => onOverride(layer.id, { hidden: shown })}
                title={shown ? "Ebene ausblenden" : "Ebene einblenden"}
                aria-label={`Ebene ${displayColor} ${shown ? "ausblenden" : "einblenden"}`}
                className={`rounded p-1 hover:bg-ink-700 ${shown ? "text-ink-100" : "text-ink-300"}`}
              >
                <EyeIcon open={shown} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
