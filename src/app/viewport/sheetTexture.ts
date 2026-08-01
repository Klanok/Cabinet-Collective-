import type { ProjectNest } from '../../core/nest/nest.ts';
import type { Mm } from '../../core/units.ts';

/** The physical region of a sheet from which a panel is nested. */
export interface SheetTexturePlacement {
  readonly x: Mm;
  readonly y: Mm;
  readonly orientation: 'as-cut' | 'turned';
  readonly partLength: Mm;
  readonly sheetIndex: number;
}

/** Index the current derived nest so the 3D view uses the same sheet layout as the cut plan. */
export const sheetTexturePlacements = (
  nest: ProjectNest,
): ReadonlyMap<string, SheetTexturePlacement> => {
  const result = new Map<string, SheetTexturePlacement>();
  for (const material of nest.byMaterial) {
    const parts = new Map(material.parts.map((part) => [part.panelId, part]));
    for (const sheet of material.sheets) {
      for (const placement of sheet.placements) {
        const part = parts.get(placement.partId);
        if (!part) continue;
        result.set(placement.partId, {
          x: placement.at.x,
          y: placement.at.y,
          orientation: placement.orientation,
          partLength: part.length,
          sheetIndex: sheet.index,
        });
      }
    }
  }
  return result;
};

/** Map a point on a panel blank into its real coordinates on the nested sheet. */
export const pointOnSheet = (
  localX: number,
  localY: number,
  placement: SheetTexturePlacement,
): readonly [number, number] => {
  if (placement.orientation === 'as-cut') {
    return [placement.x + localX, placement.y + localY];
  }
  // A 90-degree clockwise turn keeps the entire part inside the rectangle reserved by the nest.
  return [placement.x + localY, placement.y + placement.partLength - localX];
};
