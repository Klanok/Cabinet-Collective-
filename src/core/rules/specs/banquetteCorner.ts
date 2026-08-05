/**
 * The inside banquette corner — an L-shaped seat box turning the corner between two walls.
 *
 * **This is the second version, and the first was wrong in kind rather than in detail.** It built a
 * quarter *disc*: convex, bulging into the room, sized by a `validate` rule insisting
 * `width = depth = insideCornerRadius`. The shop's verdict was *"a complete mess."* The description
 * that replaced it, and the shape everything here is built from, is in `model/insideCorner.ts` —
 * **read that first**, including the part about which way the fillet curves, because this item was
 * mis-derived twice from one sentence before it was written down.
 *
 * The short version: the seat is an **L**, a span along each wall and a run's depth off each, with a
 * small **concave fillet** where the two seat fronts meet.
 *
 * ## What it is made of, from the shop
 *
 * > *"the entire radius front should be formed bendy ply then laminated — that is the point of this
 * > cabinet"*
 *
 * So **there is no flat front panel on this unit at all.** The whole front — along the first leg,
 * round the fillet, along the second — is *one piece of formed bendy ply per layer*, laminated to
 * match the doors. That is §4.5's *"one piece, no join"* wrap, bent the other way: an exposed front
 * wants no joint line in it, and here the alternative would have put one at each tangent.
 *
 * It also means this cabinet produces **no door-decor part**. The laminate over the ply is the
 * finish, which is `Panel.finishMaterialId` doing exactly the job §4.23 built it for.
 *
 * > *"the strip should be there and set back from the radius by 50mm — depending on what the
 * > entered radius is"*
 *
 * So the fixing strip survives from §4.5 and keeps its meaning: a flat landing the curved piece is
 * fixed to. Here it is the **former** running 50mm past each tangent, so the ply has something
 * rigid to be pressed onto where it comes out of the curve. It is the construction method's
 * `fixingStripWidth`, not a second 50 — and *"depending on what the entered radius is"* is the same
 * rule the convex corner already has: a radius that does not leave the strip room is reported
 * rather than drawn with a strip too small to fix to.
 *
 * ## The one number that inverts
 *
 * Every surface parallel to the finished face is `r + d` about **one centre** out in the room, so
 * the formers are cut to `r + skin` where a convex corner's are cut to `r − skin`. On the shipped
 * figures the ply's back face lands 3mm *in front of* the carcass — `frontStandoff + door − skin` —
 * so the formers pack the curve out to finish flush with the banquettes either side of it. Getting
 * that sign backwards is a step exactly where a hand lands.
 */

import { type Mm, mm } from '../../units.ts';
import { rectProfile } from '../../geom/profile.ts';
import { placement } from '../../geom/placement.ts';
import { v3 } from '../../geom/vec.ts';
import { cylindricalForming, developedLength } from '../../model/forming.ts';
import {
  type InsideCornerPlan,
  insideCornerPlan,
  insideCornerRingAt,
  maxInsideCornerRadius,
} from '../../model/insideCorner.ts';
import type { RuleContext } from '../context.ts';
import type { CabinetSpec, PartInstance } from '../spec.ts';
import { BAND_ALL, BAND_NONE } from '../spec.ts';
import { type PlanRing, type PlanVertex, planPlate } from '../radius.ts';
import { formerHeights, isLaminatedCurve } from '../parts.ts';

const QUARTER_TURN = Math.PI / 2;

/** How far the finished face stands in front of the carcass: a standoff plus a front's board. */
const frontProud = (ctx: RuleContext): Mm => mm((ctx.construction.frontStandoff ?? 2) + ctx.td);

/** Everything outboard of the formers: the plies, and the laminate over them. */
const skinThickness = (ctx: RuleContext): Mm =>
  mm(layerCount(ctx) * ctx.ts + laminate(ctx));

const layerCount = (ctx: RuleContext): number => Math.max(1, Math.round(ctx.options.skinLayers ?? 2));
const laminate = (ctx: RuleContext): Mm =>
  isLaminatedCurve(ctx.construction) ? mm(ctx.construction.finishLaminate) : mm(0);

export const cornerPlanOf = (ctx: RuleContext): InsideCornerPlan =>
  insideCornerPlan({
    W: ctx.W,
    D: ctx.D,
    seatDepth: mm(ctx.options.seatDepth ?? 500),
    radius: mm(ctx.options.insideCornerRadius ?? 0),
    frontProud: frontProud(ctx),
  });

