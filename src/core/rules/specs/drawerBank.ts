/**
 * Drawer bank — a base carcass fronted by a stack of drawer fronts instead of doors.
 *
 * The carcass and the fronts are Phase 1. The **boxes** are Phase 2, and they are sized by the
 * runner rather than by the cabinet: a MERIVOBOX bottom is `LW − 51` wide and `NL − 26` long, where
 * `LW` is the clear opening the boards leave and `NL` is one of the lengths Blum actually makes. So
 * this spec asks for boxes and `rules/drawerBox.ts` reads the runner system for the numbers —
 * which is why they waited, rather than being guessed at against a runner nobody had chosen.
 */

import { type Mm, mm } from '../../units.ts';
import { equalDrawerFronts } from '../../model/cabinet.ts';
import type { CabinetSpec } from '../spec.ts';
import type { RuleContext } from '../context.ts';
import { drawerBoxes } from '../drawerBox.ts';
import {
  appliedEndPanels,
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
  const opening = mm(ctx.H - ctx.construction.revealTop - ctx.construction.revealBottom);
  return equalDrawerFronts(opening, count, ctx.construction.gapBetweenDrawers);
};

export const DRAWER_BANK_SPEC: CabinetSpec = {
  typeId: 'drawer-bank',
  name: 'Drawer bank',
  capabilities: {
    // A bank's fronts already lay out in the door zone, so the arithmetic is there — what is
    // missing is the formers and the wrap, and a corner cut with nothing round it is worse than
    // a square one. Turning this on is adding two part rules, not a rethink.
    cornerRadius:
      'A rounded corner is not built on a drawer bank yet — the corner would come out cut away ' +
      'with nothing wrapped round it. Use a base cabinet at the end of the run.',
    appliedEnds: true,
    customFeatures: true,
    partOverrides: true,
  },
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
        heights.reduce((a, b) => a + b, 0) +
        gaps +
        ctx.construction.revealTop +
        ctx.construction.revealBottom;
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
    { key: 'side-left', produce: leftSide },
    { key: 'side-right', produce: rightSide },
    { key: 'bottom', produce: (ctx) => [bottomPanel(ctx)] },
    {
      key: 'rails',
      produce: (ctx) => [
        ...stretcher(ctx, 'front', 'Top rail front'),
        ...stretcher(ctx, 'back', 'Top rail back'),
      ],
    },
    { key: 'back', produce: backPanel },
    { key: 'fronts', produce: (ctx) => drawerFronts(ctx, resolveFrontHeights(ctx)) },
    // The same heights feed both, so a box and the front it is screwed to cannot disagree about
    // where the drawer is.
    { key: 'boxes', produce: (ctx) => drawerBoxes(ctx, resolveFrontHeights(ctx)) },
    {
      key: 'kick',
      produce: (ctx) => (ctx.options.hasKick === false ? [] : kickPanel(ctx)),
    },
    {
      key: 'applied-ends',
      produce: (ctx) =>
        appliedEndPanels(ctx, { underBenchtop: true, standsOnKick: true }),
    },
  ],
};
