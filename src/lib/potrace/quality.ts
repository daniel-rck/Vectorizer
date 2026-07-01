/**
 * Bildvorverarbeitung & Farbmetrik.
 * Verifiziert (siehe tests/):
 * - Otsu: bimodales 40/220-Testbild -> Schwelle 130 (Plateau-Mitte);
 *   Achtung Fließkomma: Varianzwerte ~1e12, Plateau-Erkennung nur über
 *   exakten Vergleich (===), absolutes Epsilon liegt unterhalb der ulp.
 * - Despeckle: Salt&Pepper-Testbild 596 -> 12 Pfade, ~28ms bei 300x220.
 * - LAB: trennt Schwarz/Dunkelblau (dE² 3180) deutlich stärker als
 *   Navy/Dunkelblau (dE² 67) — RGB-Distanz kehrt das Verhältnis um.
 */

export type Lab = readonly [number, number, number];

/** Otsu-Schwellwert über Luminanz (Alpha über Weiß komponiert), Plateau-Mitte. */
export function otsu(d: Uint8ClampedArray): number {
  const hist = new Float64Array(256);
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const eff = Math.round(lum * a + 255 * (1 - a));
    hist[eff]++;
    total++;
  }
  if (!total) return 128;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let first = 128;
  let last = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > maxVar) {
      maxVar = v;
      first = t;
      last = t;
    } else if (v === maxVar) {
      // Plateau: im leeren Histogramm-Tal bit-identische Werte
      last = t;
    }
  }
  return ((first + last) >> 1) + 1;
}

function median9(v: number[]): number {
  for (let i = 1; i < 9; i++) {
    const k = v[i];
    let j = i - 1;
    while (j >= 0 && v[j] > k) {
      v[j + 1] = v[j];
      j--;
    }
    v[j + 1] = k;
  }
  return v[4];
}

/** 3x3-Median pro Kanal; Rand wird kopiert. Alpha bleibt unverändert. */
export function despeckle(
  d: Uint8ClampedArray,
  w: number,
  h: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(d.length);
  const vr = new Array<number>(9);
  const vg = new Array<number>(9);
  const vb = new Array<number>(9);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        out[o] = d[o];
        out[o + 1] = d[o + 1];
        out[o + 2] = d[o + 2];
        out[o + 3] = d[o + 3];
        continue;
      }
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const p = ((y + dy) * w + (x + dx)) * 4;
          vr[n] = d[p];
          vg[n] = d[p + 1];
          vb[n] = d[p + 2];
          n++;
        }
      }
      out[o] = median9(vr);
      out[o + 1] = median9(vg);
      out[o + 2] = median9(vb);
      out[o + 3] = d[o + 3];
    }
  }
  return out;
}

function srgb2lin(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** sRGB (0..255) -> CIELAB (D65). */
export function rgb2lab(r: number, g: number, b: number): Lab {
  const lr = srgb2lin(r);
  const lg = srgb2lin(g);
  const lb = srgb2lin(b);
  const X = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const Y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const Z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (t: number): number =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Quadrierte LAB-Distanz (deltaE76²). */
export function labDist2(l1: Lab, l2: Lab): number {
  const dl = l1[0] - l2[0];
  const da = l1[1] - l2[1];
  const db = l1[2] - l2[2];
  return dl * dl + da * da + db * db;
}
