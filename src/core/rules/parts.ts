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
import {
  type Profile2D,
  bowedFrontProfile,
  notchedRectProfile,
  rectProfile,
} from '../geom/profile.ts';
import { placement } from '../geom/placement.ts';
import { type SignedAxis, v2, v3 } from '../geom/vec.ts';
import { cylindricalForming, developedLength } from '../model/forming.ts';
import { type DrawerFrontFit, resolveDrawerFrontHeights } from '../model/cabinet.ts';
import type { GrainConstraint, PanelRole } from '../model/panel.ts';
import {
  TESTED_WEB,
  TESTED_WEB_RADIUS,
  type ConstructionMethod,
} from '../model/construction.ts';
import type { PanelFeature } from '../model/feature.ts';
import type { RuleContext } from './context.ts';
import {
  type CornerRadius,
  QUARTER_TURN,
  clampToSubstrate,
  cornerFormerRing,
  cornerPlateRing,
  planPlate,
  outboardOfFormers,
  wrapLayerCount,
} from './radius.ts';
import {
  BAND_ALL,
  BAND_FRONT,
  BAND_NONE,
  type BandingRule,
  type CabinetSpec,
  type MaterialSlot,
  type PartInstance,
  refusalOf,
} from './spec.ts';

/** The lower and upper of two x positions, whichever hand the cabinet is. */
const span = (a: Mm, b: Mm): { lo: Mm; hi: Mm; length: Mm } => {
  const lo = mm(Math.min(a, b));
  const hi = mm(Math.max(a, b));
  return { lo, hi, length: mm(hi - lo) };
};

/**
 * A side panel, either end.
 *
 * On a cabinet with a rounded corner one of these two is the **end panel** — the one the curve
 * runs into. It stays in, which is a settled decision rather than a simplification: it goes on
 * carrying the shelves, the top and the benchtop load, and deleting it in favour of formers at
 * every radius would throw away a good 460mm side panel to get a 100mm curve.
 *
 * Two things happen to it, and both fall out of the geometry rather than being special-cased:
 *
 * - it **sets back** by the thickness of the wrap, so the ply finishes flush with the rest of
 *   the cabinet rather than standing proud of it;
 * - it **loses the radius off its depth** — full depth at radius 0, and gone entirely by the
 *   time the radius reaches the depth, because there is no end face left for it to be.
 *
 * The panel at the other end is untouched until the curve springs from inside its front edge,
 * at which point there is no front face there for it to finish at and it goes too.
 */
const sidePanel = (ctx: RuleContext, side: 'left' | 'right', name: string): PartInstance[] => {
  const rad = ctx.radius;

  if (rad === null) {
    const placed =
      side === 'left'
        ? placement(v3(0, 0, ctx.D - ctx.sideDepth), '+Y', '+Z')
        : placement(v3(ctx.W, 0, ctx.D), '+Y', '-Z');
    return [
      {
        name,
        role: 'side',
        profile: rectProfile(ctx.H, ctx.sideDepth),
        placement: placed,
        material: 'carcass',
        bandedDirections: BAND_FRONT,
        grain: 'length-along-grain',
        note: 'Grain vertical',
      },
    ];
  }

  const isEndPanel = (rad.corner === 'front-right') === (side === 'right');

  if (isEndPanel) {
    if (!rad.hasEndPanel) return [];
    const depth = mm(rad.tangentZ - rad.backZ);
    // The A-face is the inside face either way: `u × v` crosses toward the interior, which is
    // why the two hands take different axes rather than the same ones and a different origin.
    const placed =
      side === 'left'
        ? placement(v3(rad.subEndX, 0, rad.backZ), '+Y', '+Z')
        : placement(v3(rad.subEndX, 0, rad.tangentZ), '+Y', '-Z');
    return [
      {
        name,
        role: 'side',
        profile: rectProfile(ctx.H, depth),
        placement: placed,
        material: 'carcass',
        bandedDirections: BAND_FRONT,
        grain: 'length-along-grain',
        note: `Grain vertical — set back ${Math.round(rad.skin)}mm behind the ply`,
      },
    ];
  }

  if (!rad.hasFarSide) return [];
  // With the back gone the side runs the whole depth, because there is nothing at the back for
  // it to stop short of.
  const applied = ctx.construction.backStyle === 'applied';
  const depth = mm(ctx.D - (applied ? rad.backZ : 0));
  const placed =
    side === 'left'
      ? placement(v3(0, 0, ctx.D - depth), '+Y', '+Z')
      : placement(v3(ctx.W, 0, ctx.D), '+Y', '-Z');
  return [
    {
      name,
      role: 'side',
      profile: rectProfile(ctx.H, depth),
      placement: placed,
      material: 'carcass',
      bandedDirections: BAND_FRONT,
      grain: 'length-along-grain',
      note: 'Grain vertical',
    },
  ];
};

/**
 * Left side. Occupies x ∈ [0, t], y ∈ [0, H], z ∈ [interiorBackZ, D].
 * A-face is the inside face (x = t) — the face that gets shelf pins and hinge plates.
 *
 * Returns a list because a corner radius can consume a side entirely — see `sidePanel`.
 */
export const leftSide = (ctx: RuleContext, name = 'Side L'): PartInstance[] =>
  sidePanel(ctx, 'left', name);

/**
 * Right side. Occupies x ∈ [W − t, W], y ∈ [0, H], z ∈ [interiorBackZ, D].
 * Same part size as the left side, mirrored — A-face is again the inside face (x = W − t).
 */
export const rightSide = (ctx: RuleContext, name = 'Side R'): PartInstance[] =>
  sidePanel(ctx, 'right', name);

/**
 * A bottom or a top on a cabinet with a rounded corner.
 *
 * The plate keeps the rectangle it always had and loses **the corner offcut only** — that is
 * the whole point, and it is the reported bug written as geometry: setting a radius must not
 * shrink the box. Where the wrap needs something to land on the plate reaches out to the
 * substrate face, because forward of the end panel there is nothing else holding the curve.
 * A bottom on a radiused cabinet is doing a former's job as well as a bottom's.
 *
 * At radius = width = depth every straight run in the ring collapses and what is left is the
 * quarter disc the enclosed radiused end already cuts — of its own accord, not by a branch.
 */
const cornerPlate = (
  ctx: RuleContext,
  rad: CornerRadius,
  name: string,
  role: 'bottom' | 'top',
): PartInstance => {
  const y = role === 'bottom' ? mm(0) : ctx.H;
  const { profile, placement: placed } = planPlate(
    cornerPlateRing(rad, ctx.W, ctx.D),
    y,
    role === 'bottom' ? 'up' : 'down',
  );
  return {
    name,
    role,
    profile,
    placement: placed,
    material: 'carcass',
    bandedDirections: BAND_FRONT,
    grain: 'any',
    note:
      `Corner cut to a ${Math.round(rad.rSub)}mm radius — under the skin, not to the ` +
      `finished ${Math.round(rad.r)}mm.`,
  };
};

/**
 * Bottom, housed between the sides. Occupies x ∈ [t, W − t], y ∈ [0, t], z ∈ [interiorBackZ, D].
 * A-face is the top face — the one visible inside the cabinet.
 */
export const bottomPanel = (ctx: RuleContext, name = 'Bottom'): PartInstance =>
  ctx.radius
    ? cornerPlate(ctx, ctx.radius, name, 'bottom')
    : {
        name,
        role: 'bottom',
        profile: rectProfile(ctx.interiorWidth, ctx.horizontalDepth),
        placement: placement(v3(ctx.interiorX0, 0, ctx.D), '+X', '-Z'),
        material: 'carcass',
        bandedDirections: BAND_FRONT,
        grain: 'any',
      };

/**
 * Full top, housed between the sides. Occupies x ∈ [t, W − t], y ∈ [H − t, H], z ∈ [interiorBackZ, D].
 * A-face is the underside — the face seen from inside.
 */
export const topPanel = (ctx: RuleContext, name = 'Top'): PartInstance =>
  ctx.radius
    ? cornerPlate(ctx, ctx.radius, name, 'top')
    : {
        name,
        role: 'top',
        profile: rectProfile(ctx.interiorWidth, ctx.horizontalDepth),
        placement: placement(v3(ctx.interiorX0, ctx.H, ctx.interiorBackZ), '+X', '+Z'),
        material: 'carcass',
        bandedDirections: BAND_FRONT,
        grain: 'any',
      };

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
): PartInstance[] => {
  const sw = ctx.construction.stretcherWidth;
  const rad = ctx.radius;
  const banding = position === 'front' ? BAND_FRONT : BAND_NONE;

  if (rad === null) {
    return [
      {
        name,
        role: 'stretcher',
        profile: rectProfile(ctx.interiorWidth, sw),
        placement: placement(v3(ctx.interiorX0, ctx.H, position === 'front' ? mm(ctx.D - sw) : ctx.interiorBackZ), '+X', '+Z'),
        material: 'carcass',
        bandedDirections: banding,
        grain: 'any',
      },
    ];
  }

  const z = position === 'front' ? mm(ctx.D - sw) : rad.backZ;
  /*
   * The front rail stops where the fixing strip starts — the strip and the curve above it are
   * the corner former's job, and a rail carried on past would sit proud of the substrate face
   * the ply lands on. The back rail is pulled in to wherever the curve has reached at its own
   * front edge, which on an ordinary radius is nowhere near it and on a large one is what
   * stops it poking out through the finished face.
   */
  const near =
    position === 'front' ? rad.stripInnerX : clampToSubstrate(rad, rad.endInnerX, mm(z + sw));
  const { lo, length } = span(rad.farInnerX, near);
  if (length <= 0) return [];

  return [
    {
      name,
      role: 'stretcher',
      profile: rectProfile(length, sw),
      placement: placement(v3(lo, ctx.H, z), '+X', '+Z'),
      material: 'carcass',
      bandedDirections: banding,
      grain: 'any',
    },
  ];
};

