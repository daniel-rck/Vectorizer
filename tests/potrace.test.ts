/**
 * Kern-Tests — Erwartungswerte stammen aus der verifizierten Referenz
 * (Node-Harness der Prototyp-Phase). Läuft unter `bun test`.
 */
import { describe, expect, test } from "bun:test";
import { Bitmap, trace, toSVGPathData } from "../src/lib/potrace/potrace";
import { despeckle, labDist2, otsu, rgb2lab } from "../src/lib/potrace/quality";
import { buildPalette, quantizeImage, rgbToHex } from "../src/lib/potrace/quantize";
import { onRequest } from "../src/worker/trace.worker";
import type { TraceMessage } from "../src/lib/potrace/protocol";

function makeBitmap(w: number, h: number, fn: (x: number, y: number) => boolean): Bitmap {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data[y * w + x] = fn(x, y) ? 1 : 0;
  return new Bitmap(w, h, data);
}

function bezierPoint(
  t: number,
  p0: [number, number], p1: [number, number],
  p2: [number, number], p3: [number, number],
): [number, number] {
  const s = 1 - t;
  return [
    s ** 3 * p0[0] + 3 * s * s * t * p1[0] + 3 * s * t * t * p2[0] + t ** 3 * p3[0],
    s ** 3 * p0[1] + 3 * s * s * t * p1[1] + 3 * s * t * t * p2[1] + t ** 3 * p3[1],
  ];
}

describe("potrace-Kern", () => {
  test("Kreis: wenige Bézier-Segmente, Sub-Pixel-Genauigkeit", () => {
    const bm = makeBitmap(100, 100, (x, y) => (x - 50) ** 2 + (y - 50) ** 2 <= 30 * 30);
    const res = trace(bm);
    expect(res.pathlist.length).toBe(1);
    const cv = res.pathlist[0].curve;
    expect(cv).not.toBeNull();
    if (!cv) return;
    expect(cv.n).toBeLessThanOrEqual(6); // Referenz: 3 Segmente
    let prev: [number, number] = [cv.c[(cv.n - 1) * 3 + 2].x, cv.c[(cv.n - 1) * 3 + 2].y];
    const errs: number[] = [];
    for (let i = 0; i < cv.n; i++) {
      if (cv.tag[i] === "CURVE") {
        const p1: [number, number] = [cv.c[i * 3].x, cv.c[i * 3].y];
        const p2: [number, number] = [cv.c[i * 3 + 1].x, cv.c[i * 3 + 1].y];
        const p3: [number, number] = [cv.c[i * 3 + 2].x, cv.c[i * 3 + 2].y];
        for (let t = 0; t <= 1.001; t += 0.1) {
          const [px, py] = bezierPoint(t, prev, p1, p2, p3);
          errs.push(Math.abs(Math.hypot(px - 50, py - 50) - 30));
        }
        prev = p3;
      } else {
        prev = [cv.c[i * 3 + 2].x, cv.c[i * 3 + 2].y];
      }
    }
    expect(Math.max(...errs)).toBeLessThan(1.5); // Referenz: 1.014px max
  });

  test("Ring: 2 Pfade mit Vorzeichen +/- (Loch via XOR)", () => {
    const bm = makeBitmap(120, 120, (x, y) => {
      const dd = (x - 60) ** 2 + (y - 60) ** 2;
      return dd <= 45 * 45 && dd >= 20 * 20;
    });
    const res = trace(bm);
    expect(res.pathlist.length).toBe(2);
    expect(res.pathlist.map((p) => p.sign).sort()).toEqual(["+", "-"]);
  });

  test("Rechteck: exakte Ecken, keine NaN", () => {
    const bm = makeBitmap(80, 60, (x, y) => x >= 10 && x < 70 && y >= 10 && y < 50);
    const d = toSVGPathData(trace(bm));
    expect(d).toContain("M10 30");
    expect(d).not.toMatch(/NaN|undefined/);
  });

  test("turdsize unterdrückt kleine Inseln", () => {
    const bm = makeBitmap(60, 60, (x, y) =>
      (x >= 10 && x < 40 && y >= 10 && y < 40) || (x === 50 && y === 50),
    );
    expect(trace(bm, { turdsize: 2 }).pathlist.length).toBe(1);
    expect(trace(bm, { turdsize: 0 }).pathlist.length).toBe(2);
  });

  test("relative Pfadkodierung: Pfade schließen exakt (kein Drift)", () => {
    const bm = makeBitmap(300, 300, (x, y) => {
      const dd = (x - 150) ** 2 + (y - 150) ** 2;
      return dd <= 120 * 120 && dd >= 60 * 60;
    });
    const d = toSVGPathData(trace(bm));
    const tokens = d.match(/[Mclz]|-?\.?\d+(?:\.\d+)?/g);
    expect(tokens).not.toBeNull();
    if (!tokens) return;
    let i = 0;
    let x = 0, y = 0, mx = 0, my = 0;
    const num = (): number => parseFloat(tokens[i++]);
    while (i < tokens.length) {
      const cmd = tokens[i++];
      if (cmd === "M") { x = num(); y = num(); mx = x; my = y; }
      else if (cmd === "l") { x += num(); y += num(); }
      else if (cmd === "c") { num(); num(); num(); num(); x += num(); y += num(); }
      else if (cmd === "z") {
        expect(Math.abs(x - mx)).toBeLessThan(0.002);
        expect(Math.abs(y - my)).toBeLessThan(0.002);
      }
    }
  });
});

