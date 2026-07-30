/**
 * The hardware bill of materials.
 *
 * **Counted from what was actually built, never from what was asked for.** A door that came out too
 * narrow to bore is not charged a hinge; a drawer bank whose depth no runner fits does not order
 * three runner sets; a shelf the corner radius ate does not order four pins. The panels and their
 * features are the record of what the job really is, so they are what gets counted — the same reason
 * `machinedFronts` counts routed fronts off the features rather than off the style on the cabinet.
 *
 * Derived, and never stored in the project. Same rule as the cutlist and the costing: change a
 * cabinet and the BOM follows, because there is nowhere for a stale copy to hide.
 */

import { type Cents, type Mm, roundCents } from '../units.ts';
import type { Panel } from '../model/panel.ts';
import type { Project } from '../model/project.ts';
import {
  type HardwareCategory,
  type HardwareUnit,
  findHardwareItem,
} from '../model/hardware.ts';
import { PINS_PER_SHELF, SHELF_PIN_ITEM_ID } from '../library/blum.ts';
import { type BuiltCabinet, buildProject } from '../rules/build.ts';

export interface HardwareBomLine {
  /** Stable grouping key — identical hardware across cabinets collapses onto one line. */
  readonly key: string;
  readonly category: HardwareCategory;
  /** What to write on the order. */
  readonly name: string;
  /** Supplier code where there is a real one. */
  readonly code?: string;
  readonly quantity: number;
  readonly unit: HardwareUnit;
  readonly unitPriceExGst: Cents;
  readonly totalExGst: Cents;
  readonly cabinetNames: readonly string[];
  readonly indicativePricing: boolean;
  readonly note?: string;
}

const cupCount = (panels: readonly Panel[]): number =>
  panels.reduce(
    (sum, p) => sum + p.features.filter((f) => f.purpose === 'hinge-cup').length,
    0,
  );

const roleCount = (panels: readonly Panel[], role: Panel['role']): number =>
  panels.filter((p) => p.role === role).length;

interface Tally {
  readonly key: string;
  readonly category: HardwareCategory;
  readonly name: string;
  readonly code?: string;
  readonly unit: HardwareUnit;
  readonly unitPriceExGst: Cents;
  readonly indicativePricing: boolean;
  readonly note?: string;
  quantity: number;
  cabinetNames: string[];
}

/**
 * The hardware one cabinet needs.
 *
 * Kept as a function of a single `BuiltCabinet` so it can be checked against one cabinet by hand,
 * which is the verification standard everything here is held to.
 */
export const hardwareForCabinet = (
  built: BuiltCabinet,
  project: Project,
): readonly Omit<HardwareBomLine, 'totalExGst' | 'cabinetNames'>[] => {
  const lines: Omit<HardwareBomLine, 'totalExGst' | 'cabinetNames'>[] = [];
  const { panels, hardware } = built;

  /*
   * Drawer boxes. One set per box, and the set is what gets ordered: a MERIVOBOX drawer at a height
   * and a nominal length arrives as runners, sides, back brackets and front fixings together.
   *
   * Counted off the bottoms rather than off `drawerCount`, so a bank with no runner that fits
   * orders nothing — which is the whole point of counting from the parts.
   */
  const boxes = roleCount(panels, 'drawer-bottom');
  if (boxes > 0 && hardware.runner) {
    const { system, sideHeight, nominalLength } = hardware.runner;
    lines.push({
      key: `runner|${system.id}|${sideHeight.code}|${nominalLength}`,
      category: 'drawer-set',
      name: `${system.brand} ${system.name} drawer set — ${sideHeight.name}, NL ${nominalLength}, ${system.loadRatingKg}kg`,
      unit: 'set',
      unitPriceExGst: system.setPriceExGst,
      indicativePricing: system.indicativePricing,
      quantity: boxes,
      note: 'Runners, sides, back brackets and front fixings. Bottom and back are on the cutlist.',
    });
  }

  /*
   * Hinges and plates, one plate per hinge. Counted from the cups actually bored: a door that could
   * not take a cup is not charged for a hinge it never got.
   */
  const hinges = cupCount(panels);
  if (hinges > 0) {
    const h = hardware.hinge;
    lines.push({
      key: `hinge|${h.id}`,
      category: 'hinge',
      name: `${h.brand} ${h.name}`,
      unit: 'each',
      unitPriceExGst: h.hingePriceExGst,
      indicativePricing: h.indicativePricing,
      quantity: hinges,
    });
    lines.push({
      key: `hinge-plate|${h.id}`,
      category: 'hinge-plate',
      name: `${h.brand} mounting plate for ${h.name}`,
      unit: 'each',
      unitPriceExGst: h.platePriceExGst,
      indicativePricing: h.indicativePricing,
      quantity: hinges,
    });
  }

  const shelves = roleCount(panels, 'shelf-adjustable');
  if (shelves > 0) {
    const pin = findHardwareItem(project.hardware, SHELF_PIN_ITEM_ID);
    if (pin) {
      lines.push({
        key: `item|${pin.id}`,
        category: pin.category,
        name: pin.name,
        code: pin.code,
        unit: pin.unit,
        unitPriceExGst: pin.priceExGst,
        indicativePricing: pin.indicativePricing,
        quantity: shelves * PINS_PER_SHELF,
        note: pin.note,
      });
    }
  }

  return lines;
};

