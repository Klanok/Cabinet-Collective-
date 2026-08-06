/**
 * A corner radius on an ordinary carcass — the plan geometry, resolved once.
 *
 * This is the **quarter-round unit's family**, not a new one. Read `quarterDiscProfile`
 * together with the former placement in `specs/radiusEnd.ts`: the corner that unit is missing
 * is the front-right one, at (W, D). A corner radius `r` there has its centre at (W − r,
 * D − r); set `r = W = D` and the centre lands on the back-left corner and what is left *is*
 * the quarter disc. So one description covers both, and `specs/radiusEnd.ts` resolves its own
 * geometry through this file rather than keeping a second copy.
 *
 * ## The three planes
 *
 * A wrap of bendy ply finishes flush, so the carcass underneath it is set back by the whole
 * thickness of the wrap on both faces the wrap covers:
 *
 * ```
 *                        z = D          ────────────┐ carcass front (the door zone)
 *                        z = D − skin   ──────┐     ┘ substrate front (under the strip)
 *                                              ╲
 *                        z = D − r              ╲___  arc centre height
 *                                    x = W − r      x = W − skin   x = W
 *                                                   substrate end  finished end
 * ```
 *
 * The **substrate** arc has radius `r − skin` and the **finished** arc has radius `r`; they
 * are concentric on (W − r, D − r), which is what makes the wrap the same thickness the whole
 * way round. Getting that centre wrong by the skin thickness is the same error as cutting a
 * former to the finished radius: a step you can catch a fingernail on, right where a hand
 * lands.
 *
 * ## Handedness
 *
 * Everything below is built for a **front-right** corner and mirrored for a front-left one.
 * That is deliberate: one description that is mirrored cannot drift out of step with itself,
 * and mirroring is a thing that can be tested on its own. `radiusCorner` has no default for
 * the reason `bowedFrontProfile` takes its edge with no default — a caller that guessed would
 * put the curve against the wall, where it is the right size, occupies the wrong quarter, and
 * looks entirely correct in a test that only asserts size.
 */

import { type Mm, mm } from '../units.ts';
import type { CornerMethod } from '../model/construction.ts';
import type { Vertex2 } from '../geom/arc.ts';
import type { Profile2D } from '../geom/profile.ts';
import { type PanelPlacement, placement } from '../geom/placement.ts';
import { v2, v3 } from '../geom/vec.ts';

export type RadiusCorner = 'front-left' | 'front-right';

/** Both faces the curve meets are square to each other, so the turn is always this. */
export const QUARTER_TURN = Math.PI / 2;

/**
 * The bulge of the corner arc **in plan coordinates**.
 *
 * Plan rings below are wound clockwise in (x, z) so that the reflection into part space —
 * which is what a horizontal panel's placement is — comes out counter-clockwise, the winding
 * every profile in this codebase uses. Clockwise plus convex is a negative sweep, so the
 * bulge is negative here and comes out positive on the part. `tan(90° / 4) = tan 22.5°`.
 */
const PLAN_ARC_BULGE = -Math.tan(Math.PI / 8);

/** Positions closer together than this are the same point. */
const SAME_POINT: Mm = mm(1e-9);

// ---------------------------------------------------------------------------------------
// Plan rings
// ---------------------------------------------------------------------------------------

/**
 * One vertex of a plan ring, in **cabinet** plan coordinates: x across, z front-to-back.
 *
 * `bulge` describes the edge leaving this vertex, exactly as `Vertex2` does — same convention,
 * different plane, so the two never get confused with each other.
 */
export interface PlanVertex {
  readonly x: Mm;
  readonly z: Mm;
  readonly bulge?: number;
}

export type PlanRing = readonly PlanVertex[];

