/**
 * The drilling — hinge cups, mounting plates, runner fixings and system holes.
 *
 * Every figure here is worked out longhand so it can be checked against a Blum jig and a tape.
 *
 * ── The hinge, CLIP top BLUMOTION ──────────────────────────────────────────────────────────
 *
 *   cup                Ø35 × 13 deep, bored in the **back** of the door
 *   drilling distance  5mm to the near edge of the bore, so 5 + 17.5 = **22.5** to the centre
 *   from the door end  96mm to the centre of the end hinges
 *   dowels             Ø8 × 11, 45mm apart (± 22.5 along the door), 9.5mm further in from
 *                      the edge than the cup centre
 *   plate              two Ø5 × 13, 32mm apart (± 16 about the hinge), 37mm back from the
 *                      front edge of the side panel
 *
 * ── Reference cabinet: base 900 × 720 × 560, pair of doors, 16mm carcass, 18mm fronts ──────
 *
 *   doors        717 × 447 each   ( (900 − 2 × 1.5 − 3) / 2 = 447 ;  720 − 3 = 717 )
 *   hinges       2 per door       ( 717 ≤ 900 )
 *   cup centres  96 and 717 − 96 = **621** along the door's length
 *
 *   A door's part space runs length **up** it, and its part y = 0 is its **right** edge, because
 *   `doors` lays it out from the right with v = −X. So:
 *
 *     Door L, hinged left    cup at part y = 447 − 22.5 = **424.5**
 *     Door R, hinged right   cup at part y =             **22.5**
 *
 *   The two are mirror images. A test that only counted six features each would pass on a pair
 *   of doors both hinged the same way, which is why the coordinate is asserted.
 *
 *   Dowels sit 9.5 further from the hinged edge than the cup:
 *     Door L  y = 424.5 − 9.5 = 415        Door R  y = 22.5 + 9.5 = 32
 *   and ± 22.5 along the length: 73.5 / 118.5 about the first cup, 598.5 / 643.5 about the second.
 *
 *   The side panels are 720 × 544 and their part y is depth — but measured from **opposite ends**:
 *
 *     Side L   v = +Z, origin at z = 16 (the front face of the back), so part y = z − 16
 *              37mm back from the front (z = 523)  →  part y = **507**
 *     Side R   v = −Z, origin at z = 560, so part y = 560 − z
 *              the same 37mm back from the front   →  part y = **37**
 *
 *   That difference is the whole reason every hole is stated in cabinet space and converted
 *   through the panel's own placement. A hard-coded 37 would put the left plate against the wall.
 *
 *   Plate screws for a hinge at 96 up:  96 ± 16 = **80 and 112**
 *                        and at 621 up:            **605 and 637**
 *
 * ── Reference cabinet: drawer bank 600 × 720 × 560, three drawers, MERIVOBOX NL 500 ────────
 *
 *   Everything vertical hangs off **the bottom of the runner**, which is Blum's own datum. The
 *   runner sits 16 above the bottom edge of its front, so with fronts at 0, 240 and 480:
 *
 *     runner bottoms at y = **16, 256, 496**  ← where the fixing holes go
 *     front fixing screws  16 + 33.5 = **49.5** and + 32 = **81.5** above each front's own bottom
 *     sideways, 20.5 in from each outer cabinet face → part x **19** and **578** on a 597 front
 *
 *   fixing z:   front  560 − 37 = 523   →  Side L part y 507, Side R part y 37
 *               rear   523 − 256 = 267  →  Side L part y 251, Side R part y 293
 *
 * ── System holes ───────────────────────────────────────────────────────────────────────────
 *
 *   pitch 32, Ø5 × 13, from one pitch above the bottom edge of the side to one pitch short of
 *   the top:  floor(720 / 32) − 1 = 22 − 1 = **21 holes**, at part x = 32, 64, … 672
 *   two rows: 37 in from the front edge and 37 in from the back edge
 *   and **none at all** on a cabinet with no adjustable shelves
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { createCabinet, createEmptyProject, createSampleKitchen, resetIdCounter } from '../src/core/project/factory.ts';
import type { CabinetOptions, CabinetTypeId } from '../src/core/model/cabinet.ts';
import type { Project } from '../src/core/model/project.ts';
import { requiresFlip } from '../src/core/model/feature.ts';
import { buildCabinet, buildProject } from '../src/core/rules/build.ts';
import { byName, drilledFor, drillingStaysOnThePart, size } from './helpers.ts';

let project: Project;

beforeEach(() => {
  resetIdCounter();
  project = createEmptyProject('Boring');
});

const build = (typeId: CabinetTypeId, options: CabinetOptions = {}, patch: Partial<{ width: number; depth: number; height: number }> = {}) =>
  buildCabinet(
    createCabinet({
      typeId,
      name: 'X',
      width: mm(patch.width ?? 900),
      depth: patch.depth === undefined ? undefined : mm(patch.depth),
      height: patch.height === undefined ? undefined : mm(patch.height),
      x: mm(0),
      options,
    }),
    project,
  );

describe('hinge cups', () => {
  it('bores two Ø35 × 13 cups 96mm from each end of a 717 door', () => {
    const { panels } = build('base', { doorCount: 2 });
    const cups = drilledFor(byName(panels, 'Door L'), 'hinge-cup');
    expect(cups).toHaveLength(2);
    expect(cups.map((c) => c.x)).toEqual([96, 621]);
    expect(cups.every((c) => c.diameter === 35 && c.depth === 13)).toBe(true);
  });

  /**
   * The cup goes in the *back* of the door, and the door's A-face is its show face — that follows
   * from where the door sits and is not a choice. So it is a B-face operation, the part turns over,
   * and the model says so rather than letting a post-processor guess.
   */
  it('bores the back face, and says the part has to be turned over', () => {
    const { panels } = build('base', { doorCount: 2 });
    const door = byName(panels, 'Door L');
    const cups = door.features.filter((f) => f.purpose === 'hinge-cup');
    expect(cups.every((f) => f.kind === 'drill' && f.face === 'B')).toBe(true);
    expect(cups.every(requiresFlip)).toBe(true);

    // And nothing else on the job needs a flip.
    const plates = byName(panels, 'Side L').features;
    expect(plates.every((f) => !requiresFlip(f))).toBe(true);
  });

  /**
   * The handedness assertion. Door L's cups are on its left edge and Door R's on its right, which in
   * each door's own part space are opposite ends of the width — 424.5 against 22.5. A pair bored the
   * same way would have the same count of the same holes.
   */
  it('mirrors a pair: the left door hinges left and the right door hinges right', () => {
    const { panels } = build('base', { doorCount: 2 });
    expect(size(byName(panels, 'Door L'))).toEqual([717, 447]);

    expect(drilledFor(byName(panels, 'Door L'), 'hinge-cup').map((c) => c.y)).toEqual([424.5, 424.5]);
    expect(drilledFor(byName(panels, 'Door R'), 'hinge-cup').map((c) => c.y)).toEqual([22.5, 22.5]);
  });

  it('takes the swing from the option when there is only one door to read', () => {
    const left = build('base', { doorCount: 1, doorSwing: 'left' });
    const right = build('base', { doorCount: 1, doorSwing: 'right' });
    const door = (b: typeof left) => byName(b.panels, 'Door');

    // A single door is 897 wide, so 897 − 22.5 = 874.5 on the left hand.
    expect(drilledFor(door(left), 'hinge-cup')[0]!.y).toBe(874.5);
    expect(drilledFor(door(right), 'hinge-cup')[0]!.y).toBe(22.5);
  });

  it('lays the two dowels 45mm apart and 9.5mm further in than the cup', () => {
    const { panels } = build('base', { doorCount: 2 });
    const dowels = drilledFor(byName(panels, 'Door L'), 'hinge-dowel');
    expect(dowels).toHaveLength(4);
    expect(dowels.map((d) => d.x)).toEqual([73.5, 118.5, 598.5, 643.5]);
    expect(dowels.every((d) => d.y === 415)).toBe(true);
    expect(dowels.every((d) => d.diameter === 8 && d.depth === 11)).toBe(true);

    // Mirrored on the other hand: 22.5 + 9.5.
    expect(drilledFor(byName(panels, 'Door R'), 'hinge-dowel').every((d) => d.y === 32)).toBe(true);
  });

  it('adds a hinge as the door gets taller, and spreads them evenly', () => {
    const tall = build('tall', { doorCount: 2 });
    const cups = drilledFor(byName(tall.panels, 'Door L'), 'hinge-cup');
    // 2067 tall → five hinges, from 96 to 1971 in four steps of 468.75.
    expect(cups.map((c) => c.x)).toEqual([96, 564.75, 1033.5, 1502.25, 1971]);
  });

  it('honours a hinge count typed over the derived one', () => {
    const { panels } = build('base', { doorCount: 2, hingeCount: 4 });
    expect(drilledFor(byName(panels, 'Door L'), 'hinge-cup')).toHaveLength(4);
  });

  it('will not bore a door too narrow for a cup, and says so instead', () => {
    const narrow = build(
      'custom',
      { doorCount: 1, shelfCount: 0, hasBack: false, topStyle: 'open' },
      { width: 44 },
    );
    expect(drilledFor(byName(narrow.panels, 'Door'), 'hinge-cup')).toHaveLength(0);
    expect(narrow.warnings.join(' ')).toMatch(/leaves nowhere for a 35mm cup/);
  });
});

