# vektor — Architektur

> Living Document. Stand: 2026-07-01.

## Stack

web-base-Standard: Bun, Biome, React 19, Vite 8, TypeScript strict, Tailwind 4,
idb (Session-Persistenz), Cloudflare Workers (statisches Hosting, kein Backend).
Scaffold: `bunx github:daniel-rck/web-base`.

## Modulschnitt

```
src/
  lib/potrace/
    potrace.ts      # Kern: Bitmap, trace(), toSVGPathData()  [FERTIG, getestet]
    quality.ts      # otsu, despeckle, rgb2lab, labDist2      [FERTIG, getestet]
    quantize.ts     # buildPalette, quantizeImage             [FERTIG, getestet]
    protocol.ts     # Worker-Nachrichtentypen                 [FERTIG]
  worker/
    trace.worker.ts # Worker: Caches + Orchestrierung         [FERTIG, getestet]
  app/              # React: Zustand, Hooks, Komponenten      [zu bauen]
  pwa/              # Manifest, SW-Registrierung, Share/File-Handler [zu bauen]
tests/
  potrace.test.ts   # 14 Tests, bun:test                      [FERTIG, grün]
```

**Regel:** `lib/` und `worker/` sind DOM-frei (tsconfig-lib: ES2022 + WebWorker)
und bleiben es. UI-Code importiert nur `protocol.ts`-Typen und den Worker.

## Threading-Modell

- Ein dedizierter Trace-Worker: `new Worker(new URL("./worker/trace.worker.ts",
  import.meta.url), { type: "module" })` — Vite bundelt das nativ, kein
  Blob-Trick wie im Prototyp nötig.
- Bild einmal als Transferable (`ArrayBuffer`) an den Worker; danach nur
  Parameter-Nachrichten.
- **Job-Superseding statt Abbruch:** Worker sind nicht unterbrechbar; jede
  Trace-Anfrage trägt eine laufende Job-ID, der Main-Thread verwirft Antworten
  mit veralteter ID. UI-seitig 110ms-Debounce auf Parameteränderungen.
- Kein Sync-Fallback mehr (Prototyp-Altlast für Artefakt-Sandbox) — echte
  Browser haben Worker.

## Caches (im Worker, invalidiert bei neuem Bild)

| Cache        | Schlüssel                    | Inhalt                          |
|--------------|------------------------------|---------------------------------|
| `filtered`   | — (ein Bild)                 | despeckelte RGBA-Kopie          |
| `quantCache` | `${paletteSize}_${despeckle}`| Palette + Pixel-Zuordnung       |
| `otsuCache`  | `despeckle ? 1 : 0`          | Otsu-Schwelle                   |

Paletten-Locking (P3): `lockedPalette` umgeht `buildPalette`, Cache-Schlüssel
wird um Hash der gepinnten Palette erweitert.

## Datenfluss

```
<input/drop> → createImageBitmap → OffscreenCanvas (downscale ≤1600px)
  → ImageData → Worker {type:"image", buf (transfer)}
Parameteränderung → debounce 110ms → Worker {type:"trace", job:n, ...}
Worker → {type:"result", job, layers[{color,d,anchors}], palette, stats, usedThreshold}
  → job === latest? → React-State → SVG-Render + Statistik
```

Ebenen-Sichtbarkeit, Farbänderung, Hintergrund-Weglassen: reine
Main-Thread-Operationen auf dem letzten Result (kein Worker-Roundtrip).

## SVG-Ausgabe

`toSVGPathData()` liefert relative Kommandos (M + c/l + z), Deltas auf dem
1/1000-Raster kumuliert. **Verifiziert:** 0px Drift (Pfad-Schlusstest im
Testpaket), ~35% kleiner als absolute Kodierung bei komplexem Inhalt.
Export-SVG: `viewBox` in Quellpixeln, eine `<path fill-rule="evenodd">` pro
Ebene, Farbmodus zusätzlich `stroke=fill stroke-width=0.5 stroke-linejoin=round`
gegen Haarlinien an Farbgrenzen.

## Performance-Profil (gemessen, Node ≈ Desktop-Browser; Pixel 6 grob ×2–3)

| Eingabe                       | Zeit        |
|-------------------------------|-------------|
| Line-Art 1600² (2,6 MP)       | ~32 ms      |
| Text/Scan 1200² (1552 Pfade)  | ~167 ms     |
| Rauschen 800², turdsize 0     | ~2,2 s      |
| dito + Despeckle              | Pfade ÷50   |

Kosten skalieren mit Konturkomplexität, nicht Pixelzahl. Konsequenzen:
Despeckle prominent anbieten, turdsize-Default 2, Worker obligatorisch.

## Fallstricke (aus dem Prototyp gelernt — nicht wiederholen)

1. **Median-Cut über Pixel** statt distinkte Farben: dominante Flächen fressen
   das Farbbudget, seltene Farben verschwinden. Immer Histogramm-Bins.
2. **Otsu-Plateau:** im leeren Histogramm-Tal ist die Varianz konstant;
   Plateau-Erkennung nur über exakten Vergleich (`===`) — absolute Epsilons
   liegen bei Varianzwerten ~1e12 unterhalb der ulp und sind wirkungslos.
3. **RGB-Distanz** hält Schwarz/Dunkelblau für nah — Zuordnung und
   Duplikat-Merge immer in LAB (deltaE-Merge-Schwelle 2.5).
4. **Beide Viewer-Ebenen absolut positionieren** kollabiert den Container:
   Raster-Canvas bleibt im Fluss (Größengeber), SVG als absolutes Overlay,
   Umschalten über Opazität statt display.
5. Worker-Attach-Guard: `self instanceof DedicatedWorkerGlobalScope` —
   `self.postMessage` existiert auch im Window.

## Qualitäts-Gates (jede Phase)

`biome check` + `tsc --noEmit` (strict) + `bun test` grün. Conventional
Commits, ein atomarer Commit pro Checkpoint.

## Hinweis zum mitgelieferten Stand

`types/bun-test.d.ts` ist ein Stub aus der Container-Verifikation — im
web-base-Repo löschen (bun-types liefert `bun:test`). `.verify/` ebenso.
`package.json`/`tsconfig.json` sind Verifikations-Minimalstände und werden
durch das web-base-Scaffold ersetzt; nur `src/`, `tests/`, `docs/` übernehmen.
