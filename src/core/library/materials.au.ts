/**
 * Australian material library seed.
 *
 * Sheet sizes, thicknesses and substrates here are the real local standards — the 3600×1800 and
 * 2400×1200 everyone quotes, 2440×1220 for imported product, 16/18/25mm, melamine-faced
 * particleboard as the carcass default and MDF as the door substrate. None of that is a
 * localisation pass over a US default; it is the baseline.
 *
 * **Those quoted figures are the usable area rather than the board**, which is the correction the
 * next comment down is about: 2400 × 1200 ships as 2410 × 1205 on carcass board and 2420 × 1210 on
 * MDF. The two that are still stated at the usable area say so on `unconfirmedSheetSizes`.
 *
 * Each material also carries a `colour` — roughly what the decor looks like on screen. It is a
 * screen approximation and nothing is cut, priced or ordered from it; the decor *name* is the fact.
 * It is there so a walnut door does not render the same off-white as a white melamine carcass.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * PRICING IS INDICATIVE. Every record below carries `indicativePricing: true`, and costing
 * surfaces that flag on any quote it touches. Replace these with your actual trade prices
 * before quoting a real job — the decor names and sheet sizes are right, the dollars are
 * ballpark only.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

import { mm } from '../units.ts';
import type {
  BenchtopMaterial,
  EdgeBandMaterial,
  MaterialLibrary,
  SheetMaterial,
  SheetSize,
} from '../model/material.ts';
import { AU_UPHOLSTERY_MATERIALS } from './upholstery.au.ts';

const sheet = (length: number, width: number, priceExGst: number): SheetSize => ({
  length: mm(length),
  width: mm(width),
  priceExGst,
});

/*
 * ── The sheet footprints, and the difference between a sheet and its usable area ──────────────
 *
 * **A `SheetSize` is the board you are handed, not the area you can nest into.** The shop, on the
 * sizes this library shipped with:
 *
 * > *"Sheet sizes are wrong — 2400 × 1200 is the usable area, not the sheet."*
 *
 * A sheet comes with a ragged, chipped or out-of-square margin all round it that nobody cuts a
 * part from. `2400 × 1200` is what is left after it, and stating that as the sheet made the model
 * take the trim off **twice** — once by the supplier and once by `sheetEdgeTrim`, which then took
 * a further 6mm off an area that had already lost it. A job could buy a sheet it did not need.
 *
 * The two figures the machine settles are read straight off its own sheet declaration in
 * `docs/woodtron-dialect.md` §1 — a real job, on real board:
 *
 * ```
 *   white carcass board   2410.0 × 1205.0 × 16.3
 *   MDF door board        3115.0 × 1205.0 × 18.0
 * ```
 *
 * So the shop's rule is **confirmed rather than asserted**: 10mm over on the length, 5mm over on
 * the width, exactly. `AU_STANDARD` is that figure.
 *
 * **`AU_LARGE` is deliberately left alone, and that is not an oversight.** Nothing confirms a
 * 3600 × 1800 sheet is really 3610 × 1805 — the rule holds on the one size anybody has measured,
 * and applying it to another is a guess. The direction of the guess is what decides it: a sheet
 * stated **smaller** than it is nests conservatively and buys the odd extra board, and one stated
 * **larger** than it is places a part that does not fit and cuts it short. An inconvenience against
 * a remake. So the unmeasured sizes stay at the usable figure and `unconfirmedSheetSizes` says
 * which they are, in the report and on screen, until somebody reads them off Laminex's and
 * Polytec's published ranges.
 */

/*
 * **The allowance is material dependent**, which is the shop's own correction and the reason there
 * is more than one footprint helper here rather than one rule:
 *
 * > *"laminex and polytecs boards are material dependant. Generally allow 20mm in length and 10mm
 * > in width for MD finish boards."*
 *
 * So there are two classes, and they are **not** the same number:
 *
 * | | over on length | over on width | where it comes from |
 * |---|---|---|---|
 * | Carcass and melamine board | 10 | 5 | measured — the machine's own sheet declaration |
 * | **MD finish** board | **20** | **10** | the shop's general allowance |
 *
 * A single global rule would have put every decorative door board 10mm short on the length and 5
 * on the width, which is a part per sheet on a long run. That is what "material dependant" costs
 * if it is read as "one number".
 */