/**
 * Drop vertices that coincide with the next one.
 *
 * This is what lets one ring description cover every radius without a case for each. A corner
 * radius grown until it equals both the width and the depth leaves the flat front, the fixing
 * strip and the end panel all zero-length; the vertices bounding them collapse onto each
 * other, and what is left is the quarter disc — of its own accord, rather than by a branch
 * that says "if this is really a radiused end, build one of those instead".
 *
 * The *later* vertex is the one kept, because a bulge belongs to the edge **leaving** a
 * vertex: the dropped one's outgoing edge has no length, and the survivor's is the real edge.
 */
const dropRepeats = (ring: PlanRing): PlanVertex[] => {
  const n = ring.length;
  const kept: PlanVertex[] = [];
  for (let i = 0; i < n; i++) {
    const here = ring[i]!;
    const next = ring[(i + 1) % n]!;
    const same =
      Math.abs(here.x - next.x) <= SAME_POINT && Math.abs(here.z - next.z) <= SAME_POINT;
    if (!same) kept.push(here);
  }
  return kept;
};

const negated = (bulge: number | undefined): number | undefined =>
  bulge === undefined ? undefined : -bulge;

/**
 * The same ring traversed the other way round.
 *
 * Two things move, and both are easy to forget. Reversing flips every arc's sweep, so bulges
 * negate; and a bulge lives on the vertex an edge **leaves**, so the edge that used to arrive
 * at a vertex now leaves it — each bulge shifts back one place.
 */
export const reverseRing = (ring: PlanRing): PlanVertex[] => {
  const n = ring.length;
  const out: PlanVertex[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const here = ring[i]!;
    const incoming = ring[(i - 1 + n) % n]!;
    out.push({ x: here.x, z: here.z, bulge: negated(incoming.bulge) });
  }
  return out;
};

/** Mirror a ring about the middle of a `width`-wide cabinet. Flips the winding. */
const mirrorRingX = (ring: PlanRing, width: Mm): PlanVertex[] =>
  ring.map((p) => ({ x: mm(width - p.x), z: p.z, bulge: negated(p.bulge) }));

/**
 * A ring built for a front-right corner, handed over to the left.
 *
 * Mirroring alone reverses the winding, so it is paired with a reversal that puts it back —
 * and between them the two bulge flips cancel, leaving each arc bowing the way it did.
 */
export const handRing = (ring: PlanRing, corner: RadiusCorner, width: Mm): PlanVertex[] =>
  corner === 'front-right' ? [...ring] : reverseRing(mirrorRingX(ring, width));

/**
 * A horizontal plate — a bottom, a top, a former — from its plan ring.
 *
 * `facing` says which way the board's thickness runs, which is the same question as which face
 * is the A-face. A bottom and a former are read from above (`'up'`, thickness `+Y`, origin at
 * the underside); a top is read from below (`'down'`, thickness `−Y`, origin at the top).
 * Getting this wrong hangs every plate a board thickness out of the carcass — the error
 * `radiusEnd.ts` already carries a comment about.
 *
 * Part space starts at the corner of the part's bounding box, which is what `occupies` in the
 * tests assumes and what a nester assumes. For `'up'` the map from plan to part space is a
 * reflection, so bulges negate; for `'down'` it is not, so the ring is reversed first to keep
 * the outline counter-clockwise.
 */
export const planPlate = (
  ring: PlanRing,
  y: Mm,
  facing: 'up' | 'down',
): { profile: Profile2D; placement: PanelPlacement } => {
  const points = dropRepeats(facing === 'up' ? ring : reverseRing(ring));
  const x0 = mm(Math.min(...points.map((p) => p.x)));

  if (facing === 'up') {
    const zTop = mm(Math.max(...points.map((p) => p.z)));
    const outline: Vertex2[] = points.map((p) =>
      p.bulge === undefined
        ? v2(p.x - x0, zTop - p.z)
        : { x: p.x - x0, y: zTop - p.z, bulge: -p.bulge },
    );
    return {
      profile: { outline, holes: [] },
      placement: placement(v3(x0, y, zTop), '+X', '-Z'),
    };
  }

  const z0 = mm(Math.min(...points.map((p) => p.z)));
  const outline: Vertex2[] = points.map((p) =>
    p.bulge === undefined ? v2(p.x - x0, p.z - z0) : { x: p.x - x0, y: p.z - z0, bulge: p.bulge },
  );
  return {
    profile: { outline, holes: [] },
    placement: placement(v3(x0, y, z0), '+X', '+Z'),
  };
};

