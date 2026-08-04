import { mm } from '../units.ts';
import type { UpholsteryCharges, UpholsteryMaterial } from '../model/material.ts';

/**
 * What the upholsterer charges, from the shop.
 *
 * > "I generally allow $350 per lineal metre — that applies to the base and separately to the back
 * > or any returns."
 *
 * **This one is the shop's own working figure, not a placeholder**, which makes it different from
 * the dollars in `materials.au.ts` and `blum.ts`. It is an allowance rather than a quoted price —
 * what he prices a job at before the upholsterer has quoted it — so it is flagged as indicative in
 * the same way, and for the same reason: a number nobody has confirmed against an invoice is a
 * number that gets trusted.
 *
 * One rate for the whole range, because it is charged by the metre of cushion rather than by the
 * fabric. If a heavier fabric ever costs more to make up, this becomes a figure per record and
 * nothing else changes — which is why it lives on the material rather than in settings.
 */
const UPHOLSTERER_CHARGES: UpholsteryCharges = { perLinealMetreExGst: 35_000 };

/**
 * How much fabric one Warwick swatch image covers, edge to edge.
 *
 * **An estimate, and it should be corrected against a real sample.** Warwick publish these as
 * pictures of a fabric, not as scaled drawings, so nothing in the file says what they cover. A
 * swatch photographed for a website is typically a hand-sized piece, and 300mm renders a weave
 * that reads as fabric at cushion scale rather than as noise or as flat colour.
 *
 * Nothing is cut, priced or ordered from it — it decides how big the weave looks on screen and
 * nothing else. Measure a sample against the image and change this one number.
 */
const SWATCH_COVERS = mm(300);

const caulfield = (colour: string, fallback: string, extension = 'jpg'): UpholsteryMaterial => ({
  id: `warwick-caulfield-${colour.toLowerCase()}`,
  brand: 'Warwick',
  collection: 'Caulfield',
  colour,
  colourFallback: fallback,
  textureUrl: `/materials/upholstery/${colour.toLowerCase()}.${extension}`,
  textureRepeat: SWATCH_COVERS,
  sourceUrl: `https://www.warwick.com.au/products/caulfield/${colour.toLowerCase()}/`,
  width: mm(1420),
  composition: '100% polyester',
  abrasionCycles: 75_000,
  charges: UPHOLSTERER_CHARGES,
  indicativePricing: true,
});

/** Initial official Warwick Caulfield palette for banquette upholstery. */
export const AU_UPHOLSTERY_MATERIALS: readonly UpholsteryMaterial[] = [
  caulfield('Oatmeal', '#b6a78f'),
  caulfield('Bone', '#d4cdbc'),
  caulfield('Taupe', '#8d7c6c'),
  caulfield('Rust', '#9b5037'),
  caulfield('Moss', '#66705a'),
  /*
   * Pickle points at the `.webp`, and that is the fix rather than an inconsistency.
   *
   * `pickle.jpg` in `public/` is not a JPEG — it is byte-for-byte the same WebP as
   * `pickle.webp`, saved under the wrong extension. Browsers sniff the content and decode it
   * anyway, so it renders, which is exactly why nobody caught it. Naming the file that is what
   * it says it is beats relying on sniffing. `pickle.jpg` is now unreferenced.
   */
  caulfield('Pickle', '#78853f', 'webp'),
  caulfield('Ocean', '#3e6870'),
  caulfield('Navy', '#263849'),
  caulfield('Charcoal', '#414344'),
];