describe('mounting plates', () => {
  it('puts two Ø5 × 13 holes 32mm apart at the same height as the cup they serve', () => {
    const { panels } = build('base', { doorCount: 2, shelfCount: 0 });
    const plates = drilledFor(byName(panels, 'Side L'), 'hinge-plate');
    expect(plates).toHaveLength(4);
    expect(plates.map((p) => p.x)).toEqual([80, 112, 605, 637]);
    expect(plates.every((p) => p.diameter === 5 && p.depth === 13)).toBe(true);
  });

  /**
   * The reason every hole is stated in cabinet space. Both sides are bored 37mm back from the front
   * edge, and that comes out as part y = 507 on the left and 37 on the right, because a side panel's
   * part +Y runs toward the back on one hand and toward the front on the other.
   */
  it('measures 37mm from the front edge on both hands, which is not the same part-space number', () => {
    const { panels } = build('base', { doorCount: 2, shelfCount: 0 });
    expect(size(byName(panels, 'Side L'))).toEqual([720, 544]);

    expect(drilledFor(byName(panels, 'Side L'), 'hinge-plate').every((p) => p.y === 507)).toBe(true);
    expect(drilledFor(byName(panels, 'Side R'), 'hinge-plate').every((p) => p.y === 37)).toBe(true);
  });

  it('only bores the side the door actually hinges on', () => {
    // One door, two hinges, two holes each — all four on the hinged side and none on the other.
    const left = build('base', { doorCount: 1, doorSwing: 'left', shelfCount: 0 });
    expect(drilledFor(byName(left.panels, 'Side L'), 'hinge-plate')).toHaveLength(4);
    expect(drilledFor(byName(left.panels, 'Side R'), 'hinge-plate')).toHaveLength(0);

    const right = build('base', { doorCount: 1, doorSwing: 'right', shelfCount: 0 });
    expect(drilledFor(byName(right.panels, 'Side L'), 'hinge-plate')).toHaveLength(0);
    expect(drilledFor(byName(right.panels, 'Side R'), 'hinge-plate')).toHaveLength(4);
  });

  it('bores a side for both banks of a split tall door', () => {
    const split = build('tall', { doorCount: 2, doorSplitHeight: mm(1200), shelfCount: 0 });
    // Lower door 1198.5 tall → 3 hinges; upper 865.5 → 2. Five hinges, ten holes, one side.
    expect(drilledFor(byName(split.panels, 'Side L'), 'hinge-plate')).toHaveLength(10);
  });

  it('says so when the radius has eaten the side a door hinges onto', () => {
    // A full-depth radius on the left takes the left side out from under a left-hung door.
    const radiused = build('base', {
      radiusCorner: 'front-left',
      carcassRadius: mm(560),
      doorCount: 1,
      doorSwing: 'left',
      shelfCount: 0,
    });
    expect(radiused.warnings.join(' ')).toMatch(/no left side panel to screw a mounting plate to/);
  });
});

