/**
 * Blum hardware — the shipped starting point.
 *
 * Phase 2 is Blum first and Hettich second, per the original architecture. This file is the whole
 * of "first": one runner system, one hinge system, and the shelf pin that goes with them.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * PRICING IS INDICATIVE, exactly as `materials.au.ts` is. The dimensions are the real thing
 * where they are marked as such; the dollars are ballpark and every record says so.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ## Where the dimensions come from
 *
 * MERIVOBOX (Blum's mid-range box system, between TANDEMBOX and LEGRABOX) is the standard drawer
 * runner here. The figures below were taken from Blum's own catalogue and planning data and from
 * the Australian distributor's MERIVOBOX ordering and planning sheet:
 *
 *   nominal lengths        270, 300, 350, 400, 450, 500, 550, 600
 *   M profile height       91mm
 *   wooden back, M         83mm high, cut from 16mm chipboard
 *   drawer bottom          LW − 51 wide  ×  NL − 26 long, from 16mm chipboard
 *   minimum inner depth    LT min = NL + 3
 *   fixing spacing         128mm at NL ≤ 300, 256mm at NL 350–600
 *   load rating            40kg (a 70kg class also exists and is not shipped here)
 *
 * `LW` is the clear width between the cabinet sides and `LT` the clear depth in front of the
 * back panel. Both come out of the rule engine from the boards that will really be cut, which is
 * the whole reason drawer boxes waited for this phase.
 *
 * The vertical figures come off Blum's front-installation sheet and are listed with the fields
 * themselves, below. Everything that has **not** been confirmed against a sheet or a real runner is
 * in `unconfirmedFigures`, named, and surfaced on screen and in the terminal report — because a
 * figure nobody knows is unchecked is a figure that gets trusted.
 *
 * ## The hinge
 *
 * CLIP top BLUMOTION, 110°, the ordinary frameless overlay hinge. Ø35 cup at 13mm deep is the
 * catalogue figure (it changed from 12.5 with the older CLIP top, which is exactly the sort of
 * number worth writing down rather than remembering). The Ø8 × 11 dowels at 45mm centres are the
 * standard INSERTA/EXPANDO pattern. Their 9.5mm offset from the cup centre is flagged.
 *
 * Two figures here are **shop settings rather than product facts**, and are not flagged as
 * unconfirmed because there is nothing to confirm — they are choices:
 *
 *   `cupDistance`   5mm. Blum allows 3–7; 5 is the usual setting on a full-overlay door.
 *   `cupEndSetback` 96mm from the end of the door to the cup centre. A shop standard, and a
 *                   multiple of 32, which is why it is the one everybody uses.
 */

import { type Cents, mm } from '../units.ts';
import type {
  DrawerRunnerSystem,
  HardwareItem,
  HardwareLibrary,
  HingeSystem,
} from '../model/hardware.ts';

/** Indicative money, in cents ex GST. Every figure below is a placeholder. */
const price = (dollars: number): Cents => Math.round(dollars * 100);

/**
 * MERIVOBOX, M height — the standard drawer runner.
 *
 * Only the M profile is shipped. K, N and the taller build-ups with gallery rails or a BOXCAP all
 * exist and all follow the same arithmetic; adding one is a row in `sideHeights` with its own
 * wooden-back height and nothing else changes, which is the test of whether this record is really
 * data rather than a special case with fields.
 */
