# vektor — Produkt-Spec

> Living Document. Stand: 2026-07-01. Arbeitstitel `vektor` — Name vor Phase 1 final entscheiden.

## Was es ist

Browser-PWA, die Rasterbilder (PNG/JPG/WEBP) in SVG vektorisiert. Kern ist eine
eigenständige, getestete Implementierung des Potrace-Algorithmus (Selinger) plus
Farbmodus (Quantisierung → Ebene pro Farbe). Läuft vollständig clientseitig,
offline-fähig, keine Uploads.

**Zielgruppe:** ich selbst — Logos/Icons/Scans/Skizzen schnell in saubere SVGs
für andere Projekte (Pincel-Assets, Websites, Plotter) verwandeln.

**Nicht-Ziele:** Foto-realistische Vektorisierung (Gradient Meshes),
Centerline-Tracing (separates Feature, siehe Backlog), Server-Anteile jeder Art.

## Herkunft / Referenz

Die Algorithmus-Module unter `src/lib/potrace/` und `src/worker/trace.worker.ts`
sind **fertig und getestet** (14 Tests, Referenzwerte aus verifiziertem
Prototyp). Sie werden übernommen, nicht neu geschrieben. Der HTML-Prototyp
(`reference/prototype.html`) dient als funktionale Referenz für UI-Verhalten,
nicht als Code-Vorlage.

## Kern-Features (Stand Prototyp, zu übernehmen)

- **Bildaufnahme:** Datei-Dialog, Drag&Drop (ganzes Fenster), Downscale auf
  max. 1600px längste Kante (PWA darf höher als der Prototyp mit 900, da Worker).
- **Farbmodus (Default):** Median-Cut über distinkte Farben (Histogramm-Bins,
  nicht Pixel!), 2–16 Farben, LAB-Zuordnung, Ebene pro Farbe, größte Fläche
  zuerst gezeichnet. Naht-Behandlung: stroke = fill, 0.5px, round joins.
- **Monochrom-Modus:** Schwellwert manuell oder Otsu (Default: auto),
  Invertierung, freie Füllfarbe.
- **Vorverarbeitung:** Despeckle (3×3-Median) als Toggle, Default aus.
- **Trace-Parameter:** turdsize, alphamax, optcurve, opttolerance, turnpolicy —
  alle live mit Debounce (~110ms) + Job-Superseding.
- **Ansichten:** Original / Vektor / Overlay (Vektor-Geometrie + Ankerpunkte
  über gedimmtem Raster).
- **Statistik:** Pfade, Segmente, Kurven/Linien, SVG-Bytes, Ebenenanzahl.
- **Export:** SVG-Download, SVG in Zwischenablage. Relative Pfadkodierung
  (~35% kleiner, 0 Drift — getestet).
- **Reset:** alle Parameter auf Default.

## Neue Features (nicht im Prototyp — Phasen 3–5)

### Ebenen-Panel (P3)
Liste aller Farb-Ebenen (Chip, Hex, Flächenanteil %), pro Ebene:
- Sichtbar-Toggle (nur Render, kein Re-Trace)
- Farbe ändern via Picker (nur Render)
- „Als Hintergrund behandeln" → Ebene aus Export/Anzeige entfernen
  (**Hintergrund-Weglassen**: Default-Shortcut auf der größten Ebene)
Reihenfolge bleibt flächenbasiert (unten = größte), kein manuelles Sortieren in v1.

### Paletten-Locking (P3)
Chip im Panel anklickbar → Farbe editieren und pinnen. Gepinnte Palette geht als
`lockedPalette` an den Worker: keine neue Median-Cut-Palette, nur LAB-Zuordnung.
(Protokollfeld existiert bereits, Worker-Implementierung in P3.)

### Zoom & Pan (P4)
- Wheel/Pinch-Zoom auf Cursor-Position, Drag-Pan, Doppelklick/Doppeltipp = fit.
- Zoom wirkt synchron auf Original + Vektor (gemeinsamer Transform).
- **Vorher/Nachher-Wischregler** als vierte Ansicht: vertikaler Split,
  Griff ziehbar, links Original / rechts Vektor.

### PWA-Fähigkeiten (P5)
- Installierbar, offline (Service Worker via vite-plugin-pwa, Workbox-Preset
  aus web-base übernehmen).
- **Share Target** (Android): Bild aus anderer App direkt an vektor teilen.
- **File Handling API**: Registrierung für image/png, image/jpeg → „Öffnen mit".
- Letzte Session (Bild + Parameter) in idb, Wiederherstellen beim Start.

## Backlog (nicht planen, nur festhalten)

- Centerline-Tracing (Zhang-Suen + Pfadverfolgung) — eigener Algorithmus,
  eigenes Spec-Dokument wenn es soweit ist.
- Batch-Verarbeitung + ZIP-Export.
- Rust/WASM-Kern via amigo-native (Faktor 3–8× gemessen am JS-Profil;
  erst wenn reale Nutzung die Worst-Cases zeigt).
- Sauvola (lokal-adaptiver Threshold) für ungleichmäßig belichtete Scans.

## UI-Richtung

Dunkles Werkzeug-UI wie der Prototyp: Control-Rail links (mobil: unter dem
Viewer), Viewer mit Ansichts-Tabs, Statistikzeile, SVG-Code-Panel einklappbar.
Space Grotesk + JetBrains Mono, Amber-Akzent. Mobil: Viewer zuerst,
Parameter als Bottom-Sheet.
