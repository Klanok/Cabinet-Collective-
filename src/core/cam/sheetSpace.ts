/**
 * Getting a part onto the machine bed — the transform, and the flip.
 *
 * This is the most dangerous file in the CAM layer, and it is dangerous for a reason this
 * codebase already has scar tissue for. §4.4's former hung a board thickness below its own line;
 * §4.6's mounting plate was bored 37mm from the wrong end of a side panel. Both had the right
 * count, the right diameter and the right size, and both were wrong. A part mirrored on the bed
 * is exactly that failure again, one layer further downstream and considerably more expensive:
 * every handed part in the job comes out backwards, and you find out when the cups are on the
 * outside of the door.
 *
 * So the whole mapping is stated once, here, and derived rather than written out per case.
 *
 * ## The three spaces this bridges
 *
 * **Part space** (docs/coordinate-convention.md) — X is the part's length, Y its width, and Z runs
 * through the thickness from the B-face at `z = 0` to the A-face at `z = t`. The profile is drawn
 * on the B-face and extruded upward.
 *
 * **Blank space** — the part's bounding box as the nest laid it, possibly turned 90°.
 * `nest/guillotine.ts` owns this and knows nothing about faces.
 *
 * **Sheet space** — the machine bed. X along the sheet's length, Y across its width, origin at the
 * corner of the usable area. Z is not this file's business: depth is measured *down from the top
 * surface* and the post-processor decides what number that is on a given machine.
 *
 * ## Which face goes up, and what it costs
 *
 * A nested sheet is machined **from one side only**. Whatever is facing up is what the spindle can
 * reach, so a part is laid with its machined face upward — which for a door means its **back** is
 * up, because that is where the hinge cups are (§2: a cup is bored on the B-face, and that is not
 * a mistake to fix).
 *
 * That is free to choose per part on double-sided board, and it is *not* free on single-sided
 * stock, where one face is the decor and the other is backing. `decorFaces` records which, and a
 * part that would have to be laid decor-down on single-sided board is reported rather than quietly
 * machined into the show face.
 *
 * **Laying a part B-face up mirrors it.** Turning a part over about its own length axis puts the
 * B-face up and leaves X where it was, so a feature at part `x` is now at `length − x` as the
 * machine looks down at it. Get this backwards and a left-hand side panel is bored as a right-hand
 * one: same holes, same diameters, same count, on the wrong end. There is one function that does
 * it and everything goes through it.
 *
 * **A mirror reverses an arc.** A curve that swept counter-clockwise sweeps clockwise once the
 * part is turned over, which on the machine is the difference between G3 and G2 — and between a
 * radius and a gouge. The bulge's sign is negated in the same place the mirror happens, so the two
 * cannot be applied separately or forgotten independently.
 */

import { type Mm, mm } from '../units.ts';
import type { Vec2 } from '../geom/vec.ts';
import type { Vertex2 } from '../geom/arc.ts';
import type { MachiningFace } from '../model/feature.ts';
import type { Orientation, Placement, Rect } from '../nest/nest.ts';

/**
 * Everything needed to put one part's geometry on the bed.
 *
 * Built once per part by `layPart` and then applied to every feature and every profile vertex, so
 * a part cannot have its outline mapped one way and its holes another.
 */
export interface Lay {
  /** The blank's position and size on the sheet, straight from the nest. */
  readonly at: Rect;
  /** Whether the nest turned the blank 90°. */
  readonly orientation: Orientation;
  /** The part's own bounding size, before any turning. */
  readonly length: Mm;
  readonly width: Mm;
  /**
   * Which of the part's own faces is uppermost on the bed — the one the spindle can reach.
   *
   * 'A' leaves the part the way it is drawn. 'B' turns it over, which mirrors it.
   */
  readonly faceUp: MachiningFace;
}

/**
 * Turn a part over: B-face up, mirrored about the middle of its length.
 *
 * The choice of axis is a convention and either would do — flipping about the width axis differs
 * only by a 180° turn in the plane, which the nest is free to make anyway. What is *not* a
 * convention is that a flip mirrors at all, and that the mirror is applied to every coordinate
 * belonging to the part rather than to some of them.
 */
const mirrorPoint = (p: Vec2, length: Mm): Vec2 => ({ x: mm(length - p.x), y: p.y });

/**
 * Part space → the blank's own frame, before the nest moves it.
 *
 * Two steps, in this order: turn the part over if its B-face is up, then turn it 90° if the nest
 * turned it. Doing them the other way round mirrors about the wrong axis.
 *
 * The 90° turn is **counter-clockwise seen from above**, which is what makes the blank's extents
 * come out as `width × length` — matching what `footprintOf` in the packer reserved. A point
 * `(x, y)` rotates to `(−y, x)` and is brought back into the box by adding the part's width.
 */
