/**
 * The post-processor — an operation list becomes ISO G-code.
 *
 * ## Read this before running anything it writes
 *
 * **This has never been run on a machine.** Nothing in this repository has. The geometry is
 * asserted in `tests/cam.test.ts` and can be trusted as far as tests go — a hole is where the model
 * says it is, a part is offset by the cutter's radius, the ordering is right. The *dialect* is a
 * different question: whether this controller wants `G81` or explicit moves, whether it needs `G90`
 * restated after a tool change, what actually selects a drill spindle. Those come off a program the
 * machine already runs, and until one has been compared against this, treat the output as a draft.
 *
 * Simulate or air-cut first. That is the project's own gate, not a disclaimer.
 *
 * ## Why the writer is generic and the machine is data
 *
 * Everything machine-specific lives on the `MachineProfile`. This file knows how to turn a contour
 * into moves and an arc into G2/G3, and nothing else — no brand, no controller, no assumption about
 * how a tool change is spelled. A second machine is a second profile.
 *
 * ## The two things this refuses to do
 *
 * It will not write a program whose moves leave the machine envelope, and it will not write one
 * whose nest gap is narrower than the cutter — see `post/check.ts`. Both are silent on screen and
 * expensive on the bed.
 *
 * ## Arcs
 *
 * An arc reaches the machine as `G2`/`G3` with `I`/`J`, never as a flattened polyline. That is
 * §2's rule and `geom/arc.ts` exists to make it possible: the centre is derived from the two
 * endpoints and the bulge, so `I` and `J` cannot disagree with where the arc actually starts and
 * ends. `I` and `J` are **incremental from the arc's start point**, which is the near-universal
 * convention and the one to check first against a real program if something looks wrong.
 */

import { type Mm, mm } from '../units.ts';
import type { Vec2 } from '../geom/vec.ts';
import { type Vertex2, arcGeometry, isArcEdge } from '../geom/arc.ts';
import { findToolOrNull } from '../library/tools.ts';
import type { Operation, SheetProgram } from '../cam/operation.ts';
import {
  type Head,
  type MachineProfile,
  type MachineTool,
  boringToolFor,
  findMachineTool,
  headOf,
  throughDepth,
  zAtDepth,
  zClearance,
  zPlunge,
} from './machine.ts';

/** Coordinates to two decimals — a hundredth of a millimetre is well past what a router holds. */
const n = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

const toolDiameterOf = (toolId: string): Mm | null => {
  const t = findToolOrNull(toolId);
  return t && t.section.kind === 'straight' ? t.section.diameter : null;
};

interface Writer {
  readonly lines: string[];
  push(line: string): void;
  comment(text: string): void;
}

const writer = (): Writer => {
  const lines: string[] = [];
  return {
    lines,
    push: (line) => lines.push(line),
    // Parenthesised, which every ISO controller accepts. A semicolon comment is not universal.
    comment: (text) => lines.push(`(${text.replace(/[()]/g, '')})`),
  };
};

/**
 * The Z steps a cut of `depth` takes with this tool.
 *
 * A 6mm bit does not take 18mm in one bite. The last step lands exactly on the final depth rather
 * than overshooting, so a through cut goes exactly as deep as it was told and no deeper into the
 * spoilboard.
 */
export const depthPasses = (depth: Mm, maxDepthOfCut: Mm): Mm[] => {
  if (maxDepthOfCut <= 0 || depth <= maxDepthOfCut) return [depth];
  const steps: Mm[] = [];
  let at = 0;
  while (at + maxDepthOfCut < depth - 1e-9) {
    at += maxDepthOfCut;
    steps.push(mm(at));
  }
  steps.push(depth);
  return steps;
};

/** Emit one pass around a path at a given Z. Arcs stay arcs. */
const contourPass = (w: Writer, path: readonly Vertex2[], closed: boolean, z: Mm, feed: number) => {
  const count = closed ? path.length : path.length - 1;
  for (let i = 0; i < count; i++) {
    const a = path[i]!;
    const b = path[(i + 1) % path.length]!;
    if (!isArcEdge(a)) {
      w.push(`G1 X${n(b.x)} Y${n(b.y)} F${feed}`);
      continue;
    }
    const g = arcGeometry(a, b, a.bulge!);
    // I and J are the vector from the arc's start to its centre, which is the incremental form.
    const i0 = g.centre.x - a.x;
    const j0 = g.centre.y - a.y;
    w.push(`${g.ccw ? 'G3' : 'G2'} X${n(b.x)} Y${n(b.y)} I${n(i0)} J${n(j0)} F${feed}`);
    void z;
  }
};