/**
 * A carcass ring: the plan at some depth behind the finished face, held in from the walls and the
 * two open ends.
 *
 * The straight edges are simply clamped, which works because every edge but the fillet is axis
 * aligned and the fillet is nowhere near them — a radius big enough to reach an inset edge has
 * already been clamped by `maxInsideCornerRadius`.
 */
const insetRing = (ring: PlanRing, plan: InsideCornerPlan, back: Mm, end: Mm): PlanVertex[] =>
  ring.map((v) => ({
    x: mm(Math.min(Math.max(v.x, back), plan.W - end)),
    z: mm(Math.min(Math.max(v.z, back), plan.D - end)),
    bulge: v.bulge,
  }));

/* ── The carcass ─────────────────────────────────────────────────────────────────────────────── */

const backs = (ctx: RuleContext): PartInstance[] => [
  {
    name: 'Back A',
    role: 'back',
    profile: rectProfile(ctx.W, ctx.H),
    placement: placement(v3(mm(0), mm(0), mm(0)), '+X', '+Y'),
    material: 'back',
    bandedDirections: BAND_NONE,
    grain: 'any',
    note: 'Against the first wall, full span',
  },
  {
    // Butts the first back rather than overlapping it, so the corner is one board thick.
    name: 'Back B',
    role: 'back',
    profile: rectProfile(mm(ctx.D - ctx.tb), ctx.H),
    placement: placement(v3(mm(0), mm(0), ctx.D), '-Z', '+Y'),
    material: 'back',
    bandedDirections: BAND_NONE,
    grain: 'any',
    note: 'Against the second wall, cut short by the first back',
  },
];

/**
 * The two open ends, where the unit butts the banquette on each side of it.
 *
 * Neither is exposed — that is what a connector *is* — so neither is banded on the outboard face
 * and neither takes an applied end. The front edge of each is banded, because it is the one edge of
 * a side that finishes against the ply rather than against a neighbour.
 */
const sides = (ctx: RuleContext, plan: InsideCornerPlan): PartInstance[] => {
  const runA = mm(plan.seatDepth - ctx.tb);
  const runB = mm(plan.seatDepth - ctx.tb);
  if (runA <= 0 || runB <= 0) return [];
  return [
    {
      name: 'End A',
      role: 'side',
      profile: rectProfile(ctx.H, runA),
      placement: placement(v3(mm(ctx.W - ctx.t), mm(0), ctx.tb), '+Y', '+Z'),
      material: 'carcass',
      bandedDirections: BAND_NONE,
      grain: 'length-along-grain',
      note: 'Open end — butts the banquette on this side. Grain vertical.',
    },
    {
      name: 'End B',
      role: 'side',
      profile: rectProfile(ctx.H, runB),
      placement: placement(v3(plan.seatDepth, mm(0), mm(ctx.D - ctx.t)), '+Y', '-X'),
      material: 'carcass',
      bandedDirections: BAND_NONE,
      grain: 'length-along-grain',
      note: 'Open end — butts the banquette on this side. Grain vertical.',
    },
  ];
};

/** The L-shaped bottom, held in from the walls and the two ends, out to the carcass front. */
const bottom = (ctx: RuleContext, plan: InsideCornerPlan): PartInstance[] => {
  const ring = insetRing(insideCornerRingAt(plan, frontProud(ctx)), plan, ctx.tb, ctx.t);
  if (ring.length < 3) return [];
  const plate = planPlate(ring, mm(0), 'up');
  return [{
    name: 'Bottom',
    role: 'bottom',
    profile: plate.profile,
    placement: plate.placement,
    material: 'carcass',
    bandedDirections: BAND_NONE,
    grain: 'any',
    note: 'L-shaped, with the inside corner filleted to carry the formers',
  }];
};

/**
 * The hinged lift-up, inset flush into the top of the carcass — the same access a plain banquette
 * has, following the L instead of a rectangle.
 */
const liftUp = (ctx: RuleContext, plan: InsideCornerPlan): PartInstance[] => {
  if (ctx.options.hasLiftUp === false) return [];
  const c = mm(ctx.options.liftUpClearance ?? 2);
  const ring = insetRing(
    insideCornerRingAt(plan, mm(frontProud(ctx) + c)),
    plan,
    mm(ctx.tb + c),
    mm(ctx.t + c),
  );
  if (ring.length < 3) return [];
  const plate = planPlate(ring, mm(ctx.H - ctx.t), 'up');
  return [{
    name: 'Lift-up',
    role: 'lid',
    profile: plate.profile,
    placement: plate.placement,
    material: 'carcass',
    bandedDirections: BAND_ALL,
    grain: 'any',
    note: `Hinged at the back, inset ${Math.round(c)}mm all round so it swings clear. Under the cushion.`,
  }];
};

