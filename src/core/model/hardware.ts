/**
 * Hardware — runner systems, hinge systems, and the loose bits that get counted onto an order.
 *
 * This is the Phase 2 vocabulary, and it is deliberately shaped the same way materials and door
 * styles are: **data, in one place, snapshotted into a job.** A runner system decides how big a
 * drawer box is cut, so it is the same class of fact as a board thickness or a shaker border —
 * change your standard runner next year and a kitchen already quoted must still cut and price
 * as it was quoted.
 *
 * ## Why the numbers are here rather than in the rule engine
 *
 * Drawer boxes were left out of Phase 1 on purpose: their sizes are dictated by the runner, not
 * by the cabinet. `LW − 51` is not a convention somebody chose, it is what MERIVOBOX's profiles
 * and runners physically take out of the opening. So the rule engine asks the system and the
 * system answers; there is no second place where a drawer bottom's width is decided.
 *
 * ## Honesty about the figures
 *
 * Two kinds of number live on a system record, and they are flagged differently.
 *
 * `indicativePricing` means the *money* is a placeholder — the same contract
 * `SheetMaterial.indicativePricing` has, surfaced on any quote it touches.
 *
 * `unconfirmedFigures` names the *dimensions* that could not be read off the Blum catalogue when
 * this was written. It is a list of field names rather than a boolean, because "which number do I
 * check?" is the only useful form of that warning. A figure in this list still has a value and
 * still drives the geometry — it has to, or nothing can be drawn — but the app says so, and the
 * whole point of one record is that correcting it is one edit rather than a hunt.
 */

import { type Cents, type Mm, mm } from '../units.ts';

/** What a piece of hardware is, for grouping an order and for matching a feature to a part. */
export type HardwareCategory =
  | 'drawer-set'
  | 'hinge'
  | 'hinge-plate'
  | 'shelf-pin'
  | 'other';

/** How a piece of hardware is sold. A runner *pair* is one line, not two. */
export type HardwareUnit = 'each' | 'pair' | 'set';

/**
 * A loose item that gets counted onto an order — a shelf pin, a connector.
 *
 * Runners and hinges are *not* these: they carry geometry that decides how parts are cut and
 * where holes go, so they are systems with their own records below. An item is something the
 * model only ever has to count and price.
 */
export interface HardwareItem {
  readonly id: string;
  readonly brand: string;
  /** Supplier order code, where there is a real one. Omitted rather than invented. */
  readonly code?: string;
  readonly name: string;
  readonly category: HardwareCategory;
  readonly unit: HardwareUnit;
  readonly priceExGst: Cents;
  readonly indicativePricing: boolean;
  readonly note?: string;
}

// ---------------------------------------------------------------------------------------
// Drawer runners
// ---------------------------------------------------------------------------------------

/**
 * One of a runner system's box side heights.
 *
 * The profile height and the wooden back's height are two different numbers and neither derives
 * from the other: the back does not run the full height of the profile, because the bottom sits
 * up inside it. On MERIVOBOX M the profile is 91mm and the back is cut at 83mm.
 */
export interface DrawerSideHeight {
  /** Blum's letter — 'M', 'K', 'N'. What you order by. */
  readonly code: string;
  readonly name: string;
  /** Height of the steel side profile. */
  readonly height: Mm;
  /** Cut height of a wooden (16mm chipboard) back for this profile. */
  readonly woodenBackHeight: Mm;
}

/**
 * How far apart the two fixing points on a cabinet profile sit, for a given nominal length.
 *
 * Both figures are multiples of 32 — 128 is four holes on the system pitch and 256 is eight —
 * which is not a coincidence: the runner is designed to land on the same grid as everything
 * else in a frameless carcass.
 */
export interface RunnerFixingSpacing {
  /** Applies to nominal lengths up to and including this. */
  readonly maxNominalLength: Mm;
  readonly spacing: Mm;
}

export interface DrawerRunnerSystem {
  readonly id: string;
  readonly brand: string;
  readonly name: string;

  /**
   * The lengths this system is actually made in. **A drawer box is one of these or it does not
   * exist** — there is no rounding a 512mm cabinet down to a 512mm runner.
   */
  readonly nominalLengths: readonly Mm[];
  readonly sideHeights: readonly DrawerSideHeight[];

