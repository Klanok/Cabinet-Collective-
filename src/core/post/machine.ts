/**
 * A machine, as data.
 *
 * Phase 5's rule from the architecture doc is "one machine first", and the way to honour that
 * without painting into a corner is to make the *machine* a record and the *writer* generic. A
 * second machine is then a second profile — numbers and a handful of code words — rather than a
 * second post-processor.
 *
 * ## Why so much of this is flagged rather than assumed
 *
 * Everything here changes what the spindle does. A wrong clearance height is a rapid through a
 * clamp; a wrong Z datum is a cutter into the table or a sheet that never gets cut through; a wrong
 * drill-bank code is a spindle fired into the material. So this file follows the pattern
 * `library/blum.ts` already established for hardware figures nobody has checked: a profile carries
 * an `unconfirmed` list, and every consumer — the report, the app, the top of the G-code file
 * itself — prints it. **A figure nobody knows is unchecked is a figure that gets trusted**, and the
 * cost of being wrong here is higher than it is for a drawer runner.
 *
 * The honest position on a machine nobody here has stood in front of: the *shape* of the output is
 * knowable from the operation list, and the *dialect* is not. It is knowable in about ten minutes
 * from one program the machine already runs, which is why `post/iso.ts` is written to be checked
 * against one rather than trusted.
 */

import { type Mm, mm } from '../units.ts';

/**
 * Where the machine's Z zero sits.
 *
 * The single most expensive number to get wrong, and the two conventions are both common.
 * `material-top` means Z0 is the top surface of the sheet and cuts go negative; `table` means Z0 is
 * the spoilboard and the top of the sheet is at +thickness. A program written for one and run on
 * the other either cuts air or drives the full depth of the material into the bed.
 */
export type ZDatum = 'material-top' | 'table';

/** How a hole is written. */
export type DrillStyle =
  /** A canned cycle — `G81 X.. Y.. Z.. R.. F..`. Compact, and every controller has one. */
  | 'canned-g81'
  /** Explicit moves: rapid to clearance, feed down, rapid out. Verbose and unambiguous. */
  | 'explicit';

/**
 * A drill bank — the row of vertical spindles on a nesting machine's head.
 *
 * A bank puts a whole System 32 row down in one hit instead of twenty-one plunges with the router,
 * which on a kitchen's worth of side panels is most of the machine time. It is also the part of a
 * machine that is least standard: how many spindles, at what pitch, in which axis, what diameter
 * each carries, and what code selects them all differ between builders.
 *
 * **Absent means every hole is bored with the router spindle.** Slower, and correct on any machine.
 * That is the default on purpose: a bank configured wrong fires a spindle that is not over the hole
 * it thinks it is.
 */
export interface DrillBank {
  /** Spindle centres, e.g. 32 for System 32. */
  readonly pitch: Mm;
  /** Which axis the row of spindles runs along. */
  readonly axis: 'X' | 'Y';
  /** How many spindles are in the row. */
  readonly count: number;
  /** What diameter they carry. A bank is usually all one size, with Ø5 the common one. */
  readonly diameter: Mm;
  /** The code that selects spindle `n`, 1-based. e.g. `(n) => \`M${50 + n}\``. */
  readonly selectCode: (spindle: number) => string;
}

export interface MachineTool {
  /** Matches a `ToolProfile` id in `library/tools.ts`. */
  readonly toolId: string;
  /** The pocket number the machine knows it by — what `T` is set to. */
  readonly pocket: number;
  /** Cutting feed, mm/min. */
  readonly feed: number;
  /** Plunge feed, mm/min. Always slower — a cutter is much worse at cutting downward. */
  readonly plungeFeed: number;
  readonly spindleRpm: number;
  /** The most it will take in one pass. An 18mm part is several passes with a 6mm bit. */
  readonly maxDepthOfCut: Mm;
}

export interface MachineProfile {
  readonly id: string;
  readonly name: string;
  /** What the file is called. KDT writes `.nc`. */
  readonly fileExtension: string;

  readonly zDatum: ZDatum;
  /** Height above the material the tool rapids at. */
  readonly clearanceHeight: Mm;
  /** Height it drops to before feeding down. Small, to save air time. */
  readonly plungeClearance: Mm;
  /** How far past the underside a through cut goes, into the spoilboard. */
  readonly throughOvercut: Mm;
  /**
   * Material left under a part so it stays in the sheet.
   *
   * Zero cuts clean through, which is only safe when every part is big enough to hold itself down
   * on the vacuum. See `ContourOperation.leaveUncut`.
   */
  readonly leaveUncut: Mm;

  /** Bed size. A program that leaves it is refused rather than run. */
  readonly envelope: { readonly x: Mm; readonly y: Mm; readonly z: Mm };

  readonly drillStyle: DrillStyle;
  readonly drillBank?: DrillBank;
  /** The cutter parts are cut out with. */
  readonly partCutterToolId: string;
  readonly tools: readonly MachineTool[];

  /** Words written once at the top of every program. */
  readonly preamble: readonly string[];
  /** Words written at the end. */
  readonly postamble: readonly string[];
  /** How a tool change is spelled. */
  readonly toolChange: (tool: MachineTool) => readonly string[];
  /** Vacuum, dust extraction — anything switched on before cutting starts. */
  readonly startSpindle: (tool: MachineTool) => readonly string[];
  readonly stopSpindle: readonly string[];

  /**
   * Figures on this profile that have **not** been checked against the machine.
   *
   * Same contract as `indicativePricing` for money and `unconfirmedFigures` for hardware: printed
   * in the report, on screen, and in a comment at the top of every program this profile writes.
   * A profile with an empty list is claiming to have been verified against real output.
   */
  readonly unconfirmed: readonly string[];
}

export const findMachineTool = (profile: MachineProfile, toolId: string): MachineTool | null =>
  profile.tools.find((t) => t.toolId === toolId) ?? null;

/**
 * The bit used for a hole of this diameter, when the router has to do the boring.
 *
 * Returns null when nothing in the tool table matches, which is a real and common state — a Ø35
 * hinge cup needs a 35mm boring bit, and a machine whose table does not list one cannot bore it.
 * Reported rather than substituted: boring a 35mm cup with a 12mm cutter would need a helical path
 * this does not generate, and doing it with the nearest bit would quietly make the wrong hole.
 */
export const boringToolFor = (
  profile: MachineProfile,
  diameter: Mm,
  toolDiameter: (toolId: string) => Mm | null,
): MachineTool | null =>
  profile.tools.find((t) => {
    const d = toolDiameter(t.toolId);
    return d !== null && Math.abs(d - diameter) < 0.01;
  }) ?? null;

/** Z of a depth below the top surface, in the machine's own datum. */
export const zAtDepth = (profile: MachineProfile, depth: Mm, thickness: Mm): Mm =>
  profile.zDatum === 'material-top' ? mm(-depth) : mm(thickness - depth);

/** Z of the rapid plane. */
export const zClearance = (profile: MachineProfile, thickness: Mm): Mm =>
  profile.zDatum === 'material-top'
    ? profile.clearanceHeight
    : mm(thickness + profile.clearanceHeight);