/** Whether a ring is wound counter-clockwise, by the straight-line shoelace. */
const isCcw = (ring: readonly Vertex2[]): boolean => {
  let acc = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    acc += a.x * b.y - b.x * a.y;
  }
  return acc > 0;
};

/**
 * Concentric passes to clear a rectangular pocket.
 *
 * Only rectangles, and that is deliberate rather than lazy: every pocket this codebase produces is
 * one — a shaker door's centre recess (§4.3) — and a clearing path for a general outline is a real
 * piece of work that would be written on guesswork here. A pocket that is not a rectangle gets its
 * boundary cut and says so, which is honest; generating a plausible-looking clearing path for a
 * shape nobody has is how a cutter ends up taking a full-width bite.
 */
const rectanglePocketRings = (outline: readonly Vertex2[], stepover: Mm): Vec2[][] => {
  const xs = outline.map((v) => v.x);
  const ys = outline.map((v) => v.y);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);

  const rings: Vec2[][] = [];
  while (maxX - minX > 1e-6 && maxY - minY > 1e-6) {
    rings.push([
      { x: mm(minX), y: mm(minY) },
      { x: mm(maxX), y: mm(minY) },
      { x: mm(maxX), y: mm(maxY) },
      { x: mm(minX), y: mm(maxY) },
    ]);
    minX += stepover;
    maxX -= stepover;
    minY += stepover;
    maxY -= stepover;
    if (maxX - minX <= 0 || maxY - minY <= 0) break;
  }
  return rings;
};

const isRectangle = (ring: readonly Vertex2[]): boolean =>
  ring.length === 4 && !ring.some(isArcEdge);

export interface PostResult {
  readonly text: string;
  readonly filename: string;
  readonly warnings: readonly string[];
}

/**
 * Write one sheet's program.
 *
 * Structure, and each part of it is there for a reason:
 *
 *   - a **header** naming the job, the sheet, the material and — loudly — anything on the machine
 *     profile that has not been verified;
 *   - the **preamble** from the profile;
 *   - operations **grouped by tool**, in the order `orderOperations` put them, with a tool change
 *     between groups and never inside one;
 *   - the **postamble**.
 */
