/**
 * Smoke-Test der App-Seite der Pipeline: Vier-Farben-Fixture durch den
 * Worker (onRequest, ohne Worker-Kontext) und daraus das Export-SVG bauen.
 */
import { describe, expect, test } from "bun:test";
import type { ResultMessage, TraceMessage } from "../src/lib/potrace/protocol";
import { onRequest } from "../src/worker/trace.worker";
import { buildSvg, formatBytes, svgByteSize } from "../src/app/lib/svg";

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

function traceFourColor(): ResultMessage {
  const { d, w, h } = fourColor();
  const ready = onRequest({ type: "image", buf: d.buffer.slice(0) as ArrayBuffer, w, h });
  expect(ready.type).toBe("ready");
  const msg: TraceMessage = {
    type: "trace",
    job: 1,
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
  const r = onRequest(msg);
  expect(r.type).toBe("result");
  if (r.type !== "result") throw new Error("unerreichbar");
  return r;
}

describe("Export-SVG (Smoke, Vier-Farben-Fixture)", () => {
  test("enthält alle Ebenen, viewBox und Naht-Strokes", () => {
    const r = traceFourColor();
    const svg = buildSvg(r.layers, r.w, r.h, { seam: r.layers.length > 1 });
    expect(r.layers.length).toBe(4);
    expect(svg).toStartWith("<svg ");
    expect(svg).toContain(`viewBox="0 0 ${r.w} ${r.h}"`);
    expect((svg.match(/<path /g) ?? []).length).toBe(4);
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('stroke-width="0.5"');
    expect(svg).not.toMatch(/NaN|undefined/);
    // größte Ebene (Hintergrund) wird zuerst gezeichnet
    expect(svg.indexOf("#f4efe6")).toBeLessThan(svg.indexOf("#2e86ab"));
  });

  test("ohne Naht (Mono / eine Ebene) keine stroke-Attribute", () => {
    const r = traceFourColor();
    const svg = buildSvg([r.layers[0]], r.w, r.h, { seam: false });
    expect(svg).not.toContain("stroke");
  });

  test("svgByteSize/formatBytes", () => {
    expect(svgByteSize("<svg/>")).toBe(6);
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });
});
