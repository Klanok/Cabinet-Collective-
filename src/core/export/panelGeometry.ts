/**
 * Putting a built panel into world space, for the drawings that project it.
 *
 * Shared by elevations and sections because they differ only in **which two axes they keep**, not
 * in how a part is found. Copying it would be the title-block mistake in geometry: two places
 * deciding where a board is, and the drawing that gets fixed is the one somebody looked at.
 */

import { type Mm } from '../units.ts';
import { v3 } from '../geom/vec.ts';
import type { Panel } from '../model/panel.ts';
import { panelExtent } from '../model/panel.ts';
import { type CabinetPlacement, partToWorld } from '../geom/placement.ts';
import { type MaterialLibrary, actualThicknessOf, findSheet } from '../model/material.ts';

/**
 * A panel's eight **solid** corners in world space — both faces, not one.
 *
 * Part space is x along the length, y across the width, z through the thickness. Taking only the
 * z = 0 face is enough for a board standing up in an elevation, because its thickness runs into
 * the page and contributes nothing to the outline. It is wrong for a board lying **flat**: a
 * benchtop's face is horizontal, so one face projects to a line and the whole 18mm band
 * disappears — which is exactly what the first elevation of the sample kitchen did.
 *
 * It matters more in section, where the thickness of every board is the thing being drawn.
 */
export const panelSolidCorners = (
  cabinetPlacement: CabinetPlacement,
  panel: Panel,
  materials: MaterialLibrary,
) => {
  const { length, width } = panelExtent(panel);
  const t: Mm = actualThicknessOf(findSheet(materials, panel.materialId));
  return [0, t].flatMap((z) =>
    [v3(0, 0, z), v3(length, 0, z), v3(length, width, z), v3(0, width, z)].map((p) =>
      partToWorld(cabinetPlacement, panel.placement, p),
    ),
  );
};
