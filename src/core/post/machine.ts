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
import type { Vec2 } from '../geom/vec.ts';

/**
 * Where the machine's Z zero sits.
 *
 * The single most expensive number to get wrong, and the two conventions are both common.
 * `material-top` means Z0 is the top surface of the sheet and cuts go negative; `table` means Z0 is
 * the spoilboard and the top of the sheet is at +thickness. A program written for one and run on
 * the other either cuts air or drives the full depth of the material into the bed.
 */
export type ZDatum = 'material-top' | 'table';

/**
 * Which head does the work.
 *
 * A nesting machine has more than one. The router spindle carries one bit at a time and cuts parts
 * out; the drill head is a fixed block of small spindles that puts a whole row of holes down in one
 * plunge. They are **bolted to the same gantry in different places**, and that is the fact this type
 * exists for — see `HeadProfile.workOffset`.
 *
 * A machine with only a router spindle still has both entries, carrying the same numbers. That
 * costs a line of data and means nothing downstream has to ask whether a machine has two heads.
 */
export type Head = 'router' | 'drill';

/**
 * What one head does, as distinct from the machine it is bolted to.
 *
 * **Read `docs/woodtron-dialect.md` §2 and §5 before changing any of this.** All four fields differ
 * between the two heads on a real machine, and three of them were single machine-wide numbers here
 * until twenty-one of that machine's own programs said otherwise.
 */
export interface HeadProfile {
  /**
   * The word that selects this head's own origin — `G54`, `G55`, and so on.
   *
   * **The single most structurally significant thing the dialect turned up.** The two heads are
   * physically offset from each other and the machine keeps a separate work offset for each, so a
   * post that writes one origin for both puts every hole in the wrong place relative to every cut
   * — by the distance between the heads, which is not small. The file looks perfectly plausible:
   * every coordinate is a number the machine accepts, every part is the right size, and the holes
   * are simply somewhere else.
   *
   * It is emitted when the head **changes**, so a program that only uses the router says it once.
   */
  readonly workOffset: string;
  /**
   * Height above the material this head rapids at.
   *
   * Per head because the heads are not the same length: on the Woodtron the drill head rapids at
   * +30 where the router rapids at +20, which is read straight off `Z46.3` and `Z36.3` on a 16.3mm
   * sheet. Too low is a rapid through a clamp; too high is air time on every move.
   */
  readonly clearanceHeight: Mm;
  /** Height it drops to before feeding down. Small, to save air time. */
  readonly plungeClearance: Mm;
  /**
   * How far past the underside a through cut goes, into the spoilboard.
   *
   * **Per head, and the drill head's figure is normally zero.** A through *route* is one pass round
   * each part and 0.2mm into the sacrificial board is how it comes out clean. A through *drill*
   * that overcut would be putting a Ø5 hole in the bed on every through-hole, hundreds of times a
   * sheet — so it stops exactly at the table. The Woodtron's own programs show both: `G1 Z0.0` for
   * a drill going right through 16.3mm board, `G1 Z-0.2` for the router taking a part out.
   */
  readonly throughOvercut: Mm;
}

/** How a hole is written. */
export type DrillStyle =
  /** A canned cycle — `G81 X.. Y.. Z.. R.. F..`. Compact, and every controller has one. */
  | 'canned-g81'
  /** Explicit moves: rapid to clearance, feed down, rapid out. Verbose and unambiguous. */
  | 'explicit';

/**
 * One spindle in a drill bank.
 *
 * `at` is where it sits **relative to the head's own origin**, which is the thing
 * `DrillBank.datum` decides the meaning of. Diameter is per spindle rather than per bank because a
 * real head is not all one size: the Woodtron's row runs Ø5 with a Ø3 at position 7, and the two
 * spindles on the second row carry Ø10 and Ø35.
 */
export interface DrillSpindle {
  /** What the machine calls it, 1-based. This is the bit the select code is built from. */
  readonly number: number;
  /** Where it sits relative to the head origin. */
  readonly at: Vec2;
  readonly diameter: Mm;
}

/**
 * What a programmed coordinate is measured to — **and this is the unanswered question.**
 *
 * `reference-spindle` means the head is positioned so that the *first spindle named in the tool
 * call* lands on the programmed coordinate. `head-origin` means the coordinate is the head's own
 * origin and each spindle lands at its own offset beyond it.
 *
 * **Both readings produce identical holes for a symmetric pattern and differ by the spindle's own
 * offset for an asymmetric one** — 128mm on the Woodtron's spindle 5. That is the difference
 * between a shelf-pin row in the right place and one 128mm along, and it cannot be settled from
 * the programs alone: every drilled row in the twenty-one files is symmetric about the part.
 *
 * It wants checking against one part whose true hole positions are known. Until then a bank is
 * left unconfigured and every hole is bored with the router, which is slower and right either way.
 */
export type BankDatum = 'reference-spindle' | 'head-origin';

