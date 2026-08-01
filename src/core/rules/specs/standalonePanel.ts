/**
 * A single rectangular sheet part placed independently in the room.
 *
 * Width and height are its finished face dimensions. Thickness comes only from the selected
 * carcass sheet material; the cabinet depth field is retained for placement compatibility but
 * is not a manufacturing input. The first version bands all four edges, which is the safe shop
 * default for a loose visible part and can later become an explicit per-edge choice.
 */

import { rectProfile } from '../../geom/profile.ts';
import { placement } from '../../geom/placement.ts';
import { v3 } from '../../geom/vec.ts';
import type { CabinetSpec } from '../spec.ts';
import { BAND_ALL } from '../spec.ts';

export const STANDALONE_PANEL_SPEC: CabinetSpec = {
  typeId: 'panel',
  name: 'Standalone panel',
  isCarcass: false,
  defaultOptions: {
    hasKick: false,
    doorCount: 0,
    shelfCount: 0,
  },
  carcassLift: () => 0,
  validate: (ctx) => {
    const problems: string[] = [];
    if (ctx.W <= 0 || ctx.H <= 0) problems.push('A standalone panel needs a width and height.');
    return problems;
  },
  parts: [
    {
      key: 'panel',
      produce: (ctx) => [
        {
          name: 'Panel',
          role: 'panel',
          profile: rectProfile(ctx.H, ctx.W),
          // Face spans x=0..W and y=0..H; its material thickness projects toward the room (+Z).
          placement: placement(v3(ctx.W, 0, 0), '+Y', '-X'),
          material: 'carcass',
          bandedDirections: BAND_ALL,
          grain: 'length-along-grain',
          note: 'Standalone panel — grain vertical; all four edges banded',
        },
      ],
    },
  ],
};
