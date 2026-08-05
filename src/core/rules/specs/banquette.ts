/**
 * Banquette seating — an upholstered seat box with a solid front and lift-up storage.
 *
 * **This is the second version.** The first was the custom carcass with `hasLid` set, and the
 * shop rejected it: *"I would never build them as they currently come in, I would have a solid
 * front maybe with some kind of inset lift up below the cushion to access the space for long term
 * storage — the overhangs don't make sense as they default either."* Three things were wrong and
 * all three are fixed here.
 *
 *   **It had no front at all.** It built sides, a bottom, a back, a divider and a lid, so you
 *   looked straight into the carcass. It now has a solid fixed front in door decor — a
 *   `false-front`, so a door style routes it but it takes no hinges and is bored for nothing.
 *
 *   **Access was the wrong kind.** A slab sat on top of the carcass. What a banquette actually
 *   has is a panel inset into the top, hinged at the back, under a cushion that lifts off first.
 *
 *   **The overhang was incoherent.** The lid came out 20mm proud at both ends and the front,
 *   while `banquette-corner`'s lid was dead flush — so the two units this feature exists to join
 *   could not line up, and two plain banquettes side by side overlapped their lids by 40mm. There
 *   is now nothing to overhang: the lift-up is inset and the top of the carcass is one flat plane.
 *
 * The parts list is composed explicitly out of the shared carcass builders rather than spread
 * from `CUSTOM_CABINET_SPEC.parts`. Spreading cannot work here — `build.ts` runs every entry in
 * the array and uses `key` only to name the panel, so a second entry under an existing key
 * produces *both* parts rather than replacing one. The builders are still the same ones every
 * other cabinet uses, which is the property worth keeping.
 */

import { mm } from '../../units.ts';
import type { CabinetSpec } from '../spec.ts';
import type { RuleContext } from '../context.ts';
import {
  appliedEndPanels,
  backPanel,
  bayShelves,
  bottomPanel,
  carcassCornerFormers,
  dividers,
  fixedFrontPanel,
  leftSide,
  liftUpPanel,
  rightSide,
  wrapLayers,
} from '../parts.ts';

/**
 * Clear span above which the seat gets a divider whether one was asked for or not.
 *
 * From the shop: *"may introduce one internally above a span of 1200 for structural rigidity"*.
 * A seat box is a wide, shallow, lidless carcass — the top is an opening rather than a panel, so
 * there is nothing across it to stop the sides bowing or the opening racking, and somebody sits
 * on it. Measured on the **clear span** between the sides rather than the nominal width, because
 * the span is what actually deflects.
 */
export const STRUCTURAL_DIVIDER_SPAN = mm(1200);

/**
 * Never fewer dividers than the span needs, never fewer than were asked for.
 *
 * Taking the maximum rather than overriding means a shop that wants three bays in a 900 seat
 * still gets them; the rule only ever adds the one the structure requires.
 */
export const banquetteDividerCount = (ctx: RuleContext): number =>
  Math.max(ctx.options.dividerCount ?? 0, ctx.interiorWidth > STRUCTURAL_DIVIDER_SPAN ? 1 : 0);

export const BANQUETTE_SPEC: CabinetSpec = {
  typeId: 'banquette',
  name: 'Banquette seating',
  /*
   * Both of these are built, and saying so is the point.
   *
   * The corner radius was built here from the day this spec was rebuilt — `formers` and `skin`
   * are two of its part rules — but `cornerRadiusProblems` asked a hard-coded list of type ids
   * and told the user it was not. A banquette is the run of the kitchen most likely to want a
   * curve on its exposed end, because somebody walks past it and sits down beside it.
   */
  capabilities: { cornerRadius: true, appliedEnds: true, customFeatures: true, partOverrides:
      'A banquette\'s parts are not interchangeable — the front carries the lift-up\'s hinges and ' +
      'the cushion sits over the top, so deleting one leaves a seat over a hole. Build it as a ' +
      'custom cabinet if you want to choose its parts.' },
  defaultOptions: {
    // The top is an opening, closed by the lift-up rather than by a panel or rails.
    topStyle: 'open',
    hasBack: true,
    shelfCount: 0,
    // The shop does not want one. Above a 1200 clear span the structure adds it back.
    dividerCount: 0,
    doorCount: 0,
    drawerCount: 0,
    hasFixedFront: true,
    hasLiftUp: true,
    liftUpClearance: mm(2),
    // The overhanging lid is gone. `hasLid` stays available on the custom carcass for anyone
    // who genuinely wants a loose top, but a banquette is not that.
    hasLid: false,
    hasKick: false,
    seatCushionThickness: mm(80), seatCushionOverhang: mm(10), hasBackCushion: true,
    backCushionHeight: mm(400), backCushionThickness: mm(80), backCushionAngle: 0,
    cushionCornerRadius: mm(18), leftEndCushion: false, rightEndCushion: false,
  },

  carcassLift: () => mm(0),

  validate: (ctx) => {
    const problems: string[] = [];
    if (ctx.options.hasLiftUp !== false && ctx.options.topStyle === 'panel') {
      problems.push(
        'A lift-up panel and a fixed top panel both close the same opening — the storage void ' +
          'would be sealed. Use one or the other.',
      );
    }
    if (ctx.options.hasFixedFront !== false && (ctx.options.doorCount ?? 0) > 0) {
      problems.push('A fixed front and doors would sit on top of each other. Use one or the other.');
    }
    return problems;
  },

  parts: [
    { key: 'side-left', produce: leftSide },
    { key: 'side-right', produce: rightSide },
    { key: 'bottom', produce: (ctx) => [bottomPanel(ctx)] },
    { key: 'back', produce: (ctx) => (ctx.options.hasBack === false ? [] : backPanel(ctx)) },
    { key: 'dividers', produce: (ctx) => dividers(ctx, banquetteDividerCount(ctx)) },
    {
      key: 'shelves',
      produce: (ctx) => bayShelves(ctx, ctx.options.shelfCount ?? 0, banquetteDividerCount(ctx)),
    },
    {
      key: 'front',
      produce: (ctx) => (ctx.options.hasFixedFront === false ? [] : fixedFrontPanel(ctx)),
    },
    {
      key: 'lift-up',
      produce: (ctx) =>
        ctx.options.hasLiftUp === false
          ? []
          : liftUpPanel(ctx, ctx.options.liftUpClearance ?? mm(2)),
    },
    // A banquette can take the same constructed rounded corner an ordinary carcass can: the
    // bottom carries the curve, and formers support the bendy-ply wrap up to the carcass top.
    { key: 'formers', produce: (ctx) => carcassCornerFormers(ctx, { hasTopPanel: false }) },
    { key: 'skin', produce: (ctx) => (ctx.radius ? wrapLayers(ctx, ctx.radius) : []) },
    /*
     * The exposed end of a run of seating, finished in door decor like the front is.
     *
     * `underBenchtop: false` because nothing lands on top of a banquette — the top edge of the
     * panel is at seat height with a cushion beside it, which is about as seen as an edge gets.
     * `standsOnKick: true` reads the drop off the cabinet's own anchor, which on a banquette's
     * `carcassLift: () => mm(0)` is zero and costs nothing — and is still the right question to
     * ask, because a seat box put on a ladder base has to reach the floor like anything else.
     */
    {
      key: 'applied-ends',
      produce: (ctx) => appliedEndPanels(ctx, { underBenchtop: false, standsOnKick: true }),
    },
  ],
};
