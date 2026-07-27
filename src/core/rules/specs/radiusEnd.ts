/**
 * Radiused end — the curved unit that finishes a run of cabinets.
 *
 * This is the second half of the radius work, and the half that needed the model to grow: an
 * **enclosed** radiused end is not a shaped part, it is an assembly. A stack of flat formers
 * with one edge on a radius makes the skeleton; bendy ply wrapped over them makes the
 * surface; the finish goes on over that.
 *
 * ## The plan shape
 *
 * The unit butts the run on its left (x = 0) and stands against the wall at its back (z = 0),
 * so its footprint is a quarter disc centred on the **back-left corner**:
 *
 * ```
 *      z = D  ┌──╮                 the run's front face carries on through here
 *             │   ╲                and turns round to the wall
 *             │    ╲
 *             │     ╲
 *       z = 0 └──────╯  x = W
 *             x = 0
 * ```
 *
 * That is the shape that makes the curve tangent to both faces it meets, so the front of the
 * run runs into it without a step and it dies into the wall rather than standing off it. It
 * also fixes the driving dimensions: the radius *is* the depth and *is* the width. A unit
 * asked for at some other width is reported rather than quietly drawn as an ellipse, which is
 * not a shape bendy ply makes.
 *
 * ## What is deliberately not here
 *
 * **No spine, and no back.** The formers fix back into the end of the last carcass in the run,
 * which is how one of these actually goes together and is why it can be a stack of plates and
 * a skin rather than a carcass in its own right. If a shop wants a spine, that is a part to
 * add here, not a rethink.
 *
 * **No door.** An enclosed radiused end is a closed feature — the point of it is the curve.
 * A curved *door* is a different problem and a much worse one.
 */

import { type Mm, mm } from '../../units.ts';
import { cylindricalForming, developedLength } from '../../model/forming.ts';
import { placement } from '../../geom/placement.ts';
import { quarterDiscProfile, rectProfile } from '../../geom/profile.ts';
import { v3 } from '../../geom/vec.ts';
import type { RuleContext } from '../context.ts';
import { BAND_NONE, type CabinetSpec, type PartInstance } from '../spec.ts';

/** A quarter turn. Both faces the curve meets are square to each other, so it is always this. */
const QUARTER = Math.PI / 2;

/** The plan radius of the curve — the outside of the finished skin. */
const outerRadius = (ctx: RuleContext): Mm => mm(ctx.options.endRadius ?? ctx.D);

/** Layers of bendy ply over the formers. */
const layerCount = (ctx: RuleContext): number => Math.max(1, Math.round(ctx.options.skinLayers ?? 2));

/**
 * The radius the **formers** are cut to: the finished face, less every layer of skin that
 * will go over them.
 *
 * Getting this wrong by one layer is the classic error — a former cut to the finished radius
 * gives a curve 3 or 6mm proud of where the run's front face is, which shows up as a step you
 * can catch a fingernail on right where everybody touches it.
 */
const formerRadius = (ctx: RuleContext): Mm => mm(outerRadius(ctx) - layerCount(ctx) * ctx.ts);

/**
 * Where the formers sit up the height.
 *
 * Top and bottom always, plus enough between them that no clear gap exceeds `formerSpacing`.
 * The gap is what decides it rather than the count, because what actually goes wrong is the
 * skin taking up a flat between two formers too far apart.
 */
const formerHeights = (ctx: RuleContext): Mm[] => {
  const spacing = Math.max(50, ctx.options.formerSpacing ?? 300);
  const span = ctx.H - ctx.t; // bottom former's underside to top former's underside
  const gaps = Math.max(1, Math.ceil(span / (spacing + ctx.t)));
  return Array.from({ length: gaps + 1 }, (_, i) => mm((span * i) / gaps));
};

const formers = (ctx: RuleContext): PartInstance[] => {
  const r = formerRadius(ctx);
  const heights = formerHeights(ctx);
  return heights.map((y, i) => ({
    name: heights.length === 1 ? 'Former' : `Former ${i + 1}`,
    role: 'former' as const,
    /*
     * A former is a horizontal plate, so its thickness has to run **up**. The thickness axis
     * is derived — `u × v` — which makes the choice of u and v the thing that decides it:
     * `+X, +Z` crosses to −Y and hangs every plate below its own line, a whole board thickness
     * out and out of the carcass at the bottom. `+Z, +X` crosses to +Y and sits them on it.
     *
     * With those axes part +X runs toward the front and part +Y runs right, so the quarter
     * disc's two straight edges land exactly on the faces that are covered: the back against
     * the wall, and the left against the run it butts.
     */
    profile: quarterDiscProfile(r),
    placement: placement(v3(0, y, 0), '+Z', '+X'),
    material: 'carcass' as const,
    // Nothing is banded: every edge of a former is either buried in the assembly or under
    // the skin.
    bandedDirections: BAND_NONE,
    grain: 'any' as const,
    note: i === 0 ? `Quarter disc, ${Math.round(r)}mm radius — cut under the skin` : undefined,
  }));
};