  /**
   * How much of the internal cabinet width the two runners and profiles take up.
   *
   * The drawer bottom is `LW − this`. It is the single most important number in this record: get
   * it wrong and every drawer bottom on the job is cut wrong.
   */
  readonly bottomWidthDeduction: Mm;
  /** How much shorter than the nominal length the bottom is cut. */
  readonly bottomLengthDeduction: Mm;
  /** The board thickness these deductions assume — 16mm chipboard. */
  readonly bottomNominalThickness: Mm;

  /**
   * Clearance the runner needs in front of the nominal length: `LT min = NL + this`.
   *
   * Measured on the **internal** cabinet depth — front edge of the carcass to the front face of
   * the back panel — because that is the clear run the runner has to live in.
   */
  readonly innerDepthAllowance: Mm;

  /** Distance from the cabinet's front edge to the runner's front fixing point. */
  readonly frontFixingSetback: Mm;
  readonly fixingSpacings: readonly RunnerFixingSpacing[];
  readonly fixingHoleDiameter: Mm;
  readonly fixingHoleDepth: Mm;

  /**
   * Height of the drawer box's floor above the bottom edge of the drawer front it carries.
   *
   * This one number does two jobs, and they are the same job seen from two sides: it puts the box
   * where it sits inside the cabinet, and — because the cabinet profile is fixed at the level the
   * box floor lands on — it puts the runner's fixing holes at the height they get drilled. The
   * fraction of a millimetre between the profile's fixing axis and the floor it carries is inside
   * the steel and is not a cut size.
   */
  readonly boxFloorAboveFrontBottom: Mm;

  readonly loadRatingKg: number;

  /**
   * Price of one drawer's worth of hardware — the pair of runners, the pair of sides, the back
   * brackets and the front fixings.
   *
   * A set rather than a per-part price because that is how it is bought: you order a MERIVOBOX
   * drawer at a nominal length and a height, and a box arrives.
   */
  readonly setPriceExGst: Cents;
  readonly indicativePricing: boolean;

  /** Field names whose values have not been checked against the catalogue. See the header. */
  readonly unconfirmedFigures: readonly string[];
  readonly specNote?: string;
}

export const findRunnerSystem = (
  systems: readonly DrawerRunnerSystem[],
  id: string | undefined,
): DrawerRunnerSystem | null => systems.find((s) => s.id === id) ?? null;

export const findSideHeight = (
  system: DrawerRunnerSystem,
  code: string | undefined,
): DrawerSideHeight | null => system.sideHeights.find((h) => h.code === code) ?? null;

/** Smallest internal cabinet depth this nominal length can be fitted in. */
export const minInnerDepthFor = (system: DrawerRunnerSystem, nominalLength: Mm): Mm =>
  mm(nominalLength + system.innerDepthAllowance);

/**
 * The longest runner this system makes that will go into `innerDepth`, or null if none will.
 *
 * Null is a real answer and gets reported, not thrown: a 200mm-deep carcass with drawer fronts on
 * it is a cabinet somebody is still drawing, and it has to stay visible while they fix it.
 */
export const largestRunnerFitting = (
  system: DrawerRunnerSystem,
  innerDepth: Mm,
): Mm | null => {
  const fitting = system.nominalLengths.filter((nl) => minInnerDepthFor(system, nl) <= innerDepth);
  return fitting.length === 0 ? null : mm(Math.max(...fitting));
};

/** Distance between the runner's two fixing points at this nominal length. */
export const runnerFixingSpacing = (system: DrawerRunnerSystem, nominalLength: Mm): Mm => {
  const bands = [...system.fixingSpacings].sort((a, b) => a.maxNominalLength - b.maxNominalLength);
  const band = bands.find((b) => nominalLength <= b.maxNominalLength) ?? bands[bands.length - 1];
  if (!band) throw new Error(`${system.name} declares no runner fixing spacings`);
  return band.spacing;
};

/**
 * Cut size of a drawer bottom.
 *
 * `innerWidth` is the clear width between the cabinet sides — Blum's LW — and it comes from the
 * boards that will really be cut, so a 16.3mm carcass gives a bottom 0.6mm narrower than a 16mm
 * one. That is the point: the deduction is the runner's, the opening is the board's.
 */
export const drawerBottomSize = (
  system: DrawerRunnerSystem,
  innerWidth: Mm,
  nominalLength: Mm,
): { length: Mm; width: Mm } => ({
  length: mm(innerWidth - system.bottomWidthDeduction),
  width: mm(nominalLength - system.bottomLengthDeduction),
});