describe("quality", () => {
  function noisyBimodal(): { d: Uint8ClampedArray; w: number; h: number } {
    const w = 200, h = 150;
    const d = new Uint8ClampedArray(w * h * 4);
    let seed = 42;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dark = (x - 60) ** 2 + (y - 75) ** 2 <= 40 * 40;
        const v = Math.max(0, Math.min(255, (dark ? 40 : 220) + (rnd() * 30 - 15)));
        const i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
    return { d, w, h };
  }

  test("Otsu: Plateau-Mitte im bimodalen Tal", () => {
    const { d } = noisyBimodal();
    const th = otsu(d);
    expect(th).toBeGreaterThan(100);
    expect(th).toBeLessThan(160); // Referenz: exakt 130
  });

  test("Otsu: degenerierte Eingaben crashen nicht", () => {
    expect(otsu(new Uint8ClampedArray(0))).toBe(128);
    const uni = new Uint8ClampedArray(400);
    for (let i = 0; i < 400; i += 4) { uni[i] = uni[i+1] = uni[i+2] = 128; uni[i+3] = 255; }
    expect(otsu(uni)).toBeGreaterThan(0);
  });

  test("despeckle entfernt Salt&Pepper (Pfadzahl kollabiert)", () => {
    const { d, w, h } = noisyBimodal();
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < d.length; i += 4)
      if (rnd() < 0.04) { const v = rnd() < 0.5 ? 0 : 255; d[i] = d[i+1] = d[i+2] = v; }
    const th = 130;
    const toBm = (dd: Uint8ClampedArray): Bitmap => {
      const bm = new Bitmap(w, h);
      for (let i = 0, p = 0; i < dd.length; i += 4, p++) {
        const lum = 0.299 * dd[i] + 0.587 * dd[i+1] + 0.114 * dd[i+2];
        bm.data[p] = lum < th ? 1 : 0;
      }
      return bm;
    };
    const before = trace(toBm(d), { turdsize: 0 }).pathlist.length;
    const after = trace(toBm(despeckle(d, w, h)), { turdsize: 0 }).pathlist.length;
    expect(after).toBeLessThan(before / 5); // Referenz: 596 -> 12
  });

  test("LAB trennt Schwarz/Dunkelblau stärker als Navy/Dunkelblau", () => {
    const black = rgb2lab(0, 0, 0);
    const darkblue = rgb2lab(0, 0, 80);
    const navy = rgb2lab(20, 20, 100);
    expect(labDist2(black, darkblue)).toBeGreaterThan(labDist2(darkblue, navy) * 10);
  });
});