/**
 * 3600 × 1800 — still the **usable area**, and the one board here that is deliberately left at it.
 *
 * The 10-and-5 rule is measured on `AU_STANDARD` and nothing confirms it holds on this sheet, so
 * applying it would be a guess in the direction that cuts a part short. See the note above and
 * `unconfirmedSheetSizes`, which says so on screen and in the report until somebody reads the
 * published range.
 */
const AU_LARGE = (price: number) => sheet(3600, 1800, price);
/** 2410 × 1205 — the real sheet behind the "2400 × 1200" everyone quotes. Off the machine files. */
const AU_STANDARD = (price: number) => sheet(2410, 1205, price);

/*
 * The same two footprints on an **MD finish** board, at the shop's 20 and 10.
 *
 * `AU_LARGE_MD` is the one figure here that is the rule applied rather than a board anybody has
 * measured — but it is the *shop's own* rule for *this class of board*, which is a different thing
 * from the extrapolation `AU_LARGE` deliberately refuses to make. It is still on
 * `unconfirmedSheetSizes`, because "generally allow" is an allowance and not a published size.
 */
const AU_STANDARD_MD = (price: number) => sheet(2420, 1210, price);
const AU_LARGE_MD = (price: number) => sheet(3620, 1810, price);
/*
 * Named `_MD` for the shop's own phrase, and it means **every MDF board** — the trim is a pressing
 * margin, so a raw sheet takes it exactly as a finished one does. See `MDF_BOARDS`.
 */

/**
 * 3115 × 1205 — a long Polytec board, confirmed twice over.
 *
 * The machine's MDF door programs ran on one (`docs/woodtron-dialect.md` §1, 3115.0 × 1205.0 ×
 * 18.0), and the shop confirms it is stock rather than a cut-down: *"3115 is a typical polytec
 * size."* It was left out of the library until that answer arrived, because a stock size nobody has
 * confirmed puts a board on an order that may not exist.
 *
 * **Stated as measured, so it takes no allowance on top.** The figure came off the machine, which
 * is where this shop enters real-world numbers — the same reason its carcass board is entered at
 * 16.3mm rather than 16.
 */
const POLYTEC_LONG = (price: number) => sheet(3115, 1205, price);

/** Imported product runs to the metric-imperial 2440×1220 — still the usable area. */
const IMPORTED = (price: number) => sheet(2440, 1220, price);

/**
 * The boards the shop's *"20mm in length and 10mm in width"* applies to.
 *
 * **MD is MDF, and it is the board rather than the finish** — both confirmed by the shop when
 * asked. The first answer named *"MD finish boards"*, which read as though a raw sheet might be
 * different; the second settled it: *"yes raw mdf is the same 20 and 10."*
 *
 * **That is the answer the physics wanted.** The margin is a **pressing trim** — a board is cut to
 * its nominal after it is pressed, and whether a decor goes on afterwards has nothing to do with
 * it. So the set is every MDF board, finished or raw, which is both simpler than the reading it
 * replaces and the one with a reason behind it.
 *
 * **Listed rather than derived from the substrate**, deliberately. A list can be checked at a
 * glance and corrected in one line; a rule over substrate strings quietly captures the next
 * material somebody adds — and it would have captured `laminate-1mm`, which carries an MDF
 * substrate and is a 1mm facing sheet rather than a board at all.
 *
 * Exported because the **migration reads the same list** — a saved job's sheets have to grow by the
 * figure their own material takes, and a size-keyed map cannot express that.
 */
export const MDF_BOARDS: readonly string[] = [
  // Branded decorative board — doors and panels.
  'poly-florentine-walnut-16',
  'poly-boston-oak-18',
  'poly-prime-oak-16',
  'poly-classic-white-door-18',
  'lam-rural-oak-16',
  'lam-classic-oak-16',
  'lam-portsea-absolute-matte-16',
  // Raw and HMR MDF — same board, same pressing trim, no decor on it.
  'mdf-raw-18',
  'mdf-raw-25',
  'mdf-hmr-18',
];