/**
 * The bendy ply, cut flat and bent afterwards.
 *
 * Each layer is a **different length**, and this is the whole reason the forming descriptor
 * exists. The inner layer wraps the formers; the next one wraps the inner layer, a board
 * thickness further out, and therefore has further to go. Cutting them all the same makes
 * every layer after the first come up short, and you find out with the glue on.
 *
 * The part stored is the flat rectangle — `developedLength` long by the carcass height. That
 * is what gets nested and cut. `forming` records the bend for the viewport and for nobody
 * else.
 */
const skins = (ctx: RuleContext): PartInstance[] => {
  const layers = layerCount(ctx);
  const rFormer = formerRadius(ctx);

  return Array.from({ length: layers }, (_, i) => {
    const inner = mm(rFormer + i * ctx.ts);
    const forming = cylindricalForming('x', inner, QUARTER);
    const length = developedLength(forming, ctx.ts);

    return {
      name: layers === 1 ? 'Skin' : `Skin layer ${i + 1}`,
      role: 'skin' as const,
      profile: rectProfile(length, ctx.H),
      // Laid so part +X wraps the curve and part +Y runs up the cabinet. The placement is
      // where the *flat* part starts; the viewport bends it from there.
      placement: placement(v3(0, 0, mm(inner)), '+X', '+Y'),
      material: 'skin' as const,
      bandedDirections: BAND_NONE,
      grain: 'any' as const,
      forming,
      note:
        `Cut flat ${length.toFixed(1)} × ${ctx.H} and bend to ${Math.round(inner)}mm inside radius. ` +
        'Check the sheet bends this way before cutting — bendy ply is sold barrel or column form.',
    };
  });
};

/**
 * The kick, which on one of these has to curve too.
 *
 * The shared `kickPanel` builder makes a flat board across the front of a cabinet, and across
 * the front of a quarter round that would be a chord cutting the corner off — a triangle of
 * daylight at each end and a flat where the curve should be. So the kick here is what the
 * rest of the unit is: a strip of bendy ply, bent, cut to its developed length.
 *
 * It sits `kickSetback` behind the finished face, so it turns a tighter circle than the skin
 * above it does and is a different length. One layer, because a kick is not holding a shape —
 * but it does need blocking behind it, which the note says.
 */
const curvedKick = (ctx: RuleContext): PartInstance[] => {
  if (ctx.options.hasKick === false) return [];
  const c = ctx.construction;
  const finished = mm(outerRadius(ctx) - c.kickSetback);
  const inner = mm(finished - ctx.ts);
  if (inner <= 0) return [];

  const forming = cylindricalForming('x', inner, QUARTER);
  const length = developedLength(forming, ctx.ts);
  return [
    {
      name: 'Kick',
      role: 'kick',
      profile: rectProfile(length, c.kickHeight),
      placement: placement(v3(0, mm(-c.kickHeight), mm(inner)), '+X', '+Y'),
      material: 'skin',
      bandedDirections: BAND_NONE,
      grain: 'any',
      forming,
      note:
        `Bendy ply, bent to ${Math.round(inner)}mm inside radius — set back ${c.kickSetback} ` +
        'from the face. Needs blocking behind it.',
    },
  ];
};

export const RADIUS_END_SPEC: CabinetSpec = {
  typeId: 'radius-end',
  name: 'Radiused end',
  defaultOptions: {
    formerSpacing: mm(300),
    skinLayers: 2,
    hasKick: true,
    // Nothing else applies: an enclosed end has no doors, drawers, shelves or back.
    doorCount: 0,
    drawerCount: 0,
    shelfCount: 0,
    hasBack: false,
  },

  carcassLift: (ctx) => (ctx.options.hasKick === false ? mm(0) : ctx.construction.kickHeight),

  validate: (ctx) => {
    const problems: string[] = [];
    const r = outerRadius(ctx);

    // A circle has one radius. If the width and the depth disagree with it, the shape being
    // asked for is an ellipse, and bendy ply over formers does not make one.
    if (Math.abs(ctx.W - r) > 0.5 || Math.abs(ctx.D - r) > 0.5) {
      problems.push(
        `A radiused end is a quarter circle, so its width and depth both have to equal its ` +
          `${Math.round(r)}mm radius. This one is ${ctx.W} × ${ctx.D}.`,
      );
    }

    const rFormer = formerRadius(ctx);
    if (rFormer <= 0) {
      problems.push(
        `${layerCount(ctx)} layers of ${ctx.ts}mm skin leave nothing of a ${Math.round(r)}mm radius.`,
      );
    }

    if (ctx.options.skinLayers === 1) {
      problems.push(
        'One layer of bendy ply takes up the shape of every former it crosses. Two is usual.',
      );
    }

    return problems;
  },

  parts: [
    { key: 'formers', produce: formers },
    { key: 'skin', produce: skins },
    { key: 'kick', produce: curvedKick },
  ],
};
