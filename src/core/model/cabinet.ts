/**
 * A placed cabinet — the small set of driving values everything else is derived from.
 *
 * Note what a cabinet does *not* store: its panels. Parts are always regenerated from the
 * rule engine, never persisted alongside the cabinet, so a saved job can't carry stale
 * geometry from before someone changed a thickness.
 */

import type { Mm } from '../units.ts';
import type { CabinetPlacement } from '../geom/placement.ts';

/** Identifies which declarative spec builds this cabinet. */
export type CabinetTypeId = 'base' | 'wall' | 'drawer-bank' | 'tall' | 'custom';

/** Which way a door swings, described by the side its hinges are on, facing the cabinet. */
export type DoorSwing = 'left' | 'right';

/**
 * Per-cabinet options. Deliberately a flat optional record rather than a per-type union:
 * specs read the keys they care about and fall back to their own defaults, so adding an
 * option to one cabinet type doesn't ripple through the store or the UI.
 */
export interface CabinetOptions {
  /** Adjustable shelves. Fixed shelves are structural and come from the spec. */
  readonly shelfCount?: number;
  readonly doorCount?: 0 | 1 | 2;
  readonly doorSwing?: DoorSwing;
  /** Explicit drawer front heights, top to bottom. Overrides `drawerCount`'s equal split. */
  readonly drawerFrontHeights?: readonly Mm[];
  readonly drawerCount?: number;
  /** Whether this cabinet sits on its own kick. False for a run on a continuous plinth. */
  readonly hasKick?: boolean;
  /**
   * Tall cabinets only. Height above the carcass bottom where the doors break into an upper
   * and lower bank. Unset means one full-height door per column.
   */
  readonly doorSplitHeight?: Mm;

  /*
   * Custom cabinets only. These turn the fixed part list of an archetype into a choice, which
   * is what lets one spec cover a banquette base, a pigeon-hole unit and whatever the next
   * job turns out to need.
   */

  /** What closes the top: a full panel, a pair of rails, or nothing. */
  readonly topStyle?: 'panel' | 'rails' | 'open';
  /** Whether the carcass has a back at all — open shelving units often don't. */
  readonly hasBack?: boolean;
  /** Vertical dividers, evenly spaced. N dividers make N+1 bays. */
  readonly dividerCount?: number;
  /**
   * A hinged or loose top, sitting on the carcass rather than housed in it — the seat of a
   * banquette base.
   */
  readonly hasLid?: boolean;
  /** How far the lid overhangs the carcass on each exposed side. */
  readonly lidOverhang?: Mm;
}

export interface CabinetMaterials {
  /** Carcass sides, bottom, top, shelves, stretchers. */
  readonly carcass?: string;
  readonly back?: string;
  readonly door?: string;
  readonly edgeBand?: string;
}

export interface Cabinet {
  readonly id: string;
  readonly typeId: CabinetTypeId;
  /** Label shown in the UI and on the cutlist — "B1", "Sink base". */
  readonly name: string;
  readonly constructionId: string;
  /**
   * Door style for this cabinet's fronts. Unset — the usual case — follows the job default,
   * the same way an unset material does. Set it for the one cabinet in a shaker kitchen that
   * is deliberately a plain slab, or the reverse.
   */
  readonly doorStyleId?: string;

  /** Driving dimensions. Everything else in the cabinet is derived from these three. */
  readonly width: Mm;
  /** Carcass height, excluding any kick. */
  readonly height: Mm;
  /** Carcass depth, excluding doors. */
  readonly depth: Mm;

  readonly placement: CabinetPlacement;
  readonly options: CabinetOptions;
  readonly materials: CabinetMaterials;
}

export const CABINET_TYPE_LABELS: Record<CabinetTypeId, string> = {
  base: 'Base',
  wall: 'Wall',
  'drawer-bank': 'Drawer bank',
  tall: 'Tall',
  custom: 'Custom',
};

/**
 * Split a total opening into equal drawer fronts separated by a gap.
 * Any rounding remainder goes to the bottom front — the largest one, where a fraction of a
 * millimetre is least visible.
 */
export const equalDrawerFronts = (opening: Mm, count: number, gap: Mm): Mm[] => {
  if (count <= 0) return [];
  const usable = opening - gap * (count - 1);
  if (usable <= 0) {
    throw new Error(`equalDrawerFronts: ${count} fronts with ${gap}mm gaps exceed a ${opening}mm opening`);
  }
  const each = Math.floor(usable / count);
  const fronts = Array.from({ length: count }, () => each);
  // Heights are ordered bottom-first, so index 0 is the bottom drawer — normally the tallest,
  // and where a millimetre of rounding is least visible.
  fronts[0] = usable - each * (count - 1);
  return fronts;
};