describe('runner fixings', () => {
  it('bores two holes per side per drawer, on the bottom line of the runner', () => {
    const { panels } = buildCabinet(
      createCabinet({
        typeId: 'drawer-bank',
        name: 'D',
        width: mm(600),
        x: mm(0),
        options: { drawerCount: 3 },
      }),
      project,
    );
    const left = drilledFor(byName(panels, 'Side L'), 'drawer-runner');
    expect(left).toHaveLength(6);
    // Three drawers, runner bottoms at 16 / 256 / 496, front and rear fixing at each.
    expect(left.map((p) => p.x)).toEqual([16, 16, 256, 256, 496, 496]);
    // 37mm from the front, then 256mm behind it at NL 500.
    expect(left.map((p) => p.y)).toEqual([507, 251, 507, 251, 507, 251]);
    expect(left.every((p) => p.diameter === 5 && p.depth === 13)).toBe(true);

    const right = drilledFor(byName(panels, 'Side R'), 'drawer-runner');
    expect(right.map((p) => p.y)).toEqual([37, 293, 37, 293, 37, 293]);
  });

  it('drops to the 128mm spacing on a short runner', () => {
    const { panels, hardware } = buildCabinet(
      createCabinet({
        typeId: 'drawer-bank',
        name: 'D',
        width: mm(600),
        depth: mm(300),
        x: mm(0),
        options: { drawerCount: 2 },
      }),
      project,
    );
    expect(hardware.runner?.nominalLength).toBe(270);
    // Side is 284 deep: 284 − 37 = 247, then 128 behind it.
    expect(drilledFor(byName(panels, 'Side L'), 'drawer-runner').map((p) => p.y)).toEqual([
      247, 119, 247, 119,
    ]);
  });

  it('bores nothing at all when no runner fits', () => {
    const { panels } = buildCabinet(
      createCabinet({
        typeId: 'drawer-bank',
        name: 'D',
        width: mm(600),
        depth: mm(200),
        x: mm(0),
        options: { drawerCount: 2 },
      }),
      project,
    );
    expect(drilledFor(byName(panels, 'Side L'), 'drawer-runner')).toHaveLength(0);
  });
});