/**
 * A drill bank — the block of vertical spindles on a nesting machine's drill head.
 *
 * A bank puts a whole System 32 row down in one hit instead of twenty-one plunges with the router,
 * which on a kitchen's worth of side panels is most of the machine time. It is also the part of a
 * machine that is least standard: how many spindles, at what pitch, in how many rows, on which
 * axes, what diameter each carries, and what code fires them all differ between builders.
 *
 * **Absent means every hole is bored with the router spindle.** Slower, and correct on any machine.
 * That is the default on purpose: a bank configured wrong fires a spindle that is not over the hole
 * it thinks it is.
 *
 * The shape here is read off `docs/woodtron-dialect.md` §6 — a flat list of spindles rather than a
 * pitch and a count, because the rows do not share a numbering origin and the diameters vary along
 * a row. `drillRow` builds a row from the pitch rule so a profile does not hand-list seventeen
 * entries.
 */
export interface DrillBank {
  readonly spindles: readonly DrillSpindle[];
  /** What the programmed coordinate positions. See `BankDatum` — this is the open question. */
  readonly datum: BankDatum;
  /**
   * The code that fires a set of spindles at once.
   *
   * Takes the whole set rather than one spindle, because firing them together in one plunge is the
   * entire point of a bank. The Woodtron spells it as a bitmask — `B31` is spindles 1 to 5 — which
   * `bitmaskSelect` builds.
   */
  readonly select: (spindles: readonly number[]) => string;
  /** Everything up and off. */
  readonly allUp: string;
}

/**
 * A row of evenly spaced spindles, numbered from `from` and starting at `base` along `axis`.
 *
 * Spindle *n* sits at `base + (n − from) × pitch`. On the Woodtron's main row that is the plain
 * `(n − 1) × 32` the programs show; the second row needs `base` because it starts its own
 * numbering at 16 but sits 160 along, not 0.
 */
export const drillRow = (row: {
  readonly axis: 'X' | 'Y';
  readonly pitch: Mm;
  /** The number of the first spindle in the row. */
  readonly from: number;
  readonly count: number;
  /** Where the first spindle sits on `axis`, from the head origin. */
  readonly base: Mm;
  /** The position on the other axis — 0 for the row the head origin sits on. */
  readonly across: Mm;
  readonly diameter: Mm;
}): DrillSpindle[] =>
  Array.from({ length: row.count }, (_, i) => {
    const along = mm(row.base + i * row.pitch);
    return {
      number: row.from + i,
      at: row.axis === 'X' ? { x: along, y: row.across } : { x: row.across, y: along },
      diameter: row.diameter,
    };
  });

/**
 * A bitmask select code, where spindle *n* sets bit *n − 1*.
 *
 * `2 ** (n - 1)` rather than `1 << (n - 1)` on purpose: the shift is a 32-bit signed operation and
 * goes negative at spindle 32, which is not far past a head this size.
 */
export const bitmaskSelect =
  (prefix: string) =>
  (spindles: readonly number[]): string =>
    `${prefix}${spindles.reduce((mask, s) => mask + 2 ** (s - 1), 0)}`;

/** Every spindle in the bank carrying this diameter, in spindle order. */
export const spindlesOfDiameter = (bank: DrillBank, diameter: Mm): DrillSpindle[] =>
  bank.spindles
    .filter((s) => Math.abs(s.diameter - diameter) < 0.01)
    .sort((a, b) => a.number - b.number);

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
  /**
   * Which head carries it. Absent means the router, which is where all but a drill bank's own
   * spindles live — so an ordinary tool table needs no answer and a bank cannot be added without
   * one.
   */
  readonly head?: Head;
}

/** Which head a tool is on. The router unless it says otherwise. */
export const headOf = (tool: MachineTool): Head => tool.head ?? 'router';

export interface MachineProfile {
  readonly id: string;
  readonly name: string;
  /** What the file is called. KDT writes `.nc`. */
  readonly fileExtension: string;

  readonly zDatum: ZDatum;
  /**
   * The heads, and what each one does differently.
   *
   * These four figures were machine-wide until the Woodtron's own programs showed all four
   * differing between the router and the drill head. A machine with only a router spindle carries
   * the same numbers twice, which is honest — it is not that it has one head, it is that its two
   * agree.
   */
  readonly heads: { readonly [K in Head]: HeadProfile };
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

/** Z of a height above the top surface, in the machine's own datum. */
const zAbove = (profile: MachineProfile, height: Mm, thickness: Mm): Mm =>
  profile.zDatum === 'material-top' ? height : mm(thickness + height);

/** Z of a head's rapid plane. */
export const zClearance = (profile: MachineProfile, head: Head, thickness: Mm): Mm =>
  zAbove(profile, profile.heads[head].clearanceHeight, thickness);

/** Z a head drops to before it starts feeding down. */
export const zPlunge = (profile: MachineProfile, head: Head, thickness: Mm): Mm =>
  zAbove(profile, profile.heads[head].plungeClearance, thickness);

/**
 * How deep a hole actually goes, once the head's own overcut is applied.
 *
 * `asked` is what the feature wanted. A hole that does not go through is drilled to exactly that.
 * A hole that does gets the head's overcut — **and never comes out shallower than it was asked
 * for**, which is what the `max` is protecting: a feature stating 20mm into 16mm board means it,
 * and a drill head with a zero overcut must not quietly pull that back to 16.
 */
export const throughDepth = (
  profile: MachineProfile,
  head: Head,
  thickness: Mm,
  asked: Mm,
  through: boolean,
): Mm =>
  through ? mm(Math.max(asked, thickness + profile.heads[head].throughOvercut)) : asked;