/**
 * Back panel. Occupies z ∈ [0, tb] under both back styles; what changes between them is the
 * back's own size and how deep the sides run.
 *
 * A-face is the face seen from inside the cabinet (z = tb).
 */
export const backPanel = (ctx: RuleContext, name = 'Back'): PartInstance[] => {
  const applied = ctx.construction.backStyle === 'applied';
  const rad = ctx.radius;

  if (rad === null) {
    // Applied: covers the whole rear face. Inset: fits between the sides and the horizontals.
    const length = applied ? ctx.W : ctx.interiorWidth;
    const width = applied ? ctx.H : ctx.interiorHeight;
    const origin = applied ? v3(0, 0, 0) : v3(ctx.interiorX0, ctx.interiorY0, 0);
    return [
      {
        name,
        role: 'back',
        profile: rectProfile(length, width),
        placement: placement(origin, '+X', '+Y'),
        material: 'back',
        bandedDirections: BAND_NONE,
        grain: 'any',
      },
    ];
  }

  // Once the curve has run past the back's own front face there is no flat end left to fix a
  // back to, and one carried on anyway would stand outside the finished face at the corner.
  if (!rad.hasBack) return [];

  const far = applied ? mm(rad.corner === 'front-right' ? 0 : ctx.W) : rad.farInnerX;
  const near = clampToSubstrate(rad, applied ? rad.endX : rad.endInnerX, ctx.tb);
  const { lo, length } = span(far, near);
  if (length <= 0) return [];

  return [
    {
      name,
      role: 'back',
      profile: rectProfile(length, applied ? ctx.H : ctx.interiorHeight),
      placement: placement(v3(lo, applied ? mm(0) : ctx.interiorY0, 0), '+X', '+Y'),
      material: 'back',
      bandedDirections: BAND_NONE,
      grain: 'any',
    },
  ];
};

/**
 * The plan shape of a shelf, bowed at the front if this cabinet asks for it.
 *
 * A shelf is laid in with `v = −Z`, so part +Y runs toward the *back* of the cabinet and the
 * front edge of the shelf is **L1** — which is also why `BAND_FRONT` resolves to L1 on a
 * shelf and to L2 on an upright. The bow has to go on the same edge the banding does, or the
 * curve ends up against the wall.
 */
const shelfProfile = (ctx: RuleContext, length: Mm, depth: Mm): Profile2D => {
  const bow = ctx.options.shelfBow ?? 0;
  if (bow <= 0) return rectProfile(length, depth);
  return bowedFrontProfile(length, depth, mm(bow), 'L1');
};

/**
 * Adjustable shelves, spread evenly through the interior opening.
 *
 * Each shelf is narrower than the opening by the construction's side clearance (so it can be
 * lifted in and out) and shallower by its setback (so it clears the doors).
 *
 * With `shelfBow` set they come out radiused at the front — open radius shelving. The part
 * grows *forward* of the carcass by the bow, which is the point of it, and the banding
 * follows the arc rather than the chord because `panelEdgeLengths` measures the real edge.
 */
export const adjustableShelves = (ctx: RuleContext, count: number): PartInstance[] => {
  if (count <= 0) return [];
  const c = ctx.construction;
  const rad = ctx.radius;
  const openingBottom = ctx.interiorY0;
  const openingHeight = ctx.interiorHeight;
  const bow = Math.max(0, ctx.options.shelfBow ?? 0);

  const frontZ = mm(ctx.D - c.shelfSetback);
  const shelf = rad === null ? null : radiusedShelf(ctx, rad, frontZ);
  // A notch that has eaten the whole shelf comes back as nothing at all, rather than as a
  // part nobody could lift in.
  if (rad !== null && shelf === null) return [];

  const length = shelf ? shelf.length : mm(ctx.interiorWidth - c.shelfSideClearance);
  const width = shelf ? shelf.width : mm(ctx.horizontalDepth - c.shelfSetback);
  const leftX = shelf ? shelf.lo : mm(ctx.interiorX0 + c.shelfSideClearance / 2);

  return Array.from({ length: count }, (_, i) => {
    // Evenly divide the opening; a shelf is centred on each division line.
    const centreY = openingBottom + (openingHeight * (i + 1)) / (count + 1);
    return {
      name: count === 1 ? 'Shelf' : `Shelf ${i + 1}`,
      role: 'shelf-adjustable' as const,
      profile: shelf ? shelf.profile : shelfProfile(ctx, length, width),
      // A bowed shelf keeps its back where a straight one had it and reaches *forward*, so
      // the origin — the front-most plane of the part — moves out by the bow.
      placement: placement(
        v3(leftX, mm(centreY - ctx.thicknessOf(i) / 2), mm(frontZ + (shelf ? 0 : bow))),
        '+X',
        '-Z',
      ),
      material: 'carcass' as const,
      bandedDirections: BAND_FRONT,
      grain: 'any' as const,
      note: shelf ? shelf.note : bow > 0 ? `Radiused front, ${bow}mm bow` : undefined,
    };
  });
};

/**
 * The plan shape of a shelf in a cabinet with a rounded corner: a rectangle with a **square
 * notch** at that corner, not an arc.
 *
 * The reason is the **edgebander, not the saw** — a curved edge cannot go through it, and a
 * shelf's front edge is banded. The top and the bottom can and do take the arc, because that
 * edge disappears under the ply and never needs banding. This will look like a shape that
 * wants improving to anyone who does not know why it is square, so the reason travels with it.
 *
 * The notch is the whole bounding square of the curve rather than a tight fit, which loses a
 * little more board and is what somebody at a saw would actually cut.
 */
interface ShelfShape {
  readonly profile: Profile2D;
  readonly length: Mm;
  readonly width: Mm;
  readonly lo: Mm;
  readonly note: string;
}

const radiusedShelf = (ctx: RuleContext, rad: CornerRadius, frontZ: Mm): ShelfShape | null => {
  const c = ctx.construction;
  const half = c.shelfSideClearance / 2;
  const inner = span(rad.farInnerX, rad.endInnerX);
  const lo = mm(inner.lo + half);
  const hi = mm(inner.hi - half);
  const length = mm(hi - lo);
  const width = mm(frontZ - rad.backZ);
  if (length <= 0 || width <= 0) return null;

  // Everything past the tangent points is inside the curve's bounding square, so that square
  // is what comes out. Both are clamped at zero: a radius smaller than the shelf's setback
  // leaves the shelf square, which is correct.
  const notchLength = mm(Math.max(0, rad.sign > 0 ? hi - rad.tangentX : rad.tangentX - lo));
  const notchWidth = mm(Math.max(0, frontZ - rad.tangentZ));

  if (notchLength <= 0 || notchWidth <= 0) {
    return { profile: rectProfile(length, width), length, width, lo, note: 'Square shelf' };
  }
  // A notch that reaches the far side or the back has eaten the shelf: report it by dropping
  // the part rather than by cutting something that cannot be lifted in.
  if (notchLength >= length || notchWidth >= width) return null;

  // The shelf lies in with `v = −Z`, so part +Y runs toward the back and the front of the
  // shelf is at y = 0. The rounded corner is therefore at the front, on whichever end the
  // radius is.
  const corner = rad.sign > 0 ? 'x1y0' : 'x0y0';
  return {
    profile: notchedRectProfile(length, width, corner, notchLength, notchWidth),
    length,
    width,
    lo,
    note:
      `Square notch ${Math.round(notchLength)} × ${Math.round(notchWidth)} at the radiused ` +
      'corner — square, not curved, because a curved edge will not go through the edgebander.',
  };
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
  const rTop = ctx.construction.revealTop;
  const rBot = ctx.construction.revealBottom;
  const rS = ctx.construction.revealSides;
  const gap = ctx.construction.gapBetweenDoors;
  const height = mm(ctx.H - rTop - rBot);

  const zone = doorZone(ctx);
  if (zone.width <= 2 * rS) return [];
  const width = count === 1 ? mm(zone.width - 2 * rS) : mm((zone.width - 2 * rS - gap) / 2);
  if (width <= 0) return [];

  // u = +Y (length runs up the door), v = −X → thickness direction +Z, facing out of the
  // cabinet. The A-face is therefore the show face.
  const make = (name: string, rightEdgeX: Mm): PartInstance => ({
    name,
    role: 'door',
    profile: rectProfile(height, width),
    placement: placement(v3(rightEdgeX, rBot, ctx.frontBackZ), '+Y', '-X'),
    material: 'door',
    bandedDirections: BAND_ALL,
    grain: 'length-along-grain',
    note: 'Grain vertical',
  });

  if (count === 1) return [make('Door', mm(zone.x0 + rS + width))];
  return [make('Door L', mm(zone.x0 + rS + width)), make('Door R', mm(zone.x1 - rS))];
};

