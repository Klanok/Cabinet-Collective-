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
import { buildRunUnits } from '../rules/runUnits.ts';
import { RECT_EDGES, profileSignature } from '../geom/profile.ts';

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
  /**
   * What each of these parts is for — a cabinet name, or a benchtop's, or a plinth's.
   *
   * Renamed from `cabinetNames` when benchtops and ladder bases started producing parts. A column
   * headed "Cabinets" with "Plinth 1" in it is the sort of small dishonesty that ends up printed
   * and handed to somebody.
   */
  readonly ownerNames: readonly string[];
  readonly note?: string;
}

/**
 * The machining somebody added by hand, as a key.
 *
 * Only the custom features (§5.12). Everything else on a panel is derived from the cabinet, so
 * two parts that match on everything above already carry the same hinge cups and the same
 * system holes — but a hole put in one side and not the other is exactly the difference this
 * has to see, and it does not change the part's size or its shape.
 */
const customMachining = (panel: Panel): string =>
  panel.features
    .filter((f) => f.purpose === 'custom')
    .map((f) => f.id)
    .sort()
    .join(',');

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
 * Parts collapse only when material, size, banding, grain, **shape and machining** all match —
 * the things that have to agree for two parts to actually be interchangeable at the saw.
 *
 * The last two arrived with §5.12 and neither is a nicety. Size used to be the whole of "same
 * shape", which was true of everything the engine produced and stopped being true the moment
 * somebody could notch a corner or bore a waste hole by hand: a side with a scribe notch in it
 * is exactly the same length and width as the plain one beside it, and without the shape in the
 * key the two collapse into "2 × Side L" and one of them is cut wrong.
 *
 * The **note** deliberately stays out of the key, and it is worth saying why, because putting it
 * in looks like the same fix. A note is advice about where a part goes — "End rib" — and an end
 * rib and a middle rib are the *same part*, cut off the same list line. Keying on free text
 * would split a line for a hint. Keying on the shape and the machining splits it for a
 * difference the saw can see.
 */
export const buildCutlist = (project: Project): readonly CutlistLine[] => {
  const library: MaterialLibrary = project.materials;

  const lines = new Map<string, CutlistLine & { ownerNames: string[] }>();

  /*
   * Cabinets first, then the run units — a benchtop and a plinth are cut from sheet stock exactly
   * as a carcass part is, so they go on the same list rather than a second one that could disagree
   * about a board thickness.
   */
  const groups: { name: string; panels: readonly Panel[] }[] = [
    ...buildProject(project).map((b) => ({ name: b.cabinet.name, panels: b.panels })),
    ...buildRunUnits(project).map((u) => ({ name: u.name, panels: u.panels })),
  ];

  for (const { name: ownerName, panels } of groups) {
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
        profileSignature(panel.profile),
        customMachining(panel),
      ].join('|');

      const existing = lines.get(key);
      if (existing) {
        existing.ownerNames.push(ownerName);
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
          ownerNames: [ownerName],
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
