/**
 * Where benchtop goes.
 *
 * Not simply "across everything". A benchtop sits on **bench-height cabinets that are
 * actually touching each other**, which means:
 *
 *   - a tall cabinet carries no benchtop — it runs past bench height to the ceiling
 *   - a wall cabinet obviously carries none
 *   - a gap between two cabinets breaks the run; benchtop does not float over fresh air
 *
 * Getting this wrong is cosmetic today, but it stops being cosmetic the moment benchtops are
 * costed or cut, so the run-finding lives in the model with the rest of the logic rather than
 * in the viewport.
 */

import { type Mm, mm } from '../units.ts';
import type { Cabinet } from '../model/cabinet.ts';
import type { Project } from '../model/project.ts';

/** Cabinets that take a benchtop. Tall and wall units do not; a custom carcass may not. */
const CARRIES_BENCHTOP = new Set(['base', 'drawer-bank']);

/** Cabinets butted together share an edge exactly; allow a whisker for rounding. */
const JOIN_TOLERANCE: Mm = mm(1);

export interface BenchtopRun {
  /** Cabinets under this length of top, left to right. */
  readonly cabinetIds: readonly string[];
  /** World X of the left-hand end. */
  readonly startX: Mm;
  readonly length: Mm;
  /** Depth of the deepest cabinet in the run, before any overhang. */
  readonly carcassDepth: Mm;
  /** World Z of the back of the run. */
  readonly backZ: Mm;
  /** Height above the floor of the top of the carcasses. */
  readonly carcassTopY: Mm;
}

const carriesBenchtop = (c: Cabinet): boolean => {
  if (!CARRIES_BENCHTOP.has(c.typeId)) return false;
  // A custom carcass at bench height would qualify, but a banquette would not — leaving
  // custom out entirely is the honest default until there's a reason to guess.
  return true;
};

/**
 * Group bench-height cabinets into runs of touching neighbours.
 *
 * Two cabinets continue the same run when they share a back line, stand at the same height,
 * and their ends meet. Anything else starts a new run.
 */
export const benchtopRuns = (project: Project): readonly BenchtopRun[] => {
  const candidates = project.cabinets
    .filter(carriesBenchtop)
    // Only axis-aligned runs for now; a rotated cabinet starts its own top.
    .slice()
    .sort((a, b) => a.placement.anchor.x - b.placement.anchor.x);

  const runs: BenchtopRun[] = [];
  let current: Cabinet[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const startX = Math.min(...current.map((c) => c.placement.anchor.x));
    const endX = Math.max(...current.map((c) => c.placement.anchor.x + c.width));
    runs.push({
      cabinetIds: current.map((c) => c.id),
      startX: mm(startX),
      length: mm(endX - startX),
      carcassDepth: mm(Math.max(...current.map((c) => c.depth))),
      backZ: mm(Math.min(...current.map((c) => c.placement.anchor.z))),
      carcassTopY: mm(Math.max(...current.map((c) => c.placement.anchor.y + c.height))),
    });
    current = [];
  };

  for (const cabinet of candidates) {
    const previous = current[current.length - 1];
    if (!previous) {
      current = [cabinet];
      continue;
    }

    const previousEnd = previous.placement.anchor.x + previous.width;
    const touching = Math.abs(cabinet.placement.anchor.x - previousEnd) <= JOIN_TOLERANCE;
    const sameBack = Math.abs(cabinet.placement.anchor.z - previous.placement.anchor.z) <= JOIN_TOLERANCE;
    const sameHeight =
      Math.abs(
        cabinet.placement.anchor.y + cabinet.height - (previous.placement.anchor.y + previous.height),
      ) <= JOIN_TOLERANCE;
    const sameAngle = cabinet.placement.yawDeg === previous.placement.yawDeg;

    if (touching && sameBack && sameHeight && sameAngle) {
      current.push(cabinet);
    } else {
      flush();
      current = [cabinet];
    }
  }
  flush();

  return runs;
};