/**
 * Footprints that are still the **usable area** rather than the real sheet.
 *
 * The same contract `indicativePricing` has for money and `unconfirmedFigures` has for hardware: a
 * figure nobody has checked is a figure that gets trusted. Each of these nests a little small,
 * which is the safe direction, and each wants the supplier's published size before a job is cut
 * tight against it.
 */
export const unconfirmedSheetSizes: readonly string[] = [
  '3600 × 1800 on a carcass or melamine board — the usable area. The real board is over on both, ' +
    'by 10 and 5 on the one size the machine files confirm, but nobody has read this one off a ' +
    'published range.',
  '2440 × 1220 — imported product, quoted at the metric-imperial size. Same question.',
  '3620 × 1810 on an MD finish board — the shop\'s "generally allow 20 and 10" applied to the ' +
    'large sheet. A stated allowance rather than a published size, and the only figure here that ' +
    'is the rule applied rather than a board somebody has measured.',
];

export const AU_SHEET_MATERIALS: readonly SheetMaterial[] = [
  /*
   * ── Carcass board ────────────────────────────────────────────────────────────────────
   *
   * A carcass is specified as a *board*, not as a finish. Nobody orders a carcass in a decor
   * name — they order white HMR particleboard, and the decor question only arises for the
   * parts that are seen. These are the defaults; the branded decors below are for doors,
   * panels and any carcass that is genuinely on show.
   */
  {
    id: 'hmr-white-16',
    brand: 'Generic',
    decor: 'White HMR particleboard',
    substrate: 'HMR-MFPB',
    thickness: mm(16),
    grain: 'none',
    colour: '#f1efe9',
    decorFaces: 2,
    sheets: [AU_LARGE(13_800), AU_STANDARD(6_300)],
    indicativePricing: true,
  },
  {
    id: 'hmr-white-18',
    brand: 'Generic',
    decor: 'White HMR particleboard',
    substrate: 'HMR-MFPB',
    thickness: mm(18),
    grain: 'none',
    colour: '#f1efe9',
    decorFaces: 2,
    sheets: [AU_LARGE(15_200)],
    indicativePricing: true,
  },
  {
    id: 'mfpb-white-16',
    brand: 'Generic',
    decor: 'White particleboard (standard)',
    substrate: 'MFPB',
    thickness: mm(16),
    grain: 'none',
    colour: '#f4f2ee',
    decorFaces: 2,
    sheets: [AU_LARGE(10_200), AU_STANDARD(4_800)],
    indicativePricing: true,
  },

  // ── Decor melamine, for doors, panels and carcasses that are on show ──────────────────
  {
    id: 'poly-classic-white-16',
    brand: 'Polytec',
    decor: 'Classic White',
    substrate: 'MFPB',
    thickness: mm(16),
    grain: 'none',
    colour: '#f7f6f2',
    decorFaces: 2,
    sheets: [AU_LARGE(10_500), AU_STANDARD(4_900)],
    indicativePricing: true,
  },
  {
    id: 'poly-classic-white-18',
    brand: 'Polytec',
    decor: 'Classic White',
    substrate: 'MFPB',
    thickness: mm(18),
    grain: 'none',
    colour: '#f7f6f2',
    decorFaces: 2,
    sheets: [AU_LARGE(11_800), AU_STANDARD(5_500)],
    indicativePricing: true,
  },
  {
    id: 'poly-snowdrift-16',
    brand: 'Polytec',
    decor: 'Snowdrift',
    substrate: 'MFPB',
    thickness: mm(16),
    grain: 'none',
    colour: '#eeece6',
    decorFaces: 2,
    sheets: [AU_LARGE(11_200)],
    indicativePricing: true,
  },
  {
    id: 'poly-sepia-oak-16',
    brand: 'Polytec',
    decor: 'Sepia Oak',
    substrate: 'MFPB',
    thickness: mm(16),
    grain: 'length',
    colour: '#b0895d',
    texture: {
      url: '/materials/board/sepia-oak.jpg',
      repeatLength: mm(3600),
      repeatWidth: mm(1800),
      grainAxis: 'v',
      sourceUrl: 'https://www.polytec.com.au/colour/sepia-oak/',
    },
    decorFaces: 2,
    sheets: [AU_LARGE(15_400)],
    indicativePricing: true,
  },
  {
    id: 'poly-notaio-walnut-16',
    brand: 'Polytec',
    decor: 'Notaio Walnut',
    substrate: 'MFPB',
    thickness: mm(16),
    grain: 'length',
    colour: '#7a5a42',
    texture: {
      url: '/materials/board/notaio-walnut.jpg',
      repeatLength: mm(3600),
      repeatWidth: mm(1800),
      grainAxis: 'v',
      sourceUrl: 'https://www.polytec.com.au/colour/notaio-walnut/',
    },
    decorFaces: 2,
    sheets: [AU_LARGE(15_400)],
    indicativePricing: true,
  },
  {
    id: 'poly-florentine-walnut-16',
    brand: 'Polytec',
    decor: 'Florentine Walnut Woodmatt',
    substrate: 'HMR-MDF',
    thickness: mm(16),
    grain: 'length',
    colour: '#5b3d2d',
    texture: {
      url: '/materials/board/florentine-walnut.jpg',
      repeatLength: mm(2400), repeatWidth: mm(1200), grainAxis: 'v',
      sourceUrl: 'https://www.polytec.com.au/colour/florentine-walnut/woodmatt/',
    },
    decorFaces: 2,
    sheets: [AU_STANDARD_MD(15_400), POLYTEC_LONG(21_500)],
    indicativePricing: true,
  },
  {
    id: 'poly-boston-oak-18',
    brand: 'Polytec',
    decor: 'Boston Oak Woodmatt',
    substrate: 'HMR-MDF',
    thickness: mm(18),
    grain: 'length',
    colour: '#9b8064',
    texture: {
      url: '/materials/board/boston-oak.jpg',
      repeatLength: mm(3600), repeatWidth: mm(1800), grainAxis: 'v',
      sourceUrl: 'https://www.polytec.com.au/colour/boston-oak/',
    },
    decorFaces: 2,
    sheets: [AU_STANDARD_MD(15_400), POLYTEC_LONG(21_500)],
    indicativePricing: true,
  },
  {
    id: 'poly-prime-oak-16',
    brand: 'Polytec',
    decor: 'Prime Oak Woodmatt',
    substrate: 'HMR-MDF',
    thickness: mm(16),
    grain: 'length',
    colour: '#b69c78',
    texture: {
      url: '/materials/board/prime-oak.jpg',
      repeatLength: mm(3600), repeatWidth: mm(1800), grainAxis: 'v',
      sourceUrl: 'https://www.polytec.com.au/colour/prime-oak/',
    },
    decorFaces: 2,
    sheets: [AU_STANDARD_MD(15_400), AU_LARGE_MD(23_000), POLYTEC_LONG(21_500)],
    indicativePricing: true,
  },
  {
    id: 'lam-polar-white-16',
    brand: 'Laminex',
    decor: 'Polar White',
    substrate: 'MFPB',
    thickness: mm(16),
    grain: 'none',
    colour: '#f8f8f6',
    decorFaces: 2,
    sheets: [AU_LARGE(10_800), AU_STANDARD(5_100)],
    indicativePricing: true,
  },
  {
    id: 'lam-parchment-16',
    brand: 'Laminex',
    decor: 'Parchment',
    substrate: 'MFPB',
    thickness: mm(16),
    grain: 'none',
    colour: '#e9e2d3',
    decorFaces: 2,
    sheets: [AU_LARGE(11_000)],
    indicativePricing: true,
  },
  {
    id: 'lam-rural-oak-16',
    brand: 'Laminex',
    decor: 'Rural Oak Natural',
    substrate: 'HMR-MDF',
    thickness: mm(16),
    grain: 'length',
    colour: '#9b7c5d',
    texture: {
      url: '/materials/board/rural-oak.jpg',
      repeatLength: mm(3600), repeatWidth: mm(1800), grainAxis: 'v',
      sourceUrl: 'https://www.laminex.com.au/products/rural-oak/Natural/p/AU1001713',
    },
    decorFaces: 2,
    sheets: [AU_STANDARD_MD(15_400)],
    indicativePricing: true,
  },
  {
    id: 'lam-classic-oak-16',
    brand: 'Laminex',
    decor: 'Classic Oak Natural',
    substrate: 'HMR-MDF',
    thickness: mm(16),
    grain: 'length',
    colour: '#aa8966',
    texture: {
      url: '/materials/board/classic-oak.jpg',
      repeatLength: mm(3600), repeatWidth: mm(1800), grainAxis: 'v',
      sourceUrl: 'https://www.laminex.com.au/products/classic-oak/Natural/p/AU1003601',
    },
    decorFaces: 2,
    sheets: [AU_STANDARD_MD(15_400), AU_LARGE_MD(23_000)],
    indicativePricing: true,
  },
  {
    id: 'lam-portsea-absolute-matte-16',
    brand: 'Laminex',
    decor: 'Portsea AbsoluteMatte',
    substrate: 'HMR-MDF',
    thickness: mm(16),
    grain: 'none',
    colour: '#477487',
    texture: {
      url: '/materials/board/portsea-absolute-matte.jpg',
      repeatLength: mm(1200), repeatWidth: mm(1200), grainAxis: 'v',
      sourceUrl: 'https://www.laminex.com.au/products/portsea/Natural/p/AU1005240',
    },
    decorFaces: 2,
    sheets: [AU_STANDARD_MD(15_400)],
    indicativePricing: true,
  },

  // ── Wet-area carcass: HMR ──────────────────────────────────────────────────────────────
  {
    id: 'poly-classic-white-hmr-16',
    brand: 'Polytec',
    decor: 'Classic White (HMR)',
    substrate: 'HMR-MFPB',
    thickness: mm(16),
    grain: 'none',
    colour: '#f7f6f2',
    decorFaces: 2,
    sheets: [AU_LARGE(14_200)],
    indicativePricing: true,
  },
  {
    id: 'poly-classic-white-hmr-18',
    brand: 'Polytec',
    decor: 'Classic White (HMR)',
    substrate: 'HMR-MFPB',
    thickness: mm(18),
    grain: 'none',
    colour: '#f7f6f2',
    decorFaces: 2,
    sheets: [AU_LARGE(15_600)],
    indicativePricing: true,
  },

  // ── Doors and panels: MDF ──────────────────────────────────────────────────────────────
  {
    id: 'mdf-raw-18',
    brand: 'Generic',
    decor: 'Raw MDF',
    substrate: 'MDF',
    thickness: mm(18),
    grain: 'none',
    colour: '#c8a87d',
    decorFaces: 2,
    sheets: [AU_LARGE_MD(9_600), AU_STANDARD_MD(4_400)],
    indicativePricing: true,
  },
  {
    id: 'mdf-raw-25',
    brand: 'Generic',
    decor: 'Raw MDF',
    substrate: 'MDF',
    thickness: mm(25),
    grain: 'none',
    colour: '#c8a87d',
    decorFaces: 2,
    sheets: [AU_LARGE_MD(14_500)],
    indicativePricing: true,
  },
  {
    id: 'mdf-hmr-18',
    brand: 'Generic',
    decor: 'HMR MDF',
    substrate: 'HMR-MDF',
    thickness: mm(18),
    grain: 'none',
    colour: '#9aad88',
    decorFaces: 2,
    sheets: [AU_LARGE_MD(13_200)],
    indicativePricing: true,
  },
  {
    id: 'poly-classic-white-door-18',
    brand: 'Polytec',
    decor: 'Classic White',
    substrate: 'MDF',
    thickness: mm(18),
    grain: 'none',
    colour: '#f7f6f2',
    decorFaces: 2,
    sheets: [AU_LARGE_MD(16_800), POLYTEC_LONG(21_500)],
    indicativePricing: true,
  },

  // ── Imported product on the 2440×1220 footprint ────────────────────────────────────────
  {
    id: 'ply-birch-18',
    brand: 'Imported',
    decor: 'Birch Plywood',
    substrate: 'plywood',
    thickness: mm(18),
    grain: 'length',
    colour: '#e0c79b',
    decorFaces: 2,
    sheets: [IMPORTED(13_500)],
    indicativePricing: true,
  },

  /*
   * ── Bendy ply ────────────────────────────────────────────────────────────────────────
   *
   * For skinning formers on a radiused end. Sold as barrel form (bends across the length of
   * the sheet) or column form (bends along it) and bought to suit the job — which the model
   * does not yet record, so the parts carry a note to check the sheet before cutting. Two
   * layers is the usual build: one takes up the shape of every former it crosses.
   *
   * Grain is left `none` deliberately. It is not that the sheet has no direction — it has a
   * very strong one — but that the direction constrains which way it *bends*, which is not
   * what `GrainDirection` means here. Recording it properly is a material-model change, and
   * pretending it is a grain constraint would nest these the right way round by accident and
   * the wrong way round the moment someone changed the nester.
   */
  {
    id: 'bendy-ply-3',
    brand: 'Imported',
    decor: 'Bendy plywood 3mm',
    substrate: 'plywood',
    thickness: mm(3),
    grain: 'none',
    colour: '#d9bd90',
    decorFaces: 2,
    sheets: [IMPORTED(6_400)],
    indicativePricing: true,
  },
  /*
   * ── Finish laminate, for wrapping a curve ────────────────────────────────────────────────
   *
   * The 1mm decorative laminate that goes over a bendy-ply wrap so the curve shows the same
   * decor as the doors. Not a substrate and never a carcass part: it is glued on by hand after
   * machining and trimmed, which is why it is priced off area rather than nested.
   *
   * **The price is the shop's own figure — "generally around $60 per sqm"** — and Polytec do not
   * publish a per-metre trade rate publicly, so it is indicative like everything else here and
   * wants the real one before a curved job is quoted from it. The sheet sizes are the footprints
   * Polytec list for laminate; check them against the **decorative** range rather than the
   * compact one, since this is the 1mm face material and not the 13mm structural board.
   */
  {
    id: 'laminate-1mm',
    brand: 'Polytec',
    decor: 'Finish laminate 1mm — matched to the door decor',
    substrate: 'MDF',
    thickness: mm(1),
    grain: 'none',
    // A neutral, and nothing is ever drawn from it: the laminate is not a part, so no mesh reads
    // this. It is here because every sheet on the price list carries a screen colour, and the
    // real answer — "whatever the door decor is" — is not a hex.
    colour: '#cfc8bd',
    decorFaces: 1,
    // $60/m²: 3660 × 1830 = 6.6978m² → $401.87; 2440 × 1220 = 2.9768m² → $178.61.
    sheets: [sheet(3660, 1830, 40_187), sheet(2440, 1220, 17_861)],
    indicativePricing: true,
  },
  {
    /*
     * The shop's bendy ply. Two layers make 16mm of wrap, which is what the corner is actually
     * built from — see `substrateRadius`, where the layers come off the finished radius to give the
     * radius the formers are cut to. At 8mm that is a much bigger bite than the 3mm the library
     * shipped with, so the formers, the skins' developed lengths and the corner plates all move.
     */
    id: 'bendy-ply-8',
    brand: 'Imported',
    decor: 'Bendy plywood 8mm',
    substrate: 'plywood',
    thickness: mm(8),
    grain: 'none',
    colour: '#d9bd90',
    decorFaces: 2,
    sheets: [IMPORTED(12_400)],
    indicativePricing: true,
  },
  {
    id: 'bendy-ply-5',
    brand: 'Imported',
    decor: 'Bendy plywood 5mm',
    substrate: 'plywood',
    thickness: mm(5),
    grain: 'none',
    colour: '#d9bd90',
    decorFaces: 2,
    sheets: [IMPORTED(8_900)],
    indicativePricing: true,
  },

  // ── Backs ──────────────────────────────────────────────────────────────────────────────
  {
    id: 'poly-classic-white-back-16',
    brand: 'Polytec',
    decor: 'Classic White (back)',
    substrate: 'MFPB',
    thickness: mm(16),
    grain: 'none',
    colour: '#f7f6f2',
    decorFaces: 2,
    sheets: [AU_LARGE(10_500)],
    indicativePricing: true,
  },
];