/**
 * The front fixing — two brackets, one at each end of the box, two screws each, in the **back** of
 * the drawer front.
 *
 * Blum gives the sideways position as `20.5 + FA` from the edge of the front, where FA is the front
 * overlay. Stated from the cabinet instead — 20.5 in from each outer face — which is the same place
 * without needing to know the reveal, and which is why widening the side reveal moves the front and
 * leaves the screw where the bracket is.
 */
describe('front fixings', () => {
  const drawerBank = (options: Record<string, unknown> = {}) =>
    buildCabinet(
      createCabinet({
        typeId: 'drawer-bank',
        name: 'D',
        width: mm(600),
        x: mm(0),
        options: { drawerCount: 3, ...options },
      }),
      project,
    );

  it('bores four pilots in the back of each front, two per bracket', () => {
    const { panels } = drawerBank();
    const front = byName(panels, 'Drawer front 1');
    const screws = drilledFor(front, 'drawer-front-fixing');
    expect(screws).toHaveLength(4);
    expect(screws.every((s) => s.face === 'B')).toBe(true);
    expect(front.features.filter((f) => f.purpose === 'drawer-front-fixing').every(requiresFlip)).toBe(
      true,
    );
  });

  it('puts them 20.5 in from each outer cabinet face, which is 19 in from a 597 front’s edge', () => {
    const { panels } = drawerBank();
    const front = byName(panels, 'Drawer front 1');
    expect(size(front)).toEqual([597, 237]);
    // The front runs from cabinet x 1.5 to 598.5, so 20.5 and 579.5 land at part x 19 and 578 —
    // symmetric about the front, and 19 + 578 = 597.
    expect([...new Set(drilledFor(front, 'drawer-front-fixing').map((s) => s.x))].sort((a, b) => a - b))
      .toEqual([19, 578]);
  });

  it('sets the height off the bottom of the runner, not off the cabinet', () => {
    const { panels } = drawerBank();
    // Runner 16 above the front's own bottom edge, screw 33.5 above that, second 32 above it.
    for (const name of ['Drawer front 1', 'Drawer front 2', 'Drawer front 3']) {
      const heights = [
        ...new Set(drilledFor(byName(panels, name), 'drawer-front-fixing').map((s) => s.y)),
      ].sort((a, b) => a - b);
      expect(heights).toEqual([49.5, 81.5]);
    }
  });

  it('moves the screw with the reveal, because the front moves and the bracket does not', () => {
    const wideReveal: Project = {
      ...project,
      constructions: project.constructions.map((c) => ({ ...c, revealSides: mm(3) })),
    };
    const built = buildCabinet(
      createCabinet({
        typeId: 'drawer-bank',
        name: 'D',
        width: mm(600),
        x: mm(0),
        options: { drawerCount: 1 },
      }),
      wideReveal,
    );
    // The front is now 594 wide starting at cabinet x 3, so 20.5 lands at part x 17.5.
    const front = byName(built.panels, 'Drawer front 1');
    expect(size(front)[0]).toBe(594);
    expect(drilledFor(front, 'drawer-front-fixing').map((s) => s.x)).toContain(17.5);
  });

  it('bores none when no runner fits — there is no box to fix a front to', () => {
    const built = buildCabinet(
      createCabinet({
        typeId: 'drawer-bank',
        name: 'D',
        width: mm(600),
        depth: mm(200),
        x: mm(0),
        options: { drawerCount: 2 },
      }),
      project,
    );
    expect(drilledFor(byName(built.panels, 'Drawer front 1'), 'drawer-front-fixing')).toHaveLength(0);
  });

  it('drops a screw that would fall off a front too short for the bracket', () => {
    // Six 100mm fronts: the second screw sits 81.5 up, which clears; a 60mm front would not.
    const built = buildCabinet(
      createCabinet({
        typeId: 'drawer-bank',
        name: 'D',
        width: mm(600),
        x: mm(0),
        options: { drawerFrontHeights: [mm(60), mm(654)] },
      }),
      project,
    );
    const shallow = byName(built.panels, 'Drawer front 1');
    expect(size(shallow)[1]).toBe(60);
    // 49.5 is on the part, 81.5 is not.
    expect(drilledFor(shallow, 'drawer-front-fixing').map((s) => s.y)).toEqual([49.5, 49.5]);
  });
});

