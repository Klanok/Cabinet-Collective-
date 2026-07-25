/**
 * Cutlist assembly.
 *
 * Phase 1 needs the parts visible and countable — enough to check against a hand-written
 * list. Phase 2 adds the full BOM and the CSV/PDF export; this module is the seam that gets
 * built on, not a throwaway.
 */

import { type Mm, mm } from '../units.ts';
import { type MaterialLibrary, findSheet } from '../model/material.ts';
import { type Panel, panelExtent, bandedLength } from '../model/panel.ts';
import type { Project } from '../model/project.ts';
import { buildProject } from '../rules/build.ts';
import { RECT_EDGES } from '../geom/profile.ts';

export interface CutlistLine {
  /** Stable key for the grouping — identical parts collapse onto one line. */
  readonly key: string;
  readonly quantity: number;
  readonly name: string;
  readonly materialId: string;
  readonly materialLabel: string;
  readonly thickness: Mm;
  readonly length: Mm;
  readonly width: Mm;
  /** Banded edges in cutlist notation — "L1 L2 W1". */
  readonly banding: string;
  readonly bandedLengthMm: Mm;
  readonly grain: string;
  readonly cabinetNames: readonly string[];
  readonly note?: string;
}

const bandingNotation = (panel: Panel): string =>
  RECT_EDGES.filter((e) => panel.edgeBanding[e]).join(' ') || '—';

const grainNotation = (panel: Panel): string => {
  switch (panel.grain) {
    case 'length-along-grain':
      return 'Length';
    case 'width-along-grain':
      return 'Width';
    case 'any':
      return 'Free';
  }
};

/**
 * Group identical parts into cutlist lines.
 *
 * Parts collapse only when material, size, banding and grain all match — the four things
 * that have to agree for two parts to actually be interchangeable at the saw.
 */
export const buildCutlist = (project: Project): readonly CutlistLine[] => {
  const built = buildProject(project);
  const library: MaterialLibrary = project.materials;

  const lines = new Map<string, CutlistLine & { cabinetNames: string[] }>();

  for (const { cabinet, panels } of built) {
    for (const panel of panels) {
      const material = findSheet(library, panel.materialId);
      const { length, width } = panelExtent(panel);
      const banding = bandingNotation(panel);
      const grain = grainNotation(panel);
      // Round to 0.1mm when keying so floating-point noise can't split one line into two.
      const key = [
        panel.materialId,
        length.toFixed(1),
        width.toFixed(1),
        banding,
        grain,
        panel.name,
      ].join('|');

      const existing = lines.get(key);
      if (existing) {
        existing.cabinetNames.push(cabinet.name);
        lines.set(key, { ...existing, quantity: existing.quantity + 1 });
      } else {
        lines.set(key, {
          key,
          quantity: 1,
          name: panel.name,
          materialId: panel.materialId,
          materialLabel: `${material.brand} ${material.decor} ${material.thickness}mm`,
          thickness: material.thickness,
          length: mm(Math.round(length * 10) / 10),
          width: mm(Math.round(width * 10) / 10),
          banding,
          bandedLengthMm: bandedLength(panel),
          grain,
          cabinetNames: [cabinet.name],
          note: panel.note,
        });
      }
    }
  }

  // Thickest first, then largest — the order a sheet order tends to be written in.
  return [...lines.values()].sort(
    (a, b) =>
      b.thickness - a.thickness ||
      a.materialLabel.localeCompare(b.materialLabel) ||
      b.length - a.length ||
      b.width - a.width,
  );
};

export const cutlistTotals = (lines: readonly CutlistLine[]) => ({
  lineCount: lines.length,
  partCount: lines.reduce((s, l) => s + l.quantity, 0),
  bandedMetres: lines.reduce((s, l) => s + (l.bandedLengthMm * l.quantity) / 1000, 0),
});
