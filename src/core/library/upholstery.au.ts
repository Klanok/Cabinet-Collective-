import { mm } from '../units.ts';
import type { UpholsteryMaterial } from '../model/material.ts';

const caulfield = (colour: string, fallback: string): UpholsteryMaterial => ({
  id: `warwick-caulfield-${colour.toLowerCase()}`,
  brand: 'Warwick',
  collection: 'Caulfield',
  colour,
  colourFallback: fallback,
  textureUrl: `/materials/upholstery/${colour.toLowerCase()}.jpg`,
  sourceUrl: `https://www.warwick.com.au/products/caulfield/${colour.toLowerCase()}/`,
  width: mm(1420),
  composition: '100% polyester',
  abrasionCycles: 75_000,
});

/** Initial official Warwick Caulfield palette for banquette upholstery. */
export const AU_UPHOLSTERY_MATERIALS: readonly UpholsteryMaterial[] = [
  caulfield('Oatmeal', '#b6a78f'),
  caulfield('Bone', '#d4cdbc'),
  caulfield('Taupe', '#8d7c6c'),
  caulfield('Rust', '#9b5037'),
  caulfield('Moss', '#66705a'),
  caulfield('Ocean', '#3e6870'),
  caulfield('Navy', '#263849'),
  caulfield('Charcoal', '#414344'),
];