export const writeSheetProgram = (
  program: SheetProgram,
  profile: MachineProfile,
  jobName: string,
): PostResult => {
  const w = writer();
  const warnings: string[] = [...program.warnings];

  w.comment(`${jobName} — sheet ${program.sheetIndex} of ${program.materialLabel}`);
  w.comment(
    `${n(program.sheetLength)} x ${n(program.sheetWidth)} x ${n(program.thickness)}mm, ` +
      `${program.operations.length} operations`,
  );
  w.comment(`Machine: ${profile.name}`);
  w.comment(
    profile.zDatum === 'material-top'
      ? 'Z zero is the TOP of the material. Cuts are negative.'
      : 'Z zero is the TABLE. The top of the material is at +thickness.',
  );
  if (program.needsSecondSetup.length > 0) {
    const note = `NOT FINISHED IN THIS PROGRAM, machined on both faces: ${program.needsSecondSetup.join(', ')}`;
    w.comment(note);
    warnings.push(note);
  }
  if (profile.unconfirmed.length > 0) {
    w.comment('--- UNVERIFIED against this machine. Simulate or air-cut before running. ---');
    for (const note of profile.unconfirmed) w.comment(`  ${note}`);
  }
  for (const line of profile.preamble) w.push(line);

  let currentTool: MachineTool | null = null;
  let currentHead: Head | null = null;

  /**
   * The perimeters that finish in the second pass — the ones carrying an onion skin.
   *
   * Collected up front rather than as the first pass runs, so the header can say how many there
   * are and the second loop cannot drift out of step with the first.
   */
  const skinned = program.operations.filter(
    (op): op is Extract<Operation, { kind: 'contour' }> =>
      op.kind === 'contour' && op.purpose === 'perimeter' && (op.leaveUncut ?? 0) > 0,
  );

  const ensureTool = (tool: MachineTool) => {
    const head = headOf(tool);
    if (currentTool && headOf(currentTool) === head && currentTool.pocket === tool.pocket) return;
    if (currentTool) for (const line of profile.stopSpindle) w.push(line);
    /*
     * The work offset before the retract, not after, and the order is load-bearing.
     *
     * The clearance about to be rapided to is the *incoming* head's, so it has to be measured in
     * the incoming head's own coordinate system. Retracting first would put the tool at the new
     * head's clearance height above the old head's zero, which is a number that means nothing on
     * either. A single-head program emits this once and it lands exactly where a preamble `G54`
     * used to sit.
     */
    if (head !== currentHead) {
      w.push(profile.heads[head].workOffset);
      currentHead = head;
    }
    w.push(`G0 Z${n(zClearance(profile, head, program.thickness))}`);
    for (const line of profile.toolChange(tool)) w.push(line);
    for (const line of profile.startSpindle(tool)) w.push(line);
    currentTool = tool;
  };

  for (const op of program.operations) {
    const tool =
      op.kind === 'bore'
        ? boringToolFor(profile, op.diameter, toolDiameterOf)
        : findMachineTool(profile, op.toolId);

    if (!tool) {
      const what =
        op.kind === 'bore'
          ? `a Ø${op.diameter}mm hole`
          : `tool "${op.toolId}"`;
      warnings.push(
        `"${op.partName}": no bit in the ${profile.name} tool table for ${what}, so it is not ` +
          `in the program. Add one to the machine profile, or bore it on the borer.`,
      );
      w.comment(`SKIPPED ${op.partName} ${op.purpose} — no tool for it`);
      continue;
    }
    ensureTool(tool);
    writeOperation(w, op, profile, tool, program.thickness);
  }

  /*
   * ## The second pass, and it is per **sheet** rather than per part
   *
   * `docs/woodtron-dialect.md` §7, off three files that each hold two parts:
   *
   * ```
   *   (first block)     part A round at Z1.0 ... then part B round at Z1.0
   *   (NEXT OPERATION)  part A round at Z-0.2 ... then part B round at Z-0.2
   * ```
   *
   * **Every contour on the sheet goes down to the onion skin first, and only then does a second
   * sweep take them all through.** That is what holds each part on the vacuum while its neighbours
   * are cut. This writer used to finish each part before starting the next, which is why the
   * Woodtron profile carried `PARTS DO NOT COME FREE` at the top of every program it wrote: the
   * first pass was all there was, and somebody had to take them through by hand.
   *
   * **The fix is not to set `leaveUncut` to 0.** That matches the machine's finished depth and cuts
   * each part clean out in turn, freeing the first one under a spinning cutter — the exact failure
   * the two-pass structure exists to prevent. The onion skin stays; what changes is that the
   * program now has somewhere to take it off.
   *
   * Only perimeters with a skin on them come back. A rebate, a groove or a pocket is finished at
   * its own depth in the first pass and has no second half, and a profile with `leaveUncut` at zero
   * is already through — for that one this loop does nothing at all, which is what keeps every
   * existing program byte-identical.
   */
  if (skinned.length > 0) {
    w.comment('NEXT OPERATION');
    w.comment(
      `second pass — ${skinned.length} contour${skinned.length === 1 ? '' : 's'} taken through, ` +
        'after every one of them has been cut to the skin. Parts stay on the vacuum until here.',
    );
    for (const op of skinned) {
      const tool = findMachineTool(profile, op.toolId);
      // A missing tool was already reported by name in the first pass; saying it twice adds
      // nothing and a second `SKIPPED` line reads like a second fault.
      if (!tool) continue;
      ensureTool(tool);
      writeThroughPass(w, op, profile, tool, program.thickness);
    }
  }

  if (currentTool) for (const line of profile.stopSpindle) w.push(line);
  for (const line of profile.postamble) w.push(line);

  return {
    text: w.lines.join('\r\n') + '\r\n',
    filename: `${jobName.replace(/[^\w-]+/g, '-').toLowerCase()}-${program.materialId}-${program.sheetIndex}${profile.fileExtension}`,
    warnings,
  };
};

/**
 * One contour's second pass: straight down through the skin, once round, out.
 *
 * **A single depth pass, deliberately, where the first pass steps down.** There is only
 * `leaveUncut` of material left here — 1.0mm on the Woodtron — so stepping it down in
 * `maxDepthOfCut` bites would write a stack of passes through air to reach a millimetre of board.
 * The machine's own files plunge straight to `Z-0.2` and go once round, and that is what this is.
 *
 * The depth is the through depth for the head the tool is on, not the sheet's thickness: the two
 * heads have their own overcut into the spoilboard, which is `HeadProfile`'s whole reason for
 * existing.
 */
const writeThroughPass = (
  w: Writer,
  op: Extract<Operation, { kind: 'contour' }>,
  profile: MachineProfile,
  tool: MachineTool,
  thickness: Mm,
) => {
  const head = headOf(tool);
  const clearance = zClearance(profile, head, thickness);
  const plunge = zPlunge(profile, head, thickness);
  const z = zAtDepth(profile, throughDepth(profile, head, thickness, thickness, true), thickness);
  const start = op.path[0]!;

  w.comment(`${op.partName} ${op.purpose} — through`);
  w.push(`G0 X${n(start.x)} Y${n(start.y)}`);
  w.push(`G0 Z${n(plunge)}`);
  w.push(`G1 Z${n(z)} F${tool.plungeFeed}`);
  contourPass(w, op.path, op.closed, z, tool.feed);
  w.push(`G0 Z${n(clearance)}`);
};