/** Order lines in the order a supplier order tends to be written: boxes, hinges, then the bits. */
const CATEGORY_ORDER: readonly HardwareCategory[] = [
  'drawer-set',
  'hinge',
  'hinge-plate',
  'shelf-pin',
  'other',
];

export const buildHardwareBom = (project: Project): readonly HardwareBomLine[] => {
  const tallies = new Map<string, Tally>();

  for (const built of buildProject(project)) {
    for (const line of hardwareForCabinet(built, project)) {
      const existing = tallies.get(line.key);
      if (existing) {
        existing.quantity += line.quantity;
        if (!existing.cabinetNames.includes(built.cabinet.name)) {
          existing.cabinetNames.push(built.cabinet.name);
        }
      } else {
        tallies.set(line.key, { ...line, cabinetNames: [built.cabinet.name] });
      }
    }
  }

  return [...tallies.values()]
    .map((t) => ({
      ...t,
      cabinetNames: t.cabinetNames,
      totalExGst: roundCents(t.quantity * t.unitPriceExGst),
    }))
    .sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
        a.name.localeCompare(b.name),
    );
};

export const hardwareBomTotals = (lines: readonly HardwareBomLine[]) => ({
  lineCount: lines.length,
  pieceCount: lines.reduce((s, l) => s + l.quantity, 0),
  totalExGst: lines.reduce((s, l) => s + l.totalExGst, 0),
  indicativePricing: lines.some((l) => l.indicativePricing),
});

/**
 * The drilling on one job, summarised — how many holes of each diameter, and how many of them need
 * the part turned over.
 *
 * Not a BOM line and not a cost. It is the number worth looking at before sending a job to a
 * machine, because the flip count is what tells you how many setups a run really is, and a
 * diameter nobody has a bit for is worth finding out before the spindle starts.
 */
export interface DrillingSummary {
  readonly diameter: Mm;
  readonly depth: Mm;
  readonly count: number;
  readonly purposes: readonly string[];
  /** True when this group is bored on the B-face and so needs the part flipped. */
  readonly needsFlip: boolean;
}

export const drillingSummary = (project: Project): readonly DrillingSummary[] => {
  const groups = new Map<string, { d: Mm; z: Mm; count: number; purposes: Set<string>; flip: boolean }>();

  for (const panel of buildProject(project).flatMap((b) => b.panels)) {
    for (const f of panel.features) {
      if (f.kind !== 'drill' && f.kind !== 'drill-line') continue;
      const holes = f.kind === 'drill' ? 1 : f.count;
      const key = `${f.diameter}|${f.depth}|${f.face}`;
      const entry =
        groups.get(key) ??
        { d: f.diameter, z: f.depth, count: 0, purposes: new Set<string>(), flip: f.face === 'B' };
      entry.count += holes;
      entry.purposes.add(f.purpose);
      groups.set(key, entry);
    }
  }

  return [...groups.values()]
    .map((g) => ({
      diameter: g.d,
      depth: g.z,
      count: g.count,
      purposes: [...g.purposes].sort(),
      needsFlip: g.flip,
    }))
    .sort((a, b) => b.diameter - a.diameter || b.count - a.count);
};