/** Cut size of a wooden drawer back. Same width as the bottom; height is the profile's. */
export const drawerBackSize = (
  system: DrawerRunnerSystem,
  height: DrawerSideHeight,
  innerWidth: Mm,
): { length: Mm; width: Mm } => ({
  length: mm(innerWidth - system.bottomWidthDeduction),
  width: height.woodenBackHeight,
});

// ---------------------------------------------------------------------------------------
// Hinges
// ---------------------------------------------------------------------------------------

/** How many hinges a door of up to this height wants. */
export interface HingeCountBand {
  readonly maxDoorHeight: Mm;
  readonly hinges: number;
}

export interface HingeSystem {
  readonly id: string;
  readonly brand: string;
  readonly name: string;

  /*
   * The cup, bored into the back of the door.
   */

  readonly cupDiameter: Mm;
  readonly cupDepth: Mm;
  /**
   * Blum's drilling distance: door edge to the **near edge** of the bore, not to its centre.
   *
   * Stated the way the catalogue states it and the way a Blum jig is set, because that is the
   * number somebody will check. The centre follows — see `cupCentreFromEdge` — and is never
   * stored, so the two cannot disagree.
   */
  readonly cupDistance: Mm;
  /** Distance from the end of the door to the centre of the end hinges. */
  readonly cupEndSetback: Mm;

  /** The two dowel holes that locate the cup. */
  readonly dowelDiameter: Mm;
  readonly dowelDepth: Mm;
  /** Centre-to-centre across the pair, symmetric about the cup. */
  readonly dowelSpacing: Mm;
  /** How far the dowel line sits from the cup centre, away from the door edge. */
  readonly dowelOffset: Mm;

  /*
   * The mounting plate, screwed to the inside face of the cabinet side.
   */

  /** Distance from the side's front edge to the plate's holes. System 32's 37mm. */
  readonly plateSetback: Mm;
  /** Centre-to-centre of the plate's two holes, symmetric about the hinge axis. */
  readonly plateHoleSpacing: Mm;
  readonly plateHoleDiameter: Mm;
  readonly plateHoleDepth: Mm;

  readonly countBands: readonly HingeCountBand[];

  readonly hingePriceExGst: Cents;
  readonly platePriceExGst: Cents;
  readonly indicativePricing: boolean;

  readonly unconfirmedFigures: readonly string[];
  readonly specNote?: string;
}

export const findHingeSystem = (
  systems: readonly HingeSystem[],
  id: string | undefined,
): HingeSystem | null => systems.find((s) => s.id === id) ?? null;

/**
 * Distance from the door's hinged edge to the **centre** of the cup.
 *
 * Derived from the drilling distance and the cup's own radius rather than stored beside them,
 * for the reason `cutWidthAtDepth` derives a groove's width: two numbers for one fact can
 * disagree, and this one is 22.5mm on a 5mm drilling distance and nobody notices if it says 22.
 */
export const cupCentreFromEdge = (hinge: HingeSystem): Mm =>
  mm(hinge.cupDistance + hinge.cupDiameter / 2);

/** How many hinges this system wants on a door of that height. */
export const hingeCountForHeight = (hinge: HingeSystem, doorHeight: Mm): number => {
  const bands = [...hinge.countBands].sort((a, b) => a.maxDoorHeight - b.maxDoorHeight);
  const band = bands.find((b) => doorHeight <= b.maxDoorHeight);
  if (band) return band.hinges;
  // Above the last band, keep adding a hinge per further band's worth of height rather than
  // capping: a 2400mm door is not a 2000mm door with the same number of hinges.
  const last = bands[bands.length - 1];
  if (!last) return 2;
  return last.hinges + Math.ceil((doorHeight - last.maxDoorHeight) / 400);
};

/**
 * Where the hinge cups go along the door's length, measured from its bottom end.
 *
 * The two end hinges sit at the setback from each end and any others are spread evenly between
 * them — which is how a door is actually set out, and it means the count decides the spacing
 * rather than a spacing decided somewhere else deciding the count.
 *
 * A door too short to take two hinges at the setback gets one, in the middle. That is a real
 * case — an appliance panel or a small false front — and it must not come back as two cups on
 * top of each other.
 */
export const hingeCentres = (hinge: HingeSystem, doorHeight: Mm, count: number): Mm[] => {
  const n = Math.max(1, Math.round(count));
  const first = hinge.cupEndSetback;
  const last = mm(doorHeight - hinge.cupEndSetback);
  if (n === 1 || last <= first) return [mm(doorHeight / 2)];
  return Array.from({ length: n }, (_, i) => mm(first + ((last - first) * i) / (n - 1)));
};

