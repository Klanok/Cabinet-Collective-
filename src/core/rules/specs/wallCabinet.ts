/**
 * Wall cabinet — frameless, full top and bottom (both faces are seen, and the carcass has to
 * carry its own load off the wall).
 *
 * Differs from a base cabinet in exactly three ways: a full top instead of rails, no kick,
 * and more shelves by default. Everything else is the same shared part builders — which is
 * the rule engine earning its keep.
 */

import { mm } from '../../units.ts';
import type { CabinetSpec } from '../spec.ts';
import {
  adjustableShelves,
  appliedEndPanels,
  backPanel,
  bottomPanel,
  carcassCornerFormers,
  doors,
  leftSide,
  pairTooNarrowProblem,
  rightSide,
  topPanel,
  wrapLayers,
} from '../parts.ts';

export const WALL_CABINET_SPEC: CabinetSpec = {
  typeId: 'wall',
  name: 'Wall cabinet',
  defaultOptions: {
    shelfCount: 2,
    doorCount: 2,
    doorSwing: 'left',
    hasKick: false,
  },

  carcassLift: () => mm(0),

  validate: (ctx) => {
    const problems: string[] = [...pairTooNarrowProblem(ctx)];
    if (ctx.D > 450) {
      problems.push(`Wall cabinet depth ${ctx.D}mm will foul the benchtop working area.`);
    }
    if (ctx.options.hasKick) {
      problems.push('Wall cabinets do not take a kick.');
    }
    return problems;
  },

  parts: [
    { key: 'side-left', produce: leftSide },
    { key: 'side-right', produce: rightSide },
    { key: 'bottom', produce: (ctx) => [bottomPanel(ctx)] },
    { key: 'top', produce: (ctx) => [topPanel(ctx)] },
    { key: 'back', produce: backPanel },
    { key: 'shelves', produce: (ctx) => adjustableShelves(ctx, ctx.options.shelfCount ?? 2) },
    { key: 'doors', produce: (ctx) => doors(ctx, ctx.options.doorCount ?? 2) },
    { key: 'formers', produce: (ctx) => carcassCornerFormers(ctx, { hasTopPanel: true }) },
    { key: 'skin', produce: (ctx) => (ctx.radius ? wrapLayers(ctx, ctx.radius) : []) },
    {
      key: 'applied-ends',
      produce: (ctx) =>
        appliedEndPanels(ctx, { underBenchtop: false, standsOnKick: false }),
    },
  ],
};
