/**
 * The cutters a door style can be machined with.
 *
 * Deliberately a short list of the bits actually in the rack, not a tooling catalogue. A door
 * style names one by id; the geometry it produces is derived from the cutter's own section
 * (see `cutWidthAtDepth`), so changing which bit a style uses changes what the style looks
 * like without anything else having to be edited to match.
 *
 * Phase 4 will own the real tool library — feeds, speeds, holder numbers, the lot. This is the
 * seam that grows into it, not a throwaway: the id a style stores is the id CAM will look up.
 */

import { mm } from '../units.ts';
import type { ToolProfile } from '../model/feature.ts';

export const STOCK_TOOLS: readonly ToolProfile[] = [
  { id: 'straight-6', name: '6mm straight', section: { kind: 'straight', diameter: mm(6) } },
  { id: 'straight-12', name: '12mm straight', section: { kind: 'straight', diameter: mm(12) } },
  { id: 'straight-16', name: '16mm straight', section: { kind: 'straight', diameter: mm(16) } },
  { id: 'vee-90', name: '90° vee', section: { kind: 'vee', includedAngleDeg: 90 } },
  { id: 'vee-60', name: '60° vee', section: { kind: 'vee', includedAngleDeg: 60 } },
  { id: 'round-6', name: '6mm round nose', section: { kind: 'round', radius: mm(3) } },
];

/** The bit a pocket is cleared with when a style doesn't say. */
export const DEFAULT_POCKET_TOOL_ID = 'straight-12';

export const findTool = (id: string): ToolProfile => {
  const found = STOCK_TOOLS.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown tool profile: ${id}`);
  return found;
};

/** Lookup that doesn't throw — for UI that has to render a style referencing a missing bit. */
export const findToolOrNull = (id: string): ToolProfile | null =>
  STOCK_TOOLS.find((t) => t.id === id) ?? null;
