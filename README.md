# vektor

Browser-PWA, die Rasterbilder (PNG/JPG/WEBP) in SVG vektorisiert. Kern ist eine
eigenständige, getestete Implementierung des Potrace-Algorithmus (Selinger) plus
Farbmodus (Median-Cut-Quantisierung → Ebene pro Farbe). Läuft vollständig
clientseitig, offline-fähig, keine Uploads.

Specs: [`docs/specs/produkt.md`](docs/specs/produkt.md),
[`docs/specs/architektur.md`](docs/specs/architektur.md) · Phasenplan: [`PLAN.md`](PLAN.md)

## Entwicklung

```sh
bun install
bun run dev        # Vite-Devserver
bun test           # Kern-Tests (potrace, quality, quantize, worker)
bun run typecheck  # tsc strict (core / tests / app getrennt)
bun run check      # biome
bun run build      # Typecheck + Production-Build
```

`src/lib/potrace/**` und `src/worker/trace.worker.ts` sind DOM-frei und
kompilieren gegen `ES2022 + WebWorker` (siehe `tsconfig.core.json`).

> Hinweis: Das `web-base`-Scaffold war aus der Build-Umgebung nicht erreichbar
> (Repo-Zugriff auf `vectorizer` beschränkt); das Setup repliziert den
> web-base-Standard manuell: Bun, Biome, React 19, Vite 8, TS strict, Tailwind 4.