describe('system holes', () => {
  it('runs 21 holes at 32mm up a 720 side, in two rows front and back', () => {
    const { panels } = build('wall', { shelfCount: 2, doorCount: 0 });
    const holes = drilledFor(byName(panels, 'Side L'), 'shelf-pin');
    expect(holes).toHaveLength(42);
    expect(holes.slice(0, 3).map((h) => h.x)).toEqual([32, 64, 96]);
    expect(holes[20]!.x).toBe(672);
    expect(holes.every((h) => h.diameter === 5 && h.depth === 13)).toBe(true);

    // A wall side is 284 deep: front row 284 − 37 = 247, rear row 37 in from the back.
    expect(new Set(holes.map((h) => h.y))).toEqual(new Set([247, 37]));
  });

  it('stays a drill-line rather than becoming twenty-one drills', () => {
    const { panels } = build('wall', { shelfCount: 2, doorCount: 0 });
    const lines = byName(panels, 'Side L').features.filter((f) => f.kind === 'drill-line');
    expect(lines).toHaveLength(2);
    expect(lines.every((f) => f.kind === 'drill-line' && f.count === 21)).toBe(true);
    // The step runs *up* the panel on both hands, because it is derived from the placement.
    for (const side of ['Side L', 'Side R']) {
      const row = byName(panels, side).features.find((f) => f.kind === 'drill-line');
      expect(row?.kind === 'drill-line' && row.step).toEqual({ x: 32, y: 0 });
    }
  });

  it('bores no rows on a cabinet with no adjustable shelves', () => {
    const { panels } = build('base', { shelfCount: 0, doorCount: 2 });
    expect(drilledFor(byName(panels, 'Side L'), 'shelf-pin')).toHaveLength(0);
  });

  it('bores no rows on a drawer bank', () => {
    const { panels } = buildCabinet(
      createCabinet({
        typeId: 'drawer-bank',
        name: 'D',
        width: mm(600),
        x: mm(0),
        options: { drawerCount: 3 },
      }),
      project,
    );
    expect(drilledFor(byName(panels, 'Side L'), 'shelf-pin')).toHaveLength(0);
  });

  it('follows the pitch a shop changes it to', () => {
    const coarse: Project = {
      ...project,
      constructions: project.constructions.map((c) => ({ ...c, systemPitch: mm(64) })),
    };
    const built = buildCabinet(
      createCabinet({
        typeId: 'wall',
        name: 'W',
        width: mm(900),
        x: mm(0),
        options: { shelfCount: 2, doorCount: 0 },
      }),
      coarse,
    );
    // floor(720 / 64) − 1 = 11 − 1 = 10.
    const row = byName(built.panels, 'Side L').features.find((f) => f.kind === 'drill-line');
    expect(row?.kind === 'drill-line' && row.count).toBe(10);
  });
});

