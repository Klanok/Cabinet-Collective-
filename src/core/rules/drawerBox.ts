/**
 * Drawer boxes — the parts Phase 1 deliberately did not cut.
 *
 * A drawer box's size is not the cabinet's decision. It is the **runner's**: MERIVOBOX takes 51mm
 * of the opening for its two profiles and runners, and its bottom is cut 26mm shorter than the
 * nominal length. Those are physical facts about a product, and guessing them ahead of the
 * hardware rules is how a whole job's worth of drawer bottoms goes in the bin. So the numbers live
 * on the runner system (`model/hardware.ts`) and this file does the arithmetic once.
 *
 * What comes out is **two parts per drawer** — a bottom and a wooden back — and that is the whole
 * cutlist contribution of a Blum box. The sides are steel and are bought, not cut, which is why
 * they appear on the hardware BOM and not here. A shop cutting its own timber sides is building a
 * different drawer and would be a different builder.
 *
 * The one number that comes from the *cabinet* rather than the runner is the clear opening between
 * the sides — Blum's LW — and it comes from the boards that will really be cut. A 16.3mm carcass
 * gives a bottom 0.6mm narrower than a 16mm one, which is exactly right: the deduction belongs to
 * the runner and the opening belongs to the board.
 */

import { type Mm, mm } from '../units.ts';
import { rectProfile } from '../geom/profile.ts';
import { placement } from '../geom/placement.ts';
import { v3 } from '../geom/vec.ts';
import {
  bottomPanelAboveFrontBottom,
  drawerBackSize,
  drawerBottomSize,
} from '../model/hardware.ts';
import type { RuleContext } from './context.ts';
import { drawerRows } from './parts.ts';
import { BAND_NONE, type PartInstance } from './spec.ts';

/**
 * Where the box sits front-to-back, in cabinet space.
 *
 * The runner needs `innerDepthAllowance` of clear space in front of its nominal length, so its
 * front lands that far behind the carcass's front edge and it runs back from there. Everything
 * else is measured off the **rear** of that run: the back panel stands on it, and the bottom butts
 * the back and runs forward. So the 26mm the bottom is cut short by all ends up at the front,
 * which is where the front fixing lives and where it needs to be.
 *
 * These are *placement* figures, not cut sizes. The cut sizes are the runner's and are exact; a
 * millimetre of where the box lands inside the carcass moves nothing on the cutlist.
 */
interface BoxPosition {
  /** Cabinet-space z of the rear face of the box. */
  readonly rearZ: Mm;
  /** Cabinet-space z where the bottom panel's back edge starts, in front of the back panel. */
  readonly bottomBackZ: Mm;
}

const boxPosition = (ctx: RuleContext, nominalLength: Mm, backThickness: Mm): BoxPosition => {
  const allowance = ctx.hardware.runnerSystem.innerDepthAllowance;
  const rearZ = mm(ctx.D - allowance - nominalLength);
  return { rearZ, bottomBackZ: mm(rearZ + backThickness) };
};

/**
 * A bottom and a back for every drawer in the bank.
 *
 * Returns nothing at all when no runner fits — the fronts still come out, so the cabinet still
 * reads as a drawer bank on screen, and `hardwareProblems` says why there are no boxes. A box
 * sized to a runner that cannot be bought is worse than no box.
 */
export const drawerBoxes = (ctx: RuleContext, frontHeights: readonly Mm[]): PartInstance[] => {
  const runner = ctx.hardware.runner;
  if (runner === null || frontHeights.length === 0) return [];

  const system = runner.system;
  const bottom = drawerBottomSize(system, ctx.interiorWidth, runner.nominalLength);
  const back = drawerBackSize(system, runner.sideHeight, ctx.interiorWidth);
  if (bottom.length <= 0 || bottom.width <= 0 || back.width <= 0) return [];

  // The box is centred in the opening: the runner takes the same bite out of each side.
  const leftX = mm(ctx.t + (ctx.interiorWidth - bottom.length) / 2);
  const position = boxPosition(ctx, runner.nominalLength, ctx.t);

  const label = `${system.name} ${runner.sideHeight.code}, NL ${runner.nominalLength}`;
  const parts: PartInstance[] = [];

  for (const row of drawerRows(ctx, frontHeights)) {
    /*
     * The **underside** of the bottom panel, which is what Blum's `20` dimensions — the bottom of
     * the runner plus 20. Not the floor you look down on: that is a board thickness higher, and
     * confusing the two is a box sitting 16mm out.
     */
    const underside = mm(row.y + bottomPanelAboveFrontBottom(system));

    /*
     * The bottom lies in flat, like a shelf: part +X runs across the cabinet and part +Y runs
     * toward the back, so `v = −Z` and the origin is the front-left corner of the panel. Its
     * A-face is therefore the top — the face you look down into, and the one a base gets marked
     * on.
     */
    parts.push({
      name: 'Drawer bottom',
      role: 'drawer-bottom',
      profile: rectProfile(bottom.length, bottom.width),
      placement: placement(v3(leftX, underside, mm(position.bottomBackZ + bottom.width)), '+X', '-Z'),
      material: 'carcass',
      // Nothing is banded: every edge of a drawer bottom is captured in the profile or under the
      // back. This is one of the few parts in a kitchen with no banding at all.
      bandedDirections: BAND_NONE,
      grain: 'any',
      note: `${label} — cut LW − ${system.bottomWidthDeduction} × NL − ${system.bottomLengthDeduction}`,
    });

    /*
     * The back stands at the rear of the run, part +X across and part +Y up, so `w = +Z` and its
     * A-face looks forward into the drawer.
     */
    parts.push({
      name: 'Drawer back',
      role: 'drawer-back',
      profile: rectProfile(back.length, back.width),
      // The back stands on the same plane the bottom does.
      placement: placement(v3(leftX, underside, position.rearZ), '+X', '+Y'),
      material: 'carcass',
      bandedDirections: BAND_NONE,
      grain: 'any',
      note: `${label} — ${runner.sideHeight.name} profile takes a ${back.width}mm back`,
    });
  }

  return parts;
};
