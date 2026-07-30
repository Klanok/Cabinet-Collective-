/**
 * Generating run units from runs — and regenerating them without losing what somebody set.
 *
 * This is the **generator half** of the bargain struck in `model/runUnit.ts`. `project/runs.ts`
 * finds where the runs are; this turns one into an object the job then owns. After that the run
 * finder has no further say: move a cabinet and the top stays exactly where it is, until somebody
 * asks for it to be regenerated.
 *
 * Regenerating is deliberately not automatic and never will be. "The cabinets moved, put the top
 * back over them" is a sentence a person says; a program that decides it for them is a program that
 * throws away a sink position because a cupboard got 20mm wider.
 */

import { mm } from '../units.ts';
import {
  type Benchtop,
  DEFAULT_BENCHTOP_OVERHANGS,
} from '../model/benchtop.ts';
import type { Cabinet } from '../model/cabinet.ts';
import { findConstruction } from '../model/construction.ts';
import type { KickBase } from '../model/kickBase.ts';
import type { Project } from '../model/project.ts';
import { regenerated } from '../model/runUnit.ts';
import { type CabinetRun, benchtopRuns, kickBaseRuns, runPlacement } from './runs.ts';
import { newId } from './factory.ts';

/**
 * A run already covered by a unit is one this would otherwise duplicate.
 *
 * Matched on **any** shared cabinet rather than on the whole list, and that is the tolerant answer
 * on purpose: a top over three cabinets is still that top after one of them is deleted, and
 * offering to generate a second one over the survivors would be worse than offering nothing.
 */
const isCovered = (run: CabinetRun, taken: ReadonlySet<string>): boolean =>
  run.memberIds.some((id) => taken.has(id));

const takenIds = (units: readonly { fromCabinetIds: readonly string[] }[]): Set<string> =>
  new Set(units.flatMap((u) => u.fromCabinetIds));

/* ── Benchtops ──────────────────────────────────────────────────────────────────────────── */

const benchtopFromRun = (run: CabinetRun, name: string, materialId: string): Benchtop => ({
  id: newId('top'),
  name,
  fromCabinetIds: run.memberIds,
  placement: runPlacement(run),
  length: run.length,
  carcassDepth: run.carcassDepth,
  materialId,
  overhangs: DEFAULT_BENCHTOP_OVERHANGS,
  // Both ends into a wall is the safe assumption rather than the common one: an end wrongly called
  // exposed puts a charged edge profile on a quote for an edge nobody will ever see, and an end
  // wrongly called a wall is visible in the 3D view the moment you look at it.
  ends: { left: 'wall', right: 'wall' },
  joins: [],
  cutouts: [],
});

/**
 * A benchtop for every run that hasn't got one yet.
 *
 * Existing tops are left completely alone — this adds, it never replaces. Regenerating an existing
 * top is `regenerateBenchtop`, and it is a different action because it means a different thing.
 */
export const generateBenchtops = (project: Project, materialId: string): readonly Benchtop[] => {
  const taken = takenIds(project.benchtops);
  const fresh: Benchtop[] = [];
  let n = project.benchtops.length;
  for (const run of benchtopRuns(project)) {
    if (isCovered(run, taken)) continue;
    n += 1;
    fresh.push(benchtopFromRun(run, `Top ${n}`, materialId));
  }
  return fresh;
};

/**
 * Put a top back over the cabinets it came from.
 *
 * Everything a person set survives: the material, the overhangs, the ends, the joins, the cutouts,
 * the upstand and the name. What moves is where it stands, how long it is and how deep the
 * carcasses under it are — see `regenerated`.
 *
 * Returns the top unchanged when its run has gone. That is not a failure to report: deleting every
 * cabinet under a top and keeping the top is a perfectly reasonable thing to be in the middle of
 * doing, and silently resizing it to nothing would be the unhelpful response.
 */
export const regenerateBenchtop = (project: Project, top: Benchtop): Benchtop => {
  const run = benchtopRuns(project).find((r) =>
    r.memberIds.some((id) => top.fromCabinetIds.includes(id)),
  );
  if (!run) return top;
  return regenerated(top, benchtopFromRun(run, top.name, top.materialId));
};

