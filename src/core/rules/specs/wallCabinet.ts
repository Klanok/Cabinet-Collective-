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
  backPanel,
  bottomPanel,
  doors,
  leftSide,
  rightSide,
  topPanel,
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
    const problems: string[] = [];
    const count = ctx.options.doorCount ?? 2;
    if (count === 2 && ctx.W < 400) {
      problems.push(`A ${ctx.W}mm cabinet is too narrow for a pair of doors — use one door.`);
    }
    if (ctx.D > 450) {
      problems.push(`Wall cabinet depth ${ctx.D}mm will foul the benchtop working area.`);
    }
    if (ctx.options.hasKick) {
      problems.push('Wall cabinets do not take a kick.');
    }
    return problems;
  },

  parts: [
    { key: 'side-left', produce: (ctx) => [leftSide(ctx)] },
    { key: 'side-right', produce: (ctx) => [rightSide(ctx)] },
    { key: 'bottom', produce: (ctx) => [bottomPanel(ctx)] },
    { key: 'top', produce: (ctx) => [topPanel(ctx)] },
    { key: 'back', produce: (ctx) => [backPanel(ctx)] },
    { key: 'shelves', produce: (ctx) => adjustableShelves(ctx, ctx.options.shelfCount ?? 2) },
    { key: 'doors', produce: (ctx) => doors(ctx, ctx.options.doorCount ?? 2) },
  ],
};
