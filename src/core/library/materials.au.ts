/**
 * Australian material library seed.
 *
 * Sheet sizes, thicknesses and substrates here are the real local standards — the 3600×1800 and
 * 2400×1200 everyone quotes, 2440×1220 for imported ply, 16/18/25mm, melamine-faced
 * particleboard as the carcass default and MDF as the door substrate. None of that is a
 * localisation pass over a US default; it is the baseline.
 *
 * **The size a board is sold by is not the size it arrives**, which is the correction the next
 * comment down is about, and the shop states the difference per class:
 *
 * ```
 *   carcass and melamine   +10 / +5     2400 × 1200 → 2410 × 1205    3600 × 1800 → 3610 × 1805
 *   any MDF board          +20 / +10    2400 × 1200 → 2420 × 1210    3600 × 1800 → 3620 × 1810
 *   imported plywood       tighter      2440 × 1220 → 2410 × 1205
 *   finish laminate        its own      3600 × 1350 Polytec, 3600 × 1500 Laminex
 * ```
 *
 * **Plywood is the one that shrinks**, and it is the trap in the set: a rule remembered as "the
 * real sheet is bigger" cuts a ply part short.
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
 * **The rule is the shop's, and it is stated per class of board rather than per size** — so it is
 * applied to every board of its class, which is what "generally allow" means:
 *
 * > *"Generally allow 20mm in length and 10mm in width for MD finish boards."*
 *
 * These figures used to sit at the usable area on an `unconfirmedSheetSizes` list, waiting for
 * somebody to read a published range. **That wait was a mistake and it is over.** The published
 * ranges quote the nominal — 3600 × 1800 is what every supplier's catalogue says — so waiting for
 * one meant waiting for a number that does not get published, while the shop had already given the
 * answer. Two suppliers who do describe the oversize put it at *"2420 × 1213mm or 3630 × 1213mm …
 * may change with a change in manufacturer"*, which is the shop's own point about it being material
 * dependent, arriving less precisely. **The shop's rule wins**, and the shop said so: *"the sizes
 * are not to be trusted."*
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

/** 3610 × 1805 — the shop's 10 and 5 on the large carcass or melamine board. */
const AU_LARGE = (price: number) => sheet(3610, 1805, price);
/** 2410 × 1205 — the real sheet behind the "2400 × 1200" everyone quotes. Off the machine files. */
const AU_STANDARD = (price: number) => sheet(2410, 1205, price);

/*
 * The same two footprints on an **MD finish** board, at the shop's 20 and 10.
 *
 * Both are the shop's own rule for this class of board. It used to say here that "generally allow"
 * was an allowance rather than a published size, which kept the large one on a caution list and
 * kept sessions hunting for a figure suppliers do not publish. The shop's answer to that was short:
 * **the advice stands, and the published sizes are not to be trusted.**
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

/**
 * 2410 × 1205 — imported **plywood**, and the one class here whose allowance is **negative**.
 *
 * > *"ply is generally tighter — allow 2410 × 1205"*
 *
 * Ply is quoted at the metric-imperial 2440 × 1220 and you cannot rely on it: the edges arrive
 * damaged or out of square, so what a sheet really gives you is 30 less on the length and 15 on the
 * width. **Every other class here grows over its quoted size and this one shrinks**, which is worth
 * saying out loud, because a rule remembered as "the real board is bigger" applied to ply cuts a
 * part short.
 *
 * The price is untouched. A sheet costs what it costs; what changed is how much of it you get.
 */
const IMPORTED = (price: number) => sheet(2410, 1205, price);

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
 * The sheets the shop's *"ply is generally tighter"* applies to.
 *
 * A third class beside carcass board and MDF, and the only one whose real sheet is **smaller** than
 * the size it is sold by. Kept as a list for the same reason `MDF_BOARDS` is: the set is a
 * judgement, it reads at a glance, and the migration has to answer the same question a size-keyed
 * map cannot — 2440 × 1220 means one thing on imported ply and would mean another on anything else
 * quoted at that size.
 */
/**
 * The finish laminates, newest first, and the legacy record they replaced.
 *
 * A list rather than a query for the same reason `MDF_BOARDS` is one: the set is a judgement, it
 * reads at a glance, and anything clever enough to find these by thickness or substrate would also
 * find a 1mm decorative board somebody adds next year.
 *
 * `laminate-1mm` stays on it because a saved job may still carry one — the migration splits it, but
 * a job whose price list was hand-edited may have kept it, and a laminate nobody can find is a
 * curve charged at nothing.
 */
export const LAMINATE_MATERIAL_IDS: readonly string[] = [
  'laminate-polytec-1mm',
  'laminate-laminex-1mm',
  'laminate-1mm',
];

