/**
 * Layout checks across cabinets.
 *
 * The rule engine validates each cabinet on its own; nothing there can see that two cabinets
 * are trying to occupy the same 300mm of wall. That matters because an overlap still produces
 * a perfectly plausible cutlist — the parts are all correct individually, there are just too
 * many of them for the space, and nothing would say so until the run was being fitted.
 */

import { type Mm, mm } from '../units.ts';
import type { Cabinet } from '../model/cabinet.ts';
import type { Project } from '../model/project.ts';
import { isClosedPlan, isInsideRoom } from '../model/room.ts';
import { cabinetFootprintCentre } from './wallPlacement.ts';
import { type Bounds3, boundsFromPoints, cabinetToWorld } from '../geom/placement.ts';
import { v3 } from '../geom/vec.ts';

/** Cabinets butted together share a face exactly; only a real intrusion counts. */
const TOUCH_TOLERANCE: Mm = mm(0.5);

/** World-space bounding box of a cabinet's carcass, excluding doors and kick. */
export const cabinetBounds = (cabinet: Cabinet): Bounds3 => {
  const { width: w, height: h, depth: d } = cabinet;
  const corners = [
    v3(0, 0, 0),
    v3(w, 0, 0),
    v3(0, h, 0),
    v3(w, h, 0),
    v3(0, 0, d),
    v3(w, 0, d),
    v3(0, h, d),
    v3(w, h, d),
  ].map((c) => cabinetToWorld(cabinet.placement, c));
  return boundsFromPoints(corners);
};

const overlapOn = (aMin: number, aMax: number, bMin: number, bMax: number): number =>
  Math.min(aMax, bMax) - Math.max(aMin, bMin);

/** How far two boxes intrude into each other on their least-overlapping axis. Zero if clear. */
const intrusion = (a: Bounds3, b: Bounds3): number => {
  const x = overlapOn(a.min.x, a.max.x, b.min.x, b.max.x);
  const y = overlapOn(a.min.y, a.max.y, b.min.y, b.max.y);
  const z = overlapOn(a.min.z, a.max.z, b.min.z, b.max.z);
  if (x <= TOUCH_TOLERANCE || y <= TOUCH_TOLERANCE || z <= TOUCH_TOLERANCE) return 0;
  return Math.min(x, y, z);
};

export interface LayoutIssue {
  readonly kind: 'overlap' | 'below-floor' | 'outside-room';
  readonly cabinetIds: readonly string[];
  readonly message: string;
}

export const checkLayout = (project: Project): readonly LayoutIssue[] => {
  const issues: LayoutIssue[] = [];
  const cabinets = project.cabinets;
  const bounds = new Map(cabinets.map((c) => [c.id, cabinetBounds(c)] as const));

  for (let i = 0; i < cabinets.length; i++) {
    for (let j = i + 1; j < cabinets.length; j++) {
      const a = cabinets[i]!;
      const b = cabinets[j]!;
      const depth = intrusion(bounds.get(a.id)!, bounds.get(b.id)!);
      if (depth > 0) {
        issues.push({
          kind: 'overlap',
          cabinetIds: [a.id, b.id],
          message: `${a.name} and ${b.name} overlap by ${Math.round(depth)}mm.`,
        });
      }
    }
  }

  for (const cabinet of cabinets) {
    const box = bounds.get(cabinet.id)!;
    if (box.min.y < -TOUCH_TOLERANCE) {
      issues.push({
        kind: 'below-floor',
        cabinetIds: [cabinet.id],
        message: `${cabinet.name} sits ${Math.round(-box.min.y)}mm below the floor.`,
      });
    }
  }

  /*
   * A cabinet standing outside the room.
   *
   * Only checkable once the room is a real outline — against a rectangle you could see it at
   * a glance, but on an L-shaped plan a cabinet parked in the notch looks perfectly reasonable
   * from most angles and isn't in the room at all.
   *
   * Tested at the centre of the footprint rather than at its corners: a cabinet pushed against
   * a wall has its back corners lying exactly *on* the outline, where inside-or-out is a
   * coin toss, while its centre is unambiguously in the room.
   */
  if (isClosedPlan(project.room)) {
    for (const cabinet of cabinets) {
      const centre = cabinetFootprintCentre(cabinet);
      if (!isInsideRoom(project.room, centre.x, centre.z)) {
        issues.push({
          kind: 'outside-room',
          cabinetIds: [cabinet.id],
          message: `${cabinet.name} is outside the room.`,
        });
      }
    }
  }

  return issues;
};
