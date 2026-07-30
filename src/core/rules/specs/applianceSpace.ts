/**
 * An appliance space — a gap in the run that something else fills.
 *
 * **Nothing is cut for one.** It has no sides, no back and no fronts, and it is the only spec in
 * here that produces zero parts. It exists because of a problem that could not be solved any other
 * way, and the problem is worth stating plainly:
 *
 * A benchtop runs straight over an integrated dishwasher, and over a bin unit, and over most
 * under-bench appliances. It does *not* run over a fridge space. Both are a gap between two
 * cabinets of exactly the same width, in exactly the same place, and **the difference is not
 * geometric** — there is nothing measurable that tells them apart. So the run-finder was getting it
 * wrong in one direction or the other however it was written, and the only honest fix is to let
 * somebody say which it is.
 *
 * That is what this is: a placed, named, measurable space that carries the answer.
 *
 * The two answers are separate, because the two questions are:
 *
 * - `carriesBenchtop` — does the top run over it? True for a dishwasher, false for a fridge.
 * - `standsOnKick` — does the ladder base run under it? **False by default, including for the
 *   dishwasher**, because a dishwasher stands on the floor and needs the plinth to stop. A top
 *   running over a space the plinth does not is the normal case, not a contradiction.
 *
 * Nothing is charged for one either — see `costing.ts`, which bills assembly per cabinet that
 * produced parts rather than per row in the list. A hole in the run takes no assembly time.
 */

import type { CabinetSpec } from '../spec.ts';

export const APPLIANCE_SPACE_SPEC: CabinetSpec = {
  typeId: 'appliance',
  name: 'Appliance space',
  isCarcass: false,
  defaultOptions: {
    // The dishwasher case, because it is the one that was being got wrong. A fridge space is one
    // click away and the click is visible in the form.
    carriesBenchtop: true,
    standsOnKick: false,
    hasKick: false,
    doorCount: 0,
    shelfCount: 0,
  },

  // It stands on the floor and fills its stated height, so there is no kick to lift it by.
  carcassLift: () => 0,

  validate: (ctx) => {
    const problems: string[] = [];
    if (ctx.W <= 0 || ctx.H <= 0 || ctx.D <= 0) {
      problems.push('An appliance space needs a width, a height and a depth.');
    }
    if (ctx.options.doorCount) {
      problems.push(
        'An appliance space has no doors. If this needs an integrated door panel, it is a ' +
          'cabinet with the appliance in it, not a space.',
      );
    }
    return problems;
  },

  parts: [],
};
