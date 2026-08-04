/**
 * When an owned run unit no longer matches the cabinets under it.
 *
 * ## Why this exists
 *
 * `model/runUnit.ts` strikes a bargain: a benchtop is **generated once and then owned**, so moving
 * a cabinet does not move the top. That is the right trade — a top that followed the cabinets would
 * throw away the sink hole you put in it — but it has a cost, and until now nobody had paid it.
 *
 * Reported from the bench as *"the benchtop radius does not work"*. It works. The top was generated
 * before the cabinet under it was given a radius, and it stayed exactly where its owner put it,
 * which is the whole design. What was missing is that **the app said nothing**: no sign the top was
 * out of step, and no hint that Regenerate is the answer. A model that is right and silent looks
 * from the bench exactly like a model that is wrong.
 *
 * So this module is the other half of the owned-not-derived bargain. Any field that is generated
 * once and owned afterwards needs an answer to "is this still true?", and this is where that answer
 * lives.
 *
 * ## Two rules it holds to
 *
 * **It compares against exactly what the Regenerate button would produce**, by calling the same
 * `regenerateBenchtop` / `regenerateKickBase` the button calls and diffing the result. Nothing here
 * re-derives what a top *ought* to be. That is not tidiness: a second derivation would be free to
 * disagree with the first, and the failure mode is an app that reports a problem pressing the
 * button does not fix — which is worse than saying nothing, because it sends somebody looking for a
 * fault that is not there.
 *
 * **It reads to report, never to move anything.** `runUnit.ts` warns that the moment something
 * other than regenerate reads `fromCabinetIds`, moving a cabinet starts moving a benchtop again and
 * the ownership is a fiction. That warning is about *geometry*: this returns sentences, changes
 * nothing, and the top stays where its owner put it until a person presses the button. `uncoveredRuns`
 * already reads the field on the same terms.
 */

import { type Mm, mm } from '../units.ts';
import type { Benchtop } from '../model/benchtop.ts';
import type { KickBase } from '../model/kickBase.ts';
import type { RunUnit, RunUnitKind } from '../model/runUnit.ts';
import type { Project } from '../model/project.ts';
import { regenerateBenchtop, regenerateKickBase, runUnder } from './generate.ts';

/**
 * Differences below this are not a difference.
 *
 * A tenth of a millimetre is under what a saw can hold and well under what anybody can measure, so
 * lighting a warning for one would train the shop to ignore the warnings. It is deliberately far
 * *below* the smallest real change: switching a board from 16 to a measured 16.3 moves a carcass by
 * 0.6mm, and that is a genuine re-cut this has to catch.
 */
const NOTICEABLE: Mm = mm(0.05);

const differs = (a: number, b: number): boolean => Math.abs(a - b) > NOTICEABLE;

export type OutOfStepKind =
  /**
   * Nothing is left to regenerate over — every cabinet this came from has been deleted, or the
   * survivors no longer touch each other and so no longer make a run.
   *
   * **Its own kind because Regenerate does nothing here**, and an app that points at a button that
   * does nothing is the silent dead button §2 exists to prevent. The unit is not wrong; it is on
   * its own, which is a perfectly reasonable thing to be in the middle of.
   */
  | 'no-run'
  /** The run is longer or shorter than the unit was made for. */
  | 'length'
  /** The run has moved out from under the unit, or turned. */
  | 'position'
  /** The carcasses under it are a different depth. */
  | 'carcass-depth'
  /** A corner radius at the end of the run no longer matches the top's. Benchtops only. */
  | 'corners'
  /** The cabinets no longer stand at the height the frame holds them at. Ladder bases only. */
  | 'height'
  /**
   * The unit is the right size in the right place, but over different cabinets than it was made
   * over — one swapped for another of the same size.
   *
   * Worth saying even though nothing is visibly wrong: `fromCabinetIds` is how Regenerate finds the
   * run, so a membership that has quietly drained away is a `no-run` waiting to happen.
   */
  | 'membership';

