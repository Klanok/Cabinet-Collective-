import { mm } from '../units.ts';
import type { UpholsteryMaterial } from '../model/material.ts';

const caulfield = (colour: string, code: string, fallback: string): UpholsteryMaterial => ({
  id: `warwick-caulfield-${colour.toLowerCase()}`,
  brand: 'Warwick',
  collection: 'Caulfield',
  colour,
  colourFallback: fallback,
  textureUrl: `https://www.warwick.com.au/media/uploads/products/sharedproductinfo/caulfield_${colour.toLowerCase()}/FCA55${code}.jpg`,
  sourceUrl: `https://www.warwick.com.au/products/caulfield/${colour.toLowerCase()}/`,
  width: mm(1420),
  composition: '100% polyester',
  abrasionCycles: 75_000,
});

/** Initial official Warwick Caulfield palette for banquette upholstery. */
export const AU_UPHOLSTERY_MATERIALS: readonly UpholsteryMaterial[] = [
  caulfield('Oatmeal', 'OATM', '#b6a78f'),
  caulfield('Bone', 'BONE', '#d4cdbc'),
  caulfield('Taupe', 'TAUP', '#8d7c6c'),
  caulfield('Rust', 'RUST', '#9b5037'),
  caulfield('Moss', 'MOSS', '#66705a'),
  caulfield('Ocean', 'OCEA', '#3e6870'),
  caulfield('Navy', 'NAVY', '#263849'),
  caulfield('Charcoal', 'CHAR', '#414344'),
];
