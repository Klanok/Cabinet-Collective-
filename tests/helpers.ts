import { type Mm } from '../src/core/units.ts';
import { type Panel, panelExtent } from '../src/core/model/panel.ts';
import { findSheet } from '../src/core/model/material.ts';
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
  const thickness = findSheet(project.materials, panel.materialId).thickness;
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
