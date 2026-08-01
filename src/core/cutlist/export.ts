/**
 * CSV export — the cutlist, the hardware order, the drilling, and the nest.
 *
 * Separate files rather than one, because they go to different places: the cutlist to the saw or
 * the nester, the hardware list to the supplier, the drilling to whoever is boring the carcasses,
 * and the nest to whoever is standing at the panel saw. Putting them in one file would mean one of
 * them always having to be edited before it could be used.
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
import { type ProjectNest, nestProject } from '../nest/nest.ts';
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
      'For',
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
      l.ownerNames.join(' '),
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
 * `Face` says which side each hole goes in; `Turns over` says whether **the part** has work on both
 * faces and so needs a second setup. They are different questions and a sheet wants both. A plain
 * door is bored back-up in one setup even though every hole in it is on the back — the face being
 * machined is the face that goes up. It is a shaker door, routed on the front *and* bored on the
 * back, that genuinely turns over.
 */
export const drillingCsv = (project: Project): string => {
  const rows: (string | number | undefined)[][] = [];

  for (const built of buildProject(project)) {
    for (const panel of built.panels) {
      // Asked once per part, not once per hole: turning over is something the *part* does.
      const turnsOver = requiresFlip(panel.features) ? 'yes' : 'no';
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
            turnsOver,
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
    ['Cabinet', 'Part', 'Purpose', 'Face', 'Turns over', 'X', 'Y', 'Diameter', 'Depth', 'Feature'],
    ...rows,
  ]);
};

/**
 * The nest: every part, on the sheet it comes off, at the corner it starts from.
 *
 * `X` and `Y` are the near corner of the blank measured from the corner of the **usable** area of
 * the sheet, so a job with an edge trim set has its coordinates measured from where the first cut
 * lands rather than from the raw sheet edge. `Turned` says the part is laid across the sheet rather
 * than along it, which is the column to check on a grained board — and on one, it is a column that
 * should never say yes and no in the same material.
 */
export const nestCsv = (project: Project, nest: ProjectNest = nestProject(project)): string => {
  const rows: (string | number | undefined)[][] = [];

  for (const material of nest.byMaterial) {
    const byId = new Map(material.parts.map((p) => [p.panelId, p]));
    for (const sheet of material.sheets) {
      for (const placement of sheet.placements) {
        const part = byId.get(placement.partId)!;
        rows.push([
          material.label,
          `${material.sheet.length}×${material.sheet.width}`,
          sheet.index,
          part.name,
          part.ownerName,
          round1(placement.at.x),
          round1(placement.at.y),
          round1(placement.at.length),
          round1(placement.at.width),
          placement.orientation === 'turned' ? 'yes' : 'no',
        ]);
      }
    }
    // Listed even though they are on no sheet — a part that fell out of the nest must not fall out
    // of the paperwork as well.
    for (const part of material.oversize) {
      rows.push([
        material.label,
        `${material.sheet.length}×${material.sheet.width}`,
        'NOT NESTED',
        part.name,
        part.ownerName,
        '',
        '',
        round1(part.length),
        round1(part.width),
        '',
      ]);
    }
  }

  return csv([
    ['Material', 'Sheet size', 'Sheet', 'Part', 'For', 'X', 'Y', 'Length', 'Width', 'Turned'],
    ...rows,
  ]);
};

/**
 * The cut sequence — what to do at the saw, in order.
 *
 * One row per cut. `Piece` is what goes on the bench and `At` is where the blade lands on it,
 * measured in sheet coordinates rather than from the edge of the piece, because that is what the
 * fence is set to. Every cut runs the full span of its piece; that is what makes it a cut a panel
 * saw can make, and `replayCuts` in `nest/guillotine.ts` is the check that it really does.
 *
 * `Stage` is how many cuts deep the piece is. A shop whose saw is limited to two- or three-stage
 * cutting wants to look at that column before starting.
 */
export const cutSequenceCsv = (
  project: Project,
  nest: ProjectNest = nestProject(project),
): string => {
  const rows: (string | number | undefined)[][] = [];

  for (const material of nest.byMaterial) {
    for (const sheet of material.sheets) {
      for (const cut of sheet.cuts) {
        rows.push([
          material.label,
          sheet.index,
          cut.sequence,
          cut.stage,
          // Named for what the operator does, not for the axis: a cut at constant x runs across
          // the sheet's length, and calling that "the X cut" is how somebody cuts it the wrong way.
          cut.axis === 'x' ? 'across the length' : 'along the length',
          round1(cut.at),
          `${round1(cut.piece.length)}×${round1(cut.piece.width)}`,
          round1(cut.piece.x),
          round1(cut.piece.y),
        ]);
      }
    }
  }

  return csv([
    [
      'Material',
      'Sheet',
      'Cut',
      'Stage',
      'Direction',
      'At',
      'Piece',
      'Piece X',
      'Piece Y',
    ],
    ...rows,
  ]);
};

/**
 * How many holes a job has, across how many parts, and how many of those parts turn over.
 *
 * Counted in **parts**, not in holes. A part turning over is one setup; how many holes are in it
 * once it is there does not change that, and counting per hole is what made a job of plain doors
 * look like sixty separate flips.
 */
export const drillingTotals = (panels: readonly Panel[]) => {
  let holes = 0;
  let boredParts = 0;
  let turnedParts = 0;
  for (const panel of panels) {
    let onThisPart = 0;
    for (const f of panel.features) {
      if (f.kind !== 'drill' && f.kind !== 'drill-line') continue;
      onThisPart += f.kind === 'drill' ? 1 : f.count;
    }
    if (onThisPart === 0) continue;
    holes += onThisPart;
    boredParts += 1;
    if (requiresFlip(panel.features)) turnedParts += 1;
  }
  return { holes, boredParts, turnedParts };
};
