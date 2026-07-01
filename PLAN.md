# PLAN — vektor

Spec: `docs/specs/produkt.md`, `docs/specs/architektur.md`. Beide zuerst lesen.

**Eiserne Regel:** `src/lib/potrace/**`, `src/worker/trace.worker.ts` und
`tests/potrace.test.ts` sind fertig und getestet (14/14 grün). In P0–P2 nicht
anfassen; ab P3 nur additiv erweitern (Paletten-Locking), bestehende Tests
bleiben unverändert grün.

**Gate nach jeder Phase:** `biome check` + `tsc --noEmit` + `bun test` grün,
dann ein atomarer Commit (Conventional Commits). Nicht weiter bei rotem Gate.

---

## P0 — Scaffold & Übernahme
- [ ] `bunx github:daniel-rck/web-base` Scaffold, Projektname final entscheiden
- [ ] `src/lib/potrace/`, `src/worker/`, `tests/`, `docs/` aus diesem Paket übernehmen
- [ ] `types/bun-test.d.ts` und `.verify/` löschen (Container-Altlasten)
- [ ] tsconfig: lib `ES2022 + WebWorker + DOM` fürs App-Verzeichnis prüfen —
      lib/ und worker/ müssen DOM-frei kompilieren (ggf. project references)
- [ ] Gate: `bun test` → 14/14 grün im neuen Repo
- Commit: `chore: scaffold + verified potrace core`

## P1 — Trace-Pipeline & Minimal-UI
- [ ] `useTraceWorker`-Hook: Worker-Lifecycle, Bild senden (Transferable),
      Job-Superseding, Busy-State (Architektur §Threading)
- [ ] Bildaufnahme: File-Dialog + Drag&Drop, Downscale ≤1600px via
      createImageBitmap + OffscreenCanvas
- [ ] Viewer: Raster-Canvas im Fluss + SVG-Overlay (Fallstrick 4 beachten!),
      Ansichten Original/Vektor/Overlay, Ankerpunkte im Overlay
- [ ] Parameter-Rail: alle Trace-Parameter, Farb-/Mono-Umschalter, Despeckle,
      Otsu-Auto mit Anzeige der gefundenen Schwelle, Reset
- [ ] Statistikzeile + SVG-Export (Download, Clipboard)
- [ ] Smoke-Test: Vier-Farben-Testbild aus tests/ als Fixture rendern
- Commit: `feat: trace pipeline with full parameter rail`

## P2 — Feinschliff Kern-UX
- [ ] Debounce 110ms, Busy-Indikator nur bei >150ms Latenz (kein Flackern)
- [ ] Mobile Layout: Viewer zuerst, Parameter als Bottom-Sheet
- [ ] Fehlerpfade: kaputte Datei, riesiges Bild, 0-Ebenen-Ergebnis
- Commit: `feat: responsive layout and error handling`

## P3 — Ebenen-Panel & Paletten-Locking
- [ ] Panel: Chip, Hex, Flächen-%, Sichtbar-Toggle, Farb-Picker (nur Render)
- [ ] „Hintergrund weglassen" (größte Ebene, Ein-Klick)
- [ ] Worker: `lockedPalette`-Pfad implementieren (Protokollfeld existiert),
      Cache-Schlüssel erweitern, **neue Tests** für gepinnte Palette
- [ ] Pin-UI: Chip anklicken → editieren/pinnen/lösen
- Commit: `feat: layer panel with palette locking`

## P4 — Zoom, Pan, Vergleich
- [ ] Gemeinsamer Transform für Raster+SVG: Wheel/Pinch auf Cursor, Drag-Pan,
      Doppeltipp fit
- [ ] Vorher/Nachher-Wischregler als vierte Ansicht
- Commit: `feat: zoom, pan and compare slider`

## P5 — PWA
- [ ] vite-plugin-pwa (web-base-Preset), Manifest, Icons, offline
- [ ] Share Target + File Handling API (image/png, image/jpeg, image/webp)
- [ ] Session-Persistenz in idb (letztes Bild + Parameter), Restore beim Start
- [ ] Lighthouse-PWA-Check auf dem Pixel 6
- Commit: `feat: installable pwa with share target and session restore`

---

Backlog (nicht Teil dieses Plans): Centerline-Tracing, Batch+ZIP,
WASM-Kern via amigo-native, Sauvola. Siehe produkt.md §Backlog.
