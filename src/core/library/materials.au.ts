/**
 * Australian material library seed.
 *
 * Sheet sizes, thicknesses and substrates here are the real local standards — 3600×1800 and
 * 2400×1200 stock, 2440×1220 for imported product, 16/18/25mm, melamine-faced particleboard
 * as the carcass default and MDF as the door substrate. None of that is a localisation pass
 * over a US default; it is the baseline.
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

const sheet = (length: number, width: number, priceExGst: number): SheetSize => ({
  length: mm(length),
  width: mm(width),
  priceExGst,
});

/** AU standard sheet footprint. */
const AU_LARGE = (price: number) => sheet(3600, 1800, price);
const AU_STANDARD = (price: number) => sheet(2400, 1200, price);
/** Imported product runs to the metric-imperial 2440×1220. */
const IMPORTED = (price: number) => sheet(2440, 1220, price);

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
    decorFaces: 2,
    sheets: [AU_LARGE(15_400)],
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
    sheets: [AU_LARGE(9_600), AU_STANDARD(4_400)],
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
    sheets: [AU_LARGE(14_500)],
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
    sheets: [AU_LARGE(13_200)],
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
    sheets: [AU_LARGE(16_800)],
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
};

/** True when any material a quote depends on is still carrying placeholder pricing. */
export const hasIndicativePricing = (lib: MaterialLibrary): boolean =>
  lib.sheets.some((s) => s.indicativePricing) ||
  lib.edgeBands.some((e) => e.indicativePricing) ||
  lib.benchtops.some((b) => b.indicativePricing);
