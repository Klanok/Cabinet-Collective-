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
export type CabinetTypeId =
  | 'base'
  | 'wall'
  | 'drawer-bank'
  | 'tall'
  | 'custom'
  | 'radius-end'
  | 'banquette'
  /** One independently placed rectangular sheet part, rather than a carcass. */
  | 'panel'
  /** A gap in the run that an appliance fills. Produces no parts — see specs/applianceSpace.ts. */
  | 'appliance';

/** Which way a door swings, described by the side its hinges are on, facing the cabinet. */
export type DoorSwing = 'left' | 'right';

/** An end of a cabinet, named as you stand and look at it. */
export type CabinetEnd = 'left' | 'right';

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
   * Which ends of this cabinet get an applied end panel — a board in the door decor, laid over
   * the carcass side so what you see at the end of a run is the kitchen and not the melamine.
   *
   * **Named ends, with no default and nothing derived.** The same handedness rule `radiusCorner`
   * takes its edge for, and a worse trap here, because an applied end on the wrong side of a
   * cabinet is exactly the right part in exactly the wrong place: it is the correct size, it
   * cuts and bands identically, and it is a remake. Nothing in the model can work out which end
   * of a run is open — a cabinet does not know its neighbours — so nothing tries.
   *
   * The panel goes **outboard of the carcass**, and the cabinet's width does not change. That is
   * what "applied" means: the carcass is the carcass, and the end is laid on it. So a cabinet
   * with an end on it takes up its width plus a board in the run, which is the fact to hold on
   * to when the last cabinet meets a wall.
   */
  readonly appliedEnds?: readonly CabinetEnd[];

  /*
   * Appliance spaces only — and the whole reason the type exists. See specs/applianceSpace.ts.
   */

  /**
   * Does the benchtop run over this space? True for a dishwasher, false for a fridge.
   *
   * Deliberately not derivable. Two gaps of identical width in identical places, one of which
   * takes a top and one of which doesn't, is a fact about what goes in them.
   */
  readonly carriesBenchtop?: boolean;
  /**
   * Does the ladder base run under this space? False by default, **including for a dishwasher** —
   * it stands on the floor, so the plinth stops either side of it.
   */
  readonly standsOnKick?: boolean;
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
  readonly seatCushionThickness?: Mm;
  readonly seatCushionInset?: Mm;
  readonly hasBackCushion?: boolean;
  readonly backCushionHeight?: Mm;
  readonly backCushionThickness?: Mm;

  /*
   * Curved work.
   */

  /**
   * How far the front of a shelf bows forward at its middle — open radius shelving.
   *
   * Stated as a bow rather than as a radius because that is what gets measured: a
   * straightedge across the front and a tape to the middle. The radius follows from it and
   * the width, and is derived rather than stored.
   */
  readonly shelfBow?: Mm;

  /**
   * Which corner of an ordinary carcass is rounded, named as you stand and look at the
   * cabinet. Unset — the usual case — means a square cabinet, exactly as before.
   *
   * **There is deliberately no default**, and `carcassRadius` deliberately does nothing on its
   * own. This is the same handedness trap `bowedFrontProfile` takes its edge for: a caller
   * that guessed would put the curve against the wall, where it is the right size, occupies
   * the wrong quarter, and looks entirely correct in a test that only asserts size.
   *
   * Only the two front corners are offered. A run ends left or right and you cannot get the
   * other hand by turning a cabinet round, because that puts its back to the room; a back
   * corner rounds into the wall where nobody sees it.
   */
  readonly radiusCorner?: 'front-left' | 'front-right';
  /**
   * Plan radius of that corner, measured to the **finished** face — the outside of the skin,
   * not the formers under it. Nothing happens unless `radiusCorner` says where it goes.
   *
   * Named apart from `endRadius`, which belongs to the quarter-round unit and is required to
   * equal both the width and the depth, and apart from `DoorStyle.cornerRadius`, which is the
   * internal radius a cutter leaves in a routed pocket. Three different radii; three names.
   */
  readonly carcassRadius?: Mm;

  /*
   * Hardware. Every one of these is an override: unset follows the job's default, exactly the way
   * an unset material or door style does, so a kitchen is specified once and not per cabinet.
   */

  /** Which drawer runner system this cabinet's boxes are built on. */
  readonly runnerSystemId?: string;
  /** Which of that system's box side heights — Blum's 'M', 'K', 'N'. */
  readonly drawerSideHeightCode?: string;
  /**
   * Nominal runner length, in the system's own steps.
   *
   * Unset — the usual case — takes the **longest runner the cabinet's real inner depth will
   * hold**, which is what you want on a standard 560 carcass and is derived rather than typed.
   * Set it when a service, a waste pipe or a pull-out behind the drawer means the deepest runner
   * that fits is not the one going in. A length the system doesn't make, or one too long for the
   * cabinet, is reported rather than quietly rounded — a runner is one of a fixed list of lengths
   * or it does not exist.
   */
  readonly drawerNominalLength?: Mm;

  /** Which hinge system this cabinet's doors are bored for. */
  readonly hingeSystemId?: string;
  /**
   * Hinges per door, overriding the count the system derives from the door's height.
   *
   * The derived count goes on height alone, and weight is the other half of it — a 2000mm solid
   * door wants more than a 2000mm MDF one. So this exists, and it is per cabinet rather than per
   * door because a cabinet's doors are the same size as each other.
   */
  readonly hingeCount?: number;

  /** Radiused end only. Plan radius of the curve. Unset follows the cabinet's depth. */
  readonly endRadius?: Mm;
  /** Radiused end only. Greatest clear gap between formers before another one is added. */
  readonly formerSpacing?: Mm;
  /**
   * Radiused end only. Layers of bendy ply over the formers.
   *
   * Two is the usual answer: one layer takes up the shape of every former it crosses and you
   * can read them down the finished curve in a raking light.
   */
  readonly skinLayers?: number;
}

