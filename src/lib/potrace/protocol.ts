/**
 * Nachrichtenprotokoll Main-Thread <-> Trace-Worker.
 * Bild wird einmal übertragen (Transferable), danach nur Parameter.
 * Antworten tragen die Job-ID; der Main-Thread verwirft veraltete
 * Ergebnisse (Superseding), da Worker nicht unterbrechbar sind.
 */

import type { TraceParams } from "./potrace";

export interface ImageMessage {
  type: "image";
  /** RGBA, Länge = w*h*4. Als Transferable senden. */
  buf: ArrayBuffer;
  w: number;
  h: number;
}

export interface TraceMessage {
  type: "trace";
  job: number;
  colorMode: boolean;
  paletteSize: number;
  params: TraceParams;
  /** Füllfarbe im Monochrom-Modus. */
  fill: string;
  despeckle: boolean;
  /** Mono: Schwelle automatisch via Otsu bestimmen. */
  autoThreshold: boolean;
  /** Mono: manuelle Helligkeitsgrenze (ignoriert bei autoThreshold). */
  threshold: number;
  /** Mono: helle statt dunkle Pixel füllen. */
  invert: boolean;
  /**
   * Feste Palette (Paletten-Locking). Wenn gesetzt, wird keine neue
   * Palette gebaut, nur die Zuordnung gerechnet.
   */
  lockedPalette?: string[];
}

export type WorkerRequest = ImageMessage | TraceMessage;

export interface TraceLayer {
  /** Hex-Farbe der Ebene. */
  color: string;
  /** SVG-Pfaddaten (relative Kodierung). */
  d: string;
  /** Ankerpunkte als flaches [x0,y0,x1,y1,...] für das Overlay. */
  anchors: number[];
}

export interface TraceStats {
  paths: number;
  seg: number;
  curves: number;
  lines: number;
}

export interface PaletteEntry {
  hex: string;
  area: number;
}

export interface ReadyMessage {
  type: "ready";
}

export interface ResultMessage {
  type: "result";
  job: number;
  w: number;
  h: number;
  /** Größte Fläche zuerst (Zeichenreihenfolge unten -> oben). */
  layers: TraceLayer[];
  palette: PaletteEntry[];
  stats: TraceStats;
  /** Tatsächlich verwendete Schwelle (Mono-Modus), z.B. Otsu-Ergebnis. */
  usedThreshold: number | null;
}

export interface ErrorMessage {
  type: "error";
  job: number;
  message: string;
}

export type WorkerResponse = ReadyMessage | ResultMessage | ErrorMessage;
