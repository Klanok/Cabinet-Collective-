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
import type { RuleContext } from '../context.ts';
import { type CabinetSpec, type PartInstance } from '../spec.ts';
import { type CornerRadius, resolveCornerRadius } from '../radius.ts';
import {
  appliedEndPanels,
  cornerFormers,
  formerHeights,
  wrapLayers,
  wrapPart,
} from '../parts.ts';

/** The plan radius of the curve — the outside of the finished skin. */
const outerRadius = (ctx: RuleContext): Mm => mm(ctx.options.endRadius ?? ctx.D);

/** Layers of bendy ply over the formers. */
const layerCount = (ctx: RuleContext): number => Math.max(1, Math.round(ctx.options.skinLayers ?? 2));

/**
 * This unit, described as the corner radius it is.
 *
 * **The quarter-round unit is already a corner radius — the front-right one.** Its straight
 * edges land on the left face and the back, and the arc runs from (0, D) round to (W, 0), so
 * the corner actually missing is the front-right, at (W, D). A corner radius `r` there has its
 * centre at (W − r, D − r); set `r = W = D` and the centre lands on the back-left corner and
 * the shape *is* the quarter disc. So the parts come out of `rules/parts.ts` rather than out
 * of a second copy here — the fixing strip, the wrap's straight tail, the end panel and the
 * far side all fall to zero of their own accord at that radius, which is exactly the identity
 * `tests/cornerRadius.test.ts` pins.
 *
 * The width and depth passed in are the **radius**, not the cabinet's. A unit asked for at
 * some other width is an ellipse, which `validate` reports; building it as a quarter of the
 * stated radius is what it has always done, and changing that here would be a different fix.
 */
const asCorner = (ctx: RuleContext): CornerRadius => {
  const r = outerRadius(ctx);
  return resolveCornerRadius({
    corner: 'front-right',
    radius: r,
    layers: layerCount(ctx),
    W: r,
    D: r,
    t: ctx.t,
    tb: ctx.tb,
    ts: ctx.ts,
    // No doors, so no door zone and nothing for a fixing strip to divide off — the wrap is
    // the whole quarter and nothing else.
    stripWidth: mm(0),
  });
};

const formers = (ctx: RuleContext): PartInstance[] =>
  cornerFormers(ctx, asCorner(ctx), formerHeights(ctx));

const skins = (ctx: RuleContext): PartInstance[] => wrapLayers(ctx, asCorner(ctx));

/**
 * The kick, which on one of these has to curve too.
 *
 * The shared `kickPanel` builder makes a flat board across the front of a cabinet, and across
 * the front of a quarter round that would be a chord cutting the corner off — a triangle of
 * daylight at each end and a flat where the curve should be. So the kick here is what the
 * rest of the unit is: a strip of bendy ply, bent, cut to its developed length.
 *
 * It sits `kickSetback` behind the finished face — with no door on an enclosed end there is no
 * door face to measure back from, which is the one thing that differs from a kick round the
 * corner of an ordinary carcass. So it turns a tighter circle than the skin above it does and
 * is a different length. One layer, because a kick is not holding a shape — but it does need
 * blocking behind it, which the note says.
 */
const curvedKick = (ctx: RuleContext): PartInstance[] => {
  if (ctx.options.hasKick === false) return [];
  const c = ctx.construction;
  const finished = mm(outerRadius(ctx) - c.kickSetback);
  const inner = mm(finished - ctx.ts);
  if (inner <= 0) return [];

  return [
    wrapPart(ctx, asCorner(ctx), {
      name: 'Kick',
      role: 'kick',
      innerRadius: inner,
      lead: mm(0),
      trail: mm(0),
      height: c.kickHeight,
      bottomY: mm(-c.kickHeight),
      note: () =>
        `Bendy ply, bent to ${Math.round(inner)}mm inside radius — set back ${c.kickSetback} ` +
        'from the face. Needs blocking behind it.',
    }),
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

    if (asCorner(ctx).rSub <= 0) {
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
    {
      key: 'applied-ends',
      produce: (ctx) =>
        appliedEndPanels(ctx, { underBenchtop: true, standsOnKick: true }),
    },
  ],
};
