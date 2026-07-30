/**
 * CSV export — the cutlist, the hardware order, and the drilling.
 *
 * Three sheets rather than one, because they go to three different places: the cutlist to the saw
 * or the nester, the hardware list to the supplier, and the drilling to whoever is boring the
 * carcasses. Putting them in one file would mean one of the three always having to be edited before
 * it could be used.
 *
 * All of this is pure string building in `src/core`, so it runs and is tested in Node with no
 * browser involved. The app turns the string into a download; nothing about the format lives there.
 *
 * **PDF is deliberately not here.** A CSV opens in Excel, imports into a nester and can be pasted
 * into an email; a PDF is a picture of a list. Printing one of these from the browser gets a
 * perfectly good PDF when somebody wants paper, and building a typesetter to do it worse is not
 * work worth doing yet.
 */

import { type Mm } from '../units.ts';
import type { Panel } from '../model/panel.ts';
import type { Project } from '../model/project.ts';
import { requiresFlip } from '../model/feature.ts';
import { buildProject } from '../rules/build.ts';
import { type HardwareBomLine, buildHardwareBom } from '../hardware/bom.ts';
import { type CutlistLine, buildCutlist } from './cutlist.ts';

/**
 * One CSV field.
 *
 * Quoted whenever it contains a comma, a quote or a newline, with inner quotes doubled — RFC 4180.
 * Worth doing properly rather than hoping: a decor name with a comma in it would otherwise silently
 * shift every column after it, and a cutlist with the widths in the banding column is worse than no
 * cutlist.
 */
const field = (value: string | number | undefined): string => {
  const s = value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CRLF, because these are opened in Excel on Windows more often than anywhere else. */
const csv = (rows: readonly (readonly (string | number | undefined)[])[]): string =>
  rows.map((r) => r.map(field).join(',')).join('\r\n') + '\r\n';

const round1 = (n: Mm): number => Math.round(n * 10) / 10;

export const cutlistCsv = (project: Project): string => {
  const lines: readonly CutlistLine[] = buildCutlist(project);
  return csv([
    [
      'Qty',
      'Part',
      'Material',
      'Thickness',
      'Length',
      'Width',
      'Banding',
      'Banded mm',
      'Grain',
      'Cabinets',
      'Note',
    ],
    ...lines.map((l) => [
      l.quantity,
      l.name,
      l.materialLabel,
      l.thickness,
      l.length,
      l.width,
      l.banding === '—' ? '' : l.banding,
      round1(l.bandedLengthMm),
      l.grain,
      l.cabinetNames.join(' '),
      l.note,
    ]),
  ]);
};

export const hardwareCsv = (project: Project): string => {
  const lines: readonly HardwareBomLine[] = buildHardwareBom(project);
  return csv([
    [
      'Qty',
      'Unit',
      'Item',
      'Code',
      'Category',
      'Unit price ex GST',
      'Total ex GST',
      'Cabinets',
      'Pricing',
      'Note',
    ],
    ...lines.map((l) => [
      l.quantity,
      l.unit,
      l.name,
      l.code,
      l.category,
      (l.unitPriceExGst / 100).toFixed(2),
      (l.totalExGst / 100).toFixed(2),
      l.cabinetNames.join(' '),
      l.indicativePricing ? 'indicative' : 'trade',
      l.note,
    ]),
  ]);
};

/**
 * Every hole on every part, one row each.
 *
 * A row of system holes is stored as one `drill-line` because that is what the operation is, but a
 * drilling sheet wants every position — so the line is expanded here. This is the *only* place that
 * expansion happens: the model keeps the operation, and CAM will read the operation too rather than
 * a list of points that has forgotten it was a pitch.
 *
 * `Flip` is its own column and is not a detail. A hinge cup is bored on the back of a door, so the
 * part turns over between the front routing and the boring — that is a setup, and a sheet that
 * doesn't say so is a sheet somebody bores from the wrong side.
 */
export const drillingCsv = (project: Project): string => {
  const rows: (string | number | undefined)[][] = [];

  for (const built of buildProject(project)) {
    for (const panel of built.panels) {
      for (const f of panel.features) {
        if (f.kind !== 'drill' && f.kind !== 'drill-line') continue;
        const count = f.kind === 'drill' ? 1 : f.count;
        for (let i = 0; i < count; i++) {
          const at =
            f.kind === 'drill'
              ? f.at
              : { x: f.start.x + f.step.x * i, y: f.start.y + f.step.y * i };
          rows.push([
            built.cabinet.name,
            panel.name,
            f.purpose,
            f.face,
            requiresFlip(f) ? 'yes' : 'no',
            round1(at.x),
            round1(at.y),
            f.diameter,
            f.depth,
            count > 1 ? `${f.id} ${i + 1}/${count}` : f.id,
          ]);
        }
      }
    }
  }

  return csv([
    ['Cabinet', 'Part', 'Purpose', 'Face', 'Flip', 'X', 'Y', 'Diameter', 'Depth', 'Feature'],
    ...rows,
  ]);
};

/** How many holes a job has, and how many of them need the part turned over. */
export const drillingTotals = (panels: readonly Panel[]) => {
  let holes = 0;
  let flipped = 0;
  for (const panel of panels) {
    for (const f of panel.features) {
      if (f.kind !== 'drill' && f.kind !== 'drill-line') continue;
      const count = f.kind === 'drill' ? 1 : f.count;
      holes += count;
      if (requiresFlip(f)) flipped += count;
    }
  }
  return { holes, flipped };
};