export const AU_EDGE_BANDS: readonly EdgeBandMaterial[] = [
  {
    id: 'eb-white-1mm',
    brand: 'Generic',
    decor: 'White',
    thickness: mm(1),
    width: mm(22),
    pricePerMetreExGst: 52,
    indicativePricing: true,
  },
  {
    id: 'eb-classic-white-1mm',
    brand: 'Polytec',
    decor: 'Classic White',
    thickness: mm(1),
    width: mm(22),
    pricePerMetreExGst: 55,
    indicativePricing: true,
  },
  {
    id: 'eb-classic-white-2mm',
    brand: 'Polytec',
    decor: 'Classic White',
    thickness: mm(2),
    width: mm(22),
    pricePerMetreExGst: 95,
    indicativePricing: true,
  },
  {
    id: 'eb-sepia-oak-1mm',
    brand: 'Polytec',
    decor: 'Sepia Oak',
    thickness: mm(1),
    width: mm(22),
    pricePerMetreExGst: 130,
    indicativePricing: true,
  },
  {
    id: 'eb-notaio-walnut-1mm',
    brand: 'Polytec',
    decor: 'Notaio Walnut',
    thickness: mm(1),
    width: mm(22),
    pricePerMetreExGst: 130,
    indicativePricing: true,
  },
  {
    id: 'eb-polar-white-1mm',
    brand: 'Laminex',
    decor: 'Polar White',
    thickness: mm(1),
    width: mm(22),
    pricePerMetreExGst: 58,
    indicativePricing: true,
  },
];