// ---------------------------------------------------------------------------------------
// The resolved corner
// ---------------------------------------------------------------------------------------

export interface CornerRadiusInput {
  readonly corner: RadiusCorner;
  /** Finished plan radius — the outside of the skin. */
  readonly radius: Mm;
  readonly layers: number;
  readonly W: Mm;
  readonly D: Mm;
  /** Carcass, back and skin board thicknesses, as the boards really measure. */
  readonly t: Mm;
  readonly tb: Mm;
  readonly ts: Mm;
  /**
   * The finish laminate over the wrap — the construction method's `finishLaminate`.
   *
   * Optional so the two specs that build a corner without a full construction method in hand keep
   * working; absent means zero, which is exactly what every job cut before this existed.
   */
  readonly finishLaminate?: Mm;
  /**
   * How this shop builds a radiused corner — see `ConstructionMethod.cornerMethod`.
   *
   * Optional for the same reason `finishLaminate` is: the two specs that resolve a corner
   * without a full construction method in hand keep working, and absent means `wrapped`, which
   * is what every job cut before §5.7 existed.
   */
  readonly cornerMethod?: CornerMethod;
  /** The door board's real thickness — what a **routed** curve is cut from. */
  readonly td?: Mm;
  /**
   * The plane the curve has to **finish** in — the front face of a door, not the carcass.
   *
   * A radiused corner is the finish at that corner: there is no door over it, so the ply and its
   * laminate *are* what somebody sees and touches, and they have to land where the fronts either
   * side of them land. `context.ts` resolves this once as `finishedFrontZ` so the curve, the
   * applied end panel and the kick face cannot end up on three different datums.
   *
   * Optional, and absent means the carcass front — which is what every job cut before this
   * existed, and what the two specs that build a corner without a construction method still get.
   */
  readonly finishedFrontZ?: Mm;
  /** The construction method's fixing strip — the flat front the wrap is fixed to. */
  readonly stripWidth: Mm;
}

/**
 * Everything a corner radius decides, worked out once so no builder re-derives it.
 *
 * Every `x` here is a real cabinet-space x, already handed. The ring builders below are the
 * only things that work in the un-mirrored frame.
 */
export interface CornerRadius {
  readonly corner: RadiusCorner;
  /** `+1` when the radiused end is at the high-x side of the cabinet, `−1` when it is at x = 0. */
  readonly sign: 1 | -1;

  /** Finished plan radius, to the outside of the wrap. */
  readonly r: Mm;
  readonly layers: number;
  /** Total thickness of the wrap — what the substrate is set back by. */
  readonly skin: Mm;
  /** Radius the substrate is cut to: the formers, and the arc on the top and the bottom. */
  readonly rSub: Mm;

  /** The finished end face. */
  readonly endX: Mm;
  /** The substrate face under the wrap. */
  readonly subEndX: Mm;
  /** Where the curve meets the front — and the arc centre's x. */
  readonly tangentX: Mm;
  /** Where the fixing strip meets the door zone. */
  readonly stripInnerX: Mm;
  /** Where the curve meets the end face — and the arc centre's z. */
  readonly tangentZ: Mm;
  /** The substrate front face, under the strip. */
  readonly subFrontZ: Mm;

  /** Flat run of front face the wrap is fixed to. Never longer than the flat front there is. */
  readonly strip: Mm;
  /** Straight run of wrap from the curve down the end to the back. */
  readonly tail: Mm;

  /*
   * What the radius has left room for. Each of these goes when the curve has eaten past it,
   * and none is a special case for the full-radius limit — they are the same rule three times.
   */