/**
 * Where a hinge's two mounting-plate screws land up the side panel, measured from the panel's own
 * bottom edge.
 *
 * `frontDatumOffset` is how far the bottom of the door sits above the bottom of the carcass — the
 * bottom reveal, which is normally zero here. It has to be passed in rather than assumed, because
 * the cup is set out from the *door's* end and the holes are set out from the *panel's*, and those
 * are not the same datum on a cabinet whose doors are not flush at the bottom.
 */
export const plateHolePositions = (hinge: HingeSystem, frontDatumOffset: Mm): [Mm, Mm] => {
  const centre = frontDatumOffset + hinge.cupEndSetback;
  return [mm(centre - hinge.plateHoleSpacing / 2), mm(centre + hinge.plateHoleSpacing / 2)];
};

/**
 * Whether those two screws fall on the System 32 grid.
 *
 * Worth knowing, and not obvious. When they do, **one line-boring pass covers the shelf pins and
 * the hinge plates** — which is the whole idea behind the 32mm system and it saves a separate
 * operation on every side panel in the job. When they don't, the plates need their own two holes.
 *
 * With the usual 96mm cup setback and a 32mm pitch they land at 80 and 112, which are *not* on the
 * grid, so this comes back false on the shipped defaults. That is not a bug to fix in code — it is a
 * shop decision about a setback, and `cupSetbackForSystemGrid` says which number would do it.
 */
export const platesOnSystemGrid = (
  hinge: HingeSystem,
  systemPitch: Mm,
  frontDatumOffset: Mm,
): boolean => {
  if (systemPitch <= 0) return false;
  const [lower, upper] = plateHolePositions(hinge, frontDatumOffset);
  const onGrid = (y: Mm) => Math.abs(y / systemPitch - Math.round(y / systemPitch)) < 1e-6;
  return onGrid(lower) && onGrid(upper);
};

/**
 * The nearest cup setback that would put both plate screws on the System 32 grid.
 *
 * Rounded up rather than to the nearest, because moving a hinge *further* from the end of a door is
 * always safe and moving it closer can run it into a shelf, a rail or the edge of the panel.
 */
export const cupSetbackForSystemGrid = (
  hinge: HingeSystem,
  systemPitch: Mm,
  frontDatumOffset: Mm,
): Mm => {
  if (systemPitch <= 0) return hinge.cupEndSetback;
  const [lower] = plateHolePositions(hinge, frontDatumOffset);
  const steps = Math.ceil(lower / systemPitch - 1e-9);
  return mm(hinge.cupEndSetback + (steps * systemPitch - lower));
};

// ---------------------------------------------------------------------------------------
// The library a job carries
// ---------------------------------------------------------------------------------------

/**
 * Everything a job needs to know about hardware, snapshotted into it the way the materials and
 * the door styles are.
 */
export interface HardwareLibrary {
  readonly runnerSystems: readonly DrawerRunnerSystem[];
  readonly hingeSystems: readonly HingeSystem[];
  readonly items: readonly HardwareItem[];
}

export const findHardwareItem = (
  library: HardwareLibrary,
  id: string,
): HardwareItem | null => library.items.find((i) => i.id === id) ?? null;

/*
 * There is deliberately no `hasIndicativeHardwarePricing(library)` here, though it looks like the
 * obvious companion to `hasIndicativePricing` for materials. Costing asks the question of the
 * hardware **actually on the job** instead, off the BOM lines — the same way `byMaterial` only
 * reports boards a part is cut from. A library carrying an unpriced runner nobody used should not
 * put an indicative flag on a quote.
 */

/**
 * Every dimension in this library that has not been checked against the catalogue, in plain
 * terms, ready to put on screen.
 *
 * Surfaced rather than left in a comment for the same reason indicative pricing is: a figure
 * nobody knows is unchecked is a figure that gets trusted.
 */
export const unconfirmedHardwareFigures = (library: HardwareLibrary): readonly string[] => {
  const notes: string[] = [];
  for (const s of library.runnerSystems) {
    for (const field of s.unconfirmedFigures) {
      notes.push(`${s.brand} ${s.name}: ${field}`);
    }
  }
  for (const h of library.hingeSystems) {
    for (const field of h.unconfirmedFigures) {
      notes.push(`${h.brand} ${h.name}: ${field}`);
    }
  }
  return notes;
};
