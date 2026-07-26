/**
 * Drawer bank — a base carcass fronted by a stack of drawer fronts instead of doors.
 *
 * Phase 1 produces the carcass and the fronts. Drawer *boxes* and runners are hardware: their
 * sizes are dictated by the runner system (Blum Legrabox/Tandembox nominal lengths, side
 * thicknesses, and the clearances each demands), so they belong with the Phase 2 hardware
 * rule sets rather than being guessed at here. Sizing a drawer box against the wrong runner
 * spec is exactly the kind of error that wastes material.
 */

import { type Mm, mm } from '../../units.ts';
import { equalDrawerFronts } from '../../model/cabinet.ts';
import type { CabinetSpec } from '../spec.ts';
import type { RuleContext } from '../context.ts';
import {
  backPanel,
  bottomPanel,
  drawerFronts,
  kickPanel,
  leftSide,
  rightSide,
  stretcher,
} from '../parts.ts';

/**
 * Front heights for the bank, bottom-first.
 *
 * Explicit heights win. Otherwise the available front height — the carcass less a reveal top
 * and bottom — is split equally between the drawers, less a gap between each.
 */
export const resolveFrontHeights = (ctx: RuleContext): Mm[] => {
  const explicit = ctx.options.drawerFrontHeights;
  if (explicit && explicit.length > 0) return [...explicit];

  const count = ctx.options.drawerCount ?? 4;
  const opening = mm(ctx.H - 2 * ctx.construction.revealTopBottom);
  return equalDrawerFronts(opening, count, ctx.construction.gapBetweenDrawers);
};

export const DRAWER_BANK_SPEC: CabinetSpec = {
  typeId: 'drawer-bank',
  name: 'Drawer bank',
  defaultOptions: {
    drawerCount: 4,
    shelfCount: 0,
    doorCount: 0,
    hasKick: true,
  },

  carcassLift: (ctx) => (ctx.options.hasKick === false ? mm(0) : ctx.construction.kickHeight),

  validate: (ctx) => {
    const problems: string[] = [];
    const heights = ctx.options.drawerFrontHeights;
    if (heights && heights.length > 0) {
      const gaps = ctx.construction.gapBetweenDrawers * (heights.length - 1);
      const used =
        heights.reduce((a, b) => a + b, 0) + gaps + 2 * ctx.construction.revealTopBottom;
      if (used > ctx.H + 0.5) {
        problems.push(
          `Drawer fronts total ${used}mm but the carcass is only ${ctx.H}mm — fronts will not fit.`,
        );
      }
    } else if ((ctx.options.drawerCount ?? 4) < 1) {
      problems.push('A drawer bank needs at least one drawer.');
    }
    if (ctx.options.doorCount) {
      problems.push('A drawer bank is fronted by drawers, not doors.');
    }
    return problems;
  },

  parts: [
    { key: 'side-left', produce: (ctx) => [leftSide(ctx)] },
    { key: 'side-right', produce: (ctx) => [rightSide(ctx)] },
    { key: 'bottom', produce: (ctx) => [bottomPanel(ctx)] },
    {
      key: 'rails',
      produce: (ctx) => [
        stretcher(ctx, 'front', 'Top rail front'),
        stretcher(ctx, 'back', 'Top rail back'),
      ],
    },
    { key: 'back', produce: (ctx) => [backPanel(ctx)] },
    { key: 'fronts', produce: (ctx) => drawerFronts(ctx, resolveFrontHeights(ctx)) },
    {
      key: 'kick',
      produce: (ctx) => (ctx.options.hasKick === false ? [] : [kickPanel(ctx)]),
    },
  ],
};
