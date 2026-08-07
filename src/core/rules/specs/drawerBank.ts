/**
 * Drawer bank — a base carcass fronted by a stack of drawer fronts instead of doors.
 *
 * The carcass and the fronts are Phase 1. The **boxes** are Phase 2, and they are sized by the
 * runner rather than by the cabinet: a MERIVOBOX bottom is `LW − 51` wide and `NL − 26` long, where
 * `LW` is the clear opening the boards leave and `NL` is one of the lengths Blum actually makes. So
 * this spec asks for boxes and `rules/drawerBox.ts` reads the runner system for the numbers —
 * which is why they waited, rather than being guessed at against a runner nobody had chosen.
 */

import { mm } from '../../units.ts';
import { MIN_DRAWER_FRONT, type DrawerFrontFit } from '../../model/cabinet.ts';
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
  resolveDrawerFronts,
  rightSide,
  stretcher,
} from '../parts.ts';

/** How many drawers a bank has when nobody has said. */
const DEFAULT_DRAWER_COUNT = 4;

/**
 * Front heights for the bank, bottom-first — explicit where they are set, an equal split where
 * they are not, and **fitted to the carcass either way**.
 *
 * It used to hand back an explicit list untouched, and that is what §5.11 was: raise one front in
 * the Inspector and the stack simply grew, so the top front finished above the top of the box —
 * on a 720mm bank, 160mm of drawer front sailing past the carcass with the carcass itself never
 * moving. It warned and built the parts anyway. Now the fit is the resolver's job, so no chain
 * that reads these heights can lay out a bank that could not be made.
 */
export const resolveFrontHeights = (ctx: RuleContext): DrawerFrontFit =>
  resolveDrawerFronts(ctx, ctx.options.drawerCount ?? DEFAULT_DRAWER_COUNT);

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
      /*
       * The fronts no longer overflow — they are fitted before anything is laid out — so what is
       * left to say is that the shop asked for more than the box had, and what it got instead.
       * The old wording, *"fronts will not fit"*, described a bank the app then went ahead and
       * built; a warning about something that has already been dealt with has to say so, or the
       * bench goes looking for a fault that is not on screen.
       */
      const fit = resolveFrontHeights(ctx);
      if (fit.short > 0.5) {
        const floor = MIN_DRAWER_FRONT * heights.length +
          ctx.construction.gapBetweenDrawers * (heights.length - 1) +
          ctx.construction.revealTop +
          ctx.construction.revealBottom;
        problems.push(
          `${heights.length} drawer fronts will not fit a ${Math.round(ctx.H)}mm carcass even at ` +
            `the ${MIN_DRAWER_FRONT}mm minimum — that needs ${Math.round(floor)}mm. Use fewer ` +
            `drawers.`,
        );
      } else if (fit.overflow > 0.5) {
        const asked = heights.reduce((a, b) => a + b, 0);
        problems.push(
          `Drawer fronts were set to ${Math.round(asked)}mm of front in a ${Math.round(ctx.H)}mm ` +
            `carcass. They have been brought back to fit — ` +
            `${fit.heights.map((h) => Math.round(h)).join(', ')}mm, bottom first.`,
        );
      }
    } else if ((ctx.options.drawerCount ?? DEFAULT_DRAWER_COUNT) < 1) {
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
    { key: 'fronts', produce: (ctx) => drawerFronts(ctx, resolveFrontHeights(ctx).heights) },
    // The same heights feed both, so a box and the front it is screwed to cannot disagree about
    // where the drawer is.
    { key: 'boxes', produce: (ctx) => drawerBoxes(ctx, resolveFrontHeights(ctx).heights) },
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