export interface OutOfStep {
  readonly unitId: string;
  readonly unitKind: RunUnitKind;
  readonly unitName: string;
  readonly kind: OutOfStepKind;
  /** What is wrong, in the terms the shop would say it. Ends with a full stop. */
  readonly message: string;
  /**
   * Whether pressing Regenerate on this unit puts it right.
   *
   * False only for `no-run`. The UI reads this rather than testing the kind, so a kind added later
   * has to answer the question rather than inherit an assumption.
   */
  readonly regenerateFixesIt: boolean;
}

const round = (n: number): number => Math.round(n);

/** Same cabinets, in the same order. */
const sameMembers = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * The differences every run unit can have, whatever kind it is.
 *
 * `regenerated` in `model/runUnit.ts` carries four fields across from the fresh unit —
 * `fromCabinetIds`, `placement`, `length` and `carcassDepth` — so those four are precisely what
 * "out of step" can mean for any unit, and the two specific kinds add only what they carry on top.
 * Reading the list off that function rather than writing it out again is what keeps this honest
 * when a fifth field is added.
 */
const sharedDifferences = (
  unit: RunUnit,
  fresh: RunUnit,
  kind: RunUnitKind,
  noun: string,
): OutOfStep[] => {
  const out: OutOfStep[] = [];
  const row = (of: OutOfStepKind, message: string): OutOfStep => ({
    unitId: unit.id,
    unitKind: kind,
    unitName: unit.name,
    kind: of,
    message,
    regenerateFixesIt: true,
  });

  if (differs(unit.length, fresh.length)) {
    const longer = fresh.length > unit.length;
    out.push(
      row(
        'length',
        `The run under ${unit.name} is now ${round(fresh.length)}mm — ${round(
          Math.abs(fresh.length - unit.length),
        )}mm ${longer ? 'longer' : 'shorter'} than the ${noun} over it.`,
      ),
    );
  }

  const moved = Math.hypot(
    fresh.placement.anchor.x - unit.placement.anchor.x,
    fresh.placement.anchor.y - unit.placement.anchor.y,
    fresh.placement.anchor.z - unit.placement.anchor.z,
  );
  const turned = differs(fresh.placement.yawDeg, unit.placement.yawDeg);
  if (moved > NOTICEABLE || turned) {
    out.push(
      row(
        'position',
        turned
          ? `The cabinets under ${unit.name} have been turned; the ${noun} is still square to where they were.`
          : `The cabinets under ${unit.name} have moved ${round(moved)}mm out from under it.`,
      ),
    );
  }

  if (differs(unit.carcassDepth, fresh.carcassDepth)) {
    out.push(
      row(
        'carcass-depth',
        `The cabinets under ${unit.name} are now ${round(
          fresh.carcassDepth,
        )}mm deep; the ${noun} was made for ${round(unit.carcassDepth)}mm.`,
      ),
    );
  }

  return out;
};

/**
 * A unit whose run has gone.
 *
 * Both regenerate functions return the unit **unchanged** when `runUnder` finds nothing, and that
 * is not an oversight to work around: deleting every cabinet under a top and keeping the top is a
 * normal state to be in the middle of. What matters is that this is reported as its own thing
 * rather than as "no problem" — a top left over an empty floor is worth seeing — and as something
 * Regenerate cannot fix, because it cannot.
 */
const noRun = (unit: RunUnit, kind: RunUnitKind): OutOfStep => ({
  unitId: unit.id,
  unitKind: kind,
  unitName: unit.name,
  kind: 'no-run',
  message: `${unit.name} has no run under it any more — the cabinets it was made over have been deleted, or no longer meet each other. It stays exactly as it is, and regenerating will not move it. Delete it, or put cabinets back.`,
  regenerateFixesIt: false,
});