/**
 * The clear run of front the doors are laid out in.
 *
 * On a square cabinet that is the whole width, and everything below reduces to the arithmetic
 * it always was. On a radiused one it stops at the fixing strip — the doors **keep clear of
 * the strip**, because the strip is what the curved piece is fixed to and is not a door
 * clearance to be borrowed back.
 *
 * This is also the width a pair-of-doors check has to measure. Measuring the full width lets a
 * 550 radius on a 900 quietly produce two 160mm doors and pass, which is the kind of error
 * that reaches the bench.
 */
export const doorZone = (ctx: RuleContext): { x0: Mm; x1: Mm; width: Mm } => {
  const rad = ctx.radius;
  if (rad === null) return { x0: mm(0), x1: ctx.W, width: ctx.W };
  return { x0: rad.doorZoneX0, x1: rad.doorZoneX1, width: rad.doorZoneWidth };
};

/**
 * The shared "is this too narrow for a pair" check, measured on the door zone.
 *
 * One function rather than the same three lines in the base, wall and tall specs — a check
 * copied three times is a check that gets fixed twice.
 */
export const pairTooNarrowProblem = (ctx: RuleContext): string[] => {
  if ((ctx.options.doorCount ?? 2) !== 2) return [];
  const zone = doorZone(ctx);
  if (zone.width >= 400) return [];
  if (ctx.radius === null) {
    return [`A ${ctx.W}mm cabinet is too narrow for a pair of doors — use one door.`];
  }
  return [
    `The radius and its fixing strip leave ${Math.round(zone.width)}mm of door front on a ` +
      `${ctx.W}mm cabinet — too narrow for a pair. Use one door.`,
  ];
};

/**
 * The clear height a bank's fronts share — the carcass less a reveal top and bottom.
 *
 * Named because three callers need it and a bank whose fronts are laid out against one figure and
 * checked against another is a bank that reports a fault it does not have.
 */
export const drawerFrontOpening = (ctx: RuleContext): Mm =>
  mm(ctx.H - ctx.construction.revealTop - ctx.construction.revealBottom);

/**
 * What this bank's fronts actually come out as: explicit where the shop has set them, an equal
 * split where it has not, and fitted to the carcass either way.
 *
 * The arithmetic is `model/cabinet.ts`; this is the one place that reads it off a `RuleContext`,
 * so a spec cannot grow its own copy — which is exactly what the drawer-bank and custom specs had
 * done before §5.11 was diagnosed.
 */
export const resolveDrawerFronts = (ctx: RuleContext, count: number): DrawerFrontFit =>
  resolveDrawerFrontHeights(
    ctx.options.drawerFrontHeights,
    count,
    drawerFrontOpening(ctx),
    ctx.construction.gapBetweenDrawers,
  );

/**
 * Where each drawer front sits, bottom-first: the cabinet-space y of its bottom edge, and its
 * height.
 *
 * Its own function because two things need it and they must agree: the fronts themselves, and the
 * **drawer boxes** behind them, whose floors and whose runner holes are set out from the bottom
 * edge of the front they belong to. Working the stack out twice is how a box ends up 3mm off the
 * front it is screwed to.
 */
export interface DrawerRow {
  /** Cabinet-space y of the front's bottom edge. */
  readonly y: Mm;
  readonly height: Mm;
}

export const drawerRows = (ctx: RuleContext, heights: readonly Mm[]): DrawerRow[] => {
  const gap = ctx.construction.gapBetweenDrawers;
  let y: Mm = ctx.construction.revealBottom;
  return heights.map((height) => {
    const row = { y, height };
    y = mm(y + height + gap);
    return row;
  });
};

/**
 * Drawer fronts, stacked bottom to top with a gap between each.
 *
 * `heights` is ordered bottom-first. Part length is the front's width, so grain runs
 * horizontally across a bank — which is how a drawer bank is normally matched.
 *
 * The *boxes* behind these are `drawerBoxes` in `rules/drawerBox.ts`, and they are sized by the
 * runner rather than by the cabinet — which is why they waited for Phase 2.
 */
export const drawerFronts = (ctx: RuleContext, heights: readonly Mm[]): PartInstance[] => {
  const rS = ctx.construction.revealSides;
  const width = mm(ctx.W - 2 * rS);

  return drawerRows(ctx, heights).map((row, i) => ({
    name: `Drawer front ${i + 1}`,
    role: 'drawer-front',
    profile: rectProfile(width, row.height),
    placement: placement(v3(rS, row.y, ctx.frontBackZ), '+X', '+Y'),
    material: 'door',
    bandedDirections: BAND_ALL,
    grain: 'length-along-grain',
    note: i === 0 ? 'Numbered from the bottom' : undefined,
  }));
};

/**
 * Toe kick. Sits below the carcass, recessed behind the door face by the construction's
 * setback. Occupies y ∈ [−kickHeight, 0].
 */
export const kickPanel = (ctx: RuleContext): PartInstance[] => {
  const c = ctx.construction;
  const rad = ctx.radius;
  // The kick face sits `kickSetback` behind the **door front**, and the panel is `t` thick. The
  // door front is the finished plane, standoff included — not the carcass.
  const faceZ = mm(ctx.finishedFrontZ - c.kickSetback);

  if (rad === null) {
    return [
      {
        name: 'Kick',
        role: 'kick',
        profile: rectProfile(ctx.W, c.kickHeight),
        placement: placement(v3(0, mm(-c.kickHeight), mm(faceZ - ctx.t)), '+X', '+Y'),
        material: 'carcass',
        bandedDirections: ['+Y'],
        grain: 'any',
        note: 'Band top edge only',
      },
    ];
  }

  /*
   * A flat board across the front of a radiused cabinet would be a chord cutting the corner
   * off — a triangle of daylight at each end and a flat where the curve should be. So the kick
   * turns the corner too, as one bent piece with a flat run at each end: the same flat–bend–
   * flat part the wrap is, at a tighter radius.
   *
   * That radius is picked so the kick's flat run lands exactly where a square cabinet's kick
   * lands, which is `kickSetback` behind the finished front face.
   *
   * **It is simply the curve, set back.** It used to read `r + td + frontStandoff − kickSetback`,
   * and those three extra terms were compensation: the carcass curve was struck about a centre
   * 20mm behind the finished face, so the kick had to add the 20 back to land in the right plane.
   * Now that the curve is struck about the finished face itself — see `resolveCornerRadius` — the
   * two share a centre, and the kick is the same arc a setback tighter. The compensation is gone
   * rather than re-tuned, which is the sign the datum was the thing that was wrong.
   */
  /*
   * **The kick turns the corner in whichever way the rest of the curve does** — §5.7's fork
   * reaches here too, and the shop's words are the whole of it: *"the kick would be kerfed and
   * have a developed length"*.
   *
   * So a routed corner's kick is the **straight kick, curved**: the same carcass board a square
   * cabinet's kick is cut from, banded on the same top edge, pocket-routed on the rear so it
   * takes the radius. It is *not* the door board — nothing sees a kick, and putting a decor
   * board below the door line would buy a sheet of the dearest material in the job to hide it
   * behind a plinth.
   *
   * A wrapped corner's kick stays bendy ply, unbanded, exactly as it was.
   */
  const routed = (c.cornerMethod ?? 'wrapped') === 'routed';
  /*
   * A kerfed kick bends on its web exactly as the front does, so the web is the thickness and
   * the blocking behind it lands `web` in from the face — not a whole carcass board.
   */
  const board = routed ? c.routedPocketResidual : ctx.ts;
  const finished = mm(rad.r - c.kickSetback);
  const inner = mm(finished - board);
  if (inner <= 0) return [];
  const flatFront = mm(Math.abs(rad.tangentX - (rad.sign > 0 ? 0 : ctx.W)));

  return [
    wrapPart(ctx, rad, {
      name: 'Kick',
      role: 'kick',
      innerRadius: inner,
      lead: flatFront,
      trail: rad.tail,
      height: c.kickHeight,
      bottomY: mm(-c.kickHeight),
      ...(routed
        ? {
            material: 'carcass' as const,
            // The same edge a straight kick bands, for the same reason: the top is the only one
            // anybody sees, under the door.
            banding: ['+Y'] as BandingRule,
            boardThickness: board,
            features: rearRelief(ctx, {
              lead: flatFront,
              arc: developedLength(
                cylindricalForming('x', inner, QUARTER_TURN, flatFront),
                board,
              ),
              height: c.kickHeight,
              // The pocket is cut into the carcass board, whatever the web left under it is.
              board: ctx.t,
            }),
          }
        : {}),
      note: (length) =>
        routed
          ? `Carcass board, cut flat ${length.toFixed(1)} × ${c.kickHeight}. Pocket the rear ` +
            `right across the curve leaving ${c.routedPocketResidual}mm, and bend to ` +
            `${Math.round(inner)}mm inside radius — set back ${c.kickSetback} from the door ` +
            'face. Band the top edge. Needs blocking behind it.'
          : `Bendy ply, cut flat ${length.toFixed(1)} × ${c.kickHeight} and bent to ` +
            `${Math.round(inner)}mm inside radius — set back ${c.kickSetback} from the door ` +
            'face. Needs blocking behind it.',
    }),
  ];
};

