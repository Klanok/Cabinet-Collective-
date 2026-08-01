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
import { type SignedAxis, v3 } from '../geom/vec.ts';
import { cylindricalForming, developedLength } from '../model/forming.ts';
import type { PanelRole } from '../model/panel.ts';
import type { RuleContext } from './context.ts';
import {
  type CornerRadius,
  QUARTER_TURN,
  clampToSubstrate,
  cornerFormerRing,
  cornerPlateRing,
  planPlate,
  substrateRadius,
  wrapLayerCount,
} from './radius.ts';
import {
  BAND_ALL,
  BAND_FRONT,
  BAND_NONE,
  type CabinetSpec,
  type PartInstance,
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
        placement: placement(v3(ctx.t, 0, ctx.D), '+X', '-Z'),
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
        placement: placement(v3(ctx.t, ctx.H, ctx.interiorBackZ), '+X', '+Z'),
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
        placement: placement(v3(ctx.t, ctx.H, position === 'front' ? mm(ctx.D - sw) : ctx.interiorBackZ), '+X', '+Z'),
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
    const origin = applied ? v3(0, 0, 0) : v3(ctx.t, ctx.t, 0);
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
      placement: placement(v3(lo, applied ? mm(0) : ctx.t, 0), '+X', '+Y'),
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
  const openingBottom = ctx.t;
  const openingHeight = ctx.interiorHeight;
  const bow = Math.max(0, ctx.options.shelfBow ?? 0);

  const frontZ = mm(ctx.D - c.shelfSetback);
  const shelf = rad === null ? null : radiusedShelf(ctx, rad, frontZ);
  // A notch that has eaten the whole shelf comes back as nothing at all, rather than as a
  // part nobody could lift in.
  if (rad !== null && shelf === null) return [];

  const length = shelf ? shelf.length : mm(ctx.interiorWidth - c.shelfSideClearance);
  const width = shelf ? shelf.width : mm(ctx.horizontalDepth - c.shelfSetback);
  const leftX = shelf ? shelf.lo : mm(ctx.t + c.shelfSideClearance / 2);

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
        v3(leftX, mm(centreY - ctx.t / 2), mm(frontZ + (shelf ? 0 : bow))),
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
   * lands. Setting it back from the *finished curve* instead would put the kick 18mm further
   * back than its neighbour's in a run, and you would see the step.
   */
  const finished = mm(rad.r + ctx.td + c.frontStandoff - c.kickSetback);
  const inner = mm(finished - ctx.ts);
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
      note: (length) =>
        `Bendy ply, cut flat ${length.toFixed(1)} × ${c.kickHeight} and bent to ` +
        `${Math.round(inner)}mm inside radius — set back ${c.kickSetback} from the door face. ` +
        'Needs blocking behind it.',
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

  if (spec.isCarcass === false) {
    problems.push(
      `An ${spec.name.toLowerCase()} is a gap in the run rather than a cabinet, so there is no ` +
        'side to apply a panel to. Put the end on the cabinet beside it instead.',
    );
    return problems;
  }

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
  const forming = cylindricalForming('x', spec.innerRadius, QUARTER_TURN, spec.lead);
  const length = mm(spec.lead + developedLength(forming, ctx.ts) + spec.trail);
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
    material: 'skin',
    bandedDirections: BAND_NONE,
    grain: 'any',
    forming,
    note: spec.note?.(length),
  };
};

/**
 * Every layer of the wrap.
 *
 * Each layer is a **different length**, and this is the whole reason the forming descriptor
 * exists. The inner layer wraps the formers; the next one wraps the inner layer, a board
 * thickness further out, and therefore has further to go. Cutting them all the same makes
 * every layer after the first come up short, and you find out with the glue on.
 */
