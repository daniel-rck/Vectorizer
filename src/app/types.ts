import { DEFAULT_PARAMS, type TraceParams } from "../lib/potrace/potrace";

/** Alle Einstellungen, die einen Worker-Trace auslösen. */
export interface TraceSettings {
  colorMode: boolean;
  paletteSize: number;
  despeckle: boolean;
  autoThreshold: boolean;
  threshold: number;
  invert: boolean;
  /** Füllfarbe im Monochrom-Modus. */
  fill: string;
  params: TraceParams;
}

export const DEFAULT_SETTINGS: TraceSettings = {
  colorMode: true,
  paletteSize: 6,
  despeckle: false,
  autoThreshold: true,
  threshold: 128,
  invert: false,
  fill: "#0e141b",
  params: { ...DEFAULT_PARAMS },
};

export type ViewMode = "orig" | "vector" | "overlay";

/** Reine Darstellungsoptionen — lösen keinen Re-Trace aus. */
export interface DisplaySettings {
  view: ViewMode;
  anchors: boolean;
  /** Hintergrundfarbe hinter dem Vektor-Render (nur Anzeige). */
  bg: string;
}

export const DEFAULT_DISPLAY: DisplaySettings = {
  view: "vector",
  anchors: true,
  bg: "#ffffff",
};

export interface SourceImage {
  data: ImageData;
  /** true, wenn auf ≤1600px längste Kante herunterskaliert wurde. */
  scaled: boolean;
  /** Monoton steigende Nummer, damit Effekte neue Bilder erkennen. */
  version: number;
}
