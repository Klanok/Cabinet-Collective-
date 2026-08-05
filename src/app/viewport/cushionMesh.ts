/**
 * Where a bevelled cushion mesh has to be placed so it finishes where it says it does.
 *
 * ## Why this is a module and not four numbers inside the JSX
 *
 * It is the same argument `core/model/cushion.ts` makes about the plan, one level down. A cushion's
 * *shape* is arithmetic, so it lives where a test in Node can read it — and so is where the mesh
 * goes. The two faults this file exists to prevent have now both happened, one per session:
 *
 * - **§5.14, first pass.** `bevelSize` grows the outline outward on every plan edge as well as
 *   through the thickness, and only the thickness was being taken back off. Both cushions came out
 *   36mm over on a 1200 × 500 seat.
 * - **§5.14, this pass.** The size was corrected and the **placement** was not. The growth is not
 *   symmetrical about the mesh's origin: it starts the geometry at `−b` on each axis and ends it at
 *   `length − b`. So a cushion of exactly the right size sat one bevel out of place on all three
 *   axes — into the wall at the back, off the end of the seat, and 18mm below the seat it rests on.
 *
 * **The second was invisible to every assertion the first one added**, because it is the right
 * size. It was found by measuring the running app (§7), which is also the second session running
 * that this cushion has been the thing that taught that lesson. So the arithmetic comes out of the
 * component and into here, where occupancy can be asserted rather than looked at.
 */

/** What a bevelled extrusion needs to finish at exactly the box it was asked for. */
export interface BevelledPlacement {
  /** Mesh origin in the parent frame. */
  readonly position: readonly [number, number, number];
  /** Extrude depth — the run, shortened by a bevel at each end. */
  readonly depth: number;
  /** The soft edge, clamped to what the cushion has room to turn. */
  readonly bevel: number;
}

/**
 * The soft pillow edge, clamped to what the cushion has room for.
 *
 * Never more than a quarter of any dimension, because a bevel bigger than that eats the face it is
 * softening, and never zero, because `bevelEnabled` with nothing to bevel produces a degenerate cap.
 */
export const softEdge = (radius: number, ...dimensions: readonly number[]): number =>
  Math.max(0.5, Math.min(radius, ...dimensions.map((d) => d / 4)));

/**
 * A back cushion or an end bolster: a wedge extruded along the run.
 *
 * The mesh is turned −π/2 about Y, which maps a local `(lx, ly, lz)` to `(−lz, ly, lx)` in the
 * parent. So the extrusion runs **backwards** along the parent's x from the origin — which is why
 * the origin sits at the far end of the run and why the bevel is *subtracted* on that axis and
 * added on the other two.
 *
 * Given `x`, `y` and a run of `width`, the finished cushion occupies
 * `x → x + width` by `y → y + height` by `0 → thickness` in the parent frame. On a wedge with lean
 * the bottom is thicker than `thickness` and grows forward, which is the lean and not an error.
 */
export const wedgeBackPlacement = (input: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly thickness: number;
  readonly radius: number;
}): BevelledPlacement => {
  const bevel = softEdge(input.radius, input.thickness, input.width, input.height);
  return {
    position: [input.x + input.width - bevel, input.y + bevel, bevel],
    depth: Math.max(1, input.width - 2 * bevel),
    bevel,
  };
};
