/// <reference lib="webworker" />
/**
 * Trace-Worker: hält das Bild, cacht Despeckle/Quantisierung/Otsu,
 * führt Potrace pro Ebene aus und liefert fertige SVG-Pfaddaten.
 *
 * Als Vite-Worker einbinden:
 *   const worker = new Worker(new URL("./trace.worker.ts", import.meta.url), { type: "module" });
 */

import { Bitmap, trace, toSVGPathData, type TraceResult } from "../lib/potrace/potrace";
import { despeckle, otsu } from "../lib/potrace/quality";
import {
  hexToRgb,
  quantizeImage,
  quantizeWithPalette,
  rgbToHex,
  type Quantization,
} from "../lib/potrace/quantize";
import type {
  ResultMessage,
  TraceLayer,
  TraceMessage,
  TraceStats,
  WorkerRequest,
  WorkerResponse,
} from "../lib/potrace/protocol";

interface ImageState {
  d: Uint8ClampedArray;
  w: number;
  h: number;
}

let img: ImageState | null = null;
let filtered: Uint8ClampedArray | null = null;
const quantCache = new Map<string, Quantization>();
const otsuCache = new Map<number, number>();

function srcFor(useDespeckle: boolean): Uint8ClampedArray {
  if (!img) throw new Error("kein Bild geladen");
  if (!useDespeckle) return img.d;
  if (!filtered) filtered = despeckle(img.d, img.w, img.h);
  return filtered;
}

function collectAnchors(res: TraceResult, arr: number[]): void {
  for (const path of res.pathlist) {
    const cv = path.curve;
    if (!cv) continue;
    for (let i = 0; i < cv.n; i++) {
      const v = cv.c[i * 3 + 2];
      arr.push(v.x, v.y);
    }
  }
}

function collectStats(res: TraceResult, st: TraceStats): void {
  for (const path of res.pathlist) {
    const cv = path.curve;
    if (!cv) continue;
    st.paths++;
    st.seg += cv.n;
    for (let i = 0; i < cv.n; i++) {
      if (cv.tag[i] === "CURVE") st.curves++;
      else st.lines++;
    }
  }
}

function getQuant(
  k: number,
  useDespeckle: boolean,
  lockedPalette?: string[],
): Quantization {
  // Gepinnte Palette geht in den Cache-Schlüssel ein (max. 16 Einträge)
  const key = lockedPalette
    ? `L_${lockedPalette.join(",")}_${useDespeckle ? 1 : 0}`
    : `${k}_${useDespeckle ? 1 : 0}`;
  const hit = quantCache.get(key);
  if (hit) return hit;
  if (!img) throw new Error("kein Bild geladen");
  const src = srcFor(useDespeckle);
  const q = lockedPalette
    ? quantizeWithPalette(src, img.w, img.h, lockedPalette.map(hexToRgb))
    : quantizeImage(src, img.w, img.h, k);
  quantCache.set(key, q);
  return q;
}

function handleTrace(msg: TraceMessage): ResultMessage {
  if (!img) throw new Error("kein Bild geladen");
  const { w, h } = img;
  const layers: TraceLayer[] = [];
  const palette: ResultMessage["palette"] = [];
  const stats: TraceStats = { paths: 0, seg: 0, curves: 0, lines: 0 };
  let usedThreshold: number | null = null;

  if (msg.colorMode) {
    const q = getQuant(msg.paletteSize, msg.despeckle, msg.lockedPalette);
    const order = q.palette
      .map((_, i) => i)
      .filter((i) => q.area[i] > 0)
      .sort((a, b) => q.area[b] - q.area[a]);
    for (const j of order) {
      const bm = new Bitmap(w, h);
      for (let p = 0; p < q.idx.length; p++) bm.data[p] = q.idx[p] === j ? 1 : 0;
      const res = trace(bm, msg.params);
      const d = toSVGPathData(res);
      if (!d) continue;
      const anchors: number[] = [];
      collectAnchors(res, anchors);
      collectStats(res, stats);
      layers.push({ color: rgbToHex(q.palette[j]), d, anchors });
      palette.push({ hex: rgbToHex(q.palette[j]), area: q.area[j] });
    }
  } else {
    const d = srcFor(msg.despeckle);
    const bm = new Bitmap(w, h);
    const th = resolveThreshold(msg, d);
    usedThreshold = th;
    const inv = msg.invert;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const a = d[i + 3] / 255;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const eff = lum * a + 255 * (1 - a);
      let filled = eff < th;
      if (inv) filled = !filled;
      bm.data[p] = filled ? 1 : 0;
    }
    const res = trace(bm, msg.params);
    const anchors: number[] = [];
    collectAnchors(res, anchors);
    collectStats(res, stats);
    layers.push({ color: msg.fill, d: toSVGPathData(res), anchors });
  }
  return {
    type: "result",
    job: msg.job,
    w,
    h,
    layers,
    palette,
    stats,
    usedThreshold,
  };
}

function resolveThreshold(msg: TraceMessage, d: Uint8ClampedArray): number {
  if (!msg.autoThreshold) return msg.threshold;
  const key = msg.despeckle ? 1 : 0;
  let v = otsuCache.get(key);
  if (v === undefined) {
    v = otsu(d);
    otsuCache.set(key, v);
  }
  return v;
}

function onRequest(msg: WorkerRequest): WorkerResponse {
  if (msg.type === "image") {
    img = { d: new Uint8ClampedArray(msg.buf), w: msg.w, h: msg.h };
    filtered = null;
    quantCache.clear();
    otsuCache.clear();
    return { type: "ready" };
  }
  try {
    return handleTrace(msg);
  } catch (e) {
    return {
      type: "error",
      job: msg.job,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

// Worker-Kontext: onmessage nur registrieren, wenn wir wirklich in einem
// DedicatedWorker laufen (nicht in Tests/Node — dort wird onRequest direkt
// importiert und aufgerufen).
if (
  typeof self !== "undefined" &&
  typeof DedicatedWorkerGlobalScope !== "undefined" &&
  self instanceof DedicatedWorkerGlobalScope
) {
  self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
    self.postMessage(onRequest(ev.data));
  };
}

export { onRequest };