const writeOperation = (
  w: Writer,
  op: Operation,
  profile: MachineProfile,
  tool: MachineTool,
  thickness: Mm,
) => {
  // Every plane this operation moves between belongs to the head the tool is on, not to the
  // machine — see `HeadProfile`. The two heads do not rapid at the same height.
  const head = headOf(tool);
  const clearance = zClearance(profile, head, thickness);
  const plunge = zPlunge(profile, head, thickness);

  switch (op.kind) {
    case 'bore': {
      const z = zAtDepth(
        profile,
        throughDepth(profile, head, thickness, op.depth, op.through),
        thickness,
      );
      w.comment(`${op.partName} ${op.purpose} D${op.diameter}`);
      if (profile.drillStyle === 'canned-g81') {
        w.push(`G0 X${n(op.at.x)} Y${n(op.at.y)}`);
        w.push(`G81 Z${n(z)} R${n(plunge)} F${tool.plungeFeed}`);
        w.push('G80');
      } else {
        w.push(`G0 X${n(op.at.x)} Y${n(op.at.y)}`);
        w.push(`G0 Z${n(plunge)}`);
        w.push(`G1 Z${n(z)} F${tool.plungeFeed}`);
        w.push(`G0 Z${n(clearance)}`);
      }
      return;
    }

    case 'contour': {
      // `op.depth` already accounts for any onion skin — see `perimeterDepth`.
      const target = op.depth;
      const start = op.path[0]!;
      w.comment(`${op.partName} ${op.purpose}`);
      w.push(`G0 X${n(start.x)} Y${n(start.y)}`);
      w.push(`G0 Z${n(plunge)}`);
      for (const depth of depthPasses(target, tool.maxDepthOfCut)) {
        w.push(`G1 Z${n(zAtDepth(profile, depth, thickness))} F${tool.plungeFeed}`);
        contourPass(w, op.path, op.closed, zAtDepth(profile, depth, thickness), tool.feed);
        // A closed path finishes where it started, so the next pass plunges in the same place
        // rather than rapiding across the part it has just cut.
        if (!op.closed) w.push(`G0 X${n(start.x)} Y${n(start.y)}`);
      }
      w.push(`G0 Z${n(clearance)}`);
      if (op.purpose === 'perimeter' && (op.leaveUncut ?? 0) > 0) {
        w.comment(`leaves ${op.leaveUncut}mm holding the part in the sheet`);
      }
      return;
    }

    case 'pocket': {
      w.comment(`${op.partName} ${op.purpose} pocket ${op.depth}mm deep`);
      const diameter = toolDiameterOf(op.toolId) ?? mm(6);
      // 45% of the cutter, which is a conservative stepover for a full-depth clearing pass.
      const stepover = mm(diameter * 0.45);
      const rings = isRectangle(op.outline)
        ? rectanglePocketRings(op.outline, stepover)
        : [op.outline.map((v) => ({ x: v.x, y: v.y }))];
      if (!isRectangle(op.outline)) {
        w.comment('boundary only — this pocket is not a rectangle and is not cleared');
      }
      const start = rings[0]![0]!;
      w.push(`G0 X${n(start.x)} Y${n(start.y)}`);
      w.push(`G0 Z${n(plunge)}`);
      for (const depth of depthPasses(op.depth, tool.maxDepthOfCut)) {
        for (const ring of rings) {
          w.push(`G0 X${n(ring[0]!.x)} Y${n(ring[0]!.y)}`);
          w.push(`G1 Z${n(zAtDepth(profile, depth, thickness))} F${tool.plungeFeed}`);
          for (const p of ring.slice(1)) w.push(`G1 X${n(p.x)} Y${n(p.y)} F${tool.feed}`);
          w.push(`G1 X${n(ring[0]!.x)} Y${n(ring[0]!.y)} F${tool.feed}`);
        }
      }
      w.push(`G0 Z${n(clearance)}`);
      return;
    }

    case 'profiled': {
      w.comment(`${op.partName} ${op.purpose} with ${op.toolId}`);
      const start = op.path[0]!;
      w.push(`G0 X${n(start.x)} Y${n(start.y)}`);
      w.push(`G0 Z${n(plunge)}`);
      w.push(`G1 Z${n(zAtDepth(profile, op.depth, thickness))} F${tool.plungeFeed}`);
      for (const p of op.path.slice(1)) w.push(`G1 X${n(p.x)} Y${n(p.y)} F${tool.feed}`);
      w.push(`G0 Z${n(clearance)}`);
      return;
    }
  }
};

/** Only used to keep the winding check available to tests and to future climb-milling work. */
export const ringIsCounterClockwise = isCcw;
