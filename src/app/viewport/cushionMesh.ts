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
 *
 * - **§5.13 item 1, the inside corner.** The same fault a third time, on a different cushion. A
 *   hand-rolled `absarc` put the corner seat 372mm through the wall, and the fix — flattening
 *   through the model's own arc code and placing the mesh at the outline's **largest** z — shipped
 *   with no test on it at all, because it was JSX. §5.13 said in as many words: *"that arithmetic
 *   wants extracting where it can be asserted. Do that before touching it again."* This is that,
 *   and it is why `insideCornerSeatMesh` is here rather than inside a `useMemo`.
 *
 * Nothing in this file may import from `three` or from React. That is the whole point of it: what
 * lives here is readable by a test running in Node, and what stays in the component is not.
 *
 * **One cushion is still outside it**, and saying so is cheaper than letting somebody find out: the
 * *plain* banquette's seat still builds its own shape and placement in `SeatCushion`. Its faults are
 * the two at the top of this comment, both fixed and neither asserted as occupancy. It wants the
 * same treatment, and it is a bigger job than it looks — the round branch draws its corner with
 * three.js's own `absarc`, so moving it here means drawing that corner the way every other outline
 * in this codebase is drawn, through the model's arc code, and that is a change to the picture
 * rather than a move.
 */

import { flattenArc } from '../../core/geom/arc.ts';
import type { Vec2 } from '../../core/geom/vec.ts';
import { type InsideCornerPlan, insideCornerRingAt } from '../../core/model/insideCorner.ts';
import type { PlanRing } from '../../core/rules/radius.ts';
import { mm } from '../../core/units.ts';

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

/* ── The inside corner's seat ────────────────────────────────────────────────────────────────── */

/**
 * The seat cushion of an inside corner unit: the L the rule engine settled on, extruded upward.
 *
 * ## Why the whole of it is here and not in the component
 *
 * Three separate things have to agree, and only the first of them is visible in a screenshot:
 *
 * - the **outline**, which is the unit's own plan pushed forward by the overhang — not a second
 *   opinion about what an L with a fillet in it looks like;
 * - the **inset**, because `bevelSize` grows the extrusion outward on every face, so the shape has
 *   to be drawn a bevel small for the finished cushion to land on the plan;
 * - the **placement**, because the extrusion grows from `−b` rather than symmetrically, and because
 *   the mesh's rotation makes shape `y` run *backwards* along cabinet z.
 *
 * The last one is the one that has been wrong. On a rectangle the origin's z is the seat's front and
 * writing `finishedFront` there is right by accident; on an **L** the outline's largest z is the far
 * end of the second leg, and the difference put the cushion 372mm through the wall. It was found by
 * measuring the live scene, which is the only instrument that could see it while this was JSX.
 */
export interface InsideCornerSeatMesh {
  /** Mesh origin in cabinet space. The z is the outline's largest, and that is the whole of it. */
  readonly position: readonly [number, number, number];
  /** Extrude depth — the cushion's thickness, less a bevel at each end. */
  readonly depth: number;
  /** The soft pillow edge, clamped to what the cushion's thickness has room to turn. */
  readonly bevel: number;
  /**
   * The plan the extruded outline traces, in **cabinet** space and exact — the finished cushion
   * pulled back by its own bevel, fillet still a bulge.
   *
   * Kept as a ring rather than only as the flattened shape so a test can ask the geometry engine
   * where the fillet's centre is. A fillet of the right radius on the wrong side is the same radius
   * and the same arc length, and it is what this unit was rejected for — see
   * `tests/insideCorner.test.ts`.
   */
  readonly insetPlan: PlanRing;
  /**
   * `insetPlan` in shape space, arcs flattened: what `new Shape()` is fed.
   *
   * Shape space is the cabinet's plan turned by the mesh's own `−π/2` about X, which maps a local
   * `(x, y, z)` to `(x, z, −y)`. So shape x is cabinet x, and shape y is `zMax − z` — cabinet z
   * measured backwards from the origin the mesh sits at.
   */
  readonly shape: readonly Vec2[];
}

/**
 * Keep a plan vertex inside the unit, `inset` in from every side.
 *
 * The upper bound is itself held at `inset`, so a span too narrow to hold two bevels collapses to a
 * line rather than inverting the clamp and turning the outline inside out.
 */
const clampToUnit = (value: number, inset: number, span: number): number =>
  Math.min(Math.max(value, inset), Math.max(inset, span - inset));