// ---------------------------------------------------------------------------------------
// Applied end panels
// ---------------------------------------------------------------------------------------

/** What a spec has to tell the end-panel builder that the context cannot work out for itself. */
export interface AppliedEndSettings {
  /**
   * Whether this cabinet stands on something — its own kick, or a run's plinth. Mirrors
   * `CabinetSpec.standsOnKick`, and decides whether "to the floor" means anything at all: a wall
   * cabinet's carcass bottom is 1500 up a wall, and an end panel that ran to the floor from there
   * would be a very expensive mistake.
   */
  readonly standsOnKick?: boolean;
  /**
   * Whether a benchtop lands on this cabinet, burying the panel's top edge.
   *
   * Passed in rather than read off the cabinet type, for the same reason `carcassCornerFormers`
   * takes `hasTopPanel`: it is a fact about the *spec*, and a builder that switched on typeId
   * would have to be edited again for every cabinet type added after it. It decides one thing —
   * whether the top edge is banded — and banding an edge nobody sees costs a metre of tape,
   * while missing one that is seen is a remake.
   */
  readonly underBenchtop?: boolean;
}

/**
 * An applied end panel — the board laid over an exposed carcass side so the end of a run reads
 * as the kitchen rather than as the inside of a cupboard.
 *
 * Four things decide its shape, and each is a decision rather than an arithmetic convenience:
 *
 * - **It sits outboard of the carcass and the cabinet's width does not change.** x ∈ [−t, 0] on
 *   the left, [W, W + t] on the right. That is what "applied" means, and it is why a cabinet
 *   with an end on it eats one board more of the run than its width says.
 *
 * - **Its front edge is set from the door face, not from the carcass.** The panel's entire job
 *   is to finish in the plane the fronts finish in, so `finishedFrontZ` is what it is measured
 *   off — the same plane a radiused corner has to land in, resolved once in the context so the
 *   two cannot drift apart.
 *
 * - **It is cut long at the back** by the method's scribe allowance, to be planed into the wall.
 *   The back edge is therefore never banded: you would be banding an edge that gets planed off.
 *
 * - **It runs down to the floor**, past whatever the cabinet is standing on, because stopping at
 *   the carcass bottom leaves the kick returning across the end of the run in carcass board.
 *
 *   How far down is the cabinet's **own anchor height** — how high its carcass bottom sits off
 *   the floor — and not the method's kick height. Those are the same number on a cabinet with its
 *   own kick and are not the same number on a run standing on a ladder base, where the plinth
 *   owns its height and is explicitly documented as not reading it back off the method. Taking
 *   the anchor gets both right without knowing which it is, and gets a cabinet standing on
 *   nothing right too: the drop is zero, because there is nothing to drop past.
 *
 * The panel is cut from the **door** slot and carries the cabinet's door style, so a shaker
 * kitchen gets shaker ends without a second rule. That happens in `build.ts`, off the role.
 */
export const appliedEndPanels = (
  ctx: RuleContext,
  settings: AppliedEndSettings = {},
): PartInstance[] => {
  const c = ctx.construction;
  const ends = ctx.options.appliedEnds ?? [];
  if (ends.length === 0) return [];

  const scribe = c.appliedEndBackScribe ?? 20;
  const overhang = c.appliedEndFrontOverhang ?? 0;
  const standsOn = settings.standsOnKick ?? true;
  const drop = standsOn ? mm(Math.max(0, ctx.cabinet.placement.anchor.y)) : mm(0);
  const toFloor =
    (ctx.options.appliedEndHeight
      ? ctx.options.appliedEndHeight === 'floor'
      : (c.appliedEndToFloor ?? true)) && drop > 0;

  const bottomY = toFloor ? mm(-drop) : mm(0);
  const height = mm(ctx.H - bottomY);
  const frontZ = mm(ctx.finishedFrontZ + overhang);
  const backZ = mm(-scribe);
  const depth = mm(frontZ - backZ);
  if (height <= 0 || depth <= 0) return [];

  // Front always; the bottom because it stands on the floor and a raw edge there drinks; the top
  // only when there is no benchtop over it.
  const banding: SignedAxis[] = ['+Z', '-Y'];
  if (!settings.underBenchtop) banding.push('+Y');

  const note =
    `Applied end — grain vertical, finished face out. Cut ${Math.round(scribe)}mm long at the ` +
    `back to scribe to the wall${
      toFloor ? `, and run ${Math.round(drop)}mm past the carcass to the floor` : ''
    }.`;

  return ends
    .filter((end) => !(ctx.radius && (ctx.radius.corner === 'front-right') === (end === 'right')))
    .map((end) => ({
      name: end === 'left' ? 'End panel L' : 'End panel R',
      role: 'end-panel' as const,
      profile: rectProfile(height, depth),
      // The A-face is the **outboard** face either way — this is the one part in the carcass
      // whose show face points away from the cabinet, and getting it backwards puts the decor
      // against the melamine. As with the sides, the two hands take different axes rather than
      // the same axes and a different origin.
      placement:
        end === 'left'
          ? placement(v3(0, bottomY, frontZ), '+Y', '-Z')
          : placement(v3(ctx.W, bottomY, backZ), '+Y', '+Z'),
      material: 'door' as const,
      bandedDirections: banding,
      grain: 'length-along-grain' as const,
      note,
    }));
};

/**
 * What is wrong with the applied ends asked for, in the shop's words.
 *
 * Run for every cabinet type from `buildCabinet`, alongside `cornerRadiusProblems`. A cabinet
 * with no applied ends produces nothing here, so this cannot disturb a job that has none.
 */
export const appliedEndProblems = (ctx: RuleContext, spec: CabinetSpec): string[] => {
  const ends = ctx.options.appliedEnds ?? [];
  if (ends.length === 0) return [];
  const problems: string[] = [];

  /*
   * Whether this spec builds one at all, in its own words.
   *
   * This used to read `spec.isCarcass === false` and compose the sentence here, which was one
   * spec's reason — an appliance space's — written in a shared builder and applied to every
   * spec that might ever refuse. The appliance space now carries that sentence itself, and a
   * banquette corner carries a different one, because they are refusing for different reasons.
   */
  const refusal = refusalOf(spec.capabilities.appliedEnds);
  if (refusal) return [refusal];

  const rad = ctx.radius;
  if (rad) {
    const clashing = ends.find((end) => (rad.corner === 'front-right') === (end === 'right'));
    if (clashing) {
      problems.push(
        `The ${clashing} end of this cabinet is the radiused one, so it has no flat end to ` +
          'apply a panel to — the curve is the finish. The panel has been left off.',
      );
    }
  }

  /*
   * There is deliberately nothing here about plinths.
   *
   * There used to be: while the drop was read off the method's kick height, a cabinet on a ladder
   * base got a panel that stopped at the carcass bottom and a warning saying the plinth needed its
   * own return. Reading the drop off the cabinet's anchor instead made the panel reach the floor
   * on its own, and the warning became a false one — which is worse than none, because it teaches
   * whoever sees it to skim past the next warning too.
   */

  return problems;
};

// ---------------------------------------------------------------------------------------
// Curved assemblies — shared with the enclosed radiused end
// ---------------------------------------------------------------------------------------

/**
 * Where the formers sit up the height.
 *
 * Top and bottom always, plus enough between them that no clear gap exceeds `formerSpacing`.
 * The gap is what decides it rather than the count, because what actually goes wrong is the
 * skin taking up a flat between two formers too far apart.
 */
export const formerHeights = (ctx: RuleContext): Mm[] => {
  const spacing = Math.max(50, ctx.options.formerSpacing ?? 300);
  const run = ctx.H - ctx.t; // bottom former's underside to top former's underside
  const gaps = Math.max(1, Math.ceil(run / (spacing + ctx.t)));
  return Array.from({ length: gaps + 1 }, (_, i) => mm((run * i) / gaps));
};

/**
 * The plates the wrap is bent over.
 *
 * On an enclosed radiused end these are the whole skeleton, and every one of them is a full
 * quarter disc. On an ordinary carcass with a rounded corner the bottom — and the top, where
 * there is one — is already doing this job, so only the heights in between need a plate, and
 * the plate is just the corner rather than the whole plan.
 *
 * The two are the same builder because they are the same part. Keeping a second copy in the
 * radiused-end spec is how the two drift and only one of them gets the next fix.
 */
