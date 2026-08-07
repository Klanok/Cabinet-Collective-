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
import { equalDrawerFronts, setDrawerFrontHeight } from '../src/core/model/cabinet.ts';
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

  /*
   * §5.11. The bug was not the warning — the bank warned all along — it was that the fronts were
   * laid out at the asked-for heights anyway, so the top one finished above the top of the
   * carcass. The assertions that bite are about **where the fronts end up**, so they are written
   * on occupancy rather than on size: a 155mm front in the wrong place is the same 155mm front.
   */
  describe('explicit fronts that do not fit', () => {
    // 400 + 400 + one 3mm gap + the 3mm top reveal = 806 in a 720mm carcass.
    const tooTall = { drawerFrontHeights: [mm(400), mm(400)] };

    it('brings the stack back inside the carcass instead of building past it', () => {
      const { panels } = drawers(tooTall);
      const top = occupies(byName(panels, 'Drawer front 2'), project).y;
      // Nothing above the carcass, and the 3mm top reveal still there.
      expect(top[1]).toBe(717);
      expect(occupies(byName(panels, 'Drawer front 1'), project).y).toEqual([0, 357]);
      expect(top).toEqual([360, 717]);
    });

    it('shares the reduction equally rather than taking it off one front', () => {
      const { panels } = drawers(tooTall);
      // 86mm to lose off each of two equal fronts, not 172 off one of them.
      expect(size(byName(panels, 'Drawer front 1'))[1]).toBe(357);
      expect(size(byName(panels, 'Drawer front 2'))[1]).toBe(357);
    });

    it('says what was asked for and what it got, not "will not fit"', () => {
      const { warnings } = drawers(tooTall);
      expect(warnings.join(' ')).toMatch(/800mm of front in a 720mm carcass/);
      expect(warnings.join(' ')).toMatch(/357, 357mm, bottom first/);
      // The old wording described a bank the app then went ahead and building anyway.
      expect(warnings.join(' ')).not.toMatch(/will not fit/);
    });

    it('puts the boxes on the fronts as built, not as asked for', () => {
      /*
       * A drawer box is set out from the bottom edge of the front it is screwed to, so a box that
       * followed the *asked-for* heights would be screwed to a front that is no longer there.
       * The upper box is the one that moves: front 2 was asked to start at 403 and is built
       * starting at 360.
       */
      const { panels } = drawers(tooTall);
      const bottoms = panels.filter((p) => p.role === 'drawer-bottom');
      expect(bottoms).toHaveLength(2);
      const undersides = bottoms.map((p) => occupies(p, project).y[0]);
      // Each sits the same fixed rise above the bottom edge of its own front — 0 and 360, not 403.
      expect(undersides[1]! - undersides[0]!).toBe(360);
    });

    it('will not shrink a front below the minimum, and says so', () => {
      /*
       * The count at which no arrangement works at all: 20mm a front plus a 3mm gap between each
       * is 23mm a drawer, and 717mm of opening runs out at 31. Thirty fronts still fit — at 21mm
       * each — which is why this asks for forty.
       */
      const { warnings, panels } = drawers({
        drawerFrontHeights: Array.from({ length: 40 }, () => mm(100)),
      });
      expect(warnings.join(' ')).toMatch(/40 drawer fronts will not fit a 720mm carcass/);
      expect(warnings.join(' ')).toMatch(/even at the 20mm minimum — that needs 920mm/);
      expect(warnings.join(' ')).toMatch(/Use fewer drawers/);
      // Every front is held at the floor rather than going to nothing or negative.
      const heights = panels.filter((p) => p.role === 'drawer-front').map((p) => size(p)[1]);
      expect(Math.min(...heights)).toBe(20);
      expect(Math.max(...heights)).toBe(20);
    });

    it('fits rather than warns where the fronts can be made to fit', () => {
      // Thirty in the same carcass: tight, but 21mm each with the gaps is inside 717.
      const { warnings, panels } = drawers({
        drawerFrontHeights: Array.from({ length: 30 }, () => mm(100)),
      });
      expect(warnings.join(' ')).not.toMatch(/will not fit/);
      const top = occupies(byName(panels, 'Drawer front 30'), project).y;
      expect(top[1]).toBeLessThanOrEqual(717);
    });
  });

  /*
   * The other half of §5.11, and the half the bench actually touches: raising one front in the
   * Inspector. `setDrawerFrontHeight` is what that control writes.
   */
  describe('setting one front height by hand', () => {
    it('takes the millimetres off the other fronts', () => {
      // 163mm to find between two fronts: 81 off each, and the odd millimetre off the top one —
      // the same rule `equalDrawerFronts` follows, where a fraction is least visible high up.
      expect(setDrawerFrontHeight([mm(237), mm(237), mm(237)], 0, mm(400))).toEqual([
        400, 156, 155,
      ]);
    });

    it('keeps the stack totalling what it did, which is what keeps it in the carcass', () => {
      const before = [mm(237), mm(237), mm(237)];
      const after = setDrawerFrontHeight(before, 1, mm(500));
      expect(after.reduce((a, b) => a + b, 0)).toBe(before.reduce((a, b) => a + b, 0));
    });

    it('gives the height back when a front is lowered, landing exactly where it started', () => {
      const equal = [mm(237), mm(237), mm(237)];
      const raised = setDrawerFrontHeight(equal, 0, mm(400));
      expect(setDrawerFrontHeight(raised, 0, mm(237))).toEqual([...equal]);
    });

    it('will not take another front below the minimum', () => {
      // 711 between three: the most the bottom can have is 711 − 20 − 20.
      const after = setDrawerFrontHeight([mm(237), mm(237), mm(237)], 0, mm(700));
      expect(after).toEqual([671, 20, 20]);
      expect(after.reduce((a, b) => a + b, 0)).toBe(711);
    });

    it('leaves a single front alone — it is the opening, and has nothing to trade against', () => {
      expect(setDrawerFrontHeight([mm(711)], 0, mm(400))).toEqual([711]);
    });
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