/** Whether this cabinet carries an applied end panel on the named end. */
export const hasAppliedEnd = (options: CabinetOptions, end: CabinetEnd): boolean =>
  (options.appliedEnds ?? []).includes(end);

/** True when both halves of a corner radius are set, which is the only way either does anything. */
export const isRadiused = (options: CabinetOptions): boolean =>
  options.radiusCorner !== undefined && (options.carcassRadius ?? 0) > 0;

/**
 * What setting a corner radius changes about the rest of the cabinet.
 *
 * **A radiused cabinet defaults to no doors and no shelves.** The common use for one of these
 * is a *decorative end*, not a cupboard — so the fronts are the exception rather than the
 * rule, and offering a cupboard by default gives you two doors squeezed into whatever the
 * curve left over.
 *
 * A default, not a rule: these sit *under* whatever the cabinet has been given, so asking for
 * a door on a radiused cabinet still gives you one, sized to the door zone.
 */
export const radiusDefaultOptions = (options: CabinetOptions): CabinetOptions =>
  isRadiused(options) ? { doorCount: 0, shelfCount: 0 } : {};

export interface CabinetMaterials {
  /** Carcass sides, bottom, top, shelves, stretchers. */
  readonly carcass?: string;
  readonly back?: string;
  readonly door?: string;
  /**
   * Bendy ply for a formed skin. A distinct slot rather than a reuse of the door board,
   * because it is a genuinely different sheet — it is bought for the direction it bends, and
   * it is the only board in a job whose thickness decides a *length* rather than a fit.
   */
  readonly skin?: string;
  readonly edgeBand?: string;
  /** Fabric selection for rendered cushions; never resolved as a sheet material. */
  readonly upholstery?: string;
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
  'radius-end': 'Radiused end',
  banquette: 'Banquette seating',
  panel: 'Standalone panel',
  appliance: 'Appliance space',
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