export const cornerFormers = (
  ctx: RuleContext,
  rad: CornerRadius,
  heights: readonly Mm[],
  name = 'Former',
): PartInstance[] =>
  heights.map((y, i) => {
    const { profile, placement: placed } = planPlate(cornerFormerRing(rad, ctx.W), y, 'up');
    return {
      name: heights.length === 1 ? name : `${name} ${i + 1}`,
      role: 'former' as const,
      profile,
      placement: placed,
      // Nothing is banded: every edge of a former is either buried in the assembly or under
      // the skin.
      bandedDirections: BAND_NONE,
      material: 'carcass' as const,
      grain: 'any' as const,
      note:
        i === 0
          ? `Cut to ${Math.round(rad.rSub)}mm radius — under the skin, not to the finished ` +
            `${Math.round(rad.r)}mm.`
          : undefined,
    };
  });

/**
 * The corner formers an ordinary carcass needs behind its wrap.
 *
 * The bottom already carries the curve at y = 0, and a cabinet closed by a top panel carries
 * it at the top too, so those two heights are skipped: a plate at the same height as a plate
 * is a plate too many. What is left is the runs in between, at whatever spacing keeps the ply
 * from taking up a flat.
 */
export const carcassCornerFormers = (
  ctx: RuleContext,
  opts: { hasTopPanel: boolean },
): PartInstance[] => {
  const rad = ctx.radius;
  if (rad === null) return [];
  const heights = formerHeights(ctx);
  const between = heights.slice(1, opts.hasTopPanel ? heights.length - 1 : heights.length);
  return cornerFormers(ctx, rad, between, 'Corner former');
};

export interface WrapSpec {
  readonly name: string;
  readonly role: PanelRole;
  /** Radius of the B-face — the inside of the bend, the face that lies on the formers. */
  readonly innerRadius: Mm;
  /** Flat run before the bend: the fixing strip, or the whole flat front for a kick. */
  readonly lead: Mm;
  /** Flat run after the bend: down the end of the cabinet to the back. */
  readonly trail: Mm;
  readonly height: Mm;
  readonly bottomY: Mm;
  /** What is laid over this layer's show face — see `PartInstance.finish`. Only the outer one. */
  readonly finish?: MaterialSlot;
  /**
   * The board this piece comes off. Defaults to `skin` — bendy ply — which every wrap was until
   * §5.7. A **routed** curve is the *door* board, because it is the same board as the fronts
   * bought for the same reason, which is why the routed method needs no new material slot.
   */
  readonly material?: MaterialSlot;
  /**
   * Which edges are banded. `BAND_NONE` on a wrapped layer, because every edge of it is buried
   * or laminated over.
   *
   * A **routed** curve bands its **leading edge** — the one that dies at the door — and that
   * band is the finished edge. It is the whole visible difference between the two methods:
   * *"the only thing that changes between the two is what covers the strip — laminated, or
   * banded."*
   */
  readonly banding?: BandingRule;
  /** The board's own grain constraint. `any` on ply; a decor board follows the cabinet. */
  readonly grain?: GrainConstraint;
  /**
   * The thickness of the board **this piece** is cut from. Defaults to the bendy ply, which is
   * what every wrap was until §5.7.
   *
   * It has to be said rather than assumed, because it sets a **length**: the developed length is
   * measured round the neutral surface, which sits inside the board. `wrapPart` read `ctx.ts`
   * for every part it made, so a routed curve off a 16mm door board was cut to the length a
   * 8mm ply would need — 6mm short round a 200 radius, on the one part that has to meet the
   * doors either side of it.
   */
  readonly boardThickness?: Mm;
  /**
   * Where through the board the material neither stretches nor compresses, as a fraction of the
   * thickness. Half way for a board that bends as one — see `DEFAULT_K_FACTOR`.
   *
   * **A kerfed part is not that.** Pocket the rear and the only continuous material left is the
   * residual web at the decor face; everything between the pockets is a rigid segment hinging on
   * it. So the length is measured round the **web**, not the middle of the board, and the two are
   * a long way apart: on a 200 radius through a quarter turn they differ by 13mm.
   */
  readonly kFactor?: number;
  /** Machining carried on the blank — the rear pockets that let a routed curve bend. */
  readonly features?: readonly PanelFeature[];
  readonly note?: (length: Mm) => string;
}

/**
 * One layer of the wrap: **one piece, no join** — the fixing strip, round the quarter, then
 * flat all the way down the end of the cabinet to the back. An exposed end wants no joint
 * line in it.
 *
 * `CylindricalForming` already describes this and needed no extension: anything before `from`
 * or past the end of the bend runs on flat along the tangent, so a single bend with straight
 * tails is exactly what it is. Cut length per layer:
 *
 * ```
 *     strip  +  (rᵢ + ts/2) · π/2  +  (D − r)
 * ```
 *
 * Both flat tails are the same on every layer and only the arc differs, so the gap between one
 * layer and the next stays exactly `ts · π/2` — 4.712mm on 3mm ply — however long the tails
 * are. The part stored is the **flat rectangle**, which is what gets nested and cut; `forming`
 * records the bend for the viewport and for nobody else.
 */
export const wrapPart = (ctx: RuleContext, rad: CornerRadius, spec: WrapSpec): PartInstance => {
  const board = spec.boardThickness ?? ctx.ts;
  const forming = cylindricalForming('x', spec.innerRadius, QUARTER_TURN, spec.lead, spec.kFactor);
  const length = mm(spec.lead + developedLength(forming, board) + spec.trail);
  // The flat part starts at the far end of its lead-in, on the plane the bend is tangent to.
  const startX = mm(rad.tangentX - rad.sign * spec.lead);
  const z = mm(rad.tangentZ + spec.innerRadius);
  // Part +X wraps the curve and part +Y runs up the cabinet — mirrored for a left-hand corner,
  // which is the one place the handedness of a wrap lives.
  const placed =
    rad.sign > 0
      ? placement(v3(startX, spec.bottomY, z), '+X', '+Y')
      : placement(v3(startX, mm(spec.bottomY + spec.height), z), '-X', '-Y');

  return {
    name: spec.name,
    role: spec.role,
    profile: rectProfile(length, spec.height),
    placement: placed,
    material: spec.material ?? 'skin',
    finish: spec.finish,
    bandedDirections: spec.banding ?? BAND_NONE,
    grain: spec.grain ?? 'any',
    ...(spec.features ? { features: spec.features } : {}),
    forming,
    note: spec.note?.(length),
  };
};

/**
 * The finish laminate over a curve, if the method carries one.
 *
 * Exported because three things have to agree about whether a given curve is laminated — the
 * former radius it is cut to, the decor it draws in, and the sheet it is charged for — and they
 * were reading three different sources: `radius.ts` read the allowance, `Viewport3D` read nothing
 * at all, and `costing.ts` charged a laminate sheet on **any** curve whether the method carried an
 * allowance or not. One predicate, so a curve cannot be dimensioned bare, drawn bare and charged
 * laminated all at once, which is what §5.14 found.
 */
export const isLaminatedCurve = (construction: ConstructionMethod): boolean =>
  (construction.finishLaminate ?? 0) > 0;

/**
 * Every layer of the wrap.
 *
 * Each layer is a **different length**, and this is the whole reason the forming descriptor
 * exists. The inner layer wraps the formers; the next one wraps the inner layer, a board
 * thickness further out, and therefore has further to go. Cutting them all the same makes
 * every layer after the first come up short, and you find out with the glue on.
 *
 * **The outer layer is the only one that carries the finish**, which is exactly what the laminate
 * is: one sheet over the outside of the finished wrap, not something between the plies —
 * `substrateRadius` already takes it off once rather than once per layer. The inner layers are
 * glue faces and nobody ever sees them. And it carries the **door** decor, because that is what a
 * shop orders: 1mm laminate matched to the doors. `laminate-1mm` on the price list is the *sheet*,
 * with a placeholder colour and its own comment saying nothing is drawn from it.
 */
/**
 * The rear relief that lets a routed curve bend — **one continuous pocket**, not a run of slots.
 *
 * The shop's own words, twice: *"it's a pocket route on the rear"*, and asked whether that meant
 * a row of kerfs or one cleared area, *"yeah one continuous pocket"*. So the whole curved section
 * is cleared to a flat floor leaving the web, and the piece bends on a continuous 2mm band rather
 * than hinging between rigid ribs. That is also what makes *"the formers will be hard up to that
 * 2mm"* literally true: the former bears on an unbroken surface.
 *
 * **It stops at the tangents**, which is the other half of the same sentence — *"the route
 * doesn't go full width, it ends at the radius and the run goes minimum 50mm past to allow screw
 * fixing. The area that gets screw fixed is still full depth."* So the flat lead and the flat
 * tail keep the whole board, and the screws have something to bite.
 *
 * A `pocket` rather than a `groove`, and the model already drew that distinction: *a groove
 * follows a line at a constant width; a pocket follows an area, and the tool has to clear the
 * whole of it.* Clearing an area is exactly what this is.
 *
 * The depth is **derived** — `board − web` — because the method stores what is *left*. A shop
 * thinks in the web that has to survive bending, not in how deep the cutter went, and deriving it
 * means a thicker board deepens the cut instead of eating the web.
 */