describe("quantize", () => {
  function fourColor(): { d: Uint8ClampedArray; w: number; h: number } {
    const w = 200, h = 150;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let c: [number, number, number] = [244, 239, 230];
        if ((x - 60) ** 2 + (y - 75) ** 2 <= 40 * 40) c = [46, 134, 171];
        else if (x > 120 && x < 175 && y > 20 && y < 70) c = [192, 57, 43];
        else if (x > 120 && x < 175 && y > 90 && y < 130) c = [39, 174, 96];
        const i = (y * w + x) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    return { d, w, h };
  }

  test("findet alle 4 Farben trotz dominantem Hintergrund", () => {
    const { d } = fourColor();
    const pal = buildPalette(d, 6);
    expect(pal.length).toBe(4);
    expect(pal.map(rgbToHex).sort()).toEqual(["#27ae60", "#2e86ab", "#c0392b", "#f4efe6"]);
  });

  test("Zuordnung deckt alle opaken Pixel", () => {
    const { d, w, h } = fourColor();
    const q = quantizeImage(d, w, h, 6);
    expect(q.area.reduce((a, b) => a + b, 0)).toBe(w * h);
    expect(Math.max(...q.area)).toBeGreaterThan((w * h) / 2);
  });
});

describe("worker (onRequest, ohne Worker-Kontext)", () => {
  const params = {
    turnpolicy: "minority" as const,
    turdsize: 2, alphamax: 1.0, optcurve: true, opttolerance: 0.2,
  };
  const base: Omit<TraceMessage, "job"> = {
    type: "trace", colorMode: true, paletteSize: 6, params,
    fill: "#000000", despeckle: false, autoThreshold: false,
    threshold: 128, invert: false,
  };

  function loadFourColor(): void {
    const w = 200, h = 150;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let c: [number, number, number] = [244, 239, 230];
        if ((x - 60) ** 2 + (y - 75) ** 2 <= 40 * 40) c = [46, 134, 171];
        else if (x > 120 && x < 175 && y > 20 && y < 70) c = [192, 57, 43];
        else if (x > 120 && x < 175 && y > 90 && y < 130) c = [39, 174, 96];
        const i = (y * w + x) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    const ready = onRequest({ type: "image", buf: d.buffer.slice(0) as ArrayBuffer, w, h });
    expect(ready.type).toBe("ready");
  }

  test("Farb-Trace: 4 Ebenen, größte zuerst, saubere Pfade", () => {
    loadFourColor();
    const r = onRequest({ ...base, job: 1 });
    expect(r.type).toBe("result");
    if (r.type !== "result") return;
    expect(r.layers.length).toBe(4);
    expect(r.layers[0].color).toBe("#f4efe6");
    expect(r.layers.every((L) => !/NaN|undefined/.test(L.d))).toBe(true);
    expect(r.stats.paths).toBeGreaterThan(0);
  });

  test("Mono mit Otsu meldet usedThreshold", () => {
    loadFourColor();
    const r = onRequest({ ...base, job: 2, colorMode: false, autoThreshold: true });
    expect(r.type).toBe("result");
    if (r.type !== "result") return;
    expect(r.usedThreshold).not.toBeNull();
    expect(r.layers.length).toBe(1);
    expect(r.layers[0].color).toBe("#000000");
  });

  test("1x1-Transparentbild: 0 Ebenen, kein Crash", () => {
    const ready = onRequest({ type: "image", buf: new ArrayBuffer(4), w: 1, h: 1 });
    expect(ready.type).toBe("ready");
    const r = onRequest({ ...base, job: 3 });
    expect(r.type).toBe("result");
    if (r.type !== "result") return;
    expect(r.layers.length).toBe(0);
  });
});
