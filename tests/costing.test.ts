/**
 * Costing, with the GST treatment checked in both registration contexts.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { costProject, sheetRatePerM2 } from '../src/core/costing/costing.ts';
import { GST_RATE, addGst, effectiveCost, gstComponent, gstOnSale, removeGst } from '../src/core/costing/gst.ts';
import { bestValueSheet, findSheet, smallestSheetFitting } from '../src/core/model/material.ts';
import { bandedEdgeCount } from '../src/core/model/panel.ts';
import { allPanels } from '../src/core/rules/build.ts';
import { AU_MATERIAL_LIBRARY } from '../src/core/library/materials.au.ts';
import { createCabinet, createEmptyProject, resetIdCounter } from '../src/core/project/factory.ts';
import type { Project } from '../src/core/model/project.ts';

let project: Project;

const withCabinet = (p: Project): Project => ({
  ...p,
  cabinets: [
    createCabinet({
      typeId: 'base',
      name: 'B1',
      width: mm(900),
      height: mm(720),
      depth: mm(560),
      x: mm(0),
    }),
  ],
});

beforeEach(() => {
  resetIdCounter();
  project = withCabinet(createEmptyProject('Costing test'));
});

describe('GST arithmetic', () => {
  it('adds and removes 10%', () => {
    expect(GST_RATE).toBe(0.1);
    expect(addGst(10_000)).toBe(11_000);
    expect(removeGst(11_000)).toBe(10_000);
  });

  it('takes the GST component as one eleventh of a tax-inclusive amount', () => {
    expect(gstComponent(11_000)).toBe(1_000);
  });

  it('makes unclaimable GST a real cost for an unregistered entity', () => {
    // A registered entity claims the input credit back, so a $100 sheet costs $100.
    expect(effectiveCost(10_000, 'registered')).toBe(10_000);
    // An unregistered one cannot, so the same sheet really costs $110.
    expect(effectiveCost(10_000, 'not-registered')).toBe(11_000);
  });

  it('charges GST on the sale only when registered', () => {
    expect(gstOnSale(100_000, 'registered')).toBe(10_000);
    expect(gstOnSale(100_000, 'not-registered')).toBe(0);
  });
});

describe('GST mode changes the cost base, not just the invoice', () => {
  const registered = () => costProject({ ...project, settings: { ...project.settings, gstMode: 'registered' } });
  const unregistered = () =>
    costProject({ ...project, settings: { ...project.settings, gstMode: 'not-registered' } });

  it('costs materials 10% higher when GST cannot be claimed back', () => {
    const r = registered();
    const u = unregistered();

    expect(u.materialCost).toBeGreaterThan(r.materialCost);
    expect(u.materialCost / r.materialCost).toBeCloseTo(1.1, 3);

    // Every panel's cost is rounded to whole cents independently, so the two totals can't be
    // in exact 1.1 proportion. Bound the drift at half a cent per panel, which is the most
    // that rounding can contribute.
    const drift = Math.abs(u.materialCost - r.materialCost * 1.1);
    expect(drift).toBeLessThanOrEqual(r.panels.length * 0.5 + 1);
  });

  it('leaves labour unaffected — there is no input credit on your own time', () => {
    expect(unregistered().labourCost).toBe(registered().labourCost);
  });

  it('charges GST on the sale when registered and none when not', () => {
    const r = registered();
    expect(r.gst).toBe(Math.round(r.sellExGst * 0.1));
    expect(r.totalIncGst).toBe(r.sellExGst + r.gst);

    const u = unregistered();
    expect(u.gst).toBe(0);
    expect(u.totalIncGst).toBe(u.sellExGst);
  });

  it('reports the mode it costed under', () => {
    expect(registered().gstMode).toBe('registered');
    expect(unregistered().gstMode).toBe('not-registered');
  });
});

describe('sheet pricing', () => {
  it('rates a material per square metre off its best-value sheet', () => {
    const material = findSheet(AU_MATERIAL_LIBRARY, 'poly-classic-white-16');
    // 3600 × 1800 = 6.48 m² at $105 ex-GST.
    expect(sheetRatePerM2(material)).toBeCloseTo(10_500 / 6.48, 6);
  });

  it('prefers the 3600×1800 sheet over the 2400×1200 on rate', () => {
    const material = findSheet(AU_MATERIAL_LIBRARY, 'poly-classic-white-16');
    const best = bestValueSheet(material);
    expect([best.length, best.width]).toEqual([3600, 1800]);
  });

  it('will not rotate a grained part onto a sheet it only fits sideways', () => {
    const grained = findSheet(AU_MATERIAL_LIBRARY, 'poly-sepia-oak-16');
    expect(grained.grain).toBe('length');
    // 1700 × 3000 fits a 3600×1800 sheet only if turned 90°, which grain forbids.
    expect(smallestSheetFitting(grained, mm(1700), mm(3000))).toBeNull();

    const plain = findSheet(AU_MATERIAL_LIBRARY, 'poly-classic-white-16');
    expect(smallestSheetFitting(plain, mm(1700), mm(3000))).not.toBeNull();
  });

  it('picks the smallest sheet a part actually fits on', () => {
    const material = findSheet(AU_MATERIAL_LIBRARY, 'poly-classic-white-16');
    const fit = smallestSheetFitting(material, mm(700), mm(500));
    expect([fit?.length, fit?.width]).toEqual([2400, 1200]);
  });
});

describe('cost breakdown', () => {
  it('adds up', () => {
    const c = costProject(project);
    const panelSum = c.panels.reduce((s, p) => s + p.totalCost, 0);

    expect(c.materialCost).toBe(c.sheetCost + c.edgeBandCost + c.hardwareCost);
    // The panels account for the sheet and the banding. The hardware is bought stock counted off
    // those same panels' features, and it is not attributed back onto any one of them.
    expect(c.materialCost).toBe(panelSum + c.hardwareCost);
    expect(c.totalCost).toBe(c.materialCost + c.labourCost + c.installCost);
    expect(c.subtotalExGst).toBe(c.totalCost + c.marginAmount);
    expect(c.sellExGst).toBe(c.subtotalExGst + c.deliveryFee);
    expect(c.totalIncGst).toBe(c.sellExGst + c.gst);
  });

  it('applies the margin percentage to cost', () => {
    const c = costProject({ ...project, settings: { ...project.settings, marginPercent: 35 } });
    expect(c.marginAmount).toBe(Math.round(c.totalCost * 0.35));
  });

  it('bills labour from panel, edge and cabinet allowances', () => {
    const c = costProject(project);
    const { minutesPerPanel, minutesPerBandedEdge, minutesPerCabinet, ratePerHourExGst } =
      project.settings.labour;

    // Recount the banded edges straight off the panels rather than trusting the breakdown.
    const bandedEdges = allPanels(project).reduce((s, p) => s + bandedEdgeCount(p), 0);
    expect(bandedEdges).toBeGreaterThan(0);

    // 10 panels × 4 min + banded edges × 1.5 min + 1 cabinet × 25 min.
    expect(c.panelCount).toBe(10);
    expect(c.labourMinutes).toBe(
      10 * minutesPerPanel + bandedEdges * minutesPerBandedEdge + 1 * minutesPerCabinet,
    );
    expect(c.labourCost).toBe(Math.round((c.labourMinutes / 60) * ratePerHourExGst * 100));
  });

  it('summarises by material, dearest first', () => {
    const c = costProject(project);
    const costs = c.byMaterial.map((m) => m.cost);
    expect([...costs].sort((a, b) => b - a)).toEqual(costs);
    // Carcass and back share one board spec; only the fronts carry a decor.
    expect(c.byMaterial.map((m) => m.materialId).sort()).toEqual(
      ['hmr-white-16', 'poly-classic-white-door-18'].sort(),
    );
  });

  it('buys whole sheets, counted off the nest, and reports the yield it achieved', () => {
    const c = costProject(project);
    for (const m of c.byMaterial) {
      expect(m.sheets).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(m.sheets)).toBe(true);
      // Bought area is whole sheets — never the part area with an allowance over it.
      expect(m.boughtM2).toBeGreaterThan(m.footprintM2);
      expect(m.yield).toBeCloseTo(m.footprintM2 / m.boughtM2, 9);
      expect(m.yield).toBeGreaterThan(0);
      expect(m.yield).toBeLessThanOrEqual(1);
    }
  });

  it('flags that the quote rests on placeholder pricing', () => {
    // Every seeded material carries indicative rates until real trade prices are loaded.
    expect(costProject(project).usesIndicativePricing).toBe(true);
  });

  it('warns when a part is too big for any sheet of its material', () => {
    const oversized: Project = {
      ...project,
      cabinets: [
        createCabinet({
          typeId: 'base',
          name: 'Huge',
          width: mm(4000),
          height: mm(2000),
          depth: mm(560),
          x: mm(0),
        }),
      ],
    };
    expect(costProject(oversized).warnings.join(' ')).toMatch(/too big for any/);
  });
});
