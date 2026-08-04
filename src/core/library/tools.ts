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
  /*
   * The Woodtron's `10COMP3W` — a 10mm three-wing compression spiral, which is what that machine
   * cuts parts out with. A compression spiral is straight-sided: up-cut at the tip and down-cut
   * above it so both faces of a laminated board come out clean, but what it *leaves* is a 10mm
   * slot, and §2's rule is that a cutter's section is the only thing that decides a cut's width.
   * So it is a straight tool here, and the compression is a purchasing fact rather than a
   * geometric one.
   */
  { id: 'straight-10', name: '10mm compression spiral', section: { kind: 'straight', diameter: mm(10) } },
  { id: 'straight-12', name: '12mm straight', section: { kind: 'straight', diameter: mm(12) } },
  { id: 'straight-16', name: '16mm straight', section: { kind: 'straight', diameter: mm(16) } },
  { id: 'vee-90', name: '90° vee', section: { kind: 'vee', includedAngleDeg: 90 } },
  { id: 'vee-60', name: '60° vee', section: { kind: 'vee', includedAngleDeg: 60 } },
  { id: 'round-6', name: '6mm round nose', section: { kind: 'round', radius: mm(3) } },

  /*
   * ── Drills ──────────────────────────────────────────────────────────────────────────────
   *
   * A drill is a `ToolProfile` like any other, and a straight-sided one: what it leaves is a
   * cylinder of its own diameter. Modelling it as anything else would mean CAM having two ways to
   * ask "how wide is this cut", which is the thing this codebase exists not to do.
   *
   * The four sizes are the ones the hardware rules actually call for, and each traces to a real
   * figure in `library/blum.ts` rather than being a catalogue. Adding a fifth means a job wanted a
   * hole nobody has a bit for, and CAM says so by name rather than boring it with the nearest one.
   */
  { id: 'drill-3', name: '3mm drill', section: { kind: 'straight', diameter: mm(3) } },
  { id: 'drill-5', name: '5mm drill', section: { kind: 'straight', diameter: mm(5) } },
  { id: 'drill-8', name: '8mm drill', section: { kind: 'straight', diameter: mm(8) } },
  {
    id: 'drill-35',
    name: '35mm hinge boring bit',
    section: { kind: 'straight', diameter: mm(35) },
  },
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
