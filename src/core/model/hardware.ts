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
  /**
   * Nominal lengths Blum makes this particular side profile in. Unset means every length on the
   * runner system; N is the important exception and must not be paired with a runner it cannot buy.
   */
  readonly nominalLengths?: readonly Mm[];
}

/**
 * Where the cabinet profile is screwed to the side panel, for a given nominal length.
 *
 * **Positions measured back from the front edge of the side panel** — not spacings, and not a
 * distance behind some other hole. Every figure on Blum's "Cabinet profile fixing positions" sheet
 * is dimensioned to that one datum, so this record is too, and there is no arithmetic between the
 * sheet and the drilling for anybody to get wrong.
 *
 * ## The mistake this replaces, because it is worth not repeating
 *
 * This used to be a single `spacing` per length band, 128 or 256, applied as "this far behind the
 * front fixing" — two holes per runner. Both halves were wrong.
 *
 * The 128 and 256 came off the wrong table. They were read as the runner's fixing distribution
 * because both are whole multiples of 32, and a runner landing on the same grid as everything else
 * in a frameless carcass is a tidy story. It was a story: the shop pointed out those figures relate
 * to the drawer bottom, and the profile is fixed at **four** points, not two.
 *
 * The lesson is the one this file exists for. A figure that is *plausible* is not a figure that has
 * been *read*, and the multiple-of-32 argument was plausibility dressed up as a source. Anything
 * here that has not been read off a sheet belongs in `unconfirmedFigures`, by name.
 */
export interface RunnerFixingPositions {
  /** Applies to nominal lengths up to and including this. */
  readonly maxNominalLength: Mm;
  /** Distances back from the front edge of the side panel, front-most first. */
  readonly positions: readonly Mm[];
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

  /**
   * Distance from the cabinet's front edge to the runner's front fixing point.
   *
   * Kept because the **drawer front's** own bracket is set out from it, which is a different hole in
   * a different part. The cabinet profile's own front screw is the first entry in `fixingPositions`
   * and is read from there, so the two cannot drift apart if a shop edits one.
   */
  readonly frontFixingSetback: Mm;
  /** Where the cabinet profile is screwed to the side panel, per nominal-length band. */
  readonly fixingPositions: readonly RunnerFixingPositions[];
  readonly fixingHoleDiameter: Mm;
  readonly fixingHoleDepth: Mm;

  /*
   * ── The vertical chain, all measured from the bottom of the runner ─────────────────────────
   *
   * Blum's front-installation sheet dimensions everything about a box off **the bottom of the
   * runner**, and so does this record. That is not a stylistic choice: the runner is the thing
   * screwed to the cabinet, so it is the only datum that both the drilling and the box can be
   * measured from without one of them going through the other.
   *
   * There used to be a single `boxFloorAboveFrontBottom` here doing two jobs at once and getting
   * both approximately right. It is gone, and the chain it stood in for is written out instead.
   */

  /**
   * How far above the **cabinet floor** the bottom of the runner has to sit — the install height.
   *
   * This used to be a single figure called `runnerAboveFrontBottom`, fixed at 16mm, standing for
   * the whole distance from the bottom edge of a drawer front up to the bottom of the runner. That
   * was wrong in a way worth recording, because it was wrong by being *one* number where there are
   * two, and only one of them belongs to the runner:
   *
   *   distance from the front's bottom edge to the runner
   *     = the cabinet bottom's **board thickness** + this install height
   *
   * The board thickness is the cabinet's business and the rule engine already knows it, measured
   * rather than nominal — so a 16.3mm board moves the whole bank by 0.3mm without anybody typing
   * anything. The install height is the runner's business, and it is **not always zero**: a
   * push-to-open runner needs clearance under it to travel, and a runner sitting straight on the
   * cabinet floor has none.
   *
   * Ships at zero for the ordinary screw-fixed MERIVOBOX, which is the runner resting on the base.
   * There is no standard default for the push-to-open case, which is exactly why it is a field.
   *
   * Read it through `runnerAboveFrontBottom`, never directly.
   */
  readonly runnerAboveCabinetFloor: Mm;
  /** Underside of the drawer bottom panel, above the bottom of the runner. Blum's `20`. */
  readonly bottomPanelAboveRunner: Mm;
  /**
   * Centre of the runner's own fixing screws, above the bottom of the runner.
   *
   * Blum's `min. 54*` on the space-requirement panel, read and confirmed by the shop. It used to be
   * taken as zero — the holes sat on the runner's own bottom line — which was the placeholder
   * standing in for not knowing, and 54mm out is a runner nowhere near where the box expects it.
   */
  readonly runnerFixingAboveRunnerBottom: Mm;

  /*
   * The front fixing — where the bracket screws into the back of the drawer front.
   */

