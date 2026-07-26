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
 *
 * ## Runs are measured along themselves, not along X
 *
 * Once a room can be any shape, a run of cabinets can face any way, so "sort by X and see
 * which ends meet" stops being true — down the return leg of an L-shaped kitchen, cabinets
 * that touch share an X entirely. Each run is therefore measured in **its own** direction:
 * along the cabinets' shared facing, with the distance back from that line held constant.
 * Along a wall running east-west that is the X axis again and nothing changes; along the
 * return leg it is the Z axis; against a wall at some awkward angle it is that angle.
 */

import { type Mm, mm } from '../units.ts';
import type { Cabinet } from '../model/cabinet.ts';
import type { Project } from '../model/project.ts';
import { normaliseDeg } from '../model/room.ts';
import { yawCosSin } from '../geom/placement.ts';

/** Cabinets that take a benchtop. Tall and wall units do not; a custom carcass may not. */
const CARRIES_BENCHTOP = new Set(['base', 'drawer-bank']);

/** Cabinets butted together share an edge exactly; allow a whisker for rounding. */
const JOIN_TOLERANCE: Mm = mm(1);

export interface BenchtopRun {
  /** Cabinets under this length of top, in order along the run. */
  readonly cabinetIds: readonly string[];
  /**
   * World position of the run's starting corner — the back of the carcasses at the left-hand
   * end, looking at the run from the front. For a run facing world +Z this is its minimum X
   * and its back Z, which is what it has always been.
   */
  readonly startX: Mm;
  readonly backZ: Mm;
  readonly length: Mm;
  /** Depth of the deepest cabinet in the run, before any overhang. */
  readonly carcassDepth: Mm;
  /** Height above the floor of the top of the carcasses. */
  readonly carcassTopY: Mm;
  /** Which way the run faces. The top extends from its back line in this direction. */
  readonly yawDeg: number;
}

const carriesBenchtop = (c: Cabinet): boolean => {
  if (!CARRIES_BENCHTOP.has(c.typeId)) return false;
  // A custom carcass at bench height would qualify, but a banquette would not — leaving
  // custom out entirely is the honest default until there's a reason to guess.
  return true;
};

/** The run's own axes: along the cabinet's width, and from its back towards its front. */
const runAxes = (yawDeg: number) => {
  const { c, s } = yawCosSin(yawDeg);
  // Cabinet +X maps to world (c, -s) and cabinet +Z to world (s, c) — see cabinetToWorld.
  return { along: { x: c, z: -s }, front: { x: s, z: c } };
};

/** Distance along the run to a cabinet's left-hand end. */
const alongOf = (cabinet: Cabinet): number => {
  const { along } = runAxes(cabinet.placement.yawDeg);
  return cabinet.placement.anchor.x * along.x + cabinet.placement.anchor.z * along.z;
};

/** How far forward of the world origin the run's back line sits. Constant within a run. */
const backOffsetOf = (cabinet: Cabinet): number => {
  const { front } = runAxes(cabinet.placement.yawDeg);
  return cabinet.placement.anchor.x * front.x + cabinet.placement.anchor.z * front.z;
};

const topYOf = (c: Cabinet): number => c.placement.anchor.y + c.height;

/**
 * Group bench-height cabinets into runs of touching neighbours.
 *
 * Two cabinets continue the same run when they face the same way, share a back line, stand at
 * the same height, and their ends meet. Anything else starts a new run.
 */
export const benchtopRuns = (project: Project): readonly BenchtopRun[] => {
  const candidates = project.cabinets.filter(carriesBenchtop);

  // Cabinets that could possibly share a top — same facing, same back line, same height.
  const groups = new Map<string, Cabinet[]>();
  for (const cabinet of candidates) {
    const key = [
      normaliseDeg(cabinet.placement.yawDeg).toFixed(3),
      backOffsetOf(cabinet).toFixed(3),
      topYOf(cabinet).toFixed(3),
    ].join('|');
    const group = groups.get(key);
    if (group) group.push(cabinet);
    else groups.set(key, [cabinet]);
  }

  const runs: BenchtopRun[] = [];

  for (const group of groups.values()) {
    const ordered = group.slice().sort((a, b) => alongOf(a) - alongOf(b));
    let current: Cabinet[] = [];

    const flush = () => {
      if (current.length === 0) return;
      const first = current[0]!;
      const last = current[current.length - 1]!;
      runs.push({
        cabinetIds: current.map((c) => c.id),
        startX: mm(first.placement.anchor.x),
        backZ: mm(first.placement.anchor.z),
        length: mm(alongOf(last) + last.width - alongOf(first)),
        carcassDepth: mm(Math.max(...current.map((c) => c.depth))),
        carcassTopY: mm(topYOf(first)),
        yawDeg: normaliseDeg(first.placement.yawDeg),
      });
      current = [];
    };

    for (const cabinet of ordered) {
      const previous = current[current.length - 1];
      if (!previous) {
        current = [cabinet];
        continue;
      }
      const touching = Math.abs(alongOf(cabinet) - (alongOf(previous) + previous.width)) <= JOIN_TOLERANCE;
      if (touching) current.push(cabinet);
      else {
        flush();
        current = [cabinet];
      }
    }
    flush();
  }

  // Deterministic order, so a report or a test reads the same way every time.
  return runs.sort((a, b) => a.startX - b.startX || a.backZ - b.backZ);
};
