/**
 * The Phase 1 gate: "design a real kitchen run and see accurate parts + rough cost".
 *
 * The sample kitchen is a 3000mm base run — sink base, three pot drawers, bin cupboard,
 * pantry base — with 2400mm of wall cabinets over it.
 *
 * Expected part count, counted by hand:
 *
 *   B1 sink base   900, 2 doors, no shelf   2 sides + bottom + 2 rails + back + 2 doors + kick  =  9
 *   D1 pot drawers 600, 3 drawers           2 sides + bottom + 2 rails + back + 3 fronts + kick = 10
 *   B2 bin cupbd   600, 1 door,  no shelf   2 sides + bottom + 2 rails + back + 1 door  + kick  =  8
 *   B3 pantry base 900, 2 doors, 1 shelf    2 sides + bottom + 2 rails + back + shelf + 2 doors + kick = 10
 *   W1 wall        900, 2 doors, 2 shelves  2 sides + bottom + top + back + 2 shelves + 2 doors =  9
 *   W2 wall        600, 1 door,  2 shelves  2 sides + bottom + top + back + 2 shelves + 1 door  =  8
 *   W3 wall        900, 2 doors, 2 shelves                                                      =  9
 *                                                                                        total = 63
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createSampleKitchen, resetIdCounter } from '../src/core/project/factory.ts';
import { allPanels, buildProject } from '../src/core/rules/build.ts';
import { costProject } from '../src/core/costing/costing.ts';
import { buildCutlist, cutlistTotals } from '../src/core/cutlist/cutlist.ts';
import { centsToAud } from '../src/core/units.ts';
import { partToWorld } from '../src/core/geom/placement.ts';
import { v3 } from '../src/core/geom/vec.ts';
import type { Project } from '../src/core/model/project.ts';

let kitchen: Project;

beforeEach(() => {
  resetIdCounter();
  kitchen = createSampleKitchen();
});

describe('the kitchen run builds', () => {
  it('has seven cabinets making up a 3000mm base run and 2400mm of wall units', () => {
    expect(kitchen.cabinets).toHaveLength(7);

    const bases = kitchen.cabinets.filter((c) => c.typeId !== 'wall');
    const walls = kitchen.cabinets.filter((c) => c.typeId === 'wall');
    expect(bases.reduce((s, c) => s + c.width, 0)).toBe(3000);
    expect(walls.reduce((s, c) => s + c.width, 0)).toBe(2400);
  });

  /**
   * 63 was the Phase 1 figure and every one of those parts is still here, the same size and in the
   * same place. The extra six are the drawer boxes Phase 1 deliberately did not cut: D1 has three
   * drawers, and a Blum box contributes a bottom and a wooden back each. The steel sides are bought,
   * not cut, so they are on the hardware BOM and not on this list.
   */
  it('produces 69 parts — the Phase 1 63, plus a bottom and a back for each of D1\'s three drawers', () => {
    const panels = allPanels(kitchen);
    expect(panels).toHaveLength(69);
    expect(panels.filter((p) => p.role === 'drawer-bottom')).toHaveLength(3);
    expect(panels.filter((p) => p.role === 'drawer-back')).toHaveLength(3);
    expect(panels.filter((p) => p.role !== 'drawer-bottom' && p.role !== 'drawer-back')).toHaveLength(63);
  });

  it('builds every cabinet without a dimensional warning', () => {
    const warnings = buildProject(kitchen).flatMap((b) => b.warnings);
    expect(warnings).toEqual([]);
  });

  it('gives every part a unique id', () => {
    const ids = allPanels(kitchen).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the run sits correctly in the room', () => {
  it('stands the base run on its kick with the carcass top at 870mm', () => {
    const base = kitchen.cabinets.find((c) => c.name === 'B1 Sink base')!;
    // Carcass origin sits on top of the 150mm kick.
    expect(base.placement.anchor.y).toBe(150);
    // 150 kick + 720 carcass = 870, which a 30mm benchtop takes to the AU standard 900.
    expect(base.placement.anchor.y + base.height).toBe(870);
  });

  it('hangs the wall cabinets at 1500mm, leaving a 600mm splashback', () => {
    const wall = kitchen.cabinets.find((c) => c.name === 'W1')!;
    expect(wall.placement.anchor.y).toBe(1500);
    // Benchtop surface is at 900, so the gap under the wall units is 600.
    expect(wall.placement.anchor.y - 900).toBe(600);
    expect(wall.placement.anchor.y + wall.height).toBe(2220);
  });

  it('butts the base cabinets along the wall without gaps or overlaps', () => {
    const bases = kitchen.cabinets
      .filter((c) => c.typeId !== 'wall')
      .sort((a, b) => a.placement.anchor.x - b.placement.anchor.x);

    let x = 0;
    for (const cabinet of bases) {
      expect(cabinet.placement.anchor.x).toBe(x);
      x += cabinet.width;
    }
    expect(x).toBe(3000);
  });

  it('puts every part inside the room and above the floor', () => {
    const room = kitchen.room;
    for (const built of buildProject(kitchen)) {
      const { placement } = built.cabinet;
      for (const panel of built.panels) {
        const corner = partToWorld(placement, panel.placement, v3(0, 0, 0));
        expect(corner.y).toBeGreaterThanOrEqual(0);
        expect(corner.y).toBeLessThanOrEqual(room.ceilingHeight);
      }
    }
  });

  it('keeps the wall cabinets clear of the benchtop in plan', () => {
    const wall = kitchen.cabinets.find((c) => c.name === 'W1')!;
    const base = kitchen.cabinets.find((c) => c.name === 'B1 Sink base')!;
    // Both back onto the same wall; the wall unit must be the shallower of the two.
    expect(wall.depth).toBeLessThan(base.depth);
    expect(wall.depth).toBe(300);
    expect(base.depth).toBe(560);
  });
});

