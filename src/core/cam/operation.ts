/**
 * The operation vocabulary — Phase 4's output, and the only thing a post-processor reads.
 *
 * An operation is **what to do to the material**, in sheet space, with no opinion about how any
 * particular controller spells it. "Bore Ø35 13 deep at (412.5, 96)" is the same instruction on a
 * KDT, a Biesse and a hobby router; what differs is whether it comes out as `G81 Z-13 R2 F...` or
 * as a plunge and a retract, and that difference belongs entirely to `post/`.
 *
 * That split is the reason this layer exists at all rather than going straight from features to
 * G-code. A second machine should be a second profile and a second writer, not a second CAM layer —
 * and the way to know whether that is true is that nothing in this file mentions a G-code word.
 *
 * ## Depth
 *
 * Every depth here is measured **down from the top surface of the sheet**, positive. Not from the
 * A-face, not from the table. The post converts that into whatever the machine's Z zero is, which
 * is a per-machine fact and one of the easiest to get expensively wrong.
 *
 * ## What is deliberately not here
 *
 * **Passes.** An 18mm part is not cut in one go with a 6mm cutter, but how many bites it takes is a
 * property of the *tool and the machine*, not of the job. The operation says "through, 18mm"; the
 * post steps it down by the tool's depth of cut.
 *
 * **Feeds and speeds.** Same reason — they belong to the tool table on a machine, and a feed that
 * is right on a 12kW spindle is wrong on a 3kW one.
 *
 * **Lead-ins, ramps and retracts.** Machine-shaped, and the post has the clearance heights.
 */

import type { Mm } from '../units.ts';
import type { Vec2 } from '../geom/vec.ts';
import type { Vertex2 } from '../geom/arc.ts';
import type { FeaturePurpose } from '../model/feature.ts';

/**
 * What an operation is for.
 *
 * A part's own outline is not a `PanelFeature` — it is the part — so it needs a purpose of its own.
 * `perimeter` is the one that cuts a part loose, which is why it is also the one that has to happen
 * last and the one that carries the hold-down.
 */
export type OperationPurpose = FeaturePurpose | 'perimeter';

interface OperationBase {
  readonly id: string;
  /** The panel this came from, so an operation can always be traced back to a part. */
  readonly partId: string;
  readonly partName: string;
  readonly purpose: OperationPurpose;
}

/** One hole. Position is the centre, in sheet space. */
export interface BoreOperation extends OperationBase {
  readonly kind: 'bore';
  readonly at: Vec2;
  readonly diameter: Mm;
  readonly depth: Mm;
  readonly through: boolean;
}

/**
 * Follow a path with a cutter at a depth.
 *
 * The path is **already offset** by the tool's radius where it needed to be — see `cam/offset.ts`
 * for why that is done here rather than left to the machine's cutter compensation. So a post
 * writes these coordinates out unchanged, and never applies a G41/G42 of its own.
 */
export interface ContourOperation extends OperationBase {
  readonly kind: 'contour';
  readonly path: readonly Vertex2[];
  readonly closed: boolean;
  readonly depth: Mm;
  readonly toolId: string;
  /**
   * Material left uncut under a through cut, so the part stays attached to the sheet.
   *
   * Only ever set on a `perimeter`. Without it the last pass frees the part while the spindle is
   * still in it: on a vacuum bed a small part lifts, and what happens next is a cutter into a
   * moving offcut. Zero means cut clean through, which is only safe with tabs or on a job where
   * every part is big enough to hold itself down.
   */
  readonly leaveUncut?: Mm;
}

/** Clear an area to a flat floor. The outline is the finished edge, not the tool centreline. */
export interface PocketOperation extends OperationBase {
  readonly kind: 'pocket';
  readonly outline: readonly Vertex2[];
  readonly depth: Mm;
  readonly toolId: string;
}

