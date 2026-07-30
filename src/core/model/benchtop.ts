/**
 * A benchtop — its own object, not something worked out from the cabinets under it.
 *
 * See `model/runUnit.ts` for why this one is stored rather than derived. What follows is what a
 * top has that no cabinet can imply, which is the other half of the argument: overhangs, a
 * breakfast-bar edge on one side only, waterfall ends, mitred corners, where the joins go, sink
 * and hob cutouts, tap holes, an upstand, and a material that need not match the one next to it.
 *
 * ## Two supplies, one object
 *
 * A shop-made top — laminated MDF, timber — **is a cut part**. It comes off a sheet, it gets
 * banded, the sink hole is machined into it, and it belongs on the cutlist beside the doors.
 *
 * A stone top is **not**. It is templated on site after the cabinets are installed, and bought in
 * per square metre with the cutouts, the joins and the edge profiling charged separately against a
 * minimum. That is a purchase-order line, not something this rule engine cuts from a sheet.
 *
 * The model holds both, and `supply` — which comes off the chosen material — decides which. That
 * one field is the difference between a top that produces panels and a top that produces a
 * supplier charge, and nothing else in the codebase has to branch on it.
 */

import type { Mm } from '../units.ts';
import type { RunUnit } from './runUnit.ts';

/** How a benchtop is come by. Decided by its material, not by the top. */
export type BenchtopSupply =
  /** Cut from sheet stock in the shop. Produces panels. */
  | 'shop-made'
  /** Templated and fabricated by somebody else. Produces a purchase-order line. */
  | 'bought-in';

/**
 * What happens at each end of a top.
 *
 * Four rather than three, and the extra one is load-bearing: **whether an end is finished is not
 * the same question as whether it is square.** A square end against a wall gets nothing; a square
 * end at the end of a run gets a banded edge on a shop-made top and a charged edge profile on a
 * bought-in one. Collapsing those two into one "square" would silently drop the edge off every
 * open-ended run.
 *
 * - `wall` — it dies into a wall, a tall cabinet or a fridge. Nobody sees it, nothing is finished.
 * - `exposed` — a plain end that somebody sees. Banded, or profiled.
 * - `waterfall` — a panel of the same material runs down to the floor, mitred into the top.
 * - `mitred` — the end itself is cut on a mitre, for a corner where two tops meet.
 */
export type BenchtopEnd = 'wall' | 'exposed' | 'waterfall' | 'mitred';

export const BENCHTOP_END_LABELS: Record<BenchtopEnd, string> = {
  wall: 'Into a wall',
  exposed: 'Exposed end',
  waterfall: 'Waterfall',
  mitred: 'Mitred',
};

/**
 * A hole in the top.
 *
 * Its own kind rather than a free rectangle, because the kind is what a stone fabricator charges
 * by: a sink cutout and a tap hole are not the same money, and neither is the same as a hob.
 */
export type CutoutKind = 'sink' | 'hob' | 'tap-hole' | 'other';

export const CUTOUT_KIND_LABELS: Record<CutoutKind, string> = {
  sink: 'Sink cutout',
  hob: 'Hob cutout',
  'tap-hole': 'Tap hole',
  other: 'Cutout',
};

export interface BenchtopCutout {
  readonly id: string;
  readonly kind: CutoutKind;
  /** Distance along the top to the cutout's centre, from its left-hand end. */
  readonly along: Mm;
  /** Distance from the **back** edge of the top to the cutout's centre. */
  readonly fromBack: Mm;
  /** Size along the run. */
  readonly width: Mm;
  /** Size front-to-back. */
  readonly depth: Mm;
  /**
   * Radius left at the internal corners. A tap hole is a circle, which is this radius equal to
   * half of both sizes — there is no separate round-hole case to get wrong.
   */
  readonly cornerRadius: Mm;
}

export interface BenchtopOverhangs {
  /** Past the front of the carcasses. 20mm is the ordinary kitchen figure. */
  readonly front: Mm;
  /** Past the back line — a scribe allowance against an out-of-true wall. */
  readonly back: Mm;
  /** Past the left-hand end of the run, looking at it from the front. */
  readonly left: Mm;
  /** Past the right-hand end. Independent of the left: a breakfast bar is one end, not both. */
  readonly right: Mm;
}

