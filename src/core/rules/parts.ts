/**
 * Shared part builders.
 *
 * Base, wall and drawer-bank cabinets share most of their carcass, so the construction
 * arithmetic lives here once and the specs compose it. Each builder documents the cabinet-space
 * volume its part occupies, because that — not the part's size — is what is actually easy to
 * get wrong, and it is what the placement tests assert against.
 *
 * Cabinet space: origin bottom-back-left of the carcass, +X right, +Y up, +Z toward the front.
 */

import { type Mm, mm } from '../units.ts';
import { rectProfile } from '../geom/profile.ts';
import { placement } from '../geom/placement.ts';
import { v3 } from '../geom/vec.ts';
import type { RuleContext } from './context.ts';
import { BAND_ALL, BAND_FRONT, BAND_NONE, type PartInstance } from './spec.ts';

/**
 * Left side. Occupies x ∈ [0, t], y ∈ [0, H], z ∈ [interiorBackZ, D].
 * A-face is the inside face (x = t) — the face that gets shelf pins and hinge plates.
 */
export const leftSide = (ctx: RuleContext, name = 'Side L'): PartInstance => ({
  name,
  role: 'side',
  profile: rectProfile(ctx.H, ctx.sideDepth),
  placement: placement(v3(0, 0, ctx.D - ctx.sideDepth), '+Y', '+Z'),
  material: 'carcass',
  bandedDirections: BAND_FRONT,
  grain: 'length-along-grain',
  note: 'Grain vertical',
});

/**
 * Right side. Occupies x ∈ [W − t, W], y ∈ [0, H], z ∈ [interiorBackZ, D].
 * Same part size as the left side, mirrored — A-face is again the inside face (x = W − t).
 */
export const rightSide = (ctx: RuleContext, name = 'Side R'): PartInstance => ({
  name,
  role: 'side',
  profile: rectProfile(ctx.H, ctx.sideDepth),
  placement: placement(v3(ctx.W, 0, ctx.D), '+Y', '-Z'),
  material: 'carcass',
  bandedDirections: BAND_FRONT,
  grain: 'length-along-grain',
  note: 'Grain vertical',
});

/**
 * Bottom, housed between the sides. Occupies x ∈ [t, W − t], y ∈ [0, t], z ∈ [interiorBackZ, D].
 * A-face is the top face — the one visible inside the cabinet.
 */
export const bottomPanel = (ctx: RuleContext, name = 'Bottom'): PartInstance => ({
  name,
  role: 'bottom',
  profile: rectProfile(ctx.interiorWidth, ctx.horizontalDepth),
  placement: placement(v3(ctx.t, 0, ctx.D), '+X', '-Z'),
  material: 'carcass',
  bandedDirections: BAND_FRONT,
  grain: 'any',
});

/**
 * Full top, housed between the sides. Occupies x ∈ [t, W − t], y ∈ [H − t, H], z ∈ [interiorBackZ, D].
 * A-face is the underside — the face seen from inside.
 */
export const topPanel = (ctx: RuleContext, name = 'Top'): PartInstance => ({
  name,
  role: 'top',
  profile: rectProfile(ctx.interiorWidth, ctx.horizontalDepth),
  placement: placement(v3(ctx.t, ctx.H, ctx.interiorBackZ), '+X', '+Z'),
  material: 'carcass',
  bandedDirections: BAND_FRONT,
  grain: 'any',
});

/**
 * A top rail. Base cabinets take a pair of these instead of a full top, so a benchtop can be
 * fixed down through them and a sink or hob can drop in.
 *
 * Occupies y ∈ [H − t, H], with z depending on which end it sits at.
 */
export const stretcher = (
  ctx: RuleContext,
  position: 'front' | 'back',
  name: string,
): PartInstance => {
  const sw = ctx.construction.stretcherWidth;
  const z = position === 'front' ? mm(ctx.D - sw) : ctx.interiorBackZ;
  return {
    name,
    role: 'stretcher',
    profile: rectProfile(ctx.interiorWidth, sw),
    placement: placement(v3(ctx.t, ctx.H, z), '+X', '+Z'),
    material: 'carcass',
    bandedDirections: position === 'front' ? BAND_FRONT : BAND_NONE,
    grain: 'any',
  };
};

/**
 * Back panel. Occupies z ∈ [0, tb] under both back styles; what changes between them is the
 * back's own size and how deep the sides run.
 *
 * A-face is the face seen from inside the cabinet (z = tb).
 */
export const backPanel = (ctx: RuleContext, name = 'Back'): PartInstance => {
  const applied = ctx.construction.backStyle === 'applied';
  // Applied: covers the whole rear face. Inset: fits between the sides and the horizontals.
  const length = applied ? ctx.W : ctx.interiorWidth;
  const width = applied ? ctx.H : ctx.interiorHeight;
  const origin = applied ? v3(0, 0, 0) : v3(ctx.t, ctx.t, 0);
  return {
    name,
    role: 'back',
    profile: rectProfile(length, width),
    placement: placement(origin, '+X', '+Y'),
    material: 'back',
    bandedDirections: BAND_NONE,
    grain: 'any',
  };
};

