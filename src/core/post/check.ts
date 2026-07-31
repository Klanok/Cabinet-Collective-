/**
 * What a program is checked for before it is written.
 *
 * Every check here is something that is **invisible on screen and expensive on the bed**. A nest
 * looks perfect with a 3.2mm gap between parts; it is only when a 6mm cutter runs down the middle
 * of that gap that both parts come out 1.4mm undersize. A depth 2mm too deep looks like nothing at
 * all until it is 2mm into an aluminium bed rail.
 *
 * These are separated from the writer on purpose. A check that lives inside the code that emits
 * moves gets skipped the day somebody adds a second writer.
 */

import { type Mm, mm } from '../units.ts';
import { findToolOrNull } from '../library/tools.ts';
import type { ProjectNest } from '../nest/nest.ts';
import { type Operation, type SheetProgram, finalDepth } from '../cam/operation.ts';
import { operationPoints } from '../cam/operations.ts';
import type { MachineProfile } from './machine.ts';

export interface Problem {
  /** `refuse` stops the program being written. `warn` is printed and the program still comes out. */
  readonly severity: 'refuse' | 'warn';
  readonly message: string;
}

/**
 * **A job nested for a saw cannot be cut on a router**, and this is the check that says so.
 *
 * It connects Phase 3 to Phase 5 and it catches two mistakes with one cause. Both nesting settings
 * ship at saw figures, because on a panel saw that is what they mean:
 *
 *   - **kerf, 3.2mm.** The gap the nest leaves between two parts. A saw blade is 3.2mm and a
 *     nesting cutter is 6 or 8, so the toolpath separating two parts is wider than the gap it runs
 *     in: it takes the difference off *each neighbour*, on every shared edge, on every sheet. Every
 *     part comes out undersize and not one of them looks it.
 *   - **sheet edge trim, 0mm.** On a saw the first cut can be flush with the sheet edge. On a
 *     router it cannot: a part sitting hard against the edge has to be cut from *outside* itself,
 *     and outside the sheet edge there is no sheet. So the trim has to be at least the cutter's
 *     radius, and a full diameter is the usual figure because it also gets rid of the damaged edge.
 *
 * Both are one field each and neither is guessable from the other, so both are named with the
 * number to set. This is reported as **one** problem rather than two, because it is one decision:
 * this job is nested for the saw and you are about to cut it on the router.
 */
export const checkNestedForRouter = (
  nest: ProjectNest,
  profile: MachineProfile,
): Problem[] => {
  const tool = findToolOrNull(profile.partCutterToolId);
  if (!tool || tool.section.kind !== 'straight') {
    return [
      {
        severity: 'refuse',
        message:
          `The ${profile.name}'s part cutter "${profile.partCutterToolId}" is not a ` +
          `straight-sided bit, so it cannot cut parts out.`,
      },
    ];
  }
  const diameter = tool.section.diameter;
  const radius = diameter / 2;

  const wrong: string[] = [];
  if (nest.kerf + 1e-9 < diameter) {
    wrong.push(
      `the gap between parts is ${nest.kerf}mm and the cutter is ${diameter}mm, so cutting one ` +
        `part would take ${((diameter - nest.kerf) / 2).toFixed(2)}mm off each of its neighbours`,
    );
  }
  if (nest.edgeTrim + 1e-9 < radius) {
    wrong.push(
      `parts sit ${nest.edgeTrim}mm from the sheet edge and the cutter needs ${radius}mm outside ` +
        `them, so the toolpath runs off the sheet`,
    );
  }
  if (wrong.length === 0) return [];

  return [
    {
      severity: 'refuse',
      message:
        `This job is nested for a saw, not for the ${profile.name}: ${wrong.join('; and ')}. ` +
        `Set Settings → Saw kerf to ${diameter}mm and Sheet edge trim to ${diameter}mm, then ` +
        `re-nest. Both ship at saw figures because that is what they mean on a panel saw.`,
    },
  ];
};

/**
 * Nothing may leave the bed, and nothing may go deeper than the machine's Z travel.
 *
 * Reported **per sheet rather than per move**. A nest with the trim set wrong puts every part in
 * the bottom row off the edge, and forty copies of the same sentence is how the one that matters
 * gets scrolled past.
 */
