/**
 * Runs — stretches of cabinets that a single thing spans.
 *
 * A benchtop spans one. So does a ladder base. Neither belongs to any cabinet in it, which is the
 * whole difficulty: everything else in this codebase is owned by exactly one carcass and derived
 * from it, and these two are not.
 *
 * This module answers only the first half of that: **where the runs are**. It is a *generator*,
 * not a definition — see `model/runUnit.ts` for why the thing it produces then stops being
 * derived the moment somebody sets an overhang on it.
 *
 * ## Two purposes, one shape
 *
 * A benchtop run and a ladder-base run are found the same way and break for different reasons, so
 * the purpose is a parameter rather than two near-identical functions that drift:
 *
 *   - a **tall** cabinet carries no benchtop and stands on no shared plinth — it runs past bench
 *     height on its own
 *   - a **wall** cabinet obviously carries neither
 *   - a gap between two cabinets breaks the run, unless something is declared to be filling it
 *   - an **appliance space** is that declaration, and it answers the two questions separately:
 *     the top runs over a dishwasher, the plinth does not
 *
 * ## Runs are measured along themselves, not along X
 *
 * Once a room can be any shape, a run of cabinets can face any way, so "sort by X and see which
 * ends meet" stops being true — down the return leg of an L-shaped kitchen, cabinets that touch
 * share an X entirely. Each run is therefore measured in **its own** direction: along the
 * cabinets' shared facing, with the distance back from that line held constant. Along a wall
 * running east-west that is the X axis again and nothing changes; along the return leg it is the
 * Z axis; against a wall at some awkward angle it is that angle.
 */

import { type Mm, mm } from '../units.ts';
import type { Cabinet } from '../model/cabinet.ts';
import type { Project } from '../model/project.ts';
import { normaliseDeg } from '../model/room.ts';
import { type CabinetPlacement, yawCosSin } from '../geom/placement.ts';
import { v3 } from '../geom/vec.ts';

/** What the run is being found for. The two break in different places. */
export type RunPurpose = 'benchtop' | 'kick-base';

/** Carcasses that take a benchtop and stand on a plinth. Tall and wall units do neither. */
const BENCH_HEIGHT_TYPES = new Set(['base', 'drawer-bank']);

/** Cabinets butted together share an edge exactly; allow a whisker for rounding. */
const JOIN_TOLERANCE: Mm = mm(1);

export interface CabinetRun {
  readonly purpose: RunPurpose;
  /**
   * Cabinets under this run, in order along it — **including any appliance space it spans**. An
   * appliance is a member of the run it is bridged by, because a top over a dishwasher is one top.
   */
  readonly memberIds: readonly string[];
  /**
   * World position of the run's starting corner — the back of the carcasses at the left-hand end,
   * looking at the run from the front. For a run facing world +Z this is its minimum X and its
   * back Z, which is what it has always been.
   */
  readonly startX: Mm;
  readonly backZ: Mm;
  readonly length: Mm;
  /** Depth of the deepest member, before any overhang. */
  readonly carcassDepth: Mm;
  /**
   * The height the run's unit is built off, and the thing every member of it has to share.
   *
   * For a benchtop that is the **top** of the carcasses, which the slab lands on. For a ladder
   * base it is the **bottom** of them, which is the top of the frame. Two different datums, and
   * both are "the surface where the cabinets stop and the shared thing starts".
   */
  readonly datumY: Mm;
  /** Which way the run faces. The unit extends from its back line in this direction. */
  readonly yawDeg: number;
}

/**
 * Whether a cabinet is part of a run of this kind.
 *
 * The appliance branch is the only interesting one, and note it encodes the defaults directly
 * rather than trusting them to have been merged in: a top runs over an appliance space **unless
 * told otherwise**, and a plinth runs under one **only if told to**. Those are opposite defaults
 * on purpose — a dishwasher takes a top over it and stands on the floor.
 */
const isMember = (purpose: RunPurpose, c: Cabinet): boolean => {
  if (c.typeId === 'appliance') {
    return purpose === 'benchtop'
      ? c.options.carriesBenchtop !== false
      : c.options.standsOnKick === true;
  }
  // A custom carcass at bench height would arguably qualify, but a banquette would not — leaving
  // custom out entirely is the honest default until there's a reason to guess.
  return BENCH_HEIGHT_TYPES.has(c.typeId);
};

/** The run's own axes: along the cabinet's width, and from its back towards its front. */
export const runAxes = (yawDeg: number) => {
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

/**
 * The height this cabinet contributes to the run's datum.
 *
 * A benchtop lands on the top of the carcass; a ladder base's frame stops where the carcass
 * bottom starts. `anchor.y` is already the underside of the carcass — a base cabinet on a 150mm
 * kick is anchored at 150 — so the two are simply the two ends of the same box.
 */
const datumOf = (purpose: RunPurpose, c: Cabinet): number =>
  purpose === 'benchtop' ? c.placement.anchor.y + c.height : c.placement.anchor.y;

/**
 * Group cabinets into runs of touching neighbours.
 *
 * Two cabinets continue the same run when they face the same way, share a back line, share the
 * run's datum, and their ends meet. Anything else starts a new run.
 */
export const cabinetRuns = (project: Project, purpose: RunPurpose): readonly CabinetRun[] => {
  const candidates = project.cabinets.filter((c) => isMember(purpose, c));

  // Cabinets that could possibly share a unit — same facing, same back line, same datum.
  const groups = new Map<string, Cabinet[]>();
  for (const cabinet of candidates) {
    const key = [
      normaliseDeg(cabinet.placement.yawDeg).toFixed(3),
      backOffsetOf(cabinet).toFixed(3),
      datumOf(purpose, cabinet).toFixed(3),
    ].join('|');
    const group = groups.get(key);
    if (group) group.push(cabinet);
    else groups.set(key, [cabinet]);
  }

  const runs: CabinetRun[] = [];

  for (const group of groups.values()) {
    const ordered = group.slice().sort((a, b) => alongOf(a) - alongOf(b));
    let current: Cabinet[] = [];

    const flush = () => {
      if (current.length === 0) return;
      const first = current[0]!;
      const last = current[current.length - 1]!;
      runs.push({
        purpose,
        memberIds: current.map((c) => c.id),
        startX: mm(first.placement.anchor.x),
        backZ: mm(first.placement.anchor.z),
        length: mm(alongOf(last) + last.width - alongOf(first)),
        carcassDepth: mm(Math.max(...current.map((c) => c.depth))),
        datumY: mm(datumOf(purpose, first)),
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
      const touching =
        Math.abs(alongOf(cabinet) - (alongOf(previous) + previous.width)) <= JOIN_TOLERANCE;
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

/** Runs a benchtop could go on. */
export const benchtopRuns = (project: Project): readonly CabinetRun[] =>
  cabinetRuns(project, 'benchtop');

/** Runs a ladder base could go under. */
export const kickBaseRuns = (project: Project): readonly CabinetRun[] =>
  cabinetRuns(project, 'kick-base');

/**
 * Where a unit generated from this run stands, in the same terms a cabinet does.
 *
 * A benchtop and a ladder base each get a local frame that behaves exactly like cabinet space —
 * origin at the back-left corner of the unit, +X along the run, +Z towards the front — so the
 * transform chain, the viewport and the boring pass all keep working without learning a new kind
 * of space. See docs/coordinate-convention.md.
 */
export const runPlacement = (run: CabinetRun): CabinetPlacement => ({
  anchor: v3(run.startX, run.datumY, run.backZ),
  yawDeg: run.yawDeg,
});
