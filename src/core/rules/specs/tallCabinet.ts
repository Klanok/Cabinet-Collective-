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
  appliedEndPanels,
  backPanel,
  bottomPanel,
  carcassCornerFormers,
  doorZone,
  doors,
  kickPanel,
  leftSide,
  pairTooNarrowProblem,
  rightSide,
  topPanel,
  wrapLayers,
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
  const rTop = c.revealTop;
  const rBot = c.revealBottom;
  const rS = c.revealSides;
  // The doors keep clear of the fixing strip on a radiused cabinet, so both banks are laid out
  // in the door zone rather than across the full width.
  const zone = doorZone(ctx);
  const width =
    count === 1 ? mm(zone.width - 2 * rS) : mm((zone.width - 2 * rS - c.gapBetweenDoors) / 2);
  if (width <= 0) return [];

  // Lower bank runs from the bottom reveal up to the split; upper bank from the split to the
  // top reveal. The break itself takes a gap, half either side of the split line.
  const halfGap = c.gapBetweenDrawers / 2;
  const banks: { name: string; y: Mm; height: Mm }[] = [
    { name: 'lower', y: rBot, height: mm(split - rBot - halfGap) },
    { name: 'upper', y: mm(split + halfGap), height: mm(ctx.H - rTop - split - halfGap) },
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
      parts.push(make(label, mm(zone.x0 + rS + width)));
    } else {
      parts.push(
        make(`${label} L`, mm(zone.x0 + rS + width)),
        make(`${label} R`, mm(zone.x1 - rS)),
      );
    }
  }
  return parts;
};

export const TALL_CABINET_SPEC: CabinetSpec = {
  typeId: 'tall',
  name: 'Tall cabinet',
  capabilities: { cornerRadius: true, appliedEnds: true, customFeatures: true },
  defaultOptions: {
    shelfCount: 4,
    doorCount: 2,
    doorSwing: 'left',
    hasKick: true,
  },

  carcassLift: (ctx) => (ctx.options.hasKick === false ? mm(0) : ctx.construction.kickHeight),

  validate: (ctx) => {
    const problems: string[] = [...pairTooNarrowProblem(ctx)];
    if (ctx.H < 1200) {
      problems.push(
        `Height ${ctx.H}mm is short for a tall cabinet — a base or wall cabinet may suit better.`,
      );
    }
    const split = ctx.options.doorSplitHeight;
    if (split && (split <= ctx.construction.revealBottom || split >= ctx.H)) {
      problems.push(`Door split at ${split}mm falls outside the ${ctx.H}mm carcass.`);
    }
    return problems;
  },

  parts: [
    { key: 'side-left', produce: leftSide },
    { key: 'side-right', produce: rightSide },
    { key: 'bottom', produce: (ctx) => [bottomPanel(ctx)] },
    { key: 'top', produce: (ctx) => [topPanel(ctx)] },
    { key: 'back', produce: backPanel },
    { key: 'shelves', produce: (ctx) => adjustableShelves(ctx, ctx.options.shelfCount ?? 4) },
    { key: 'doors', produce: tallDoors },
    { key: 'formers', produce: (ctx) => carcassCornerFormers(ctx, { hasTopPanel: true }) },
    { key: 'skin', produce: (ctx) => (ctx.radius ? wrapLayers(ctx, ctx.radius) : []) },
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
