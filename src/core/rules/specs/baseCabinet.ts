/**
 * Base cabinet — frameless, 16mm carcass, top rails rather than a full top so a benchtop can
 * be fixed down and a sink or hob can drop in.
 *
 * Parts: two sides, a bottom, front and back rails, a back, optional adjustable shelves,
 * optional doors, and a kick.
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
  kickPanel,
  leftSide,
  pairTooNarrowProblem,
  rightSide,
  stretcher,
  wrapLayers,
} from '../parts.ts';

export const BASE_CABINET_SPEC: CabinetSpec = {
  typeId: 'base',
  name: 'Base cabinet',
  capabilities: { cornerRadius: true, appliedEnds: true, customFeatures: true },
  defaultOptions: {
    shelfCount: 1,
    doorCount: 2,
    doorSwing: 'left',
    hasKick: true,
  },

  carcassLift: (ctx) => (ctx.options.hasKick === false ? mm(0) : ctx.construction.kickHeight),

  validate: (ctx) => {
    const problems: string[] = [...pairTooNarrowProblem(ctx)];
    if (ctx.D < 300) {
      problems.push(`Base cabinet depth ${ctx.D}mm is unusually shallow (AU standard is 560mm).`);
    }
    // Two rails plus a bottom need somewhere to live.
    if (ctx.H < 2 * ctx.t + ctx.construction.stretcherWidth) {
      problems.push(`Height ${ctx.H}mm leaves no room for a bottom and top rails.`);
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
    { key: 'shelves', produce: (ctx) => adjustableShelves(ctx, ctx.options.shelfCount ?? 1) },
    { key: 'doors', produce: (ctx) => doors(ctx, ctx.options.doorCount ?? 2) },
    // A base cabinet is closed at the top by rails rather than a panel, so there is nothing up
    // there for the wrap to land on — the top former is doing that job as well as its own.
    { key: 'formers', produce: (ctx) => carcassCornerFormers(ctx, { hasTopPanel: false }) },
    { key: 'skin', produce: (ctx) => (ctx.radius ? wrapLayers(ctx, ctx.radius) : []) },
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