  /** Screw centre above the bottom of the runner. Blum's `33.5`. */
  readonly frontFixingAboveRunner: Mm;
  /** A second screw this far above the first. Blum's `32`. */
  readonly frontFixingRowSpacing: Mm;
  /**
   * Screw centre measured in from the **outer face of the cabinet side**.
   *
   * Blum writes this as `20.5 + FA`, measured from the edge of the front, where FA is the front
   * overlay. Stated from the cabinet instead, because that is the datum that does not need to know
   * what the reveal is: how far the front's own edge then is from the screw falls out of the front's
   * placement, the same way every other hole here does. A shop that widens its side reveal moves the
   * front and the screw stays where the bracket is.
   */
  readonly frontFixingFromCabinetSide: Mm;
  /** Pilot bore for a screw-on front. The EXPANDO variant takes a Ø8 dowel and is not modelled. */
  readonly frontFixingPilotDiameter: Mm;
  readonly frontFixingPilotDepth: Mm;
  /**
   * Add this to the front fixing height when the cabinet profile is fitted before the cabinet is
   * assembled — Blum's `*` footnote, which is +1mm. Not applied automatically: nothing in the model
   * knows the order a shop assembles in.
   */
  readonly preAssembledProfileAllowance: Mm;

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

/**
 * Where this runner is screwed to the side panel, back from its front edge.
 *
 * A short runner is drilled differently from a long one, which is why the set steps between length
 * bands rather than scaling. Sorted front-most first so the drilling comes out in the order somebody
 * would work along the panel.
 */
export const runnerFixingPositions = (
  system: DrawerRunnerSystem,
  nominalLength: Mm,
): readonly Mm[] => {
  const bands = [...system.fixingPositions].sort((a, b) => a.maxNominalLength - b.maxNominalLength);
  const band = bands.find((b) => nominalLength <= b.maxNominalLength) ?? bands[bands.length - 1];
  if (!band) throw new Error(`${system.name} declares no cabinet profile fixing positions`);
  return [...band.positions].sort((a, b) => a - b);
};

/**
 * Bring a stored runner system's fixing data forward to positions.
 *
 * A saved job carries its own copy of the hardware library, so the old shape — a single `spacing`
 * per length band, applied as "this far behind the front fixing" — is on disk and has to be
 * converted rather than assumed away.
 *
 * Two different jobs, deliberately:
 *
 * - **A system whose id matches one in the shipped library** is given the shipped positions. Its
 *   old figures came off the wrong table and produced two holes where there are four; carrying
 *   them forward faithfully would be preserving a known error, which is the one thing a migration
 *   must not do when the shop has told us the number is wrong.
 * - **A system a shop added themselves** keeps exactly what it had, restated in the new shape as
 *   two positions — the front setback and that far behind it. We have no sheet for their runner
 *   and no business giving it Blum's pattern.
 *
 * Either way this **moves drilling**, and `migrateV15toV16` says so rather than implying otherwise.
 */
export const withProfileFixingPositions = (
  system: Record<string, unknown>,
  shipped: readonly DrawerRunnerSystem[],
): Record<string, unknown> => {
  if (Array.isArray(system.fixingPositions)) return system;
  const { fixingSpacings, ...rest } = system;

  const known = shipped.find((s) => s.id === system.id);
  if (known) return { ...rest, fixingPositions: known.fixingPositions };

  const setback = typeof system.frontFixingSetback === 'number' ? system.frontFixingSetback : 37;
  const bands = Array.isArray(fixingSpacings) ? (fixingSpacings as Record<string, unknown>[]) : [];
  return {
    ...rest,
    fixingPositions: bands.map((b) => ({
      maxNominalLength: b.maxNominalLength,
      positions: [mm(setback), mm(setback + Number(b.spacing ?? 0))],
    })),
  };
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

/**
 * How far above the bottom edge of its drawer front the bottom of the runner sits.
 *
 * The link that ties the hardware to the cabinet, and the only one in the chain that Blum's sheet
 * cannot state — because half of it is a fact about the *carcass*, not about the runner.
 *
 * On the bottom drawer of a bank the runner goes as low as it will go: onto the cabinet floor, plus
 * whatever install height the runner itself needs. The front is flush with the carcass bottom, so it
 * starts a board thickness below that floor. The drawers above keep the same relationship to their
 * own fronts, so the bank reads straight.
 *
 * `carcassThickness` is the board that will really be cut, not the nominal — see `BuildThicknesses`.
 * That is the whole reason this is a function taking an argument rather than a number sitting on the
 * runner record, which is what it used to be: a runner does not know what the cabinet is made of,
 * and a shop that moves to 18mm board must not have to re-type a hardware figure to suit.
 */
export const runnerAboveFrontBottom = (
  system: DrawerRunnerSystem,
  carcassThickness: Mm,
): Mm => mm(carcassThickness + system.runnerAboveCabinetFloor);

/**
 * Height of the **underside** of the drawer bottom panel above the bottom edge of its front.
 *
 * Links of the chain applied in the order Blum's sheet states them, and the reason it is a function
 * rather than a field is that a field would be a third place claiming to know a sum of numbers
 * already here.
 */
export const bottomPanelAboveFrontBottom = (
  system: DrawerRunnerSystem,
  carcassThickness: Mm,
): Mm => mm(runnerAboveFrontBottom(system, carcassThickness) + system.bottomPanelAboveRunner);

/** Height of the front fixing screws above the bottom edge of the front, bottom screw first. */
export const frontFixingHeights = (
  system: DrawerRunnerSystem,
  carcassThickness: Mm,
): [Mm, Mm] => {
  const first = mm(
    runnerAboveFrontBottom(system, carcassThickness) + system.frontFixingAboveRunner,
  );
  return [first, mm(first + system.frontFixingRowSpacing)];
};

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