/**
 * Adjustable shelves, spread evenly through the interior opening.
 *
 * Each shelf is narrower than the opening by the construction's side clearance (so it can be
 * lifted in and out) and shallower by its setback (so it clears the doors).
 */
export const adjustableShelves = (ctx: RuleContext, count: number): PartInstance[] => {
  if (count <= 0) return [];
  const c = ctx.construction;
  const length = mm(ctx.interiorWidth - c.shelfSideClearance);
  const width = mm(ctx.horizontalDepth - c.shelfSetback);
  const openingBottom = ctx.t;
  const openingHeight = ctx.interiorHeight;

  return Array.from({ length: count }, (_, i) => {
    // Evenly divide the opening; a shelf is centred on each division line.
    const centreY = openingBottom + (openingHeight * (i + 1)) / (count + 1);
    return {
      name: count === 1 ? 'Shelf' : `Shelf ${i + 1}`,
      role: 'shelf-adjustable' as const,
      profile: rectProfile(length, width),
      placement: placement(
        v3(mm(ctx.t + c.shelfSideClearance / 2), mm(centreY - ctx.t / 2), mm(ctx.D - c.shelfSetback)),
        '+X',
        '-Z',
      ),
      material: 'carcass' as const,
      bandedDirections: BAND_FRONT,
      grain: 'any' as const,
    };
  });
};

/**
 * Doors. Full-overlay frameless: the fronts cover the carcass apart from a reveal at the
 * outer edges and a gap between the pair.
 *
 * A single door is `W − 2·reveal` wide; a pair splits `W − 2·reveal − gap` between them.
 * Both run `H − 2·reveal` tall and sit at z ∈ [D, D + doorThickness].
 *
 * Part length is the door's *height*, so the cutlist reads the way a joiner writes it and
 * grained material runs the right way without a second rule.
 */
export const doors = (ctx: RuleContext, count: 0 | 1 | 2): PartInstance[] => {
  if (count === 0) return [];
  const r = ctx.construction.frontReveal;
  const gap = ctx.construction.frontGap;
  const height = mm(ctx.H - 2 * r);
  const width = count === 1 ? mm(ctx.W - 2 * r) : mm((ctx.W - 2 * r - gap) / 2);

  // u = +Y (length runs up the door), v = −X → thickness direction +Z, facing out of the
  // cabinet. The A-face is therefore the show face.
  const make = (name: string, rightEdgeX: Mm): PartInstance => ({
    name,
    role: 'door',
    profile: rectProfile(height, width),
    placement: placement(v3(rightEdgeX, r, ctx.D), '+Y', '-X'),
    material: 'door',
    bandedDirections: BAND_ALL,
    grain: 'length-along-grain',
    note: 'Grain vertical',
  });

  if (count === 1) return [make('Door', mm(r + width))];
  return [make('Door L', mm(r + width)), make('Door R', mm(ctx.W - r))];
};

/**
 * Drawer fronts, stacked bottom to top with a gap between each.
 *
 * `heights` is ordered bottom-first. Part length is the front's width, so grain runs
 * horizontally across a bank — which is how a drawer bank is normally matched.
 *
 * Phase 1 produces the *fronts*. Drawer boxes and runners are hardware, and arrive with the
 * Phase 2 hardware rule sets.
 */
export const drawerFronts = (ctx: RuleContext, heights: readonly Mm[]): PartInstance[] => {
  const r = ctx.construction.frontReveal;
  const gap = ctx.construction.frontGap;
  const width = mm(ctx.W - 2 * r);

  let y = r;
  return heights.map((h, i) => {
    const instance: PartInstance = {
      name: `Drawer front ${i + 1}`,
      role: 'drawer-front',
      profile: rectProfile(width, h),
      placement: placement(v3(r, mm(y), ctx.D), '+X', '+Y'),
      material: 'door',
      bandedDirections: BAND_ALL,
      grain: 'length-along-grain',
      note: i === 0 ? 'Numbered from the bottom' : undefined,
    };
    y = mm(y + h + gap);
    return instance;
  });
};

/**
 * Toe kick. Sits below the carcass, recessed behind the door face by the construction's
 * setback. Occupies y ∈ [−kickHeight, 0].
 */
export const kickPanel = (ctx: RuleContext): PartInstance => {
  const c = ctx.construction;
  // The kick face sits `kickSetback` behind the door front, and the panel is `t` thick.
  const faceZ = mm(ctx.D + ctx.td - c.kickSetback);
  return {
    name: 'Kick',
    role: 'kick',
    profile: rectProfile(ctx.W, c.kickHeight),
    placement: placement(v3(0, mm(-c.kickHeight), mm(faceZ - ctx.t)), '+X', '+Y'),
    material: 'carcass',
    bandedDirections: ['+Y'],
    grain: 'any',
    note: 'Band top edge only',
  };
};
