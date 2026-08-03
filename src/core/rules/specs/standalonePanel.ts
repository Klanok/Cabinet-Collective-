/**
 * A single rectangular sheet part placed independently in the room.
 *
 * Width and height are its finished face dimensions. Thickness comes only from the selected
 * carcass sheet material; the cabinet depth field is retained for placement compatibility but
 * is not a manufacturing input. It bands all four edges, which is the safe shop default for a
 * loose visible part and can later become an explicit per-edge choice.
 *
 * **Its grain is chooseable.** A loose panel is nothing but a show part, so `panel` is one of
 * `GRAIN_CHOICE_ROLES` and `options.grainDirection` turns it. It is deliberately *not* in
 * `STYLED_FRONT_ROLES`, which is a different question — that list decides what a door style
 * routes, and a filler or a scribe has no business coming out of the machine with shaker
 * grooves in it.
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
          // Vertical by default — its length runs up the part. `options.grainDirection` overrides
          // this in `build.ts`, so the note deliberately does not claim a direction: the cutlist's
          // grain column is the answer once a panel can be turned.
          grain: 'length-along-grain',
          note: 'Standalone panel — all four edges banded',
        },
      ],
    },
  ],
};