/* ── The curve ───────────────────────────────────────────────────────────────────────────────── */

/**
 * The formers behind the fillet: a plate at each height, carrying the ply and packing it out to
 * finish flush with the fronts either side.
 *
 * Its front face is the arc at `r + skin`, its flanks are the fixing strip, and its back sits on
 * the carcass front planes.
 */
const formers = (ctx: RuleContext, plan: InsideCornerPlan): PartInstance[] => {
  if (plan.radius <= 0) return [];
  const skin = skinThickness(ctx);
  const strip = stripWidth(ctx, plan);
  const ply = insideCornerRingAt(plan, skin);
  if (ply.length < 3) return [];
  const back = mm(plan.finishedFront - frontProud(ctx));
  const cx = plan.filletCentre.x;
  const cz = plan.filletCentre.y;
  const f = mm(plan.finishedFront - skin);
  const bulge = ply.find((v) => v.bulge !== undefined)?.bulge;
  if (bulge === undefined) return [];

  /*
   * Walked so the material lies between the arc and the carcass corner. The two flats either side
   * of the arc are the strip: the flat landing the ply is pressed onto as it comes out of the bend.
   */
  const ring: PlanVertex[] = [
    { x: mm(cx + strip), z: f },
    { x: cx, z: f, bulge },
    { x: f, z: cz },
    { x: f, z: mm(cz + strip) },
    { x: back, z: mm(cz + strip) },
    { x: back, z: back },
    { x: mm(cx + strip), z: back },
  ];

  return formerHeights(ctx).map((y, i) => {
    const plate = planPlate(ring, y, 'up');
    return {
      name: `Corner former ${i + 1}`,
      role: 'former' as const,
      profile: plate.profile,
      placement: plate.placement,
      material: 'carcass' as const,
      bandedDirections: BAND_NONE,
      grain: 'any' as const,
      note:
        `Cut to ${Math.round(plan.radius + skin)}mm radius — the finished ${Math.round(plan.radius)} ` +
        `plus ${Math.round(skin)} of skin, because the ply is on the inside of this curve. ` +
        `${Math.round(strip)}mm fixing strip each side.`,
    };
  });
};

/** The flat landing each side of the curve, never longer than the leg has to give. */
const stripWidth = (ctx: RuleContext, plan: InsideCornerPlan): Mm =>
  mm(
    Math.max(
      0,
      Math.min(
        ctx.construction.fixingStripWidth ?? 50,
        plan.frontA.x1 - plan.frontA.x0,
        plan.frontB.z1 - plan.frontB.z0,
      ),
    ),
  );

/**
 * The front: one formed piece per layer, flat along the first leg, round the fillet, flat along the
 * second. No join, because the shop's answer is that the whole front is the formed piece.
 *
 * Each layer is longer than the one inside it by exactly `ts · π/2`, which is §4.4's rule surviving
 * a change of sign — the layers stack *outward from the room* here rather than inward.
 */
const front = (ctx: RuleContext, plan: InsideCornerPlan): PartInstance[] => {
  if (plan.radius <= 0) return [];
  const lead = mm(plan.frontA.x1 - plan.frontA.x0);
  const trail = mm(plan.frontB.z1 - plan.frontB.z0);
  if (lead <= 0 || trail <= 0) return [];
  const fl = laminate(ctx);
  const layers = layerCount(ctx);
  const laminated = isLaminatedCurve(ctx.construction);

  return Array.from({ length: layers }, (_, i) => {
    // The B-face is the inside of the bend, and on a concave curve the inside is the **show** face.
    // So the show face is the B-face here where a convex wrap has it on the A-face, and the layers
    // stack away from the room rather than toward it.
    const showRadius = mm(plan.radius + fl + i * ctx.ts);
    const forming = cylindricalForming('x', showRadius, QUARTER_TURN, lead);
    const length = mm(lead + developedLength(forming, ctx.ts) + trail);
    const showZ = mm(plan.finishedFront - fl - i * ctx.ts);
    return {
      name: layers === 1 ? 'Front' : `Front layer ${i + 1}`,
      role: 'skin' as const,
      profile: rectProfile(length, ctx.H),
      // Part +X runs from the open end of the first leg, back along it, round the fillet and out
      // along the second. `w = u × v` puts the thickness away from the room, so the B-face — the
      // inside of the bend — is the face somebody sees.
      placement: placement(v3(ctx.W, mm(0), showZ), '-X', '+Y'),
      material: 'skin' as const,
      forming,
      finish: laminated && i === 0 ? ('door' as const) : undefined,
      bandedDirections: BAND_NONE,
      grain: 'any' as const,
      note:
        `Cut flat ${length.toFixed(1)} × ${ctx.H} and form to ${Math.round(showRadius)}mm on the ` +
        `show face — this curve bends the other way, so the face you see is the inside of the bend. ` +
        (laminated && i === 0 ? 'Laminate this layer in the door decor. ' : '') +
        'Check the sheet bends this way before cutting — bendy ply is sold barrel or column form.',
    };
  });
};

