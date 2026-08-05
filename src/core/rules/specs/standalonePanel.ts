/**
 * A single rectangular sheet part placed independently in the room.
 *
 * **It stands edge out**, and that is the whole shape of this file. Asked for from the bench:
 *
 * > "it faces edge out, it has to sit next to the cabinet like an applied panel"
 *
 * So its face runs **into the room**, front to back, and what you see standing in front of a run is
 * its banded edge — exactly what an applied end looks like. What runs *along* the run is the
 * board's thickness. It used to be built the other way round, lying flat along the run like a
 * splashback, which is the wrong default for the thing it is actually used as.
 *
 * The same change answers the other half of that bench report — *"a standalone panel should stand
 * perpendicular to the wall, not flat against it"* — because a panel that sits like an applied end
 * against a cabinet is, by construction, perpendicular to the wall the cabinet backs onto. **Both
 * reports are one fix**, and it is a fix to how the board is built rather than to how anything
 * snaps: there is no panel special case anywhere in the placement code.
 *
 * Height and **depth** are its finished face dimensions — depth, because that is the axis its face
 * now runs along. `createCabinet` is the one place that swap happens, so a caller still says
 * `width` and still means the panel's face width. Its `width` field is a nominal thickness
 * placeholder for the footprint; the real thickness comes only from the selected carcass sheet
 * material. It bands all four edges, which is the safe shop default for a
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
  capabilities: {
    cornerRadius:
      'A standalone panel is a single flat board, not a carcass — there is no end to wrap and ' +
      'nothing for a curve to be fixed to.',
    appliedEnds:
      'A standalone panel is the board an applied end is made of. Place a second panel rather ' +
      'than applying one to this one.',
    customFeatures: true,
    partOverrides:
      'This is one board. Deleting its only part leaves nothing — delete the panel itself.',
  },
  isCarcass: false,
  defaultOptions: {
    hasKick: false,
    doorCount: 0,
    shelfCount: 0,
  },
  carcassLift: () => 0,
  validate: (ctx) => {
    const problems: string[] = [];
    // `D` rather than `W`: the panel's face width runs into the room now. See the header.
    if (ctx.D <= 0 || ctx.H <= 0) problems.push('A standalone panel needs a width and height.');
    return problems;
  },
  parts: [
    {
      key: 'panel',
      produce: (ctx) => [
        {
          name: 'Panel',
          role: 'panel',
          profile: rectProfile(ctx.H, ctx.D),
          /*
           * Face spans z=0..D and y=0..H, with the material thickness projecting along +X — so the
           * board fills its own footprint, which `createCabinet` made a board thickness wide.
           *
           * `w = u × v` is derived, not chosen: (+Y) × (+Z) = +X. The old build was
           * (+Y) × (−X) = +Z, a face lying across the run with its thickness poking into the room.
           * That one line is the whole difference between a splashback and an applied end.
           */
          placement: placement(v3(0, 0, 0), '+Y', '+Z'),
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