export const wrapLayers = (ctx: RuleContext, rad: CornerRadius): PartInstance[] =>
  Array.from({ length: rad.layers }, (_, i) => {
    const inner = mm(rad.rSub + i * ctx.ts);
    // Belt as well as braces. `resolveRadius` will not hand over a corner this tight, and
    // `cylindricalForming` is right to refuse one — but a builder that can throw is a builder
    // that can take the whole app down, so it returns nothing instead.
    if (inner <= 0) return null;
    return wrapPart(ctx, rad, {
      name: rad.layers === 1 ? 'Skin' : `Skin layer ${i + 1}`,
      role: 'skin',
      innerRadius: inner,
      lead: rad.strip,
      trail: rad.tail,
      height: ctx.H,
      bottomY: mm(0),
      note: (length) =>
        `Cut flat ${length.toFixed(1)} × ${ctx.H} and bend to ${Math.round(inner)}mm inside radius. ` +
        'Check the sheet bends this way before cutting — bendy ply is sold barrel or column form.',
    });
  }).filter((layer): layer is PartInstance => layer !== null);

/**
 * What is wrong with the corner radius on this cabinet, in plain terms.
 *
 * Reported rather than thrown, and run for every cabinet type from `buildCabinet`, so a
 * half-filled form says what it needs rather than quietly drawing something else. A cabinet
 * with no radius on it produces nothing here, which is what lets the radius-zero invariant
 * compare warnings as well as parts.
 */
export const cornerRadiusProblems = (ctx: RuleContext): string[] => {
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
    // `asked > 0` first, and it is not a nicety: a corner named with **no** radius on it is a
    // half-filled form, not an impossible cabinet, and has to do nothing whatsoever. Without
    // it, every square cabinet whose corner had ever been named picked up a warning — which is
    // the radius-zero invariant, and it caught this.
    if (asked > 0 && substrateRadius(mm(asked), layers, ctx.ts) <= 0) {
      problems.push(
        `A ${Math.round(asked)}mm radius is smaller than the ${layers} × ${ctx.ts}mm of bendy ` +
          `ply that wraps it, so there is nothing left to bend it round. The smallest this ` +
          `cabinet can turn is about ${Math.ceil(layers * ctx.ts) + 1}mm — and in practice a ` +
          'radius wants to be a good deal bigger than the board going round it.',
      );
    }
    return problems;
  }

  // The carcass builders take the radius for any type, but only these three specs also cut the
  // formers and the wrap. On anything else the corner would come out cut and bare, which looks
  // like a finished cabinet in the viewport and is a hole in the end of one.
  if (!['base', 'wall', 'tall'].includes(ctx.cabinet.typeId)) {
    problems.push(
      'A rounded corner is only built on base, wall and tall cabinets — this one would come ' +
        'out with the corner cut away and nothing wrapped round it.',
    );
  }

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
  if ((ctx.options.shelfBow ?? 0) > 0 && (ctx.options.shelfCount ?? 0) > 0) {
    problems.push(
      'A shelf cannot carry a bowed front and a rounded corner at once — two curves arguing ' +
        'over one edge. Pick one.',
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
    const centreX = ctx.t + (ctx.interiorWidth * (i + 1)) / (count + 1);
    return {
      name: count === 1 ? 'Divider' : `Divider ${i + 1}`,
      role: 'divider' as const,
      profile: rectProfile(ctx.interiorHeight, ctx.horizontalDepth),
      placement: placement(v3(mm(centreX - ctx.t / 2), ctx.t, ctx.interiorBackZ), '+Y', '+Z'),
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
  const openingBottom = ctx.t;
  const openingHeight = ctx.interiorHeight;

  const bow = Math.max(0, ctx.options.shelfBow ?? 0);

  const parts: PartInstance[] = [];
  for (let level = 0; level < shelfCount; level++) {
    const centreY = openingBottom + (openingHeight * (level + 1)) / (shelfCount + 1);
    for (let bay = 0; bay < bays; bay++) {
      // Left edge of this bay: the interior start, plus the bays and dividers before it.
      const bayLeft = ctx.t + bay * (bayWidth(ctx, dividerCount) + ctx.t);
      parts.push({
        name: shelfCount === 1 ? `Shelf bay ${bay + 1}` : `Shelf ${level + 1} bay ${bay + 1}`,
        role: 'shelf-adjustable',
        profile: shelfProfile(ctx, width, depth),
        placement: placement(
          v3(
            mm(bayLeft + c.shelfSideClearance / 2),
            mm(centreY - ctx.t / 2),
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
