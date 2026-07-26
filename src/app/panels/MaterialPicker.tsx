/**
 * Material selection.
 *
 * Sheets are grouped by substrate and filtered by role — you shouldn't be able to pick 18mm
 * MDF for a carcass side by accident, or an edge band where a sheet belongs.
 */

import type { MaterialLibrary, SheetMaterial } from '../../core/model/material.ts';

export type MaterialRole = 'carcass' | 'back' | 'door';

const SUBSTRATE_LABELS: Record<string, string> = {
  MFPB: 'Melamine particleboard',
  'HMR-MFPB': 'HMR melamine particleboard',
  MDF: 'MDF',
  'HMR-MDF': 'HMR MDF',
  plywood: 'Plywood',
  'raw-particleboard': 'Raw particleboard',
};

export const sheetLabel = (m: SheetMaterial): string =>
  `${m.brand} ${m.decor} — ${m.thickness}mm`;

/** Group by substrate so the dropdown reads like a supplier's list rather than a flat jumble. */
const grouped = (sheets: readonly SheetMaterial[]) => {
  const groups = new Map<string, SheetMaterial[]>();
  for (const s of sheets) {
    const key = SUBSTRATE_LABELS[s.substrate] ?? s.substrate;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
};

export function SheetPicker({
  label,
  hint,
  library,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  library: MaterialLibrary;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="setting-row">
      <div className="setting-label">
        <span>{label}</span>
        {hint && <em>{hint}</em>}
      </div>
      <div className="setting-input">
        <select className="wide" value={value} onChange={(e) => onChange(e.target.value)}>
          {grouped(library.sheets).map(([group, sheets]) => (
            <optgroup key={group} label={group}>
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {sheetLabel(s)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}

export function EdgeBandPicker({
  label,
  hint,
  library,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  library: MaterialLibrary;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="setting-row">
      <div className="setting-label">
        <span>{label}</span>
        {hint && <em>{hint}</em>}
      </div>
      <div className="setting-input">
        <select className="wide" value={value} onChange={(e) => onChange(e.target.value)}>
          {library.edgeBands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.brand} {b.decor} — {b.thickness}mm × {b.width}mm
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