const membershipRow = (unit: RunUnit, kind: RunUnitKind, noun: string): OutOfStep => ({
  unitId: unit.id,
  unitKind: kind,
  unitName: unit.name,
  kind: 'membership',
  message: `${unit.name} is still the right size in the right place, but the cabinets under it are not the ones the ${noun} was made over.`,
  regenerateFixesIt: true,
});

/** Every way a top no longer matches the cabinets under it. Empty when it is in step. */
export const benchtopOutOfStep = (project: Project, top: Benchtop): readonly OutOfStep[] => {
  if (!runUnder(project, top, 'benchtop')) return [noRun(top, 'benchtop')];
  const fresh = regenerateBenchtop(project, top);

  const out = sharedDifferences(top, fresh, 'benchtop', 'top');

  /*
   * The corners, which is the one this was reported for.
   *
   * `regenerateBenchtop` carries `corners` across from the fresh unit deliberately — "put the top
   * back over them" has to mean putting the curve back over the curve — so a difference here is
   * exactly what the button will change, and saying so is the whole point of this module.
   */
  const ends: readonly ['left' | 'right', string][] = [
    ['left', 'left'],
    ['right', 'right'],
  ];
  for (const [side, label] of ends) {
    const now = fresh.corners[side];
    const had = top.corners[side];
    if (!differs(now, had)) continue;
    out.push({
      unitId: top.id,
      unitKind: 'benchtop',
      unitName: top.name,
      kind: 'corners',
      message:
        now > 0 && had > 0
          ? `The cabinet at the ${label} end of ${top.name} now has a ${round(now)}mm radius; the top's ${label} corner is cut to ${round(had)}mm.`
          : now > 0
            ? `The cabinet at the ${label} end of ${top.name} now has a ${round(now)}mm rounded corner; the top's ${label} corner is still square.`
            : `The cabinet at the ${label} end of ${top.name} is square now; the top still has a ${round(had)}mm radius on its ${label} corner.`,
      regenerateFixesIt: true,
    });
  }

  if (out.length === 0 && !sameMembers(top.fromCabinetIds, fresh.fromCabinetIds)) {
    out.push(membershipRow(top, 'benchtop', 'top'));
  }
  return out;
};

/** Every way a ladder base no longer matches the cabinets over it. Empty when it is in step. */
export const kickBaseOutOfStep = (project: Project, base: KickBase): readonly OutOfStep[] => {
  if (!runUnder(project, base, 'kick-base')) return [noRun(base, 'kick-base')];
  const fresh = regenerateKickBase(project, base);

  const out = sharedDifferences(base, fresh, 'kick-base', 'frame');

  /*
   * Height follows the run and depth does not — see `regenerateKickBase`. The frame's height is
   * not a choice: it is the gap between the floor and the underside of the carcasses, and a frame
   * that does not match it either holds the run in the air or leaves it hanging. So a difference
   * here is a fault rather than an edit, and it is the one on this unit worth being loud about.
   */
  if (differs(base.height, fresh.height)) {
    out.push({
      unitId: base.id,
      unitKind: 'kick-base',
      unitName: base.name,
      kind: 'height',
      message: `The cabinets over ${base.name} now sit ${round(
        fresh.height,
      )}mm off the floor; the frame is ${round(base.height)}mm high.`,
      regenerateFixesIt: true,
    });
  }

  if (out.length === 0 && !sameMembers(base.fromCabinetIds, fresh.fromCabinetIds)) {
    out.push(membershipRow(base, 'kick-base', 'frame'));
  }
  return out;
};

/**
 * Everything in the job that is out of step with the cabinets, in a fixed order.
 *
 * Tops before frames, and each in the order they sit on the project, so a report and the panel read
 * the same way every time.
 */
export const projectOutOfStep = (project: Project): readonly OutOfStep[] => [
  ...project.benchtops.flatMap((top) => benchtopOutOfStep(project, top)),
  ...project.kickBases.flatMap((base) => kickBaseOutOfStep(project, base)),
];