  /** The end panel on the radiused side. Its depth is the full depth less the radius. */
  readonly hasEndPanel: boolean;
  /** The side panel at the other end. Goes when the curve springs from inside its front edge. */
  readonly hasFarSide: boolean;
  /** The back. Goes when the curve has run past its inner face. */
  readonly hasBack: boolean;

  /** Inner face of the far side, or the cabinet's own face where there is no side left. */
  readonly farInnerX: Mm;
  /** Inner face of the end panel, or the substrate face where there is no end panel left. */
  readonly endInnerX: Mm;
  /** Front face of the back, or the back of the cabinet where there is no back left. */
  readonly backZ: Mm;

  /** Clear zone the doors are laid out in — `x0` is always the lower x. */
  readonly doorZoneX0: Mm;
  readonly doorZoneX1: Mm;
  readonly doorZoneWidth: Mm;
}

/** Layers of wrap, as a whole number of at least one. */
export const wrapLayerCount = (layers: number): number => Math.max(1, Math.round(layers));

/**
 * The radius the substrate is cut to — the finished radius less every layer of wrap.
 *
 * **Zero or negative means there is no radius to build**, because the ply has nothing left to
 * bend round. A 5mm radius under two layers of 3mm ply is not a tight curve, it is an
 * impossible one, and it has to be reported rather than attempted: `cylindricalForming`
 * rightly refuses a radius that isn't positive, and a throw out of the rule engine takes the
 * whole app down and leaves a saved job that takes it down again on every reload.
 *
 * Exported so the check and the arithmetic are the same function. Two places computing this
 * and disagreeing about the boundary is how you get a warning that says it's fine and a
 * builder that throws anyway.
 */
/**
 * Radius the formers are cut to — the finished radius less everything that goes on outside them.
 *
 * That is the bendy-ply layers **and** the finish laminate over them. The laminate counts once,
 * not once per layer: it is a single sheet applied to the outside of the finished wrap, not
 * something between the plies.
 *
 * Leaving it out puts the formers over size and the finished curve proud of the radius that was
 * asked for — by the thickness of the laminate, on a face that has to line up with the doors.
 */
export const substrateRadius = (
  radius: Mm,
  layers: number,
  ts: Mm,
  finishLaminate: Mm = mm(0),
): Mm => mm(radius - (wrapLayerCount(layers) * ts + finishLaminate));

/**
 * Everything outboard of the formers — the one number both methods have to agree on.
 *
 * The formers are cut to the finished radius **less this**, the curved piece lands on the
 * finished radius, and the 3D view draws it there. Three readings of one fact is exactly what
 * §5.14 found when the former radius, the drawn decor and the charged sheet each decided for
 * themselves whether a curve was laminated, so there is one function and everything asks it.
 *
 * - **wrapped** — the ply stack plus the laminate over it, which is what it has always been.
 * - **routed** — one board of the *door* thickness, and nothing over it. The decor face **is**
 *   the finish, so there is no laminate to allow for; allowing for one would put the formers a
 *   millimetre small and the finished curve a millimetre shy of the doors beside it.
 */
export const outboardOfFormers = (input: {
  readonly cornerMethod?: CornerMethod;
  readonly layers: number;
  readonly ts: Mm;
  readonly td: Mm;
  readonly finishLaminate?: Mm;
}): Mm =>
  input.cornerMethod === 'routed'
    ? input.td
    : mm(wrapLayerCount(input.layers) * input.ts + (input.finishLaminate ?? mm(0)));