export interface BenchtopUpstand {
  /** How far it stands above the top surface. */
  readonly height: Mm;
}

/*
 * There is deliberately no thickness here. An upstand is a strip of the top's own material, so its
 * thickness is that board's — and a second field claiming to know it would be free to disagree with
 * the board that will really be cut.
 */

export interface Benchtop extends RunUnit {
  /** Which benchtop material — and with it, whether this top is cut or bought. */
  readonly materialId: string;
  readonly overhangs: BenchtopOverhangs;
  readonly ends: {
    readonly left: BenchtopEnd;
    readonly right: BenchtopEnd;
  };
  /**
   * Where the top is joined, as distances along it from its left-hand end.
   *
   * Explicit, and deliberately not worked out from where the cabinets meet. A join goes where the
   * slab size forces one and where it will be least visible — under a wall cabinet, not in front
   * of the sink — and neither of those is a fact about the carcasses. `suggestedJoins` will
   * propose positions from a slab length when you want a starting point.
   */
  readonly joins: readonly Mm[];
  readonly cutouts: readonly BenchtopCutout[];
  /** The strip standing up at the back. Absent for the usual tiled or glass splashback. */
  readonly upstand?: BenchtopUpstand;
}

/** Total front-to-back size, carcass plus both overhangs. */
export const benchtopDepth = (t: Benchtop): Mm =>
  t.carcassDepth + t.overhangs.front + t.overhangs.back;

/** Total end-to-end size, run plus both end overhangs. */
export const benchtopLength = (t: Benchtop): Mm => t.length + t.overhangs.left + t.overhangs.right;

/**
 * Where the top is cut, as the lengths of each section from left to right.
 *
 * A join list of `[1200]` on a 2400 top is two 1200 sections. Joins outside the top, or given out
 * of order, are ignored rather than producing a negative section — a number typed into a field
 * fires on every keystroke, and "2" on the way to "2400" must not break the drawing.
 */
export const benchtopSections = (t: Benchtop): readonly Mm[] => {
  const total = benchtopLength(t);
  const cuts = [...t.joins]
    .filter((j) => j > 0 && j < total)
    .sort((a, b) => a - b);
  const sections: Mm[] = [];
  let previous = 0;
  for (const cut of cuts) {
    sections.push(cut - previous);
    previous = cut;
  }
  sections.push(total - previous);
  return sections;
};

/**
 * Join positions that would keep every section within a given slab length.
 *
 * A **suggestion**, never applied automatically. Where a join really goes is a judgement about
 * what is least visible, and the model's opinion about slab length is only ever the constraint
 * that judgement works inside.
 */
export const suggestedJoins = (t: Benchtop, maxSectionLength: Mm): readonly Mm[] => {
  const total = benchtopLength(t);
  if (maxSectionLength <= 0 || total <= maxSectionLength) return [];
  const count = Math.ceil(total / maxSectionLength);
  const each = total / count;
  return Array.from({ length: count - 1 }, (_, i) => (i + 1) * each);
};

/** True when an end is a face somebody sees, and so gets banded or profiled. */
export const isFinishedEnd = (end: BenchtopEnd): boolean =>
  end === 'exposed' || end === 'waterfall';

/**
 * The finished edges — the ones that get banded on a shop-made top and profiled on a stone one.
 *
 * The front always counts. An end counts when somebody sees it. The back does not, because a
 * splashback covers it, and a **mitred** end does not either: a mitre is a joint, and it is
 * charged as one rather than as a metre of profiling.
 */
export const finishedEdgeLength = (t: Benchtop): Mm => {
  const depth = benchtopDepth(t);
  let total = benchtopLength(t);
  if (isFinishedEnd(t.ends.left)) total += depth;
  if (isFinishedEnd(t.ends.right)) total += depth;
  return total;
};

/** Standard overhangs for a new top: 20mm proud at the front, flush everywhere else. */
export const DEFAULT_BENCHTOP_OVERHANGS: BenchtopOverhangs = {
  front: 20,
  back: 0,
  left: 0,
  right: 0,
};
