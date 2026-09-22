import { describe, expect, test } from "bun:test";
import { normalizeDisplay, normalizeSettings } from "../src/app/lib/settings";
import { svgFileName } from "../src/app/lib/svg";
import { DEFAULT_DISPLAY, DEFAULT_SETTINGS } from "../src/app/types";

describe("normalizeSettings", () => {
  test("leere/kaputte Session → Defaults", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("x")).toEqual(DEFAULT_SETTINGS);
  });

  test("fehlende Felder werden ergänzt, gültige übernommen", () => {
    const s = normalizeSettings({ colorMode: false, params: { turdsize: 7 } });
    expect(s.colorMode).toBe(false);
    expect(s.paletteSize).toBe(DEFAULT_SETTINGS.paletteSize);
    expect(s.params.turdsize).toBe(7);
    expect(s.params.alphamax).toBe(DEFAULT_SETTINGS.params.alphamax);
  });

  test("falsch typisierte Felder fallen auf Default zurück", () => {
    const s = normalizeSettings({ paletteSize: "8", params: { optcurve: 1 } });
    expect(s.paletteSize).toBe(DEFAULT_SETTINGS.paletteSize);
    expect(s.params.optcurve).toBe(DEFAULT_SETTINGS.params.optcurve);
  });
});

describe("normalizeDisplay", () => {
  test("unbekannte Ansicht → Default", () => {
    expect(normalizeDisplay({ view: "3d", bg: "#000000" })).toEqual({
      ...DEFAULT_DISPLAY,
      bg: "#000000",
    });
  });
});

describe("svgFileName", () => {
  test("Endung ersetzen, unzulässige Zeichen entschärfen", () => {
    expect(svgFileName("logo.png")).toBe("logo.svg");
    expect(svgFileName("mein.logo.final.webp")).toBe("mein.logo.final.svg");
    expect(svgFileName("a:b?.jpg")).toBe("a_b_.svg");
    expect(svgFileName("")).toBe("vektorisiert.svg");
  });
});