export const checkEnvelope = (
  program: SheetProgram,
  profile: MachineProfile,
): Problem[] => {
  const problems: Problem[] = [];
  const { envelope } = profile;

  if (program.sheetLength > envelope.x || program.sheetWidth > envelope.y) {
    problems.push({
      severity: 'refuse',
      message:
        `A ${program.sheetLength}×${program.sheetWidth} sheet does not fit the ${profile.name}'s ` +
        `${envelope.x}×${envelope.y} bed.`,
    });
  }

  let worstDepth = 0;
  const offBed: string[] = [];
  let firstOff: string | null = null;
  for (const op of program.operations) {
    worstDepth = Math.max(worstDepth, finalDepth(op));
    for (const p of operationPoints(op)) {
      if (p.x < 0 || p.y < 0 || p.x > envelope.x || p.y > envelope.y) {
        offBed.push(op.partName);
        firstOff ??= `"${op.partName}" at (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;
        break;
      }
    }
  }

  if (offBed.length > 0) {
    const distinct = [...new Set(offBed)];
    problems.push({
      severity: 'refuse',
      message:
        `${offBed.length} move${offBed.length === 1 ? '' : 's'} on sheet ${program.sheetIndex} ` +
        `${offBed.length === 1 ? 'is' : 'are'} off the ${profile.name}'s bed — first is ` +
        `${firstOff}. ${distinct.length} part${distinct.length === 1 ? '' : 's'} affected.`,
    });
  }

  if (worstDepth > envelope.z) {
    problems.push({
      severity: 'refuse',
      message: `A cut ${worstDepth.toFixed(1)}mm deep is past the ${profile.name}'s Z travel of ${envelope.z}mm.`,
    });
  }
  return problems;
};

/**
 * A through cut has to actually get through, and not much further.
 *
 * Too shallow and the part stays in the sheet — annoying but safe. Too deep and the cutter is into
 * the spoilboard, which is normal in small amounts and expensive in large ones, so the overcut is
 * checked against something sane rather than left to whatever was typed.
 */
export const checkThroughDepth = (program: SheetProgram, profile: MachineProfile): Problem[] => {
  const problems: Problem[] = [];
  const perimeters = program.operations.filter(
    (op): op is Extract<Operation, { kind: 'contour' }> =>
      op.kind === 'contour' && op.purpose === 'perimeter',
  );
  for (const op of perimeters.slice(0, 1)) {
    const cut = finalDepth(op);
    const skin = op.leaveUncut ?? 0;
    // An onion skin is deliberate, so it is not a problem — but a cut that falls short of the
    // board *without* one is, because nobody asked for it and the parts stay in the sheet.
    if (cut < program.thickness && skin <= 0) {
      problems.push({
        severity: 'warn',
        message:
          `Parts are cut ${cut.toFixed(1)}mm deep into ${program.thickness}mm board and nothing ` +
          `asked for an onion skin, so they will not come free.`,
      });
    }
    if (cut > program.thickness + 3) {
      problems.push({
        severity: 'warn',
        message:
          `Parts are cut ${(cut - program.thickness).toFixed(1)}mm into the spoilboard, which is ` +
          `more than it needs and will chew it up.`,
      });
    }
  }
  void profile;
  return problems;
};

/** Every check, for one sheet. */
export const checkProgram = (
  program: SheetProgram,
  profile: MachineProfile,
  nest: ProjectNest,
): Problem[] => [
  ...checkNestedForRouter(nest, profile),
  ...checkEnvelope(program, profile),
  ...checkThroughDepth(program, profile),
];

export const refusals = (problems: readonly Problem[]): Problem[] =>
  problems.filter((p) => p.severity === 'refuse');

/** The nest kerf this machine's cutter needs, for the message that tells somebody what to set. */
export const kerfForMachine = (profile: MachineProfile): Mm => {
  const tool = findToolOrNull(profile.partCutterToolId);
  return tool && tool.section.kind === 'straight' ? tool.section.diameter : mm(6);
};
