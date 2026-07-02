import type { TurnPolicy } from "../../lib/potrace/potrace";
import type { PaletteEntry } from "../../lib/potrace/protocol";
import type { DisplaySettings, TraceSettings } from "../types";
import { ColorSwatch, RailCard, SelectField, Slider, Toggle } from "./controls";

const TURN_POLICIES: readonly TurnPolicy[] = [
  "minority",
  "majority",
  "black",
  "white",
  "left",
  "right",
];

export function ParameterRail({
  settings,
  display,
  palette,
  usedThreshold,
  dims,
  paletteLocked,
  onSettings,
  onDisplay,
  onPickFile,
  onLoadSample,
}: {
  settings: TraceSettings;
  display: DisplaySettings;
  palette: readonly PaletteEntry[];
  /** Zuletzt vom Worker gemeldete Schwelle (Otsu-Anzeige). */
  usedThreshold: number | null;
  /** Anzeige "BxH (skaliert)" nach Bildaufnahme. */
  dims: string | null;
  /** Palette ist gepinnt — Farbanzahl-Slider wirkungslos. */
  paletteLocked?: boolean;
  onSettings: (patch: Partial<TraceSettings>) => void;
  onDisplay: (patch: Partial<DisplaySettings>) => void;
  onPickFile: () => void;
  onLoadSample: () => void;
}) {
  const p = settings.params;
  const setParams = (patch: Partial<TraceSettings["params"]>): void =>
    onSettings({ params: { ...p, ...patch } });

  const thresholdDisplay =
    settings.autoThreshold && usedThreshold !== null
      ? `${usedThreshold} (auto)`
      : String(settings.threshold);

  return (
    <div className="space-y-3">
      <RailCard title="Bildquelle" badge={dims ?? undefined}>
        <button
          type="button"
          onClick={onPickFile}
          className="w-full rounded-md border border-dashed border-ink-600 px-3 py-5 text-center text-[13px] text-ink-300 transition-colors hover:border-accent-500 hover:text-ink-100"
        >
          <strong className="block text-ink-100">Bild ablegen oder wählen</strong>
          <span className="font-mono text-[11px]">PNG · JPG · WEBP</span>
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onLoadSample}
            className="flex-1 rounded border border-ink-600 px-2 py-1.5 text-[12px] hover:border-accent-500"
          >
            Beispiel laden
          </button>
          <button
            type="button"
            onClick={onPickFile}
            className="flex-1 rounded border border-ink-600 px-2 py-1.5 text-[12px] hover:border-accent-500"
          >
            Datei wählen
          </button>
        </div>
      </RailCard>

      <RailCard title="Schwellwert" dimmed={settings.colorMode}>
        <Toggle
          label="Automatisch (Otsu)"
          checked={settings.autoThreshold}
          onChange={(on) => onSettings({ autoThreshold: on })}
        />
        <Slider
          label="Helligkeitsgrenze"
          value={
            settings.autoThreshold && usedThreshold !== null
              ? usedThreshold
              : settings.threshold
          }
          display={thresholdDisplay}
          min={1}
          max={254}
          onChange={(v) => onSettings({ threshold: v, autoThreshold: false })}
          hint="Pixel dunkler als die Grenze werden gefüllt."
          dimmed={settings.autoThreshold}
        />
        <Toggle
          label="Invertieren (hell füllen)"
          checked={settings.invert}
          onChange={(on) => onSettings({ invert: on })}
        />
      </RailCard>

      <RailCard title="Trace-Parameter">
        <Toggle
          label="Despeckle (Median 3×3)"
          checked={settings.despeckle}
          onChange={(on) => onSettings({ despeckle: on })}
        />
        <Slider
          label="Fleckfilter · turdsize"
          value={p.turdsize}
          display={String(p.turdsize)}
          min={0}
          max={20}
          onChange={(v) => setParams({ turdsize: v })}
          hint="Unterdrückt Inseln bis zu dieser Fläche (px)."
        />
        <Slider
          label="Eckenschwelle · alphamax"
          value={Math.round(p.alphamax * 100)}
          display={p.alphamax.toFixed(2)}
          min={0}
          max={134}
          onChange={(v) => setParams({ alphamax: v / 100 })}
          hint="Niedrig → mehr Ecken, hoch → mehr Rundungen."
        />
        <Toggle
          label="Kurven optimieren"
          checked={p.optcurve}
          onChange={(on) => setParams({ optcurve: on })}
        />
        <Slider
          label="Toleranz · opttolerance"
          value={Math.round(p.opttolerance * 100)}
          display={p.opttolerance.toFixed(2)}
          min={0}
          max={100}
          onChange={(v) => setParams({ opttolerance: v / 100 })}
          hint="Wie stark Segmente zusammengefasst werden."
          dimmed={!p.optcurve}
        />
        <SelectField
          label="Drehregel · turnpolicy"
          value={p.turnpolicy}
          options={TURN_POLICIES}
          onChange={(v) => setParams({ turnpolicy: v as TurnPolicy })}
        />
      </RailCard>

      <RailCard title="Darstellung">
        <Toggle
          label="Farbig (mehrere Ebenen)"
          checked={settings.colorMode}
          onChange={(on) => onSettings({ colorMode: on })}
        />
        {settings.colorMode ? (
          <>
            <Slider
              label="Farben"
              value={settings.paletteSize}
              display={String(settings.paletteSize)}
              min={2}
              max={16}
              onChange={(v) => onSettings({ paletteSize: v })}
              hint={
                paletteLocked
                  ? "Palette ist gepinnt — Regler wirkt erst nach dem Lösen."
                  : "Bild wird auf so viele Farben reduziert, je Farbe eine getracte Ebene."
              }
              dimmed={paletteLocked}
            />
            {palette.length ? (
              <div className="flex flex-wrap gap-1">
                {palette.map((c) => (
                  <span
                    key={c.hex}
                    title={c.hex}
                    className="h-5 w-5 rounded border border-ink-600"
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
        <div className="flex gap-4">
          <ColorSwatch
            label="Füllung"
            value={settings.fill}
            onChange={(v) => onSettings({ fill: v })}
            dimmed={settings.colorMode}
          />
          <ColorSwatch
            label="Hintergrund"
            value={display.bg}
            onChange={(v) => onDisplay({ bg: v })}
          />
        </div>
        <Toggle
          label="Ankerpunkte im Overlay"
          checked={display.anchors}
          onChange={(on) => onDisplay({ anchors: on })}
        />
      </RailCard>
    </div>
  );
}