export const resolveCornerRadius = (input: CornerRadiusInput): CornerRadius => {
  const { corner, radius: r, W, D, t, tb, ts } = input;
  const finishLaminate = input.finishLaminate ?? mm(0);
  const layers = wrapLayerCount(input.layers);
  // Everything outboard of the formers — the ply stack and its laminate, or the one routed
  // board. One function, so the formers and the finished face cannot disagree.
  const skin = outboardOfFormers({
    cornerMethod: input.cornerMethod,
    layers,
    ts,
    td: input.td ?? ts,
    finishLaminate,
  });
  const rSub = mm(r - skin);

  const sign: 1 | -1 = corner === 'front-right' ? 1 : -1;
  /** Un-mirrored → real. Front-right is the frame everything is written in, so it is identity. */
  const hand = (x: number): Mm => mm(corner === 'front-right' ? x : W - x);

  // The strip cannot be longer than the flat front there is to put it on. A radius that leaves
  // less than the method asks for is reported by `cornerRadiusProblems` rather than drawn with
  // a strip too small to fix to.
  const flatFront = Math.max(0, W - r);
  const strip = mm(Math.min(input.stripWidth, flatFront));
  /*
   * **The curve finishes in the door plane, not on the carcass.**
   *
   * Reported from the bench as "why has the radius applied to cabinets not updated to meet the
   * finished door depth yet?", and the answer was that it never had: every figure here was
   * measured off `D`, so a curve finished 20mm — a 2mm standoff plus an 18mm door — behind the
   * fronts beside it. On the one corner of the kitchen where the board *is* the finish, it sat
   * proud of nothing and shy of everything.
   *
   * Two things follow, and the second is the one that looks odd until you build it. The arc's
   * centre moves forward with the plane, so the tangent on the end face moves forward too. And
   * the substrate now sits **forward of the carcass front** rather than behind it: at a 200
   * radius on a 560 carcass the plate reaches z = 563, and the wrap over it lands on 580 with
   * the doors. A bottom on a radiused cabinet was always doing a former's job as well as its
   * own — this is that job stated properly.
   */
  const front = input.finishedFrontZ ?? D;
  const tangentZ = mm(Math.max(0, front - r));
  const subFrontZ = mm(front - skin);

  // A back panel whose front face is already inside the curve would stand outside the finished
  // face at the corner, and there is no flat end left to fix it to.
  const hasBack = tangentZ > tb;
  const backZ = hasBack ? tb : mm(0);

  // The far side's front edge finishes on the front face. Once the curve springs from inside
  // that panel there is no front face there for it to finish at.
  const hasFarSide = W - r > t;
  const farInnerX = hand(hasFarSide ? t : 0);

  // The end panel keeps the full depth less the radius, so it disappears of its own accord at
  // radius = depth. Nothing here says "and at the limit, delete it".
  const hasEndPanel = tangentZ - backZ > 0;
  const subEndX = hand(W - skin);
  const endInnerX = hand(W - skin - (hasEndPanel ? t : 0));

  const tangentX = hand(W - r);
  const stripInnerX = hand(W - r - strip);

  // The doors run from the far end of the cabinet to where the fixing strip starts. They are
  // laid out in that zone with the same reveals a full-width bank has, so a radiused cabinet's
  // fronts read the same as its neighbours'. `hand(0)` is the **far** end: the un-mirrored
  // frame puts the radiused end at x = W, so the doors start from the other one.
  const zoneOuter = hand(0);
  const doorZoneX0 = mm(Math.min(zoneOuter, stripInnerX));
  const doorZoneX1 = mm(Math.max(zoneOuter, stripInnerX));

  return {
    corner,
    sign,
    r,
    layers,
    skin,
    rSub,
    endX: hand(W),
    subEndX,
    tangentX,
    stripInnerX,
    tangentZ,
    subFrontZ,
    strip,
    tail: tangentZ,
    hasEndPanel,
    hasFarSide,
    hasBack,
    farInnerX,
    endInnerX,
    backZ,
    doorZoneX0,
    doorZoneX1,
    doorZoneWidth: mm(doorZoneX1 - doorZoneX0),
  };
};