/**
 * Everything the corner seat's mesh is built from, in one place.
 *
 * The outline comes from `insideCornerRingAt` at `bevel − overhang`: a surface parallel to the
 * finished front, forward by the overhang and then back by the bevel the extrusion will add. One
 * centre and one radius, so the fillet follows for free rather than being described a second time
 * — which is what the model exists for, and what the hand-rolled arc in the viewport was not.
 *
 * The two walls and the two open ends are **clamped** rather than moved: a cushion is proud at the
 * fronts and flush everywhere it meets something, so the overhang must not push it into a wall.
 *
 * Returns `null` when there is no seat left to draw, which is a unit whose seat depth eats its own
 * span — reported in millimetres by the carcass warnings, not drawn as a degenerate blob here.
 */
export const insideCornerSeatMesh = (input: {
  readonly plan: InsideCornerPlan;
  /** Cabinet-space y of the carcass top: what the cushion rests on. */
  readonly seatTop: number;
  readonly thickness: number;
  /** How far the cushion stands proud of the two finished fronts. */
  readonly overhang: number;
  /** The soft pillow edge asked for. */
  readonly radius: number;
}): InsideCornerSeatMesh | null => {
  const { plan } = input;
  const bevel = Math.max(0.5, Math.min(input.radius, input.thickness / 2 - 1));
  const ring = insideCornerRingAt(plan, mm(bevel - input.overhang));
  if (ring.length < 3) return null;

  const insetPlan: PlanRing = ring.map((v) => ({
    x: mm(clampToUnit(v.x, bevel, plan.W)),
    z: mm(clampToUnit(v.z, bevel, plan.D)),
    bulge: v.bulge,
  }));

  // The mesh origin's z, and the reason this function exists. Working it back out of the plan is
  // where this went wrong: on an L the deepest point is the far end of the second leg, not a front.
  const zMax = Math.max(...insetPlan.map((v) => v.z));

  /*
   * Flattened through the model's own `flattenArc` rather than rebuilt with `absarc`, so the
   * cushion cannot disagree with the seat under it about where the curve goes. The last sample of
   * each arc is dropped because the next vertex is pushed as the start of its own edge.
   */
  const shape: Vec2[] = [];
  insetPlan.forEach((v, i) => {
    const next = insetPlan[(i + 1) % insetPlan.length]!;
    const a = { x: v.x, y: mm(zMax - v.z) };
    const b = { x: next.x, y: mm(zMax - next.z) };
    shape.push(a);
    if (v.bulge !== undefined && Math.abs(v.bulge) > 1e-9) {
      // The z → y reflection reverses the arc's sense, so the bulge does too.
      shape.push(...flattenArc(a, b, -v.bulge).map((f) => f.at).slice(0, -1));
    }
  });

  return {
    // x is the cabinet's own origin: the outline is already in cabinet x. y lifts the extrusion by
    // one bevel so it starts on the seat rather than a bevel below it.
    position: [0, input.seatTop + bevel, zMax],
    depth: Math.max(1, input.thickness - 2 * bevel),
    bevel,
    insetPlan,
    shape,
  };
};

/** The box a finished cushion occupies in cabinet space: `x0 → x1` by `y0 → y1` by `z0 → z1`. */
export interface CushionBox {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly z0: number;
  readonly z1: number;
}

/**
 * Where the corner seat's mesh actually finishes, read back out of the numbers handed to three.js.
 *
 * **This is the reading direction, not a second derivation.** It takes the mesh's own `position`,
 * `depth`, `bevel` and `shape` and applies what the renderer will do with them, so it moves when
 * the placement moves — which is what makes it worth asserting. Deriving the box from the plan
 * again would agree with the plan no matter where the mesh went.
 *
 * Two things the renderer does, and both grow the part:
 *
 * - `bevelSize` pushes the outline outward by `b` on every edge, and `bevelThickness` extends the
 *   extrusion by `b` at each end — so the geometry spans `−b → depth + b` along the extrude axis.
 *   On an axis-aligned box that is exactly `±b`, which is why this can be stated as a box at all.
 * - the mesh's `−π/2` about X maps a local `(x, y, z)` to `(x, z, −y)`, so the extrude runs **up**
 *   and shape y runs **backwards** along cabinet z from the origin.
 */
export const insideCornerSeatOccupancy = (mesh: InsideCornerSeatMesh): CushionBox => {
  const b = mesh.bevel;
  const [px, py, pz] = mesh.position;
  const xs = mesh.shape.map((p) => p.x);
  const ys = mesh.shape.map((p) => p.y);
  return {
    x0: px + Math.min(...xs) - b,
    x1: px + Math.max(...xs) + b,
    y0: py - b,
    y1: py + mesh.depth + b,
    // Backwards: the largest shape y is the smallest cabinet z.
    z0: pz - Math.max(...ys) - b,
    z1: pz - Math.min(...ys) + b,
  };
};
