/**
 * Custom cabinet — the same carcass everything else is built from, but with the part list
 * chosen rather than fixed.
 *
 * This is the answer to "I'll need cabinets you haven't thought of". Rather than trying to
 * predict them, the archetypes' assumptions become options:
 *
 *   topStyle      full panel, a pair of rails, or nothing
 *   hasBack       open shelving often has none
 *   dividerCount  vertical dividers — with shelves, this is a pigeon-hole grid
 *   hasLid        a seat sitting on the carcass — a banquette base
 *   doorCount / drawerCount / shelfCount
 *
 * Between them these cover the cases named so far without inventing a bespoke type for each:
 *
 *   Banquette base   no doors, no top, a lid, low height
 *   Pigeon holes     dividers + shelves, no doors, no back
 *   Open shelving    no doors, no back, plain shelves
 */

import { mm } from '../../units.ts';
import { equalDrawerFronts } from '../../model/cabinet.ts';
import type { CabinetSpec, PartInstance } from '../spec.ts';
import type { RuleContext } from '../context.ts';
import {
  appliedEndPanels,
  backPanel,
  bayShelves,
  bottomPanel,
  dividers,
  doors,
  drawerFronts,
  kickPanel,
  leftSide,
  lidPanel,
  rightSide,
  stretcher,
  topPanel,
} from '../parts.ts';

const topParts = (ctx: RuleContext): PartInstance[] => {
  switch (ctx.options.topStyle ?? 'panel') {
    case 'panel':
      return [topPanel(ctx)];
    case 'rails':
      return [
        ...stretcher(ctx, 'front', 'Top rail front'),
        ...stretcher(ctx, 'back', 'Top rail back'),
      ];
    case 'open':
      return [];
  }
};

const frontParts = (ctx: RuleContext): PartInstance[] => {
  const drawerCount = ctx.options.drawerCount ?? 0;
  if (drawerCount > 0) {
    const explicit = ctx.options.drawerFrontHeights;
    const heights =
      explicit && explicit.length > 0
        ? [...explicit]
        : equalDrawerFronts(
            mm(ctx.H - ctx.construction.revealTop - ctx.construction.revealBottom),
            drawerCount,
            ctx.construction.gapBetweenDrawers,
          );
    return drawerFronts(ctx, heights);
  }
  return doors(ctx, (ctx.options.doorCount ?? 0) as 0 | 1 | 2);
};

export const CUSTOM_CABINET_SPEC: CabinetSpec = {
  typeId: 'custom',
  name: 'Custom cabinet',
  capabilities: {
    cornerRadius:
      'A rounded corner is not built on a custom carcass — the corner would come out cut away ' +
      'with nothing wrapped round it. A base, wall, tall or banquette unit builds one.',
    appliedEnds: true,
    customFeatures: true,
  },
  defaultOptions: {
    topStyle: 'panel',
    hasBack: true,
    shelfCount: 1,
    dividerCount: 0,
    doorCount: 0,
    drawerCount: 0,
    hasLid: false,
    lidOverhang: mm(20),
    hasKick: true,
  },

  carcassLift: (ctx) => (ctx.options.hasKick === false ? mm(0) : ctx.construction.kickHeight),

  validate: (ctx) => {
    const problems: string[] = [];

    if ((ctx.options.doorCount ?? 0) > 0 && (ctx.options.drawerCount ?? 0) > 0) {
      problems.push(
        'This cabinet has both doors and drawer fronts — they would sit on top of each other. ' +
          'Use one or the other for now.',
      );
    }

    const dividerCount = ctx.options.dividerCount ?? 0;
    if (dividerCount > 0) {
      // Each divider eats its own thickness out of the interior.
      const bay = (ctx.interiorWidth - dividerCount * ctx.t) / (dividerCount + 1);
      if (bay <= 0) {
        problems.push(
          `${dividerCount} dividers leave no room in a ${ctx.W}mm cabinet.`,
        );
      } else if (bay < 100) {
        problems.push(`${dividerCount} dividers give ${Math.round(bay)}mm bays — very tight.`);
      }
    }

    if (ctx.options.hasLid && (ctx.options.doorCount ?? 0) > 0) {
      problems.push('A lid and doors on the same cabinet is unusual — check this is intended.');
    }

    if (ctx.options.topStyle === 'open' && ctx.options.hasBack === false && dividerCount === 0) {
      problems.push('With no top, no back and no dividers, this carcass has nothing bracing it.');
    }

    return problems;
  },

  parts: [
    { key: 'side-left', produce: leftSide },
    { key: 'side-right', produce: rightSide },
    { key: 'bottom', produce: (ctx) => [bottomPanel(ctx)] },
    { key: 'top', produce: topParts },
    {
      key: 'back',
      produce: (ctx) => (ctx.options.hasBack === false ? [] : backPanel(ctx)),
    },
    { key: 'dividers', produce: (ctx) => dividers(ctx, ctx.options.dividerCount ?? 0) },
    {
      key: 'shelves',
      produce: (ctx) => bayShelves(ctx, ctx.options.shelfCount ?? 0, ctx.options.dividerCount ?? 0),
    },
    { key: 'fronts', produce: frontParts },
    {
      key: 'lid',
      produce: (ctx) => (ctx.options.hasLid ? [lidPanel(ctx, ctx.options.lidOverhang ?? mm(20))] : []),
    },
    {
      key: 'kick',
      produce: (ctx) => (ctx.options.hasKick === false ? [] : kickPanel(ctx)),
    },
    {
      key: 'applied-ends',
      produce: (ctx) =>
        appliedEndPanels(ctx, { underBenchtop: false, standsOnKick: true }),
    },
  ],
};