/**
 * The catch-all.
 *
 * A hole measured off the wrong edge is the same hole at the same diameter, and on a part deep
 * enough it lands somewhere plausible and passes everything. On a shallow one it lands off the
 * part — so asserting that every hole is *on* its part across every cabinet type, both hands and a
 * range of sizes is what makes the handedness genuinely tested rather than spot-checked.
 */
describe('every hole lands on the part it is bored in', () => {
  const cases: { label: string; typeId: CabinetTypeId; options: CabinetOptions; width?: number; depth?: number }[] = [
    { label: 'base, pair of doors', typeId: 'base', options: { doorCount: 2, shelfCount: 1 } },
    { label: 'base, single left', typeId: 'base', options: { doorCount: 1, doorSwing: 'left', shelfCount: 2 } },
    { label: 'base, single right', typeId: 'base', options: { doorCount: 1, doorSwing: 'right', shelfCount: 2 } },
    { label: 'wall', typeId: 'wall', options: { doorCount: 2, shelfCount: 3 } },
    { label: 'wall, shallow', typeId: 'wall', options: { doorCount: 2, shelfCount: 3 }, depth: 150 },
    { label: 'tall', typeId: 'tall', options: { doorCount: 2, shelfCount: 4 } },
    { label: 'tall, split', typeId: 'tall', options: { doorCount: 2, doorSplitHeight: 1200 as never, shelfCount: 4 } },
    { label: 'drawer bank', typeId: 'drawer-bank', options: { drawerCount: 4 } },
    { label: 'drawer bank, shallow', typeId: 'drawer-bank', options: { drawerCount: 3 }, depth: 300 },
    { label: 'custom with dividers', typeId: 'custom', options: { doorCount: 2, shelfCount: 2, dividerCount: 2 } },
    {
      label: 'radius front-right',
      typeId: 'base',
      options: { radiusCorner: 'front-right', carcassRadius: 200 as never, doorCount: 1, doorSwing: 'left', shelfCount: 1 },
    },
    {
      label: 'radius front-left',
      typeId: 'base',
      options: { radiusCorner: 'front-left', carcassRadius: 200 as never, doorCount: 1, doorSwing: 'right', shelfCount: 1 },
    },
  ];

  for (const c of cases) {
    for (const width of [600, 900]) {
      it(`${c.label} at ${width}mm wide`, () => {
        const built = build(c.typeId, c.options, { width, depth: c.depth });
        for (const panel of built.panels) {
          expect(drillingStaysOnThePart(panel), `${panel.name} in ${c.label}`).toBe(true);
        }
      });
    }
  }

  it('holds across the whole sample kitchen', () => {
    for (const panel of buildProject(createSampleKitchen()).flatMap((b) => b.panels)) {
      expect(drillingStaysOnThePart(panel), panel.name).toBe(true);
    }
  });

  /**
   * Feed it what a person types, not what they mean to type — the lesson §4.5 paid for. Every one of
   * these is a keystroke on the way to a real number, and none of them may throw.
   */
  it('never throws on a half-typed dimension', () => {
    for (const width of [1, 4, 5, 6, 44, 45, 60, 600, 6000]) {
      for (const typeId of ['base', 'wall', 'tall', 'drawer-bank'] as CabinetTypeId[]) {
        expect(() =>
          build(typeId, { doorCount: 2, shelfCount: 1, drawerCount: 3 }, { width }),
        ).not.toThrow();
      }
    }
  });
});

describe('feature ids stay unique within a panel', () => {
  it('across doors, plates, runners and system holes on one side panel', () => {
    const split = build('tall', { doorCount: 2, doorSplitHeight: mm(1200), shelfCount: 4 });
    for (const panel of split.panels) {
      const ids = panel.features.map((f) => f.id);
      expect(new Set(ids).size, panel.name).toBe(ids.length);
    }
  });
});