export const PLY_BOARDS: readonly string[] = [
  'ply-birch-18',
  'bendy-ply-3',
  'bendy-ply-5',
  'bendy-ply-8',
];

/*
 * ── There is no `unconfirmedSheetSizes` any more, and both halves of that are the point ────────
 *
 * **Every footprint in this library now traces to the shop or to the machine.** Carcass and
 * melamine at +10/+5, any MDF board at +20/+10, plywood at a *tighter* 2410 × 1205, the two
 * laminate sheets at the two brands' own sizes, and 2410 × 1205 / 3115 × 1205 read off the
 * machine's own sheet declaration. Nothing is left to caution about.
 *
 * **And the caution never reached anybody.** `unconfirmedSheetSizes` was exported, asserted in one
 * test, and rendered in **zero** places — while its own comment claimed it said so "in the report
 * and on screen", and three sections of `docs/handover.md` repeated that. The hardware, ladder,
 * applied-end and machine lists are all genuinely rendered, which is what made the claim look
 * plausible. A list nothing renders is not a safety net; it is a note to whoever reads the source.
 *
 * So if a future footprint has no answer: **wire it to a panel the way `unconfirmedHardwareFigures`
 * is** — `SettingsModal` and `HardwarePanel` are the pattern — rather than adding a constant here
 * and trusting a comment about where it shows up.
 */

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
   * the sheet) or column form (bends along it) and bought to suit the job. Two layers is the
   * usual build: one takes up the shape of every former it crosses.
   *
   * **`bendAxis` is the material-model change this comment used to say was needed**, and the
   * paragraph it replaces was right about why it mattered: grain stays `none` because the sheet
   * genuinely has no decor — it is a substrate, laminated over — and its very strong direction
   * constrains which way it *bends*, which is a different question. Putting the bend in `grain`
   * would have nested these correctly by accident and wrongly the moment somebody touched the
   * nester.
   *
   * What the old wording did not say is that leaving it unrecorded was not neutral. `none` is
   * exactly what tells the nester a part may rotate freely, and it does: measured on a plain
   * radiused end, **both skins came off the sheet turned**. The note on the part told the
   * operator to check the sheet, by which point the cut plan had already committed.
   *
   * **Column is the shop's default** — *"generally column but sometimes barrel depending on the
   * application"* — so `length` is what ships, and it is a setting per board rather than a
   * constant because the shop buys both. The word-to-axis mapping was this file's own reading
   * and is now the shop's answer: *"you have it right on the column"*. Column bends **along the
   * sheet's length**, confirmed, so the caution that stood on the Materials tab is gone.
   */
  {
    id: 'bendy-ply-3',
    brand: 'Imported',
    decor: 'Bendy plywood 3mm',
    substrate: 'plywood',
    thickness: mm(3),
    grain: 'none',
    // Column form — bends along the sheet's length. See the block comment above.
    bendAxis: 'length' as const,
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
  /*
   * ── The finish laminate, one record per brand ─────────────────────────────────────────────
   *
   * **The brand is the job's, not the library's**, and that is the shop's own answer to why there
   * cannot be a single laminate record:
   *
   * > *"the brand being used depends on the project as it's a decor, a choice the client would
   * > make for the finish"*
   *
   * A curve is finished in the **door decor** — `finish: 'door'` in the part rules, drawn through
   * `Panel.finishMaterialId` — so a job's laminate is whatever brand its doors are, and the two
   * brands sell the sheet in different sizes. One record carrying both sizes let the cheapest-buy
   * search charge a Laminex sheet on an all-Polytec job, which is the wrong sheet on the order and
   * a plausible-looking number on the quote.
   *
   * `costing.ts` resolves which of these to charge from the decor's own `brand`. Both are priced at
   * the same $60/m² the single record was; if the two brands really differ, that is a price edit
   * rather than a code change.
   */
  {
    id: 'laminate-polytec-1mm',
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
    // 3600 × 1350 = 4.86m² at $60/m² → $291.60.
    sheets: [sheet(3600, 1350, 29_160)],
    indicativePricing: true,
  },
  {
    id: 'laminate-laminex-1mm',
    brand: 'Laminex',
    decor: 'Finish laminate 1mm — matched to the door decor',
    substrate: 'MDF',
    thickness: mm(1),
    grain: 'none',
    colour: '#cfc8bd',
    decorFaces: 1,
    // 3600 × 1500 = 5.40m² at $60/m² → $324.00.
    sheets: [sheet(3600, 1500, 32_400)],
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
    // Column form — bends along the sheet's length. See the block comment above.
    bendAxis: 'length' as const,
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
    // Column form — bends along the sheet's length. See the block comment above.
    bendAxis: 'length' as const,
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
