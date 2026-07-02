/**
 * Export-SVG aus Trace-Ebenen bauen. DOM-frei, damit es in bun test
 * ohne Browser läuft (Smoke-Test) und später im Worker nutzbar wäre.
 */

import type { TraceLayer } from "../../lib/potrace/protocol";

export interface SvgBuildOptions {
  /** Naht-Behandlung im Farbmodus: stroke = fill, 0.5px, round joins. */
  seam: boolean;
}

export function buildSvg(
  layers: readonly TraceLayer[],
  w: number,
  h: number,
  opts: SvgBuildOptions,
): string {
  let paths = "";
  for (const layer of layers) {
    const seam = opts.seam
      ? ` stroke="${layer.color}" stroke-width="0.5" stroke-linejoin="round"`
      : "";
    paths += `<path d="${layer.d}" fill="${layer.color}"${seam} fill-rule="evenodd"/>`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"` +
    ` width="${w}" height="${h}">${paths}</svg>`
  );
}

export function svgByteSize(svg: string): number {
  return new TextEncoder().encode(svg).length;
}

export function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}