export const rearRelief = (
  ctx: RuleContext,
  spec: { lead: Mm; arc: Mm; height: Mm; board: Mm },
): PanelFeature[] => {
  const web = ctx.construction.routedPocketResidual;
  const depth = mm(spec.board - web);
  if (depth <= 0 || spec.arc <= 0) return [];
  const x0 = spec.lead;
  const x1 = mm(spec.lead + spec.arc);
  return [
    {
      id: 'bend-relief',
      kind: 'pocket',
      purpose: 'bend-relief',
      // The back. Clearing the decor face would be a curve with a trench down the front of it.
      face: 'B',
      outline: [v2(x0, mm(0)), v2(x1, mm(0)), v2(x1, spec.height), v2(x0, spec.height)],
      depth,
      // Square walls at the tangents: the step from full board to web is the line the former
      // lands against, and rounding it would leave the former proud of the flat.
      cornerRadius: mm(0),
    },
  ];
};

/**
 * The curved piece on a **routed** corner — one board, not a stack.
 *
 * The whole of §5.7 in one part. It is the *door* board, so what you see is the same decor as
 * the fronts either side with no laminate over it; its leading edge is **banded**, and that band
 * is the finished edge where the curve dies at the door; and its rear is pocket-routed so it
 * bends over the same formers a wrapped curve uses.
 *
 * **Its grain follows the cabinet, defaulting to vertical**, for the reason the laminate does —
 * this piece is a visible decor face standing between two doors, and a curve whose grain runs
 * round it beside doors whose grain runs up them is the thing a client sees first. Unlike the
 * laminate, this one is *cut* rather than drawn, so the constraint reaches the nest.
 */
export const routedCurve = (ctx: RuleContext, rad: CornerRadius): PartInstance[] => {
  const inner = mm(rad.rSub);
  if (inner <= 0) return [];
  /*
   * **The web is the material that bends, so the web is the thickness.**
   *
   * `rSub` is now `r − web` — the former is hard up against the back of the web — and everything
   * between the pockets is a rigid segment hinging on that web. So the piece develops exactly as
   * a strip of board `web` thick wrapped at `r − web` would, about its own middle, and needs no
   * special k-factor at all: the neutral surface lands at `r − web/2`.
   *
   * This replaces a `kerfKFactor` that expressed the same thing as a fraction of the **whole
   * board**, which was arithmetically equivalent only while the former was assumed to sit a whole
   * board back. It is not; the shop's correction is that it sits against the web.
   */
  const web = ctx.construction.routedPocketResidual;
  const forming = cylindricalForming('x', inner, QUARTER_TURN, rad.strip);
  const arc = developedLength(forming, web);
  const wantVertical = (ctx.options.grainDirection ?? 'vertical') === 'vertical';

  return [
    wrapPart(ctx, rad, {
      name: 'Curved front',
      role: 'skin',
      innerRadius: inner,
      lead: rad.strip,
      trail: rad.tail,
      height: ctx.H,
      bottomY: mm(0),
      material: 'door',
      boardThickness: web,
      // The leading edge — the one that dies at the door. It faces back along the part's own
      // length, which is `-X` on a right-hand corner and `+X` on a left-hand one.
      banding: [rad.sign > 0 ? '-X' : '+X'],
      // The piece's length runs *around* the curve, so grain up the curve is across its width —
      // the same translation `finishGrainFor` does, and opposite to what a door gets.
      grain: wantVertical ? 'width-along-grain' : 'length-along-grain',
      features: rearRelief(ctx, { lead: rad.strip, arc, height: ctx.H, board: ctx.td }),
      note: (length) =>
        `${ctx.construction.name}: routed curve. Cut flat ${length.toFixed(1)} × ${ctx.H} from ` +
        `the door board. Pocket the rear right across the curve, leaving ` +
        `${ctx.construction.routedPocketResidual}mm, and bend to ${Math.round(inner)}mm inside ` +
        'radius over the formers. The flats either side stay full depth for the screws. Band the ' +
        'leading edge — that band is the finished edge.',
    }),
  ];
};

export const wrapLayers = (ctx: RuleContext, rad: CornerRadius): PartInstance[] => {
  // §5.7's fork, and the only one: the corner, the strip, the wrap to the back and the
  // square-notched shelf are the same either way.
  if ((ctx.construction.cornerMethod ?? 'wrapped') === 'routed') return routedCurve(ctx, rad);
  const laminated = isLaminatedCurve(ctx.construction);
  return Array.from({ length: rad.layers }, (_, i) => {
    const inner = mm(rad.rSub + i * ctx.ts);
    // Belt as well as braces. `resolveRadius` will not hand over a corner this tight, and
    // `cylindricalForming` is right to refuse one — but a builder that can throw is a builder
    // that can take the whole app down, so it returns nothing instead.
    if (inner <= 0) return null;
    const outer = i === rad.layers - 1;
    return wrapPart(ctx, rad, {
      name: rad.layers === 1 ? 'Skin' : `Skin layer ${i + 1}`,
      role: 'skin',
      innerRadius: inner,
      lead: rad.strip,
      trail: rad.tail,
      height: ctx.H,
      bottomY: mm(0),
      finish: outer && laminated ? 'door' : undefined,
      note: (length) =>
        `Cut flat ${length.toFixed(1)} × ${ctx.H} and bend to ${Math.round(inner)}mm inside radius. ` +
        /*
         * This used to read *"check the sheet bends this way before cutting"*, which asked the
         * operator to catch a fault the cut plan had already committed — §4.26 is the measurement
         * that it did not work. The nest now lays the blank to the board's own bend axis, so the
         * note points at the setting that decides it rather than at the sheet in his hands.
         *
         * It names no form on purpose: the axis is per board, this context carries thicknesses
         * rather than the library, and a note hardcoding "column" would be wrong on the barrel
         * board the shop also buys.
         */
        'This blank is nested to run the way its board bends — the form is set per board under ' +
        'Settings → Materials. ' +
        (outer && laminated
          ? ` Laminate the outside face in the door decor, ${ctx.construction.finishLaminate}mm.`
          : ''),
    });
  }).filter((layer): layer is PartInstance => layer !== null);
};

/**
 * What is wrong with the corner radius on this cabinet, in plain terms.
 *
 * Reported rather than thrown, and run for every cabinet type from `buildCabinet`, so a
 * half-filled form says what it needs rather than quietly drawing something else. A cabinet
 * with no radius on it produces nothing here, which is what lets the radius-zero invariant
 * compare warnings as well as parts.
 */