/* ── Ladder bases ───────────────────────────────────────────────────────────────────────── */

const kickBaseFromRun = (run: CabinetRun, name: string, setback: number): KickBase => ({
  id: newId('plinth'),
  name,
  fromCabinetIds: run.memberIds,
  placement: {
    // The frame stands on the **floor**, so its datum is not the run's — the run's datum for this
    // purpose is the underside of the carcasses, which is the *top* of the frame.
    anchor: { x: run.startX, y: 0, z: run.backZ },
    yawDeg: run.yawDeg,
  },
  length: run.length,
  carcassDepth: run.carcassDepth,
  // What was under the cabinets before there was a plinth: they are anchored at their carcass
  // bottom, so the gap to the floor is exactly that height.
  height: mm(run.datumY),
  // Set back so the face lands where a per-cabinet kick's face would, which is what stops a run
  // that mixes the two reading as a step.
  depth: mm(run.carcassDepth - setback),
  hasFace: true,
});

export interface GeneratedKickBases {
  readonly kickBases: readonly KickBase[];
  /**
   * The cabinets, with `hasKick` switched off on every member of a new frame.
   *
   * **The generator changes the cabinets, and it has to.** `CabinetOptions.hasKick` has always been
   * documented as "false for a run on a continuous plinth" — a ladder base is that plinth, and
   * leaving both switched on gives you a kick panel screwed to the front of a kick face. It is a
   * visible, deliberate consequence of asking for a plinth, which is why it comes back as data to
   * apply rather than happening somewhere out of sight.
   */
  readonly cabinets: readonly Cabinet[];
}

export const generateKickBases = (project: Project): GeneratedKickBases => {
  const construction = findConstruction(project.constructions, project.defaults.constructionId);
  const taken = takenIds(project.kickBases);
  const fresh: KickBase[] = [];
  const switchedOff = new Set<string>();
  let n = project.kickBases.length;

  for (const run of kickBaseRuns(project)) {
    if (isCovered(run, taken)) continue;
    // A run already sitting on the floor has no space under it for a frame. Skipped rather than
    // generated as a zero-height object somebody then has to delete.
    if (run.datumY <= 0) continue;
    n += 1;
    fresh.push(kickBaseFromRun(run, `Plinth ${n}`, construction.kickSetback));
    run.memberIds.forEach((id) => switchedOff.add(id));
  }

  return {
    kickBases: fresh,
    cabinets: project.cabinets.map((c) =>
      switchedOff.has(c.id) ? { ...c, options: { ...c.options, hasKick: false } } : c,
    ),
  };
};

/**
 * Put a plinth back under the cabinets it came from.
 *
 * **`height` follows the run and `depth` does not**, and the asymmetry is the point. The height of
 * the frame is not a choice — it is the gap between the floor and the underside of the carcasses,
 * and a frame that does not match it either holds the run up in the air or leaves it hanging. The
 * depth *is* a choice: it ships as the carcass depth less the kick setback and somebody may well
 * have pulled it back further to clear a skirting or a service.
 */
export const regenerateKickBase = (project: Project, base: KickBase): KickBase => {
  const construction = findConstruction(project.constructions, project.defaults.constructionId);
  const run = kickBaseRuns(project).find((r) =>
    r.memberIds.some((id) => base.fromCabinetIds.includes(id)),
  );
  if (!run) return base;
  const fresh = kickBaseFromRun(run, base.name, construction.kickSetback);
  return { ...regenerated(base, fresh), height: fresh.height };
};

/**
 * Runs with nothing on them yet — what the viewport draws as a ghost and the UI offers a button
 * for.
 *
 * The **only** thing in the app that reads `fromCabinetIds` other than regenerating, and it reads
 * it to answer "is there already one of these", which is the question that field exists for.
 */
export const uncoveredRuns = (project: Project, purpose: 'benchtop' | 'kick-base') => {
  const taken =
    purpose === 'benchtop' ? takenIds(project.benchtops) : takenIds(project.kickBases);
  const runs = purpose === 'benchtop' ? benchtopRuns(project) : kickBaseRuns(project);
  return runs.filter((run) => !isCovered(run, taken));
};