const toBlank = (p: Vec2, lay: Lay): Vec2 => {
  const faced = lay.faceUp === 'B' ? mirrorPoint(p, lay.length) : p;
  return lay.orientation === 'turned'
    ? { x: mm(lay.width - faced.y), y: mm(faced.x) }
    : faced;
};

/** Part space → sheet space. The one mapping; everything geometric goes through it. */
export const partPointToSheet = (p: Vec2, lay: Lay): Vec2 => {
  const b = toBlank(p, lay);
  return { x: mm(lay.at.x + b.x), y: mm(lay.at.y + b.y) };
};

/**
 * Does this lay reverse the handedness of the plane?
 *
 * A mirror does; a rotation does not. Anything that depends on the *direction* of travel — an
 * arc's sweep, the winding of a closed path, which side of a contour the material is on — has to
 * be flipped exactly when this is true. Stated as one derived predicate so no caller has to
 * remember that turning 90° is harmless and turning over is not.
 */
export const layReversesHandedness = (lay: Lay): boolean => lay.faceUp === 'B';

const withBulge = (p: Vec2, bulge: number | undefined): Vertex2 =>
  bulge === undefined || bulge === 0 ? { x: p.x, y: p.y } : { x: p.x, y: p.y, bulge };

/**
 * A whole boundary ring, mapped, staying counter-clockwise and keeping every arc on its own edge.
 *
 * Unmirrored this is just the points. Mirrored it is worth working through, because there are two
 * separate things to get right and they interact — which is exactly the sort of place a sign error
 * survives every test that checks vertex positions.
 *
 * **A mirror reverses the winding.** The same vertices in the same order now run clockwise, and
 * everything downstream — which side of a contour the material is on, what "outside" means to the
 * tool offset — reads the winding. So the traversal is reversed to put it back
 * counter-clockwise.
 *
 * **A bulge belongs to the edge leaving its vertex**, so reversing the traversal moves every bulge
 * back one place: the edge leaving vertex *i* in the reversed ring is the original edge from *i−1*
 * to *i*, travelled backwards.
 *
 * And now the part that is easy to get wrong. **Two negations apply and they cancel.** Mirroring an
 * arc negates its sweep; travelling that same arc backwards negates it again. So the bulge carried
 * across is the **original number, unchanged** — which is why this reads from `ring` rather than
 * from the mirrored points. Negating once, which is the obvious thing to write, produces an arc
 * that bows the wrong way: not a slightly different curve, but the complement of the one wanted,
 * cutting straight through the part. There is a test that mirrors a quarter disc and checks the arc
 * still bulges away from the material.
 */
export const partRingToSheet = (ring: readonly Vertex2[], lay: Lay): Vertex2[] => {
  const points = ring.map((v) => partPointToSheet(v, lay));
  const n = ring.length;
  if (!layReversesHandedness(lay)) return points.map((p, i) => withBulge(p, ring[i]!.bulge));

  const reversed: Vertex2[] = [];
  for (let i = n - 1; i >= 0; i--) {
    reversed.push(withBulge(points[i]!, ring[(i - 1 + n) % n]!.bulge));
  }
  return reversed;
};

/** An open path — a groove centreline, a profiled cut. No winding to preserve, so no reversal. */
export const partPathToSheet = (path: readonly Vec2[], lay: Lay): Vec2[] =>
  path.map((p) => partPointToSheet(p, lay));

/**
 * Decide which way up a part goes, from where its machining is.
 *
 * Three cases and each is a real one:
 *
 *   - **machined on one face** — that face goes up. Nearly every part in a plain kitchen, and the
 *     reason a job of plain doors has no flips in it at all (§2).
 *   - **machined on neither face** — a back panel, a drawer bottom. Nothing to reach, so it is laid
 *     A-face up, which keeps its geometry unmirrored and its cut path the way it is drawn.
 *   - **machined on both faces** — a shaker door, recessed on the show face and bored in the back.
 *     One nested program cannot do both. The face carrying more work goes up and the rest is
 *     **reported**, because half-machining a part and saying nothing is how a door reaches the
 *     bench looking finished.
 */
export const faceToLayUp = (faces: ReadonlySet<MachiningFace>, weightA: number, weightB: number): MachiningFace => {
  if (faces.size === 0) return 'A';
  if (faces.size === 1) return faces.has('B') ? 'B' : 'A';
  return weightB > weightA ? 'B' : 'A';
};

/** The blank's rectangle on the sheet, for drawing and for bounds checks. */
export const layBounds = (lay: Lay): Rect => lay.at;

/**
 * Build the lay for a part.
 *
 * `at` and `orientation` come from the nest and are not negotiable — the nest reserved that
 * rectangle and the cut has to happen inside it. `faceUp` is CAM's own decision and is the only
 * thing added here.
 */
export const layPart = (
  placement: Placement,
  length: Mm,
  width: Mm,
  faceUp: MachiningFace,
): Lay => ({
  at: placement.at,
  orientation: placement.orientation,
  length,
  width,
  faceUp,
});