export const MERIVOBOX: DrawerRunnerSystem = {
  id: 'merivobox',
  brand: 'Blum',
  name: 'MERIVOBOX',

  nominalLengths: [mm(270), mm(300), mm(350), mm(400), mm(450), mm(500), mm(550), mm(600)],
  sideHeights: [
    {
      code: 'M',
      name: 'M — 91mm',
      height: mm(91),
      woodenBackHeight: mm(83),
    },
  ],

  bottomWidthDeduction: mm(51),
  bottomLengthDeduction: mm(26),
  bottomNominalThickness: mm(16),

  innerDepthAllowance: mm(3),

  frontFixingSetback: mm(37),
  fixingSpacings: [
    { maxNominalLength: mm(300), spacing: mm(128) },
    { maxNominalLength: mm(600), spacing: mm(256) },
  ],
  fixingHoleDiameter: mm(5),
  fixingHoleDepth: mm(13),

  /*
   * The vertical chain, off the bottom of the runner. `20` and `33.5` are read straight off Blum's
   * "Installation dimensions – front – screw-on" sheet and confirmed by the shop:
   *
   *     bottom of runner  →  underside of the drawer bottom     20
   *     bottom of runner  →  front fixing screw centre          33.5   (+1, see the footnote)
   *     first screw       →  second screw                       32     (vertical — off the drawing)
   *     bottom of runner  →  the runner's own fixing screws     54     (Blum's `min. 54*`)
   *     outer face of the cabinet side  →  screw centre         20.5   (Blum's `20.5 + FA`)
   *
   * The screw ends up 2.5mm below the top face of a 16mm bottom, which is where a front fixing
   * bracket sits — level with the bottom of the box. Worth noting because it is the check that says
   * the chain has been read off the right datum.
   */
  runnerAboveFrontBottom: mm(16),
  bottomPanelAboveRunner: mm(20),
  runnerFixingAboveRunnerBottom: mm(54),

  frontFixingAboveRunner: mm(33.5),
  frontFixingRowSpacing: mm(32),
  frontFixingFromCabinetSide: mm(20.5),
  frontFixingPilotDiameter: mm(3),
  frontFixingPilotDepth: mm(12),
  preAssembledProfileAllowance: mm(1),

  loadRatingKg: 40,

  // A MERIVOBOX drawer at this height and length: runner pair, side pair, back brackets and front
  // fixings. Bought as a set, so priced as one.
  setPriceExGst: price(52),
  indicativePricing: true,

  unconfirmedFigures: [
    'runnerAboveFrontBottom — the bottom of the runner is taken to sit 16mm above the bottom edge ' +
      'of its drawer front, which is a board thickness, from the bottom drawer sitting on the ' +
      'cabinet floor with its front flush below it. Everything else in the chain is off Blum’s ' +
      'sheet; this link is not, and it is what moves the box and the runner holes together. The ' +
      '"min. 31.5" on the front-installation sheet may well be it — worth reading the footnote.',
    'runnerFixingAboveRunnerBottom — 54mm, read off Blum’s `min. 54*`. The same 54 could instead be ' +
      'the minimum height of the *runner* above the cabinet floor, which would make it ' +
      '`runnerAboveFrontBottom` rather than this. Hold a runner against a side panel and measure ' +
      'from its bottom edge to the screw centre: about 54 confirms it here, 10 to 15 means it is the ' +
      'other one. The `*` footnote does not settle it — the confirmed 33.5 carries the same footnote ' +
      'and is runner-relative.',
    'fixingSpacings — the 128/256 table is taken as the spacing of the runner’s two fixings in the ' +
      'cabinet side. Blum’s own sheet heads that table "Drilling distances – base", and on the same ' +
      'page "base" is the drawer bottom panel — so this table may belong to a different part ' +
      'entirely, and the cabinet side may have no confirmed spacing at all.',
  ],
  specNote:
    'Wooden bottom and wooden back, 16mm chipboard. A steel back is a shorter base — NL − 22 rather ' +
    'than NL − 26 — and is not modelled. Front fixing figures are the screw-on variant. INSERTA and ' +
    'EXPANDO T use the same vertical chain but a Ø10 (+0.2/−0.1) bore 12mm in from the edge of the ' +
    'front (min. 6mm for EXPANDO T), and are not modelled. A high front built up to E height with a ' +
    'BOXCAP takes a third fixing 128mm above the lowest and a 184mm back; only M height is shipped, ' +
    'so neither is here.',
};

/**
 * CLIP top BLUMOTION 110° — the standard hinge.
 *
 * The count bands are Blum's guidance in the form a rule engine can use: a door gets more hinges
 * as it gets taller. Weight matters too and is not modelled — a 2000mm solid-timber door wants
 * more than a 2000mm MDF one — so this is the floor rather than the answer, and it is editable.
 */
export const CLIP_TOP_BLUMOTION: HingeSystem = {
  id: 'clip-top-blumotion',
  brand: 'Blum',
  name: 'CLIP top BLUMOTION 110°',

  cupDiameter: mm(35),
  cupDepth: mm(13),
  cupDistance: mm(5),
  cupEndSetback: mm(96),

  dowelDiameter: mm(8),
  dowelDepth: mm(11),
  dowelSpacing: mm(45),
  dowelOffset: mm(9.5),

  plateSetback: mm(37),
  plateHoleSpacing: mm(32),
  plateHoleDiameter: mm(5),
  plateHoleDepth: mm(13),

  countBands: [
    { maxDoorHeight: mm(900), hinges: 2 },
    { maxDoorHeight: mm(1600), hinges: 3 },
    { maxDoorHeight: mm(2000), hinges: 4 },
  ],

  hingePriceExGst: price(6.4),
  platePriceExGst: price(2.1),
  indicativePricing: true,

  unconfirmedFigures: [
    'dowelOffset — the two Ø8 dowels sit 9.5mm off the cup centre, away from the door edge. ' +
      'The 45mm spacing is the catalogue figure; the offset wants checking against a real hinge.',
  ],
  specNote:
    'Boring depth is 13mm. The older CLIP top was 12.5mm on the same pattern — worth knowing if ' +
    'a job mixes old and new stock.',
};

export const SHELF_PIN: HardwareItem = {
  id: 'shelf-pin-5',
  brand: 'Generic',
  name: 'Shelf pin, Ø5 steel',
  category: 'shelf-pin',
  unit: 'each',
  priceExGst: price(0.18),
  indicativePricing: true,
  note: 'Four per adjustable shelf.',
};

export const BLUM_HARDWARE_LIBRARY: HardwareLibrary = {
  runnerSystems: [MERIVOBOX],
  hingeSystems: [CLIP_TOP_BLUMOTION],
  items: [SHELF_PIN],
};

/** Ids the shipped defaults point at. Named so the migrations don't repeat the strings. */
export const DEFAULT_RUNNER_SYSTEM_ID = MERIVOBOX.id;
export const DEFAULT_DRAWER_SIDE_HEIGHT_CODE = 'M';
export const DEFAULT_HINGE_SYSTEM_ID = CLIP_TOP_BLUMOTION.id;
export const SHELF_PIN_ITEM_ID = SHELF_PIN.id;
/** Pins per adjustable shelf. Four corners; there is no case for three. */
export const PINS_PER_SHELF = 4;
