/**
 * Base cabinet, hand-calculated.
 *
 * Reference cabinet: 900 W × 720 H × 560 D, frameless 32mm, 16mm carcass, 16mm applied back,
 * 18mm doors, 150mm kick, 100mm top rails, 3mm gap between fronts, 1.5mm reveal.
 *
 *   side depth        560 − 16 (back)          = 544
 *   interior width    900 − 2×16               = 868
 *   interior height   720 − 2×16               = 688
 *   shelf             868 − 2 clearance        = 866  ×  544 − 10 setback = 534
 *   door width        (900 − 2×1.5 − 3) ÷ 2    = 447
 *   door height       720 − 2×1.5              = 717
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import {
  createCabinet,
  createEmptyProject,
  resetIdCounter,
} from '../src/core/project/factory.ts';
import type { Project } from '../src/core/model/project.ts';
import { byName, namesOf, occupies, size } from './helpers.ts';

const REFERENCE = { W: mm(900), H: mm(720), D: mm(560) };

let project: Project;

const build = (options = {}) => {
  const cabinet = createCabinet({
    typeId: 'base',
    name: 'B1',
    width: REFERENCE.W,
    height: REFERENCE.H,
    depth: REFERENCE.D,
    x: mm(0),
    options,
  });
  return { ...buildCabinet(cabinet, project), project };
};

beforeEach(() => {
  resetIdCounter();
  project = createEmptyProject('Test');
});

describe('base cabinet part sizes', () => {
  it('produces exactly the expected part list', () => {
    const { panels } = build({ shelfCount: 1, doorCount: 2, hasKick: true });
    expect(namesOf(panels)).toEqual([
      'Side L',
      'Side R',
      'Bottom',
      'Top rail front',
      'Top rail back',
      'Back',
      'Shelf',
      'Door L',
      'Door R',
      'Kick',
    ]);
  });

  it('cuts both sides 720 × 544', () => {
    const { panels } = build();
    expect(size(byName(panels, 'Side L'))).toEqual([720, 544]);
    expect(size(byName(panels, 'Side R'))).toEqual([720, 544]);
  });

  it('cuts the bottom 868 × 544, housed between the sides', () => {
    const { panels } = build();
    expect(size(byName(panels, 'Bottom'))).toEqual([868, 544]);
  });

  it('cuts top rails 868 × 100', () => {
    const { panels } = build();
    expect(size(byName(panels, 'Top rail front'))).toEqual([868, 100]);
    expect(size(byName(panels, 'Top rail back'))).toEqual([868, 100]);
  });

  it('cuts an applied back at the full carcass face, 900 × 720', () => {
    const { panels } = build();
    expect(size(byName(panels, 'Back'))).toEqual([900, 720]);
  });

  it('cuts the shelf 866 × 534 — clearance off the width, setback off the depth', () => {
    const { panels } = build({ shelfCount: 1 });
    expect(size(byName(panels, 'Shelf'))).toEqual([866, 534]);
  });

  it('cuts a pair of doors 717 × 447', () => {
    const { panels } = build({ doorCount: 2 });
    expect(size(byName(panels, 'Door L'))).toEqual([717, 447]);
    expect(size(byName(panels, 'Door R'))).toEqual([717, 447]);
  });

  it('cuts a single door the full width less reveals, 717 × 897', () => {
    const { panels } = build({ doorCount: 1 });
    expect(size(byName(panels, 'Door'))).toEqual([717, 897]);
  });

  it('cuts the kick 900 × 150', () => {
    const { panels } = build({ hasKick: true });
    expect(size(byName(panels, 'Kick'))).toEqual([900, 150]);
  });
});

describe('base cabinet placement', () => {
  it('stands the sides at each end, clear of the back', () => {
    const { panels } = build();
    expect(occupies(byName(panels, 'Side L'), project)).toEqual({
      x: [0, 16],
      y: [0, 720],
      z: [16, 560],
    });
    expect(occupies(byName(panels, 'Side R'), project)).toEqual({
      x: [884, 900],
      y: [0, 720],
      z: [16, 560],
    });
  });

  it('faces both sides inward — the A-face is the machined face', () => {
    const { panels } = build();
    // Left side's A-face points +X (into the cabinet); right side's points −X.
    expect(byName(panels, 'Side L').placement.u).toBe('+Y');
    expect(byName(panels, 'Side L').placement.v).toBe('+Z');
    expect(byName(panels, 'Side R').placement.u).toBe('+Y');
    expect(byName(panels, 'Side R').placement.v).toBe('-Z');
  });

  it('houses the bottom between the sides at floor level', () => {
    const { panels } = build();
    expect(occupies(byName(panels, 'Bottom'), project)).toEqual({
      x: [16, 884],
      y: [0, 16],
      z: [16, 560],
    });
  });

  it('sets the rails at the top, front and back', () => {
    const { panels } = build();
    expect(occupies(byName(panels, 'Top rail front'), project)).toEqual({
      x: [16, 884],
      y: [704, 720],
      z: [460, 560],
    });
    expect(occupies(byName(panels, 'Top rail back'), project)).toEqual({
      x: [16, 884],
      y: [704, 720],
      z: [16, 116],
    });
  });

  it('puts the back across the whole rear face', () => {
    const { panels } = build();
    expect(occupies(byName(panels, 'Back'), project)).toEqual({
      x: [0, 900],
      y: [0, 720],
      z: [0, 16],
    });
  });

  it('centres a single shelf in the opening', () => {
    const { panels } = build({ shelfCount: 1 });
    // Opening runs y 16 → 704; its midpoint is 360, and the shelf straddles it.
    expect(occupies(byName(panels, 'Shelf'), project)).toEqual({
      x: [17, 883],
      y: [352, 368],
      z: [16, 550],
    });
  });

  it('spaces three shelves evenly through the opening', () => {
    const { panels } = build({ shelfCount: 3 });
    const centres = ['Shelf 1', 'Shelf 2', 'Shelf 3'].map((n) => {
      const o = occupies(byName(panels, n), project);
      return (o.y[0] + o.y[1]) / 2;
    });
    // Opening 16 → 704, divided in four: 188, 360, 532.
    expect(centres).toEqual([188, 360, 532]);
  });

  it('hangs the doors in front of the carcass with a 3mm gap between them', () => {
    const { panels } = build({ doorCount: 2 });
    const left = occupies(byName(panels, 'Door L'), project);
    const right = occupies(byName(panels, 'Door R'), project);

    expect(left).toEqual({ x: [1.5, 448.5], y: [1.5, 718.5], z: [560, 578] });
    expect(right).toEqual({ x: [451.5, 898.5], y: [1.5, 718.5], z: [560, 578] });

    expect(right.x[0] - left.x[1]).toBe(3); // gap between the pair
    expect(left.x[0]).toBe(1.5); // reveal at the outer edge
    expect(900 - right.x[1]).toBe(1.5);
  });

  it('recesses the kick below the carcass and behind the door face', () => {
    const { panels } = build({ hasKick: true });
    // Door face is at z = 560 + 18 = 578; a 50mm setback puts the kick face at 528.
    expect(occupies(byName(panels, 'Kick'), project)).toEqual({
      x: [0, 900],
      y: [-150, 0],
      z: [512, 528],
    });
  });
});

describe('base cabinet edge banding', () => {
  it('bands the front edge of each side — a handed pair, opposite named edges', () => {
    const { panels } = build();
    // Both sides are banded on the edge facing the front. Because the sides are mirrored,
    // that is a different named edge on each — which is exactly the handedness a cutlist
    // has to get right.
    expect(byName(panels, 'Side L').edgeBanding).toEqual({ L2: 'eb-classic-white-1mm' });
    expect(byName(panels, 'Side R').edgeBanding).toEqual({ L1: 'eb-classic-white-1mm' });
  });

  it('bands all four edges of a door', () => {
    const { panels } = build({ doorCount: 2 });
    expect(Object.keys(byName(panels, 'Door L').edgeBanding).sort()).toEqual([
      'L1',
      'L2',
      'W1',
      'W2',
    ]);
  });

  it('leaves the back unbanded', () => {
    const { panels } = build();
    expect(byName(panels, 'Back').edgeBanding).toEqual({});
  });

  it('bands the front rail but not the back one', () => {
    const { panels } = build();
    expect(Object.keys(byName(panels, 'Top rail front').edgeBanding)).toHaveLength(1);
    expect(byName(panels, 'Top rail back').edgeBanding).toEqual({});
  });
});

describe('base cabinet options', () => {
  it('omits the kick when the cabinet sits on a continuous plinth', () => {
    const { panels } = build({ hasKick: false });
    expect(namesOf(panels)).not.toContain('Kick');
  });

  it('omits doors when asked for none', () => {
    const { panels } = build({ doorCount: 0 });
    expect(namesOf(panels).filter((n) => n.startsWith('Door'))).toEqual([]);
  });

  it('warns when a narrow cabinet is given a pair of doors', () => {
    const cabinet = createCabinet({
      typeId: 'base',
      name: 'B1',
      width: mm(300),
      x: mm(0),
      options: { doorCount: 2 },
    });
    const { warnings } = buildCabinet(cabinet, project);
    expect(warnings.join(' ')).toMatch(/too narrow for a pair of doors/);
  });

  it('produces no parts, and says why, when the width cannot fit its own sides', () => {
    const cabinet = createCabinet({ typeId: 'base', name: 'Bad', width: mm(20), x: mm(0) });
    const { panels, warnings } = buildCabinet(cabinet, project);
    expect(panels).toEqual([]);
    expect(warnings.join(' ')).toMatch(/too narrow/);
  });
});

describe('construction method drives the parts, not the spec', () => {
  it('rebuilds every dependent part when the carcass thickness changes', () => {
    const cabinet = createCabinet({
      typeId: 'base',
      name: 'B1',
      width: REFERENCE.W,
      height: REFERENCE.H,
      depth: REFERENCE.D,
      x: mm(0),
      constructionId: 'frameless-32-18',
    });
    const { panels } = buildCabinet(cabinet, project);

    // 18mm carcass and 18mm back: interior width 900 − 36 = 864, side depth 560 − 18 = 542.
    expect(size(byName(panels, 'Side L'))).toEqual([720, 542]);
    expect(size(byName(panels, 'Bottom'))).toEqual([864, 542]);
    // Doors are unaffected — they are sized from the carcass face, not its thickness.
    expect(size(byName(panels, 'Door L'))).toEqual([717, 447]);
  });

  it('runs the sides full depth when the back is inset instead of applied', () => {
    const inset = {
      ...project,
      constructions: project.constructions.map((c) =>
        c.id === 'frameless-32-16' ? { ...c, backStyle: 'inset' as const } : c,
      ),
    };
    const cabinet = createCabinet({
      typeId: 'base',
      name: 'B1',
      width: REFERENCE.W,
      height: REFERENCE.H,
      depth: REFERENCE.D,
      x: mm(0),
    });
    const { panels } = buildCabinet(cabinet, inset);

    expect(size(byName(panels, 'Side L'))).toEqual([720, 560]); // full depth
    expect(occupies(byName(panels, 'Side L'), inset).z).toEqual([0, 560]);
    // The inset back fits between the sides and the horizontals.
    expect(size(byName(panels, 'Back'))).toEqual([868, 688]);
  });
});
