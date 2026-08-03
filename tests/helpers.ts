import { type Mm, mm } from '../src/core/units.ts';
import { type Panel, panelExtent } from '../src/core/model/panel.ts';
import { actualThicknessOf, findSheet } from '../src/core/model/material.ts';
import { partToCabinet } from '../src/core/geom/placement.ts';
import { v3 } from '../src/core/geom/vec.ts';
import type { Project } from '../src/core/model/project.ts';

export interface Occupancy {
  readonly x: readonly [Mm, Mm];
  readonly y: readonly [Mm, Mm];
  readonly z: readonly [Mm, Mm];
}

/**
 * The cabinet-space box a panel actually occupies.
 *
 * Part sizes alone don't catch a mirrored or misplaced panel — a left side with a right
 * side's placement is the same size and completely wrong. Asserting occupancy is what makes
 * the placement testable.
 */
export const occupies = (panel: Panel, project: Project): Occupancy => {
  const thickness = actualThicknessOf(findSheet(project.materials, panel.materialId));
  const { length, width } = panelExtent(panel);
  const corners = [
    v3(0, 0, 0),
    v3(length, 0, 0),
    v3(length, width, 0),
    v3(0, width, 0),
    v3(0, 0, thickness),
    v3(length, 0, thickness),
    v3(length, width, thickness),
    v3(0, width, thickness),
  ].map((c) => partToCabinet(panel.placement, c));

  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const axis = (get: (v: { x: number; y: number; z: number }) => number) =>
    [round(Math.min(...corners.map(get))), round(Math.max(...corners.map(get)))] as const;

  return { x: axis((v) => v.x), y: axis((v) => v.y), z: axis((v) => v.z) };
};

/** Size of a panel as `length × width`, for terse assertions. */
export const size = (panel: Panel): [Mm, Mm] => {
  const { length, width } = panelExtent(panel);
  return [length, width];
};

export const byName = (panels: readonly Panel[], name: string): Panel => {
  const found = panels.find((p) => p.name === name);
  if (!found) {
    throw new Error(`No panel named "${name}". Found: ${panels.map((p) => p.name).join(', ')}`);
  }
  return found;
};

export const namesOf = (panels: readonly Panel[]): string[] => panels.map((p) => p.name);

/**
 * Every drilled position on a panel, in part space, with a row of holes expanded.
 *
 * Used both to check individual holes and to check that none of them fall off the part — which is
 * the assertion that catches a handedness error a count never will. A mounting plate measured from
 * the wrong edge of a side panel is the same number of holes at the same diameter; it is only
 * *where* it lands that is wrong, and on a shallow part it lands outside.
 */
export const drilledPoints = (
  panel: Panel,
): { id: string; purpose: string; face: string; x: number; y: number; diameter: Mm; depth: Mm }[] => {
  const points: {
    id: string;
    purpose: string;
    face: string;
    x: number;
    y: number;
    diameter: Mm;
    depth: Mm;
  }[] = [];
  for (const f of panel.features) {
    if (f.kind === 'drill') {
      points.push({
        id: f.id,
        purpose: f.purpose,
        face: f.face,
        x: f.at.x,
        y: f.at.y,
        diameter: f.diameter,
        depth: f.depth,
      });
    } else if (f.kind === 'drill-line') {
      for (let i = 0; i < f.count; i++) {
        points.push({
          id: `${f.id}#${i + 1}`,
          purpose: f.purpose,
          face: f.face,
          x: f.start.x + f.step.x * i,
          y: f.start.y + f.step.y * i,
          diameter: f.diameter,
          depth: f.depth,
        });
      }
    }
  }
  return points;
};

/** True when every drilled position on the panel lies inside the part's own bounding box. */
export const drillingStaysOnThePart = (panel: Panel): boolean => {
  const { length, width } = panelExtent(panel);
  return drilledPoints(panel).every(
    (p) => p.x >= 0 && p.x <= length && p.y >= 0 && p.y <= width,
  );
};

/** Holes of one purpose, in the order they were emitted. */
export const drilledFor = (panel: Panel, purpose: string) =>
  drilledPoints(panel).filter((p) => p.purpose === purpose);

/**
 * The same job with no finish laminate on its curved work.
 *
 * The shipped construction method allows **1mm of finish laminate** over a bendy-ply wrap, applied
 * by hand after machining so the curve carries the same decor as the doors. That allowance moves
 * the formers and the substrate in by a millimetre, which is correct and is asserted in its own
 * tests — but it is a *second* thing happening on top of the wrap arithmetic.
 *
 * Every figure in the curved-work suites was worked out longhand for the wrap alone, and those
 * derivations are still exactly right about the wrap. Pinning the allowance to zero keeps each of
 * those tests measuring the one relationship it was written to measure, rather than measuring it
 * plus an unrelated allowance and reporting a number nobody derived. The laminate's own effect —
 * substrate in by 1mm, finished face unmoved — is asserted separately.
 */
export const withoutFinishLaminate = (project: Project): Project => ({
  ...project,
  constructions: project.constructions.map((c) => ({ ...c, finishLaminate: mm(0) })),
});
