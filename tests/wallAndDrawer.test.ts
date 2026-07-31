/**
 * Wall cabinet and drawer bank, hand-calculated.
 *
 * Wall reference:   900 W × 720 H × 300 D → side depth 300 − 16 = 284, interior width 868.
 * Drawer reference: 600 W × 720 H × 560 D, three drawers.
 *     front height available   720 − 3 top − 0 bottom      = 717
 *     less two 3mm gaps                                    = 711
 *     ÷ 3                                                  = 237 each
 *     front width              600 − 2×1.5                 = 597
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { equalDrawerFronts } from '../src/core/model/cabinet.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { createCabinet, createEmptyProject, resetIdCounter } from '../src/core/project/factory.ts';
import type { Project } from '../src/core/model/project.ts';
import { byName, namesOf, occupies, size } from './helpers.ts';

let project: Project;

beforeEach(() => {
  resetIdCounter();
  project = createEmptyProject('Test');
});

const wall = (options = {}) =>
  buildCabinet(
    createCabinet({
      typeId: 'wall',
      name: 'W1',
      width: mm(900),
      height: mm(720),
      depth: mm(300),
      x: mm(0),
      options,
    }),
    project,
  );

const drawers = (options = {}) =>
  buildCabinet(
    createCabinet({
      typeId: 'drawer-bank',
      name: 'D1',
      width: mm(600),
      height: mm(720),
      depth: mm(560),
      x: mm(0),
      options,
    }),
    project,
  );

describe('wall cabinet', () => {
  it('takes a full top rather than rails', () => {
    const { panels } = wall();
    expect(namesOf(panels)).toEqual([
      'Side L',
      'Side R',
      'Bottom',
      'Top',
      'Back',
      'Shelf 1',
      'Shelf 2',
      'Door L',
      'Door R',
    ]);
    expect(namesOf(panels)).not.toContain('Top rail front');
  });

  it('cuts carcass parts to the shallower wall depth', () => {
    const { panels } = wall();
    expect(size(byName(panels, 'Side L'))).toEqual([720, 284]);
    expect(size(byName(panels, 'Bottom'))).toEqual([868, 284]);
    expect(size(byName(panels, 'Top'))).toEqual([868, 284]);
    expect(size(byName(panels, 'Back'))).toEqual([900, 720]);
  });

  it('houses the top between the sides at the top of the carcass', () => {
    const { panels } = wall();
    expect(occupies(byName(panels, 'Top'), project)).toEqual({
      x: [16, 884],
      y: [704, 720],
      z: [16, 300],
    });
  });

  it('cuts shelves 866 × 274 and spaces them in thirds', () => {
    const { panels } = wall({ shelfCount: 2 });
    expect(size(byName(panels, 'Shelf 1'))).toEqual([866, 274]);

    const centre = (name: string) => {
      const o = occupies(byName(panels, name), project);
      return (o.y[0] + o.y[1]) / 2;
    };
    // Opening 16 → 704 divided in three.
    expect(centre('Shelf 1')).toBeCloseTo(16 + 688 / 3, 6);
    expect(centre('Shelf 2')).toBeCloseTo(16 + (688 * 2) / 3, 6);
  });

  it('never gets a kick', () => {
    const { panels, warnings } = wall({ hasKick: true });
    expect(namesOf(panels)).not.toContain('Kick');
    expect(warnings.join(' ')).toMatch(/do not take a kick/);
  });

  it('warns about a depth that would foul the bench', () => {
    const built = buildCabinet(
      createCabinet({ typeId: 'wall', name: 'W', width: mm(900), depth: mm(600), x: mm(0) }),
      project,
    );
    expect(built.warnings.join(' ')).toMatch(/foul the benchtop/);
  });
});

describe('drawer bank', () => {
  it('produces a base carcass fronted by drawers', () => {
    const { panels } = drawers({ drawerCount: 3 });
    expect(namesOf(panels)).toEqual([
      'Side L',
      'Side R',
      'Bottom',
      'Top rail front',
      'Top rail back',
      'Back',
      'Drawer front 1',
      'Drawer front 2',
      'Drawer front 3',
      // A Blum box is a bottom and a wooden back; the sides are steel and are bought.
      'Drawer bottom',
      'Drawer back',
      'Drawer bottom',
      'Drawer back',
      'Drawer bottom',
      'Drawer back',
      'Kick',
    ]);
  });

  it('cuts three equal fronts 597 × 237', () => {
    const { panels } = drawers({ drawerCount: 3 });
    for (const n of ['Drawer front 1', 'Drawer front 2', 'Drawer front 3']) {
      expect(size(byName(panels, n))).toEqual([597, 237]);
    }
  });

  it('stacks the fronts bottom-first, flush at the bottom with the reveal at the top', () => {
    const { panels } = drawers({ drawerCount: 3 });
    const y = (n: string) => occupies(byName(panels, n), project).y;

    expect(y('Drawer front 1')).toEqual([0, 237]);
    expect(y('Drawer front 2')).toEqual([240, 477]);
    expect(y('Drawer front 3')).toEqual([480, 717]);

    expect(y('Drawer front 2')[0] - y('Drawer front 1')[1]).toBe(3);
    expect(y('Drawer front 1')[0]).toBe(0); // flush with the carcass bottom
    expect(720 - y('Drawer front 3')[1]).toBe(3); // reveal at the top
  });

  it('sits the fronts proud of the carcass face', () => {
    const { panels } = drawers({ drawerCount: 3 });
    // 2mm standoff off the carcass, then the 18mm front — finishing at 580.
    expect(occupies(byName(panels, 'Drawer front 1'), project).z).toEqual([562, 580]);
  });

  it('honours explicit front heights over an equal split', () => {
    // A deep bottom drawer under two shallower ones. The three must still sum to the 711mm
    // left after the reveals and the two gaps.
    const { panels } = drawers({ drawerFrontHeights: [mm(277), mm(217), mm(217)] });
    expect(size(byName(panels, 'Drawer front 1'))).toEqual([597, 277]);
    expect(size(byName(panels, 'Drawer front 2'))).toEqual([597, 217]);
    // 0 + 277 + 3 + 217 + 3 = 500, and the top front finishes at 717.
    expect(occupies(byName(panels, 'Drawer front 3'), project).y).toEqual([500, 717]);
    expect(drawers({ drawerFrontHeights: [mm(277), mm(217), mm(217)] }).warnings).toEqual([]);
  });

  it('warns when explicit fronts overflow the carcass', () => {
    const { warnings } = drawers({ drawerFrontHeights: [mm(400), mm(400)] });
    expect(warnings.join(' ')).toMatch(/will not fit/);
  });

  it('rejects doors on a drawer bank', () => {
    const { warnings } = drawers({ drawerCount: 3, doorCount: 2 });
    expect(warnings.join(' ')).toMatch(/fronted by drawers, not doors/);
  });
});

describe('equal drawer front splitting', () => {
  it('divides exactly when it can', () => {
    expect(equalDrawerFronts(mm(717), 3, mm(3))).toEqual([237, 237, 237]);
    expect(equalDrawerFronts(mm(717), 4, mm(3))).toEqual([177, 177, 177, 177]);
  });

  it('gives the rounding remainder to the bottom drawer', () => {
    // 717 less six 3mm gaps = 699; 699 ÷ 7 = 99.857, so six at 99 and the bottom takes 105.
    const fronts = equalDrawerFronts(mm(717), 7, mm(3));
    expect(fronts).toEqual([105, 99, 99, 99, 99, 99, 99]);
    expect(fronts.reduce((a, b) => a + b, 0) + 6 * 3).toBe(717);
  });

  it('refuses a split that cannot fit', () => {
    expect(() => equalDrawerFronts(mm(20), 10, mm(3))).toThrow(/exceed/);
  });
});
