/**
 * Tall cabinet — pantry, broom cupboard, oven tower.
 *
 * Full height from the kick to the top of the run. Takes a full top rather than rails,
 * because unlike a base cabinet there is no benchtop above it doing that job, and unlike a
 * wall cabinet it is deep and heavy enough to need the carcass closed at both ends.
 *
 * Doors: a tall opening is usually closed by a pair stacked one above the other rather than
 * one very long door, which would sag and be awkward to hang. `doorSplitHeight` sets where
 * the break falls, measured from the bottom of the carcass; leaving it unset gives a single
 * full-height door per column.
 */

import { type Mm, mm } from '../../units.ts';
import { rectProfile } from '../../geom/profile.ts';
import { placement } from '../../geom/placement.ts';
import { v3 } from '../../geom/vec.ts';
import type { CabinetSpec, PartInstance } from '../spec.ts';
import { BAND_ALL } from '../spec.ts';
import type { RuleContext } from '../context.ts';
import {
  adjustableShelves,
  backPanel,
  bottomPanel,
  doors,
  kickPanel,
  leftSide,
  rightSide,
  topPanel,
} from '../parts.ts';

/**
 * Doors for a tall cabinet, optionally split into an upper and lower bank.
 *
 * Each bank is sized exactly as a normal door bank is — the same reveals and the same gap
 * between a side-by-side pair — with the horizontal break between banks using the drawer gap,
 * since that is the gap that reads as a horizontal line.
 */
const tallDoors = (ctx: RuleContext): PartInstance[] => {
  const count = (ctx.options.doorCount ?? 2) as 0 | 1 | 2;
  if (count === 0) return [];

  const split = ctx.options.doorSplitHeight;
  if (!split || split <= 0 || split >= ctx.H) return doors(ctx, count);

  const c = ctx.construction;
  const rTB = c.revealTopBottom;
  const rS = c.revealSides;
  const width =
    count === 1 ? mm(ctx.W - 2 * rS) : mm((ctx.W - 2 * rS - c.gapBetweenDoors) / 2);

  // Lower bank runs from the bottom reveal up to the split; upper bank from the split to the
  // top reveal. The break itself takes a gap, half either side of the split line.
  const halfGap = c.gapBetweenDrawers / 2;
  const banks: { name: string; y: Mm; height: Mm }[] = [
    { name: 'lower', y: rTB, height: mm(split - rTB - halfGap) },
    { name: 'upper', y: mm(split + halfGap), height: mm(ctx.H - rTB - split - halfGap) },
  ];

  const parts: PartInstance[] = [];
  for (const bank of banks) {
    if (bank.height <= 0) continue;
    const label = bank.name === 'lower' ? 'Door lower' : 'Door upper';
    const make = (name: string, rightEdgeX: Mm): PartInstance => ({
      name,
      role: 'door',
      profile: rectProfile(bank.height, width),
      placement: placement(v3(rightEdgeX, bank.y, ctx.D), '+Y', '-X'),
      material: 'door',
      bandedDirections: BAND_ALL,
      grain: 'length-along-grain',
      note: 'Grain vertical',
    });
    if (count === 1) {
      parts.push(make(label, mm(rS + width)));
    } else {
      parts.push(make(`${label} L`, mm(rS + width)), make(`${label} R`, mm(ctx.W - rS)));
    }
  }
  return parts;
};

export const TALL_CABINET_SPEC: CabinetSpec = {
  typeId: 'tall',
  name: 'Tall cabinet',
  defaultOptions: {
    shelfCount: 4,
    doorCount: 2,
    doorSwing: 'left',
    hasKick: true,
  },

  carcassLift: (ctx) => (ctx.options.hasKick === false ? mm(0) : ctx.construction.kickHeight),

  validate: (ctx) => {
    const problems: string[] = [];
    const count = ctx.options.doorCount ?? 2;
    if (count === 2 && ctx.W < 400) {
      problems.push(`A ${ctx.W}mm cabinet is too narrow for a pair of doors — use one door.`);
    }
    if (ctx.H < 1200) {
      problems.push(
        `Height ${ctx.H}mm is short for a tall cabinet — a base or wall cabinet may suit better.`,
      );
    }
    const split = ctx.options.doorSplitHeight;
    if (split && (split <= ctx.construction.revealTopBottom || split >= ctx.H)) {
      problems.push(`Door split at ${split}mm falls outside the ${ctx.H}mm carcass.`);
    }
    return problems;
  },

  parts: [
    { key: 'side-left', produce: (ctx) => [leftSide(ctx)] },
    { key: 'side-right', produce: (ctx) => [rightSide(ctx)] },
    { key: 'bottom', produce: (ctx) => [bottomPanel(ctx)] },
    { key: 'top', produce: (ctx) => [topPanel(ctx)] },
    { key: 'back', produce: (ctx) => [backPanel(ctx)] },
    { key: 'shelves', produce: (ctx) => adjustableShelves(ctx, ctx.options.shelfCount ?? 4) },
    { key: 'doors', produce: tallDoors },
    {
      key: 'kick',
      produce: (ctx) => (ctx.options.hasKick === false ? [] : [kickPanel(ctx)]),
    },
  ],
};