export const cornerRadiusProblems = (ctx: RuleContext, spec: CabinetSpec): string[] => {
  const problems: string[] = [];
  const corner = ctx.options.radiusCorner;
  const asked = ctx.options.carcassRadius ?? 0;

  if (!corner) {
    if (asked > 0) {
      problems.push(
        `This cabinet has a ${Math.round(asked)}mm corner radius but no corner named, so it is ` +
          'being drawn square. Say which front corner is rounded — left or right as you stand ' +
          'and look at it.',
      );
    }
    return problems;
  }

  const rad = ctx.radius;

  /*
   * A radius the wrap cannot turn. `ctx.radius` is null for this, so the cabinet is drawn
   * square rather than half-built — but it has to be *said*, or a radius that quietly does
   * nothing looks like the field is broken.
   *
   * Checked from the raw numbers rather than off `ctx.radius`, precisely because there is no
   * resolved radius to read in this case. `substrateRadius` is shared with the resolver so the
   * two cannot disagree about where the boundary is.
   */
  if (rad === null) {
    const layers = wrapLayerCount(ctx.options.skinLayers ?? 2);
    const routed = (ctx.construction.cornerMethod ?? 'wrapped') === 'routed';
    /*
     * Asked through the same predicate `cornerRadiusFor` used to decide there was no corner, so
     * the boundary this warns at and the boundary the engine gave up at are one number. They
     * were one number when only bendy ply existed and this read `substrateRadius`; §5.7 made
     * that a two-answer question, and a warning naming a ply stack on a routed corner would be
     * the wrong figure *and* the wrong sentence.
     *
     * `asked > 0` first, and it is not a nicety: a corner named with **no** radius on it is a
     * half-filled form, not an impossible cabinet, and has to do nothing whatsoever. Without
     * it, every square cabinet whose corner had ever been named picked up a warning — which is
     * the radius-zero invariant, and it caught this.
     */
    const outboard = outboardOfFormers({
      cornerMethod: ctx.construction.cornerMethod,
      layers,
      ts: ctx.ts,
      td: ctx.td,
      finishLaminate: ctx.construction.finishLaminate,
    });
    if (asked > 0 && asked - outboard <= 0) {
      problems.push(
        routed
          ? `A ${Math.round(asked)}mm radius is smaller than the ${ctx.td}mm board the curve is ` +
            `routed from, so there is nothing left to bend round the formers. The smallest this ` +
            `cabinet can turn is about ${Math.ceil(outboard) + 1}mm — and in practice a radius ` +
            'wants to be a good deal bigger than the board going round it.'
          : `A ${Math.round(asked)}mm radius is smaller than the ${layers} × ${ctx.ts}mm of bendy ` +
            `ply that wraps it, so there is nothing left to bend it round. The smallest this ` +
            `cabinet can turn is about ${Math.ceil(outboard) + 1}mm — and in practice a ` +
            'radius wants to be a good deal bigger than the board going round it.',
      );
    }
    return problems;
  }

  /*
   * The carcass builders take the radius for any type, but only a spec that also cuts the
   * formers and the wrap can finish it. On anything else the corner comes out cut and bare,
   * which looks like a finished cabinet in the viewport and is a hole in the end of one.
   *
   * **Asked of the spec, not of the type id**, and that is this check's whole history. It read
   * `['base', 'wall', 'tall']` and went on reading it after the banquette started cutting its
   * own formers and wrap — so the one cabinet the shop most wants a curve on told the user it
   * could not have one, while building it correctly underneath. A hard-coded list of types is a
   * second opinion about what a spec does, and it is the one that goes stale.
   */
  const refusal = refusalOf(spec.capabilities.cornerRadius);
  if (refusal) problems.push(refusal);

  if (rad.r > ctx.W + 0.5 || rad.r > ctx.D + 0.5) {
    problems.push(
      `A ${Math.round(rad.r)}mm radius does not fit a ${ctx.W} × ${ctx.D} cabinet — the curve ` +
        'would run off the end of it.',
    );
  }
  const stripAsked = ctx.construction.fixingStripWidth ?? 50;
  if (rad.strip < stripAsked - 0.5) {
    problems.push(
      `A ${Math.round(rad.r)}mm radius leaves only ${Math.round(rad.strip)}mm of flat front, ` +
        `and the curved piece is fixed to that strip — this method asks for ${stripAsked}mm.`,
    );
  }
  /*
   * **A radius tighter than the shop has ever bent this web.**
   *
   * The bench figure is a pair — *"2mm web is tested to 200mm radius"* — so this reads both
   * halves and refuses to interpolate between them. At the tested web it compares radii; at any
   * other web there is no tested radius to compare against, and the Joinery tab says *that*
   * instead. Splitting it this way keeps one warning per fault: the job is wrong here, the
   * method is unproven there.
   *
   * Not an error, and it must not become one. Nobody has bent it tighter, which is a different
   * statement from it not going tighter — the cabinet is built, cut and quoted exactly as asked,
   * and what it earns is a sample off the saw before the job runs.
   */
  if ((ctx.construction.cornerMethod ?? 'wrapped') === 'routed') {
    const web = ctx.construction.routedPocketResidual;
    if (Math.abs(web - TESTED_WEB) < 0.001 && rad.r < TESTED_WEB_RADIUS - 0.5) {
      problems.push(
        `A ${Math.round(rad.r)}mm radius is tighter than a ${TESTED_WEB}mm web has been bent — ` +
          `${TESTED_WEB_RADIUS}mm is the shop's tested figure and nothing has been proven under ` +
          'it. It will be cut and priced as asked; bend a sample before running the job.',
      );
    }
  }
  if ((ctx.options.shelfBow ?? 0) > 0 && (ctx.options.shelfCount ?? 0) > 0) {
    problems.push(
      'A shelf cannot carry a bowed front and a rounded corner at once — two curves arguing ' +
        'over one edge. Pick one.',
    );
  }
  /*
   * **A curve with no finish laminate on it, said out loud.**
   *
   * `finishLaminate` migrates to **zero** on everything saved before §5.0 (project v23, standards
   * v19), deliberately, because a curve already quoted was cut without it. So a shop's curve may
   * genuinely have no laminate at all — and until §5.14 nothing on screen told that apart from a
   * laminated curve that simply wasn't being drawn, because neither was drawn.
   *
   * Now that the laminated one renders in the door decor, the bare one renders in bendy ply, which
   * is honest and is *also* what a curve looks like when nobody has noticed. **Making the picture
   * right without saying this would make the bare case invisible instead of wrong** — §4.18's
   * lesson in new clothes. So it is a sentence, on the cabinet, in millimetres.
   *
   * Not an error: a shop that veneers or paints its curves has a perfectly good bare wrap, which is
   * why it says what it will look like rather than what to do about it.
   *
   * **A wrapped corner only.** §5.7's routed curve is the door board itself with a banded leading
   * edge — there is no substrate to show and no laminate in the build, so `finishLaminate` is not
   * read on that path at all (see `outboardOfFormers`). Left ungated, a routed method with the
   * laminate turned off was told its bendy ply would show beside the doors, on a corner with no
   * bendy ply in it. That is the shape of stale claim this project keeps finding: the sentence was
   * true of every corner when it was written, and §5.7 made a second kind of corner.
   */
  if ((ctx.construction.cornerMethod ?? 'wrapped') === 'wrapped' && !isLaminatedCurve(ctx.construction)) {
    problems.push(
      'This curve has no finish laminate on it, so the bendy ply is the finished face and the ' +
        'corner will show its substrate beside the doors. Set "Finish laminate over a curve" ' +
        'under Joinery — 1mm is the shipped figure. Leave it at zero if you are veneering or ' +
        'painting the curve yourself.',
    );
  }
  return problems;
};

/**
 * Vertical dividers, evenly spaced through the interior.
 *
 * `count` dividers make `count + 1` bays. Each divider runs the full interior height and the
 * full horizontal depth, housed between the bottom and whatever closes the top.
 */
export const dividers = (ctx: RuleContext, count: number): PartInstance[] => {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => {
    // Bays are equal, so divider i sits on the (i+1)th division of the interior width.
    const centreX = ctx.interiorX0 + (ctx.interiorWidth * (i + 1)) / (count + 1);
    return {
      name: count === 1 ? 'Divider' : `Divider ${i + 1}`,
      role: 'divider' as const,
      profile: rectProfile(ctx.interiorHeight, ctx.horizontalDepth),
      placement: placement(
        v3(mm(centreX - ctx.thicknessOf(i) / 2), ctx.interiorY0, ctx.interiorBackZ),
        '+Y',
        '+Z',
      ),
      material: 'carcass' as const,
      bandedDirections: BAND_FRONT,
      grain: 'length-along-grain' as const,
      note: 'Grain vertical',
    };
  });
};

/** Clear width of one bay, once the dividers have taken their thickness out of the interior. */
export const bayWidth = (ctx: RuleContext, dividerCount: number): Mm =>
  mm((ctx.interiorWidth - dividerCount * ctx.t) / (dividerCount + 1));

/**
 * Shelves within each bay — the pigeon-hole case.
 *
 * With no dividers this is the same as a plain run of adjustable shelves. With dividers it
 * produces `shelfCount × (dividerCount + 1)` short shelves on a grid, which is what a pigeon
 * hole unit actually is.
 */
export const bayShelves = (
  ctx: RuleContext,
  shelfCount: number,
  dividerCount: number,
): PartInstance[] => {
  if (shelfCount <= 0) return [];
  if (dividerCount <= 0) return adjustableShelves(ctx, shelfCount);

  const c = ctx.construction;
  const bays = dividerCount + 1;
  const width = mm(bayWidth(ctx, dividerCount) - c.shelfSideClearance);
  const depth = mm(ctx.horizontalDepth - c.shelfSetback);
  const openingBottom = ctx.interiorY0;
  const openingHeight = ctx.interiorHeight;

  const bow = Math.max(0, ctx.options.shelfBow ?? 0);

  const parts: PartInstance[] = [];
  for (let level = 0; level < shelfCount; level++) {
    const centreY = openingBottom + (openingHeight * (level + 1)) / (shelfCount + 1);
    for (let bay = 0; bay < bays; bay++) {
      // Left edge of this bay: the interior start, plus the bays and dividers before it.
      const bayLeft = ctx.interiorX0 + bay * (bayWidth(ctx, dividerCount) + ctx.t);
      parts.push({
        name: shelfCount === 1 ? `Shelf bay ${bay + 1}` : `Shelf ${level + 1} bay ${bay + 1}`,
        role: 'shelf-adjustable',
        profile: shelfProfile(ctx, width, depth),
        placement: placement(
          v3(
            mm(bayLeft + c.shelfSideClearance / 2),
            // `parts.length` is this shelf's index in what the rule returns, which is exactly what
            // `thicknessOf` is asked about — the bays and levels are this builder's own bookkeeping.
            mm(centreY - ctx.thicknessOf(parts.length) / 2),
            mm(ctx.D - c.shelfSetback + bow),
          ),
          '+X',
          '-Z',
        ),
        material: 'carcass',
        bandedDirections: BAND_FRONT,
        grain: 'any',
        note: bow > 0 ? `Radiused front, ${bow}mm bow` : undefined,
      });
    }
  }
  return parts;
};

/**
 * A lid sitting on top of the carcass rather than housed in it — a banquette seat.
 *
 * Overhangs the carcass on the front and both ends, and is banded all round because every
 * edge of it is seen and sat on.
 */
