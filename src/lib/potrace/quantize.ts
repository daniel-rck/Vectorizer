/**
 * Farbquantisierung: Median-Cut über *distinkte* Farben (Histogramm-Bins),
 * nicht über Pixel — sonst dominiert eine große Hintergrundfläche die
 * Splits und seltene Farben gehen verloren (verifizierter Fehlerfall:
 * Grün fehlte bei pixelbasiertem Median-Cut komplett).
 *
 * Zuordnung Pixel -> Palette läuft in CIELAB (wahrnehmungskorrekt),
 * beschleunigt über eine 32^3-LUT: identische 5-Bit-Bins ergeben
 * identische Zuordnung, rgb2lab wird pro Bin nur einmal gerechnet.
 */

import { type Lab, labDist2, rgb2lab } from "./quality";

export type RGB = readonly [number, number, number];

export interface Quantization {
  /** Pixel-Index -> Palettenindex, -1 für transparent. */
  idx: Int16Array;
  palette: RGB[];
  /** Pixelanzahl je Palettenfarbe. */
  area: number[];
}

interface HistEntry {
  r: number;
  g: number;
  b: number;
  cnt: number;
}

interface Box {
  e: HistEntry[];
  rR: number;
  rG: number;
  rB: number;
  avg: RGB;
}

function mkbox(e: HistEntry[]): Box {
  let rmn = 255,
    rmx = 0,
    gmn = 255,
    gmx = 0,
    bmn = 255,
    bmx = 0,
    sr = 0,
    sg = 0,
    sb = 0,
    sc = 0;
  for (const p of e) {
    if (p.r < rmn) rmn = p.r;
    if (p.r > rmx) rmx = p.r;
    if (p.g < gmn) gmn = p.g;
    if (p.g > gmx) gmx = p.g;
    if (p.b < bmn) bmn = p.b;
    if (p.b > bmx) bmx = p.b;
    sr += p.r * p.cnt;
    sg += p.g * p.cnt;
    sb += p.b * p.cnt;
    sc += p.cnt;
  }
  sc = sc || 1;
  return {
    e,
    rR: rmx - rmn,
    rG: gmx - gmn,
    rB: bmx - bmn,
    avg: [Math.round(sr / sc), Math.round(sg / sc), Math.round(sb / sc)],
  };
}

/** Palette mit maximal k Farben; nahe Duplikate (deltaE < 2.5) verschmolzen. */
export function buildPalette(d: Uint8ClampedArray, k: number): RGB[] {
  const SH = 3;
  const map = new Map<number, { c: number; r: number; g: number; b: number }>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const key = ((r >> SH) << 10) | ((g >> SH) << 5) | (b >> SH);
    const e = map.get(key);
    if (e) {
      e.c++;
      e.r += r;
      e.g += g;
      e.b += b;
    } else map.set(key, { c: 1, r, g, b });
  }
  if (!map.size) return [];
  const entries: HistEntry[] = [];
  map.forEach((e) => {
    entries.push({ r: e.r / e.c, g: e.g / e.c, b: e.b / e.c, cnt: e.c });
  });
  const boxes: Box[] = [mkbox(entries)];
  while (boxes.length < k) {
    let bi = -1;
    let best = -1;
    for (let i = 0; i < boxes.length; i++) {
      const bx = boxes[i];
      if (bx.e.length < 2) continue;
      const rr = Math.max(bx.rR, bx.rG, bx.rB);
      if (rr > best) {
        best = rr;
        bi = i;
      }
    }
    if (bi < 0) break;
    const bx = boxes[bi];
    const ch: keyof HistEntry =
      bx.rR >= bx.rG && bx.rR >= bx.rB ? "r" : bx.rG >= bx.rB ? "g" : "b";
    bx.e.sort((p, q) => p[ch] - q[ch]);
    const m = bx.e.length >> 1;
    boxes.splice(bi, 1, mkbox(bx.e.slice(0, m)), mkbox(bx.e.slice(m)));
  }
  const pal: RGB[] = [];
  const labs: Lab[] = [];
  for (const bx of boxes) {
    const c = bx.avg;
    const cl = rgb2lab(c[0], c[1], c[2]);
    let dup = false;
    for (const l of labs) {
      if (labDist2(l, cl) < 6.25) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      pal.push(c);
      labs.push(cl);
    }
  }
  return pal;
}

function nearestLab(palLab: Lab[], lab: Lab): number {
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < palLab.length; i++) {
    const dd = labDist2(palLab[i], lab);
    if (dd < bd) {
      bd = dd;
      bi = i;
    }
  }
  return bi;
}

/** Vollständige Quantisierung: Palette + Pixelzuordnung + Flächen. */
export function quantizeImage(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  k: number,
): Quantization {
  const palette = buildPalette(d, k);
  const palLab = palette.map((c) => rgb2lab(c[0], c[1], c[2]));
  const idx = new Int16Array(w * h);
  idx.fill(-1);
  const area = new Array<number>(palette.length).fill(0);
  const lut = new Int16Array(32768);
  lut.fill(-1);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (d[i + 3] < 128) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let j = lut[key];
    if (j < 0) {
      j = nearestLab(palLab, rgb2lab(r, g, b));
      lut[key] = j;
    }
    idx[p] = j;
    area[j]++;
  }
  return { idx, palette, area };
}

export function rgbToHex(c: RGB): string {
  return (
    "#" +
    ("0" + c[0].toString(16)).slice(-2) +
    ("0" + c[1].toString(16)).slice(-2) +
    ("0" + c[2].toString(16)).slice(-2)
  );
}