export const BANQUETTE_CORNER_SPEC: CabinetSpec = {
  typeId: 'banquette-corner',
  name: 'Inside banquette corner',
  capabilities: {
    cornerRadius:
      'An inside banquette corner already has a radius of its own — the fillet where its two seat ' +
      'fronts meet. Change "Inside corner radius" rather than adding an outside corner to it.',
    appliedEnds:
      'An inside banquette corner is a connector: both of its ends butt the banquettes it joins, ' +
      'so neither is exposed. Put the end panel on the banquette at the end of the run.',
    customFeatures: true,
  },
  defaultOptions: {
    formerSpacing: mm(250), skinLayers: 2, hasKick: false, hasBack: true,
    doorCount: 0, drawerCount: 0, shelfCount: 0,
    // The shop's own example: 900 along each wall, 500 deep to both, a 150 internal radius.
    seatDepth: mm(500), insideCornerRadius: mm(150),
    hasLiftUp: true, liftUpClearance: mm(2),
    seatCushionThickness: mm(80), seatCushionOverhang: mm(10), hasBackCushion: true,
    backCushionHeight: mm(400), backCushionThickness: mm(80), backCushionAngle: 0,
    cushionCornerRadius: mm(18),
  },
  carcassLift: () => mm(0),

  validate: (ctx) => {
    const problems: string[] = [];
    const plan = cornerPlanOf(ctx);
    const asked = mm(ctx.options.insideCornerRadius ?? 0);
    const seat = mm(ctx.options.seatDepth ?? 500);

    /*
     * **`width = depth = insideCornerRadius` is gone**, and its removal is the point. It made the
     * unit look like a square with a disc taken out of it, which is what both earlier readings
     * assumed and what produced a quarter disc. On the shop's description these are three separate
     * numbers — 900, 900 and 150 — and the constraint was the thing keeping them welded together.
     */
    if (seat >= Math.min(ctx.W, ctx.D)) {
      problems.push(
        `A ${Math.round(seat)}mm seat depth on a ${Math.round(ctx.W)} × ${Math.round(ctx.D)} ` +
          'corner leaves no L — the two legs fill the whole footprint, which is a rectangular seat ' +
          'rather than a corner. Make the spans longer or the seat shallower.',
      );
    }
    const most = maxInsideCornerRadius({ W: ctx.W, D: ctx.D, seatDepth: plan.finishedFront });
    if (asked > most + 0.5) {
      problems.push(
        `A ${Math.round(asked)}mm inside radius does not fit: the fillet is tangent that far along ` +
          `each leg, and the shorter leg only has ${Math.round(most)}mm of front. Built at ` +
          `${Math.round(plan.radius)}mm.`,
      );
    }
    const stripAsked = ctx.construction.fixingStripWidth ?? 50;
    if (plan.radius > 0 && stripWidth(ctx, plan) < stripAsked - 0.5) {
      problems.push(
        `A ${Math.round(plan.radius)}mm inside radius leaves only ` +
          `${Math.round(stripWidth(ctx, plan))}mm of flat front for the formers to land on, and the ` +
          `formed front is fixed to that strip — this method asks for ${stripAsked}mm.`,
      );
    }
    return problems;
  },

  parts: [
    { key: 'backs', produce: (ctx) => (ctx.options.hasBack === false ? [] : backs(ctx)) },
    { key: 'sides', produce: (ctx) => sides(ctx, cornerPlanOf(ctx)) },
    { key: 'bottom', produce: (ctx) => bottom(ctx, cornerPlanOf(ctx)) },
    { key: 'formers', produce: (ctx) => formers(ctx, cornerPlanOf(ctx)) },
    { key: 'front', produce: (ctx) => front(ctx, cornerPlanOf(ctx)) },
    { key: 'lift-up', produce: (ctx) => liftUp(ctx, cornerPlanOf(ctx)) },
  ],
};
