/** Kleine Formular-Bausteine der Parameter-Rail. */

import { type ReactNode, useId } from "react";

export function RailCard({
  title,
  badge,
  dimmed,
  children,
}: {
  title: string;
  badge?: string;
  dimmed?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-lg border border-ink-700 bg-ink-900 p-4 transition-opacity ${
        dimmed ? "opacity-45" : ""
      }`}
    >
      <h2 className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-ink-300">
        {title}
        {badge ? (
          <span className="rounded bg-ink-700 px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal text-ink-100">
            {badge}
          </span>
        ) : null}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-2 text-left text-[13px] text-ink-100 disabled:opacity-40"
    >
      <span>{label}</span>
      <span
        className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${
          checked ? "bg-accent-500" : "bg-ink-600"
        }`}
      >
        <span
          className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-ink-950 transition-transform ${
            checked ? "translate-x-[16px]" : "translate-x-[2px]"
          }`}
        />
      </span>
    </button>
  );
}

export function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  hint,
  dimmed,
}: {
  label: string;
  value: number;
  /** Anzeigewert (z.B. formatiert oder "130 (auto)"). */
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  hint?: string;
  dimmed?: boolean;
}) {
  const id = useId();
  return (
    <div className={dimmed ? "opacity-45" : ""}>
      <label
        htmlFor={id}
        className="mb-1 flex items-baseline justify-between text-[13px]"
      >
        <span>{label}</span>
        <span className="font-mono text-[12px] text-accent-400">{display}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-(--color-accent-500)"
      />
      {hint ? <p className="mt-1 text-[11px] leading-snug text-ink-300">{hint}</p> : null}
    </div>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px]">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-ink-600 bg-ink-800 px-2 py-1.5 font-mono text-[12px] text-ink-100"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ColorSwatch({
  label,
  value,
  onChange,
  dimmed,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dimmed?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2 text-[13px] ${dimmed ? "opacity-45" : ""}`}
    >
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 cursor-pointer rounded border border-ink-600 bg-transparent"
      />
      {label}
    </label>
  );
}