/**
 * Run a shaped cutter along a path — a V-groove, a cove, a moulded edge.
 *
 * Distinct from a contour because the cutter's own section is the point (§2: a cutter's
 * cross-section is the cutter's business), so there is no offset to apply and no side to be on.
 * The path is the centreline and the shape comes from the tool.
 */
export interface ProfiledOperation extends OperationBase {
  readonly kind: 'profiled';
  readonly path: readonly Vec2[];
  readonly depth: Mm;
  readonly toolId: string;
}

export type Operation =
  | BoreOperation
  | ContourOperation
  | PocketOperation
  | ProfiledOperation;

/** Which tool an operation needs, or null for a bore — a bore is chosen by diameter. */
export const toolOf = (op: Operation): string | null =>
  op.kind === 'bore' ? null : op.toolId;

/**
 * How deep an operation goes.
 *
 * Just its depth — `leaveUncut` is **not** subtracted here, because it was already accounted for
 * when the depth was chosen. See `perimeterDepth` in `cam/operations.ts`: leaving material and
 * overcutting into the spoilboard are two exclusive cases, not two adjustments to stack.
 * Subtracting again here is how a 0.2mm onion skin turned into a clean through cut.
 */
export const finalDepth = (op: Operation): Mm => op.depth;

/**
 * One sheet's worth of work, in the order it happens.
 *
 * The order is the deliverable as much as the coordinates are — see `orderOperations`.
 */
export interface SheetProgram {
  readonly materialId: string;
  readonly materialLabel: string;
  /** 1-based within its material, matching the nest. */
  readonly sheetIndex: number;
  readonly sheetLength: Mm;
  readonly sheetWidth: Mm;
  /** What the board really measures — what a through cut has to get past. */
  readonly thickness: Mm;
  readonly operations: readonly Operation[];
  /**
   * Parts on this sheet that could not be fully machined in this setup.
   *
   * A part worked on both faces is the ordinary case — a shaker door is recessed on the front and
   * bored in the back, and one nested program reaches one face. Named rather than silently
   * half-cut, because a door that arrives at the bench looking finished and is not is worse than
   * one that never got machined at all.
   */
  readonly needsSecondSetup: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Put a sheet's operations into the order they have to happen in.
 *
 * This is machining knowledge rather than tidiness, and one line of it is a safety rule:
 *
 *   1. **Boring**, while the sheet is whole and every part is still held flat by the vacuum.
 *   2. **Pockets, grooves and profiled cuts** — still held, and still able to take side load.
 *   3. **Interior cutouts** — a sink hole. The waste falls inside a part that is still attached.
 *   4. **Perimeters, last.** A part that has been cut out is loose. Boring a hole in a part the
 *      vacuum is no longer holding down is how a bit breaks and a part becomes a projectile.
 *
 * Within a group, operations are kept in part order and then grouped by tool, because a tool change
 * costs real seconds and a nested sheet has a lot of them. Bores are sorted by diameter for the
 * same reason.
 *
 * The sort is **stable within each bucket**, so the same job produces the same program every time —
 * a program that reordered itself between runs would be impossible to check against the one that
 * was proved on the machine.
 */
export const orderOperations = (operations: readonly Operation[]): Operation[] => {
  const bucket = (op: Operation): number => {
    if (op.purpose === 'perimeter') return 3;
    if (op.kind === 'bore') return 0;
    if (op.kind === 'contour') return 2; // an interior cutout
    return 1; // pockets, profiled cuts, grooves
  };
  const key = (op: Operation): string =>
    op.kind === 'bore' ? `d${op.diameter.toFixed(2)}` : op.toolId;

  return [...operations]
    .map((op, index) => ({ op, index }))
    .sort(
      (a, b) =>
        bucket(a.op) - bucket(b.op) ||
        (key(a.op) < key(b.op) ? -1 : key(a.op) > key(b.op) ? 1 : 0) ||
        a.index - b.index,
    )
    .map((e) => e.op);
};
