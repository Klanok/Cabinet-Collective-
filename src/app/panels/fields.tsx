/**
 * The three controls a settings row is ever made of.
 *
 * Pulled out of the settings screen so the door style editor uses the same ones rather than a
 * near-copy that drifts a pixel and a hint at a time.
 */

import type { ReactNode } from 'react';

export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-label">
        <span>{label}</span>
        {hint && <em>{hint}</em>}
      </div>
      <div className="setting-input">{children}</div>
    </div>
  );
}

export function NumberRow({
  label,
  hint,
  value,
  suffix = 'mm',
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <SettingRow label={label} hint={hint}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
      <span className="suffix">{suffix}</span>
    </SettingRow>
  );
}

export function TextRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <SettingRow label={label} hint={hint}>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </SettingRow>
  );
}

export function SelectRow({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  options: readonly { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <SettingRow label={label} hint={hint}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </SettingRow>
  );
}
