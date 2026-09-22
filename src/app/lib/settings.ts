/**
 * Gespeicherte Einstellungen (idb-Session) gegen die aktuellen Defaults
 * absichern: fehlende oder falsch typisierte Felder aus älteren Versionen
 * fallen auf den Default zurück. DOM-frei (bun test).
 */

import {
  DEFAULT_DISPLAY,
  DEFAULT_SETTINGS,
  type DisplaySettings,
  type TraceSettings,
  type ViewMode,
} from "../types";

const VIEWS: readonly ViewMode[] = ["orig", "vector", "overlay", "compare"];

type Loose<T> = { [K in keyof T]?: unknown };

/** Nur Felder mit gleichem Typ wie der Default übernehmen. */
function pick<T extends object>(defaults: T, raw: unknown): T {
  const out = { ...defaults };
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Loose<T>;
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const v = src[key];
    if (v !== undefined && typeof v === typeof defaults[key]) out[key] = v as T[keyof T];
  }
  return out;
}

export function normalizeSettings(raw: unknown): TraceSettings {
  const s = pick(DEFAULT_SETTINGS, raw);
  const params = pick(
    DEFAULT_SETTINGS.params,
    (raw as Loose<TraceSettings> | null)?.params,
  );
  return { ...s, params };
}

export function normalizeDisplay(raw: unknown): DisplaySettings {
  const d = pick(DEFAULT_DISPLAY, raw);
  return VIEWS.includes(d.view) ? d : { ...d, view: DEFAULT_DISPLAY.view };
}