export const lidPanel = (ctx: RuleContext, overhang: Mm): PartInstance => {
  const o = Math.max(0, overhang);
  return {
    name: 'Lid',
    role: 'lid',
    profile: rectProfile(mm(ctx.W + 2 * o), mm(ctx.D + o)),
    // Sits on top of the carcass, overhanging the ends and the front but not the back wall.
    placement: placement(v3(mm(-o), ctx.H, mm(ctx.D + o)), '+X', '-Z'),
    material: 'door',
    bandedDirections: BAND_ALL,
    grain: 'length-along-grain',
    note: 'Sits on the carcass — not housed',
  };
};

/**
 * A solid fixed front, in door decor, that does not open.
 *
 * This is the face of a banquette. It is `false-front` rather than `door` and the distinction
 * carries real weight: `rules/boring.ts` selects `door` and `drawer-front` to bore, so a fixed
 * front takes **no hinge cups and no plates**, and none appear on the hardware BOM. It is still
 * in `STYLED_FRONT_ROLES`, so a shaker or V-groove kitchen routes it exactly like the doors
 * either side of it, which is the whole reason it is a front and not a panel.
 *
 * **Part length runs across, not up** — modelled on `drawerFronts` rather than on `doors`. A
 * banquette front is wide and low, so grain runs horizontally along the run the way a drawer
 * bank is matched. A door is tall and its grain runs up it; copying the door here would stand
 * the grain on end on a 1200 × 380 front, which is not how one is built.
 *
 * ## It takes no reveal, and that is the §5.14 correction
 *
 * It used to cut `H − revealTop − revealBottom` by `zone.width − 2 × revealSides`, which on the
 * shipped reveals is 3mm short at the top and 1.5mm short at each end. **A reveal is clearance
 * for a door to swing** — `revealTop` is 3mm specifically so a door can open under a benchtop
 * (§3). A false front takes no hinges, never opens, and has no benchtop over it: the cushion sits
 * on top of the carcass beside it. So the gap was clearance for a movement that never happens,
 * and all it did was expose a white band of carcass along the top of the front, which is what the
 * bench photographed.
 *
 * The sides are the same argument and have a second half: in a run of seating the fronts should
 * **meet**, and two fronts each held in 1.5mm leave a 3mm line of daylight between units that are
 * meant to read as one bench.
 *
 * So the front fills its zone exactly — full carcass height, the full clear run of front. On a
 * radiused unit `doorZone` still stops it at the fixing strip, which is a piece of structure
 * rather than a reveal and stays.
 *
 * **This re-cuts every banquette front in every saved job**, 3mm taller and 3mm wider. It is a
 * rule change rather than a migration, so nothing carries the old size forward, and it travels
 * with project v30 on purpose — see §5.14.
 */
export const fixedFrontPanel = (ctx: RuleContext): PartInstance[] => {
  const zone = doorZone(ctx);
  const height = ctx.H;
  const width = zone.width;
  if (height <= 0 || width <= 0) return [];
  return [{
    name: 'Front',
    role: 'false-front',
    profile: rectProfile(width, height),
    placement: placement(v3(zone.x0, mm(0), ctx.frontBackZ), '+X', '+Y'),
    material: 'door',
    bandedDirections: BAND_ALL,
    grain: 'length-along-grain',
    note: 'Fixed — no hinges, and no reveal: it does not open. Grain horizontal.',
  }];
};

/**
 * The square notch a lift-up takes at a rounded corner, or `null` if the curve has eaten it.
 *
 * **What it clears is the top corner former, not the arc.** A shelf notches to the bounding
 * square of the curve, because a shelf sits in clear air between the formers. This panel does
 * not: `carcassCornerFormers` puts a plate at the top of the carcass on a lidless seat box, and
 * a lift-up is flush with the top of the carcass by definition, so the two are the same board at
 * the same height. The former reaches inboard as far as the **fixing strip** — `stripInnerX`,
 * a strip's width further in than the tangent — so that is where the panel has to stop.
 *
 * The clearances cancel, which is worth seeing rather than trusting: the panel's edges are
 * already `c` inside the opening and the notch has to stand `c` clear of the former, so the
 * notch measures `|endInnerX − stripInnerX|` by `D − tangentZ` with no `c` in it at all.
 */
interface LiftUpNotch {
  readonly profile: Profile2D;
  readonly note?: string;
}

const liftUpNotch = (
  ctx: RuleContext,
  rad: CornerRadius,
  length: Mm,
  width: Mm,
): LiftUpNotch | null => {
  const notchLength = mm(Math.max(0, Math.abs(rad.endInnerX - rad.stripInnerX)));
  // A former sitting entirely forward of the carcass front — a radius barely bigger than the
  // wrap — never reaches the opening, so there is nothing to notch round.
  const notchWidth = mm(Math.max(0, ctx.D - rad.tangentZ));
  if (notchLength <= 0 || notchWidth <= 0) return { profile: rectProfile(length, width) };
  if (notchLength >= length || notchWidth >= width) return null;

  // The panel lies in with `v = −Z`, so part +Y runs toward the back and y = 0 is its front
  // edge. The notch is therefore at the front, on whichever end the radius is.
  const corner = rad.sign > 0 ? 'x1y0' : 'x0y0';
  return {
    profile: notchedRectProfile(length, width, corner, notchLength, notchWidth),
    note:
      `Square notch ${Math.round(notchLength)} × ${Math.round(notchWidth)} at the radiused ` +
      'corner, to land on the top former — square, not curved, because a curved edge will not ' +
      'go through the edgebander',
  };
};

/**
 * The hinged lift-up panel that gives access to the storage void under a banquette seat.
 *
 * **Inset, not sitting on top.** It drops into the carcass opening so its top face finishes
 * flush with the top edges of the sides, the back and the front. The cushion sits on that flush
 * surface and comes off before the panel is lifted, so the panel carries no cushion fixing and
 * the two are independent parts.
 *
 * That is the correction to the first version, which perched a slab on top of the carcass and
 * overhung it by 20mm on both ends and the front. An overhanging lid cannot be built next to
 * anything: two banquettes side by side overlapped their lids by 40mm, and the inside corner's
 * lid was flush, so the two units this feature exists to join could not line up.
 *
 * Cut from carcass board rather than door decor because nothing sees it — it lives under a
 * cushion — but banded all round, because it is handled every time the storage is opened.
 *
 * **The hinge itself is not modelled.** A lid stay is not in the Blum library this build ships,
 * and inventing a part number and a price is exactly the failure `npm run report`'s unchecked
 * list exists to prevent. The panel is cut to be hinged along its back edge; what it is hinged
 * *with*, and whether it lands on cleats or on nothing but the hinge, is an open question — see
 * §5.4 of the handover.
 *
 * **On a banquette with a rounded corner it stops at the curve**, and it has to: the topmost
 * corner former sits flush with the top of the carcass — exactly where this panel does — so a
 * full rectangle and the former occupy the same board at the same height. Notched, it lands on
 * the former instead of fighting it.
 *
 * The notch is **square, not curved**, for the reason the shelf notch is: a curved edge will not
 * go through the edgebander, and this panel is banded all round because it is handled every time
 * the storage is opened. See `radiusedShelf`.
 */
export const liftUpPanel = (ctx: RuleContext, clearance: Mm): PartInstance[] => {
  const c = Math.max(0, clearance);
  const rad = ctx.radius;

  /*
   * The opening the panel drops into, which the radius moves: the side it runs into sets back
   * behind the ply, so its inner face is `endInnerX` rather than `W − t`, and the back is gone
   * entirely once the curve has run past it. Off the plain figures at radius zero, so nothing
   * about a square banquette moves.
   */
  const { lo: openLo, hi: openHi } =
    rad === null ? span(ctx.interiorX0, mm(ctx.W - ctx.shell.right)) : span(rad.farInnerX, rad.endInnerX);
  const backZ = rad === null ? ctx.interiorBackZ : rad.backZ;

  const lo = mm(openLo + c);
  const length = mm(openHi - openLo - 2 * c);
  const width = mm(ctx.D - backZ - 2 * c);
  if (length <= 0 || width <= 0) return [];

  const shape = rad === null ? null : liftUpNotch(ctx, rad, length, width);
  // A notch that has eaten the panel means the curve has taken the whole opening — report it by
  // producing nothing rather than by cutting a lid nobody could fit.
  if (rad !== null && shape === null) return [];

  return [{
    name: 'Lift-up',
    role: 'lid',
    profile: shape ? shape.profile : rectProfile(length, width),
    /*
     * Top face flush with the top of the carcass, so the cushion lands on one continuous plane.
     *
     * v is −Z, not +Z, and that is the whole of it: the thickness runs along u × v, so +X × +Z
     * puts the board *below* the origin and the seat finishes a board thickness low. +X × −Z
     * puts it above. Same footprint either way, which is exactly why this is asserted as
     * occupancy rather than as a size — a size test passes on both.
     */
    placement: placement(v3(lo, mm(ctx.H - ctx.t), mm(ctx.D - c)), '+X', '-Z'),
    material: 'carcass',
    bandedDirections: BAND_ALL,
    grain: 'any',
    note:
      `Inset, hinged along the back edge, ${c}mm clearance all round` +
      (shape?.note ? `. ${shape.note}` : ''),
  }];
};
