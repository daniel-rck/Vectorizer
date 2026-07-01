import type { ResultMessage } from "../../lib/potrace/protocol";
import { formatBytes } from "../lib/svg";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-ink-700 bg-ink-900 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-300">
        {label}
      </div>
      <div className="text-[15px]">{value}</div>
    </div>
  );
}

export function StatsBar({
  result,
  svgBytes,
  colorMode,
}: {
  result: ResultMessage | null;
  svgBytes: number;
  colorMode: boolean;
}) {
  const st = result?.stats;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat
        label="Pfade"
        value={
          st
            ? `${st.paths}${colorMode && result ? ` · ${result.layers.length} Ebenen` : ""}`
            : "—"
        }
      />
      <Stat label="Segmente" value={st ? String(st.seg) : "—"} />
      <Stat label="Kurven / Linien" value={st ? `${st.curves} / ${st.lines}` : "—"} />
      <Stat label="SVG-Größe" value={st ? formatBytes(svgBytes) : "—"} />
    </div>
  );
}
