/**
 * P3: Paletten-Locking — feste Palette umgeht den Median-Cut, es wird
 * nur die LAB-Zuordnung gerechnet. Neue Tests, bestehende bleiben unverändert.
 */
import { describe, expect, test } from "bun:test";
import type { TraceMessage } from "../src/lib/potrace/protocol";
import { hexToRgb, quantizeWithPalette, rgbToHex } from "../src/lib/potrace/quantize";
import { onRequest } from "../src/worker/trace.worker";

function fourColor(): { d: Uint8ClampedArray; w: number; h: number } {
  const w = 200,
    h = 150;
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c: [number, number, number] = [244, 239, 230];
      if ((x - 60) ** 2 + (y - 75) ** 2 <= 40 * 40) c = [46, 134, 171];
      else if (x > 120 && x < 175 && y > 20 && y < 70) c = [192, 57, 43];
      else if (x > 120 && x < 175 && y > 90 && y < 130) c = [39, 174, 96];
      const i = (y * w + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  return { d, w, h };
}

const baseMsg: Omit<TraceMessage, "job"> = {
  type: "trace",
  colorMode: true,
  paletteSize: 6,
  params: {
    turnpolicy: "minority",
    turdsize: 2,
    alphamax: 1.0,
    optcurve: true,
    opttolerance: 0.2,
  },
  fill: "#000000",
  despeckle: false,
  autoThreshold: false,
  threshold: 128,
  invert: false,
};

function loadImage(): void {
  const { d, w, h } = fourColor();
  const ready = onRequest({ type: "image", buf: d.buffer.slice(0) as ArrayBuffer, w, h });
  expect(ready.type).toBe("ready");
}

describe("hexToRgb", () => {
  test("Roundtrip mit rgbToHex", () => {
    expect(hexToRgb("#2e86ab")).toEqual([46, 134, 171]);
    expect(rgbToHex(hexToRgb("#c0392b"))).toBe("#c0392b");
    expect(hexToRgb("F4EFE6")).toEqual([244, 239, 230]);
  });

  test("ungültige Eingabe -> Schwarz", () => {
    expect(hexToRgb("kaputt")).toEqual([0, 0, 0]);
    expect(hexToRgb("#fff")).toEqual([0, 0, 0]);
  });
});

describe("quantizeWithPalette", () => {
  test("deckt alle opaken Pixel mit der festen Palette", () => {
    const { d, w, h } = fourColor();
    const pal = ["#f4efe6", "#2e86ab", "#c0392b", "#27ae60"].map(hexToRgb);
    const q = quantizeWithPalette(d, w, h, [...pal]);
    expect(q.palette.length).toBe(4);
    expect(q.area.reduce((a, b) => a + b, 0)).toBe(w * h);
    expect(q.idx.includes(-1)).toBe(false);
  });

  test("leere Palette: keine Zuordnung, kein Crash", () => {
    const { d, w, h } = fourColor();
    const q = quantizeWithPalette(d, w, h, []);
    expect(q.palette.length).toBe(0);
    expect(q.area.length).toBe(0);
    expect(q.idx.every((v) => v === -1)).toBe(true);
  });
});

describe("worker: lockedPalette", () => {
  test("2-Farben-Pin: exakt diese Ebenenfarben, alle Pixel zugeordnet", () => {
    loadImage();
    const locked = ["#f4efe6", "#2e86ab"];
    const r = onRequest({ ...baseMsg, job: 10, lockedPalette: locked });
    expect(r.type).toBe("result");
    if (r.type !== "result") return;
    expect(r.layers.map((l) => l.color).sort()).toEqual([...locked].sort());
    expect(r.palette.map((p) => p.hex).sort()).toEqual([...locked].sort());
    // paletteSize (6) wird bei gepinnter Palette ignoriert
    expect(r.layers.length).toBe(2);
    const total = r.palette.reduce((a, p) => a + p.area, 0);
    expect(total).toBe(200 * 150);
  });

  test("gepinnte Farbe ohne Pixel-Nähe erzeugt keine leere Ebene", () => {
    loadImage();
    // Magenta liegt LAB-fern von allen Bildfarben -> bekommt keine Pixel...
    // aber nearest-Zuordnung vergibt immer: hier gewinnt Magenta nie.
    const r = onRequest({
      ...baseMsg,
      job: 11,
      lockedPalette: ["#f4efe6", "#2e86ab", "#c0392b", "#27ae60", "#ff00ff"],
    });
    expect(r.type).toBe("result");
    if (r.type !== "result") return;
    expect(r.layers.some((l) => l.color === "#ff00ff")).toBe(false);
    expect(r.layers.length).toBe(4);
  });

  test("Cache trennt gepinnte und freie Palette (Superseding-sicher)", () => {
    loadImage();
    const free = onRequest({ ...baseMsg, job: 12 });
    const locked = onRequest({
      ...baseMsg,
      job: 13,
      lockedPalette: ["#000000", "#ffffff"],
    });
    const freeAgain = onRequest({ ...baseMsg, job: 14 });
    expect(free.type).toBe("result");
    expect(locked.type).toBe("result");
    expect(freeAgain.type).toBe("result");
    if (free.type !== "result" || locked.type !== "result" || freeAgain.type !== "result")
      return;
    expect(locked.layers.length).toBe(2);
    expect(free.layers.length).toBe(4);
    expect(freeAgain.layers.map((l) => l.color)).toEqual(free.layers.map((l) => l.color));
  });
});