/**
 * Benchtop materials.
 *
 * Note what the two `bought-in` records carry that no sheet material does: a square-metre rate, a
 * minimum, and separate charges for the cutouts, the joins and the edge. That is not decoration —
 * it is how the quote actually arrives, and a stone top costed as area × rate comes out under on
 * every small job and under by a long way on any job with a sink in it.
 *
 * The shop-made one names a sheet rather than restating one, so a laminated MDF top and an MDF
 * door panel can never be priced off two different boards.
 */
export const AU_BENCHTOP_MATERIALS: readonly BenchtopMaterial[] = [
  {
    id: 'stone-quartz-20',
    brand: 'Generic',
    decor: 'Engineered stone 20mm',
    thickness: mm(20),
    supply: 'bought-in',
    colour: '#dedbd4',
    charges: {
      ratePerM2ExGst: 55_000,
      minimumChargeExGst: 90_000,
      cutoutChargeExGst: {
        sink: 18_000,
        hob: 14_000,
        'tap-hole': 4_500,
        other: 12_000,
      },
      joinChargeExGst: 16_000,
      edgeProfilePerMExGst: 4_500,
      edgeProfileName: '20mm pencil round',
    },
    indicativePricing: true,
  },
  {
    id: 'laminate-postformed-33',
    brand: 'Laminex',
    decor: 'Postformed laminate 33mm',
    thickness: mm(33),
    supply: 'bought-in',
    colour: '#cfc9bf',
    charges: {
      ratePerM2ExGst: 18_000,
      minimumChargeExGst: 25_000,
      cutoutChargeExGst: {
        sink: 7_500,
        hob: 6_500,
        'tap-hole': 2_500,
        other: 6_000,
      },
      joinChargeExGst: 9_000,
      edgeProfilePerMExGst: 2_200,
      edgeProfileName: 'Postformed front, ABS ends',
    },
    indicativePricing: true,
  },
  {
    id: 'shopmade-hmr-mdf-18',
    brand: 'Generic',
    decor: 'Shop-made HMR MDF, laminated',
    thickness: mm(18),
    supply: 'shop-made',
    sheetMaterialId: 'mdf-hmr-18',
    colour: '#cbc4b8',
    // The sheet it is cut from carries the pricing flag; this record adds no rate of its own.
    indicativePricing: false,
  },
];

export const AU_MATERIAL_LIBRARY: MaterialLibrary = {
  sheets: AU_SHEET_MATERIALS,
  edgeBands: AU_EDGE_BANDS,
  benchtops: AU_BENCHTOP_MATERIALS,
  upholstery: AU_UPHOLSTERY_MATERIALS,
};

/** True when any material a quote depends on is still carrying placeholder pricing. */
export const hasIndicativePricing = (lib: MaterialLibrary): boolean =>
  lib.sheets.some((s) => s.indicativePricing) ||
  lib.edgeBands.some((e) => e.indicativePricing) ||
  lib.benchtops.some((b) => b.indicativePricing);