describe('the cutlist reads like a real one', () => {
  it('collapses identical parts onto one line', () => {
    const lines = buildCutlist(kitchen);
    const totals = cutlistTotals(lines);

    expect(totals.partCount).toBe(69);
    // Identical parts repeat across cabinets, so there must be fewer lines than parts.
    expect(totals.lineCount).toBeLessThan(69);
    expect(totals.lineCount).toBeGreaterThan(0);
  });

  it('groups the four 720 × 544 base sides that share a size onto fewer lines than parts', () => {
    const lines = buildCutlist(kitchen);
    const baseSides = lines.filter(
      (l) => l.name.startsWith('Side') && l.length === 720 && l.width === 544,
    );
    // Four base cabinets, two sides each — left and right band different edges, so they
    // land on two lines of four.
    expect(baseSides).toHaveLength(2);
    expect(baseSides.reduce((s, l) => s + l.quantity, 0)).toBe(8);
    expect(baseSides.map((l) => l.banding).sort()).toEqual(['L1', 'L2']);
  });

  it('lists thicker material first', () => {
    const thicknesses = buildCutlist(kitchen).map((l) => l.thickness);
    expect([...thicknesses].sort((a, b) => b - a)).toEqual(thicknesses);
  });

  it('records banding and grain for every line', () => {
    for (const line of buildCutlist(kitchen)) {
      expect(line.banding).toMatch(/^(—|(L1|L2|W1|W2)( (L1|L2|W1|W2))*)$/);
      expect(['Length', 'Width', 'Free']).toContain(line.grain);
      expect(line.quantity).toBeGreaterThan(0);
    }
  });
});

describe('the run costs out', () => {
  it('produces a coherent breakdown', () => {
    const c = costProject(kitchen);

    expect(c.cabinetCount).toBe(7);
    expect(c.panelCount).toBe(69);
    expect(c.warnings).toEqual([]);

    expect(c.materialCost).toBe(c.sheetCost + c.edgeBandCost + c.hardwareCost);
    expect(c.totalCost).toBe(c.materialCost + c.labourCost + c.installCost);
    expect(c.subtotalExGst).toBe(c.totalCost + c.marginAmount);
    expect(c.sellExGst).toBe(c.subtotalExGst + c.deliveryFee);
    expect(c.totalIncGst).toBe(c.sellExGst + c.gst);
  });

  it('lands in a believable range for a 3m kitchen on indicative rates', () => {
    const c = costProject(kitchen);
    const sell = centsToAud(c.totalIncGst);
    // Carcasses, fronts, drawer boxes and hardware. No benchtop, appliances or joinery beyond the
    // cabinets, which arrive in later phases.
    expect(sell).toBeGreaterThan(1_200);
    expect(sell).toBeLessThan(10_000);
  });

  it('splits cost sensibly between material and labour', () => {
    const c = costProject(kitchen);
    // Roughly $400 of sheet and banding against ~9 hours in the shop. Neither should vanish.
    expect(centsToAud(c.materialCost)).toBeGreaterThan(200);
    expect(centsToAud(c.labourCost)).toBeGreaterThan(300);
    expect(c.labourMinutes / 60).toBeGreaterThan(5);
    expect(c.labourMinutes / 60).toBeLessThan(20);
  });

  it('needs more than one sheet of carcass material', () => {
    const c = costProject(kitchen);
    const carcass = c.byMaterial.find((m) => m.materialId === 'hmr-white-16')!;
    expect(carcass.estimatedSheets).toBeGreaterThan(1);
    expect(carcass.panelCount).toBeGreaterThan(20);
  });

  it('costs the same job higher for an unregistered entity', () => {
    const registered = costProject(kitchen);
    const personal = costProject({
      ...kitchen,
      settings: { ...kitchen.settings, gstMode: 'not-registered', entityName: 'Personal ABN' },
    });

    // Materials cost more, because the GST on them can't be claimed back...
    expect(personal.materialCost).toBeGreaterThan(registered.materialCost);
    // ...but nothing is charged on the invoice.
    expect(personal.gst).toBe(0);
    expect(registered.gst).toBeGreaterThan(0);
  });

  it('says out loud that it is running on placeholder pricing', () => {
    expect(costProject(kitchen).usesIndicativePricing).toBe(true);
  });
});