/**
 * The furthest a part may reach toward the radiused end at depth `z`, in cabinet x.
 *
 * Behind the curve that is the substrate face; through the curve it is the arc itself. A rail
 * or a back that ignored this would poke out through the finished face on a large radius,
 * which is the failure that is invisible in a cutlist and obvious on the bench.
 */
export const substrateBoundX = (rad: CornerRadius, z: Mm): Mm => {
  if (z <= rad.tangentZ) return rad.subEndX;
  const rise = z - rad.tangentZ;
  if (rise >= rad.rSub) return rad.tangentX;
  return mm(rad.tangentX + rad.sign * Math.sqrt(rad.rSub * rad.rSub - rise * rise));
};

/** `x`, pulled back to the substrate boundary at depth `z` if it reached past it. */
export const clampToSubstrate = (rad: CornerRadius, x: Mm, z: Mm): Mm => {
  const bound = substrateBoundX(rad, z);
  return rad.sign > 0 ? mm(Math.min(x, bound)) : mm(Math.max(x, bound));
};

// ---------------------------------------------------------------------------------------
// The two rings
// ---------------------------------------------------------------------------------------

/**
 * Where a horizontal plate reaches, in the un-mirrored frame — everything a bottom and a top
 * have in common, which is everything except the height they sit at.
 */
const plateRingRight = (rad: CornerRadius, W: Mm, frontZ: Mm): PlanVertex[] => {
  const unhand = (x: Mm): Mm => (rad.corner === 'front-right' ? x : mm(W - x));
  const far = unhand(rad.farInnerX);
  const end = unhand(rad.endInnerX);
  const tangentX = mm(W - rad.r);
  const stripInnerX = mm(Math.max(far, W - rad.r - rad.strip));
  const subEndX = mm(W - rad.skin);

  const ring: PlanVertex[] = [{ x: far, z: rad.backZ }];

  // The flat front, and the step back under the wrap. At full radius there is no flat front
  // left, so neither of these exists and the ring runs straight up the far face to the arc.
  if (stripInnerX > far + SAME_POINT) {
    ring.push({ x: far, z: frontZ });
    ring.push({ x: stripInnerX, z: frontZ });
  }
  ring.push({ x: stripInnerX, z: rad.subFrontZ });
  ring.push({ x: tangentX, z: rad.subFrontZ, bulge: PLAN_ARC_BULGE });
  // Out to the substrate face: forward of the end panel the plate has to carry the wrap on
  // its own, which is the whole reason a bottom on a radiused cabinet is also a former.
  ring.push({ x: subEndX, z: rad.tangentZ });
  ring.push({ x: end, z: rad.tangentZ });
  ring.push({ x: end, z: rad.backZ });
  return ring;
};

/**
 * The plan ring of a bottom or a top on a radiused cabinet: the housed rectangle, reaching out
 * to the substrate boundary wherever the wrap needs something to land on, with the corner cut
 * to the substrate arc.
 */
export const cornerPlateRing = (rad: CornerRadius, W: Mm, frontZ: Mm): PlanRing =>
  handRing(plateRingRight(rad, W, frontZ), rad.corner, W);

/**
 * The plan ring of a corner former: the fixing strip, the arc, and enough behind it to screw
 * to the end panel.
 *
 * At radius = width = depth this is the whole quarter and the ring collapses to exactly
 * `quarterDiscProfile`'s three vertices — which is the point, because that is the part the
 * enclosed radiused end already cuts.
 */
export const cornerFormerRing = (rad: CornerRadius, W: Mm): PlanRing => {
  const tangentX = mm(W - rad.r);
  const stripInnerX = mm(W - rad.r - rad.strip);
  const subEndX = mm(W - rad.skin);
  const right: PlanVertex[] = [
    { x: stripInnerX, z: rad.subFrontZ },
    { x: tangentX, z: rad.subFrontZ, bulge: PLAN_ARC_BULGE },
    { x: subEndX, z: rad.tangentZ },
    { x: stripInnerX, z: rad.tangentZ },
  ];
  return handRing(right, rad.corner, W);
};
