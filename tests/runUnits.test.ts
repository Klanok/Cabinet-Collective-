/**
 * Benchtops and ladder bases — the things that span a run of cabinets and belong to none of them.
 *
 * Two claims are worth stating before the tests, because most of what follows is checking one or
 * the other:
 *
 * **A run unit is owned, not derived.** Everything else in this codebase is regenerated from its
 * cabinet on every build. A benchtop is generated once and then owned, because it stops being
 * derivable the moment somebody sets an overhang on one end or puts a sink 300mm off centre. So the
 * tests that matter most here are the ones asserting that a cabinet moving does *not* move a top,
 * and that regenerating keeps everything a person set.
 *
 * **The dishwasher and the fridge are the same gap.** Two spaces of identical width in identical
 * places, one of which takes a top over it and one of which does not, and nothing measurable tells
 * them apart. That is what the appliance space exists to record, and it is why the benchtop run and
 * the plinth run get different answers out of the one gap.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import {
  type Benchtop,
  benchtopLength,
  benchtopSections,
  finishedEdgeLength,
  suggestedJoins,
} from '../src/core/model/benchtop.ts';
import { ribPositions } from '../src/core/model/kickBase.ts';
import { CURRENT_SCHEMA_VERSION, migrateProject } from '../src/core/model/project.ts';
import type { Project } from '../src/core/model/project.ts';
import { benchtopRuns, kickBaseRuns } from '../src/core/project/runs.ts';
import {
  generateBenchtops,
  generateKickBases,
  regenerateBenchtop,
  regenerateKickBase,
  uncoveredRuns,
} from '../src/core/project/generate.ts';
import {
  createCabinet,
  createEmptyProject,
  createSampleKitchen,
  resetIdCounter,
} from '../src/core/project/factory.ts';
import { allPanels, buildCabinet } from '../src/core/rules/build.ts';
import { buildBenchtop, buildKickBase, buildRunUnits } from '../src/core/rules/runUnits.ts';
import { benchtopCharges } from '../src/core/costing/benchtopCost.ts';
import { costProject } from '../src/core/costing/costing.ts';
import {
  AU_SHOP_STANDARDS,
  CURRENT_STANDARDS_VERSION,
  migrateStandards,
} from '../src/core/standards/standards.ts';
import { byName, occupies, size } from './helpers.ts';

let project: Project;

const withCabinets = (...args: Parameters<typeof createCabinet>[0][]): Project => ({
  ...project,
  cabinets: args.map((a) => createCabinet(a, project.defaults, project.constructions)),
});

beforeEach(() => {
  resetIdCounter();
  project = createEmptyProject('Run unit test');
});

/*
 * ── The gap that is not geometric ─────────────────────────────────────────────────────────────
 */

describe('an appliance space', () => {
  /** 900 base, 600 appliance, 900 base — the only thing that changes is what fills the middle. */
  const withAppliance = (options: Record<string, unknown>) =>
    withCabinets(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0) },
      { typeId: 'appliance', name: 'DW', width: mm(600), x: mm(900), options },
      { typeId: 'base', name: 'B2', width: mm(900), x: mm(1500) },
    );

  it('lets the benchtop run straight over a dishwasher', () => {
    const runs = benchtopRuns(withAppliance({}));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.length).toBe(2400);
    // The space is a member of the run it is bridged by — one top over three units.
    expect(runs[0]!.memberIds).toHaveLength(3);
  });

  it('breaks the run at a fridge space, which is the identical gap', () => {
    const runs = benchtopRuns(withAppliance({ carriesBenchtop: false }));
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.length)).toEqual([900, 900]);
  });

  /**
   * The two questions are separate, and a dishwasher is exactly the case that answers them
   * differently: the top runs over it, and the plinth does not, because it stands on the floor.
   */
  it('stops the plinth at a dishwasher even though the top runs over it', () => {
    const p = withAppliance({});
    expect(benchtopRuns(p)).toHaveLength(1);
    expect(kickBaseRuns(p)).toHaveLength(2);
  });

  it('lets the plinth run under a space that is told to stand on it', () => {
    // A bin unit rather than a dishwasher: it sits on the plinth like a cabinet, so it is placed
    // like one — on top of the kick, at carcass height. The datum test enforces that by itself.
    const p = withCabinets(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0) },
      {
        typeId: 'appliance',
        name: 'Bin',
        width: mm(600),
        x: mm(900),
        y: mm(150),
        height: mm(720),
        options: { standsOnKick: true },
      },
      { typeId: 'base', name: 'B2', width: mm(900), x: mm(1500) },
    );
    expect(kickBaseRuns(p)).toHaveLength(1);
    expect(kickBaseRuns(p)[0]!.length).toBe(2400);
  });

  it('cuts nothing and is charged no assembly time', () => {
    const p = withAppliance({});
    const dishwasher = p.cabinets[1]!;
    expect(buildCabinet(dishwasher, p).panels).toEqual([]);
    // Two carcasses' worth of assembly, not three.
    const withoutSpace: Project = { ...p, cabinets: [p.cabinets[0]!, p.cabinets[2]!] };
    expect(costProject(p).labourMinutes).toBe(costProject(withoutSpace).labourMinutes);
  });

  it('is not told its width is too narrow for sides it does not have', () => {
    const p = withAppliance({});
    expect(buildCabinet(p.cabinets[1]!, p).warnings).toEqual([]);
  });
});

/*
 * ── Owned, not derived ────────────────────────────────────────────────────────────────────────
 */

describe('a benchtop is owned once it is generated', () => {
  const runOfTwo = () =>
    withCabinets(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0) },
      { typeId: 'base', name: 'B2', width: mm(900), x: mm(900) },
    );

  const withTop = (p: Project): Project => ({
    ...p,
    benchtops: generateBenchtops(p, 'stone-quartz-20'),
  });

  it('generates one top per run, sitting on the carcasses', () => {
    const p = withTop(runOfTwo());
    expect(p.benchtops).toHaveLength(1);
    const top = p.benchtops[0]!;
    expect(top.length).toBe(1800);
    expect(top.carcassDepth).toBe(560);
    // 150 kick + 720 carcass — the underside of the slab.
    expect(top.placement.anchor.y).toBe(870);
    expect(top.overhangs.front).toBe(20);
  });

  it('does not move when a cabinet under it does', () => {
    const p = withTop(runOfTwo());
    const moved: Project = {
      ...p,
      cabinets: p.cabinets.map((c) =>
        c.name === 'B2' ? { ...c, width: mm(1200) } : c,
      ),
    };
    // The run is now 2100 long. The top is still exactly the top somebody agreed to.
    expect(benchtopRuns(moved)[0]!.length).toBe(2100);
    expect(moved.benchtops[0]!.length).toBe(1800);
  });

  it('regenerates over the new run and keeps everything a person set', () => {
    const p = withTop(runOfTwo());
    const edited: Benchtop = {
      ...p.benchtops[0]!,
      name: 'Island',
      overhangs: { front: mm(40), back: mm(10), left: mm(300), right: mm(0) },
      ends: { left: 'waterfall', right: 'wall' },
      joins: [mm(900)],
      cutouts: [
        {
          id: 'sink',
          kind: 'sink',
          along: mm(400),
          fromBack: mm(280),
          width: mm(500),
          depth: mm(400),
          cornerRadius: mm(10),
        },
      ],
    };
    const grown: Project = {
      ...p,
      benchtops: [edited],
      cabinets: p.cabinets.map((c) => (c.name === 'B2' ? { ...c, width: mm(1200) } : c)),
    };

    const after = regenerateBenchtop(grown, edited);
    // The geometry follows the run …
    expect(after.length).toBe(2100);
    // … and nothing else does.
    expect(after.id).toBe(edited.id);
    expect(after.name).toBe('Island');
    expect(after.overhangs).toEqual(edited.overhangs);
    expect(after.ends).toEqual(edited.ends);
    expect(after.joins).toEqual(edited.joins);
    expect(after.cutouts).toEqual(edited.cutouts);
  });

  it('leaves a top alone when every cabinet under it has gone', () => {
    const p = withTop(runOfTwo());
    const empty: Project = { ...p, cabinets: [] };
    expect(regenerateBenchtop(empty, p.benchtops[0]!)).toEqual(p.benchtops[0]!);
  });

  it('never generates a second top over a run that already has one', () => {
    const p = withTop(runOfTwo());
    expect(generateBenchtops(p, 'stone-quartz-20')).toEqual([]);
    expect(uncoveredRuns(p, 'benchtop')).toEqual([]);
  });
});

/*
 * ── Two supplies, one object ──────────────────────────────────────────────────────────────────
 */

describe('what a benchtop produces depends on how it is come by', () => {
  const topOf = (materialId: string, patch: Partial<Benchtop> = {}): [Project, Benchtop] => {
    const p = withCabinets({ typeId: 'base', name: 'B1', width: mm(1800), x: mm(0) });
    const top = { ...generateBenchtops(p, materialId)[0]!, ...patch };
    return [{ ...p, benchtops: [top] }, top];
  };

  it('cuts a shop-made top as real parts on the cutlist', () => {
    const [p, top] = topOf('shopmade-hmr-mdf-18');
    const built = buildBenchtop(top, p);
    expect(built.panels).toHaveLength(1);
    // 1800 long by 560 carcass + 20 front overhang.
    expect(size(built.panels[0]!)).toEqual([1800, 580]);
    expect(built.panels[0]!.ownerKind).toBe('benchtop');
    expect(built.panels[0]!.materialId).toBe('mdf-hmr-18');
  });

  it('cuts nothing at all for a bought-in one', () => {
    const [p, top] = topOf('stone-quartz-20');
    expect(buildBenchtop(top, p).panels).toEqual([]);
    expect(buildBenchtop(top, p).warnings).toEqual([]);
  });

  it('cuts one part per section, not one part per top', () => {
    const [p, top] = topOf('shopmade-hmr-mdf-18', { joins: [mm(1000)] });
    const built = buildBenchtop(top, p);
    const slabs = built.panels.filter((x) => x.role === 'benchtop');
    expect(slabs.map((x) => size(x)[0])).toEqual([1000, 800]);
  });

  it('bands the front always and an end only when somebody sees it', () => {
    const [wall] = topOf('shopmade-hmr-mdf-18', { ends: { left: 'wall', right: 'wall' } });
    const [open] = topOf('shopmade-hmr-mdf-18', { ends: { left: 'exposed', right: 'exposed' } });
    const bandedEdges = (p: Project) =>
      Object.keys(buildBenchtop(p.benchtops[0]!, p).panels[0]!.edgeBanding).sort();
    // Lying flat with u = +X and v = −Z, the front edge is L1 and the two ends are W1 and W2.
    expect(bandedEdges(wall)).toEqual(['L1']);
    expect(bandedEdges(open)).toEqual(['L1', 'W1', 'W2']);
  });

  it('hangs a waterfall panel to the floor, mitred at the long point', () => {
    const [p, top] = topOf('shopmade-hmr-mdf-18', { ends: { left: 'waterfall', right: 'wall' } });
    const panel = byName(buildBenchtop(top, p).panels, 'Benchtop waterfall — left');
    // Floor to the top surface: 870 to the underside, plus the 18mm slab.
    expect(size(panel)).toEqual([888, 580]);
    // It reaches the floor, which in unit space is 870 below the origin.
    expect(occupies(panel, p).y).toEqual([-870, 18]);
  });

  /**
   * The one that would look right in a test asserting only the hole's size.
   *
   * A slab lies A-face up, so its part space runs +Y **from the front towards the back**. A sink
   * 280mm from the back of a 580 top is therefore at y = 300, not y = 280 — and a cutout with the
   * two confused sits hard against the wrong edge while measuring exactly the same.
   */
  it('puts a cutout the stated distance from the back, not from the front', () => {
    const [p, top] = topOf('shopmade-hmr-mdf-18', {
      cutouts: [
        {
          id: 'sink',
          kind: 'sink',
          along: mm(900),
          fromBack: mm(280),
          width: mm(820),
          depth: mm(450),
          cornerRadius: mm(10),
        },
      ],
    });
    const cutout = buildBenchtop(top, p).panels[0]!.features.find((f) => f.kind === 'cutout')!;
    const ys = cutout.outline.map((v) => v.y);
    expect(Math.min(...ys)).toBe(300 - 225);
    expect(Math.max(...ys)).toBe(300 + 225);
    const xs = cutout.outline.map((v) => v.x);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([490, 1310]);
  });

  /**
   * The handedness pair, which is the one this codebase's own history says to check.
   *
   * The two waterfall panels are the same size and take different axes, so a mirrored placement
   * would be exactly the same part in exactly the wrong place — invisible to any test that only
   * asserts a size. Each hangs *inboard* of the top's end with its show face flush with it, which is
   * the part that reads wrong until you picture the mitre.
   */
  it('hands the two waterfall panels against each other, not against the same axis', () => {
    const [p, top] = topOf('shopmade-hmr-mdf-18', {
      ends: { left: 'waterfall', right: 'waterfall' },
    });
    const panels = buildBenchtop(top, p).panels;
    const left = byName(panels, 'Benchtop waterfall — left');
    const right = byName(panels, 'Benchtop waterfall — right');
    expect(size(left)).toEqual(size(right));
    // The top runs 0 → 1800, so each panel occupies the 18mm just inside its own end.
    expect(occupies(left, p).x).toEqual([0, 18]);
    expect(occupies(right, p).x).toEqual([1782, 1800]);
    // Both cover the full depth of the top, front to back.
    expect(occupies(left, p).z).toEqual(occupies(right, p).z);
  });

  it('cuts the upstand from the top’s own board, standing on its back edge', () => {
    const [p, top] = topOf('shopmade-hmr-mdf-18', { upstand: { height: mm(100) } });
    const upstand = byName(buildBenchtop(top, p).panels, 'Benchtop upstand');
    expect(size(upstand)).toEqual([1800, 100]);
    // Standing on the top surface, at the back line.
    expect(occupies(upstand, p).y).toEqual([18, 118]);
    expect(occupies(upstand, p).z).toEqual([0, 18]);
  });

  it('reports a cutout that straddles a join rather than cutting half of it into each piece', () => {
    const [p, top] = topOf('shopmade-hmr-mdf-18', {
      joins: [mm(900)],
      cutouts: [
        {
          id: 'sink',
          kind: 'sink',
          along: mm(900),
          fromBack: mm(280),
          width: mm(820),
          depth: mm(450),
          cornerRadius: mm(10),
        },
      ],
    });
    const built = buildBenchtop(top, p);
    expect(built.warnings.join(' ')).toMatch(/crosses a join/);
    expect(built.panels.flatMap((x) => x.features)).toEqual([]);
  });
});

/*
 * ── What a stone top costs ────────────────────────────────────────────────────────────────────
 */

describe('a bought-in top is a purchase order, not a sheet', () => {
  const stoneTop = (patch: Partial<Benchtop> = {}): Project => {
    const p = withCabinets({ typeId: 'base', name: 'B1', width: mm(3000), x: mm(0) });
    return { ...p, benchtops: [{ ...generateBenchtops(p, 'stone-quartz-20')[0]!, ...patch }] };
  };

  /**
   * Longhand, against the shipped indicative rates:
   *
   *   area           3000 × 580 = 1.74m² at $550.00/m²          = $957.00
   *   cutouts        one sink at $180.00                        = $180.00
   *   joins          none                                       =   $0.00
   *   edge           3.0m of front at $45.00/m                  = $135.00
   *                                                               ────────
   *                                                               $1272.00
   *
   * Both ends run into a wall, so neither is a finished edge — which is why the edge line is 3.0m
   * and not 4.16m.
   */
  it('charges the area, the cutouts, the joins and the edge separately', () => {
    const p = stoneTop({
      cutouts: [
        {
          id: 'sink',
          kind: 'sink',
          along: mm(900),
          fromBack: mm(280),
          width: mm(820),
          depth: mm(450),
          cornerRadius: mm(10),
        },
      ],
    });
    const [charge] = benchtopCharges(p);
    expect(charge!.areaM2).toBeCloseTo(1.74, 3);
    expect(charge!.areaCost).toBe(95_700);
    expect(charge!.cutoutCost).toBe(18_000);
    expect(charge!.joinCost).toBe(0);
    expect(charge!.edgeMetres).toBeCloseTo(3.0, 3);
    expect(charge!.edgeCost).toBe(13_500);
    expect(charge!.minimumApplied).toBe(false);
    expect(charge!.totalExGst).toBe(127_200);
  });

  it('counts a mitred end as a join and not as a metre of profiling', () => {
    const plain = benchtopCharges(stoneTop())[0]!;
    const mitred = benchtopCharges(stoneTop({ ends: { left: 'wall', right: 'mitred' } }))[0]!;
    expect(mitred.joinCount).toBe(plain.joinCount + 1);
    expect(mitred.edgeMetres).toBeCloseTo(plain.edgeMetres, 6);
  });

  it('charges the minimum on a job too small to reach it', () => {
    const p = withCabinets({ typeId: 'base', name: 'V', width: mm(900), x: mm(0) });
    const top = generateBenchtops(p, 'stone-quartz-20')[0]!;
    const [charge] = benchtopCharges({ ...p, benchtops: [top] });
    // 0.9 × 0.58 = 0.522m² at $550 = $287.10, plus $40.50 of edge — under the $900 minimum.
    expect(charge!.minimumApplied).toBe(true);
    expect(charge!.totalExGst).toBe(90_000);
  });

  it('charges an upstand as the strip of slab it is', () => {
    const plain = benchtopCharges(stoneTop())[0]!;
    const withUpstand = benchtopCharges(stoneTop({ upstand: { height: mm(100) } }))[0]!;
    // 3000 × 100 of extra slab on top of the 1.74m².
    expect(withUpstand.areaM2 - plain.areaM2).toBeCloseTo(0.3, 6);
  });

  it('says so when an end overhangs the run but is marked as running into a wall', () => {
    const p = stoneTop({
      overhangs: { front: mm(20), back: mm(0), left: mm(0), right: mm(300) },
      ends: { left: 'wall', right: 'wall' },
    });
    expect(costProject(p).warnings.join(' ')).toMatch(/300mm at the right end/);
    // And says nothing when the same overhang is on an end that admits to being seen.
    const bar = stoneTop({
      overhangs: { front: mm(20), back: mm(0), left: mm(0), right: mm(300) },
      ends: { left: 'wall', right: 'exposed' },
    });
    expect(costProject(bar).warnings.join(' ')).not.toMatch(/marked as running into a wall/);
  });

  it('lands on its own cost line, inside material cost, with no sheet bought for it', () => {
    const p = stoneTop();
    const cost = costProject(p);
    expect(cost.benchtopCost).toBeGreaterThan(0);
    expect(cost.materialCost).toBe(
      cost.sheetCost + cost.edgeBandCost + cost.hardwareCost + cost.benchtopCost,
    );
    expect(cost.panels.some((x) => x.name.startsWith('Benchtop'))).toBe(false);
  });

  it('says so rather than quoting zero when a bought-in material has no rates', () => {
    const p = stoneTop();
    const noRates: Project = {
      ...p,
      materials: {
        ...p.materials,
        benchtops: p.materials.benchtops.map((m) =>
          m.id === 'stone-quartz-20' ? { ...m, charges: undefined } : m,
        ),
      },
    };
    expect(benchtopCharges(noRates)[0]!.totalExGst).toBe(0);
    expect(costProject(noRates).warnings.join(' ')).toMatch(/no fabrication rates/);
  });
});

describe('benchtop arithmetic', () => {
  const top = (patch: Partial<Benchtop>): Benchtop =>
    ({
      id: 't',
      name: 'Top',
      fromCabinetIds: [],
      placement: { anchor: { x: 0, y: 870, z: 0 }, yawDeg: 0 },
      length: mm(3000),
      carcassDepth: mm(560),
      materialId: 'stone-quartz-20',
      overhangs: { front: mm(20), back: mm(0), left: mm(0), right: mm(0) },
      ends: { left: 'wall', right: 'wall' },
      joins: [],
      cutouts: [],
      ...patch,
    }) as Benchtop;

  it('splits into sections at the joins, left to right', () => {
    expect(benchtopSections(top({ joins: [mm(1200), mm(2000)] }))).toEqual([1200, 800, 1000]);
  });

  it('ignores a join outside the top rather than producing a negative section', () => {
    // A number field fires on every keystroke: "3" on the way to "3000" must not break the drawing.
    expect(benchtopSections(top({ joins: [mm(-50), mm(9000)] }))).toEqual([3000]);
    expect(benchtopSections(top({ joins: [mm(2000), mm(500)] }))).toEqual([500, 1500, 1000]);
  });

  it('counts an end as a finished edge only when somebody sees it', () => {
    expect(finishedEdgeLength(top({}))).toBe(3000);
    expect(finishedEdgeLength(top({ ends: { left: 'exposed', right: 'wall' } }))).toBe(3580);
    expect(finishedEdgeLength(top({ ends: { left: 'waterfall', right: 'exposed' } }))).toBe(4160);
    // A mitre is a joint, not a profiled edge.
    expect(finishedEdgeLength(top({ ends: { left: 'mitred', right: 'wall' } }))).toBe(3000);
  });

  it('lengthens with an end overhang, on that end alone', () => {
    const bar = top({ overhangs: { front: mm(20), back: mm(0), left: mm(0), right: mm(300) } });
    expect(benchtopLength(bar)).toBe(3300);
  });

  it('suggests joins that keep every section inside a slab, and none when it already does', () => {
    expect(suggestedJoins(top({}), mm(3200))).toEqual([]);
    expect(suggestedJoins(top({}), mm(1400))).toEqual([1000, 2000]);
  });
});

/*
 * ── The ladder base ───────────────────────────────────────────────────────────────────────────
 */

describe('a ladder base is built the way the bench described it', () => {
  const plinth = (width = mm(1800)) => {
    const p = withCabinets({ typeId: 'base', name: 'B1', width, x: mm(0) });
    const { kickBases, cabinets } = generateKickBases(p);
    const project2: Project = { ...p, cabinets, kickBases };
    return { project: project2, base: kickBases[0]!, built: buildKickBase(kickBases[0]!, project2) };
  };

  it('stands on the floor at the kick height, set back like a kick panel would be', () => {
    const { base } = plinth();
    expect(base.height).toBe(150);
    expect(base.placement.anchor.y).toBe(0);
    // 560 carcass less the 50mm kick setback, so the face lands where a per-cabinet kick's does.
    expect(base.depth).toBe(510);
  });

  it('runs its ribs the full height to the floor — they are what it stands on', () => {
    const { project: p, built } = plinth();
    const ribs = built.panels.filter((x) => x.role === 'kick-rib');
    for (const rib of ribs) {
      expect(size(rib)[1]).toBe(150);
      expect(occupies(rib, p).y).toEqual([0, 150]);
    }
  });

  it('cuts the rails short so they hang clear of the floor', () => {
    const { project: p, built } = plinth();
    const rails = built.panels.filter((x) => x.role === 'kick-rail');
    expect(rails).toHaveLength(2);
    for (const rail of rails) {
      // 150 less the 10mm gap, and the top edge still flush with the top of the ribs.
      expect(size(rail)[1]).toBe(140);
      expect(occupies(rail, p).y).toEqual([10, 150]);
    }
  });

  /**
   * The figure that is a reading rather than a fact — see `unconfirmedLadderFigures`.
   *
   * The face is cut 10mm over-height and the extra is taken to sit at the **floor**, as a scribe
   * allowance. In unit space the floor is y = 0, so the face hangs *below* it, exactly as it does on
   * the bench before anybody planes it in.
   */
  it('cuts the kick face over-height with the extra at the floor', () => {
    const { project: p, built } = plinth();
    const face = byName(built.panels, 'Kick face');
    expect(size(face)).toEqual([1800, 160]);
    expect(occupies(face, p).y).toEqual([-10, 150]);
    expect(face.note).toMatch(/planed in on site/);
  });

  it('puts a rib at each end and none further apart than the limit', () => {
    // 1800 long, 16mm board, 600 greatest clear gap → ceil(1784 / 616) = 3 gaps, so four ribs.
    const positions = ribPositions(mm(1800), mm(16), mm(600));
    expect(positions).toHaveLength(4);
    expect(positions[0]).toBe(8);
    expect(positions[3]).toBe(1792);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]! - positions[i - 1]! - 16).toBeLessThanOrEqual(600);
    }
  });

  it('fits the ribs between the rails, not through them', () => {
    const { project: p, built } = plinth();
    const rib = built.panels.find((x) => x.role === 'kick-rib')!;
    // 510 frame less a rail at each end.
    expect(size(rib)[0]).toBe(478);
    expect(occupies(rib, p).z).toEqual([16, 494]);
  });

  it('switches the individual kick off every cabinet it goes under', () => {
    const { project: p } = plinth();
    expect(p.cabinets.every((c) => c.options.hasKick === false)).toBe(true);
    const panels = p.cabinets.flatMap((c) => buildCabinet(c, p).panels);
    expect(panels.filter((x) => x.role === 'kick')).toEqual([]);
  });

  /**
   * Regenerating a plinth: the height follows the run and the depth does not.
   *
   * The asymmetry is the point. A frame's height is not a choice — it is the gap between the floor
   * and the underside of the carcasses, and a frame that does not match it holds the run up in the
   * air. The depth *is* a choice, and somebody may have pulled it back to clear a skirting.
   */
  it('follows the run’s height on a regenerate, and keeps a depth somebody chose', () => {
    const { project: p, base } = plinth();
    const pulledBack = { ...base, depth: mm(450) };
    const raised: Project = {
      ...p,
      kickBases: [pulledBack],
      cabinets: p.cabinets.map((c) => ({
        ...c,
        placement: { ...c.placement, anchor: { ...c.placement.anchor, y: mm(200) } },
      })),
    };
    const after = regenerateKickBase(raised, pulledBack);
    expect(after.height).toBe(200);
    expect(after.depth).toBe(450);
  });

  it('refuses to build a plinth with no height under the cabinets', () => {
    const p = withCabinets({
      typeId: 'base',
      name: 'B1',
      width: mm(900),
      x: mm(0),
      options: { hasKick: false },
    });
    // Nothing to generate — the cabinets are already on the floor.
    expect(generateKickBases(p).kickBases).toEqual([]);
  });
});

/*
 * ── The sample kitchen, and the migration ─────────────────────────────────────────────────────
 */

describe('the sample kitchen', () => {
  it('gets one top over the dishwasher and two plinths either side of it', () => {
    const kitchen = createSampleKitchen();
    expect(kitchen.benchtops).toHaveLength(1);
    expect(benchtopLength(kitchen.benchtops[0]!)).toBe(4200);
    expect(kitchen.kickBases).toHaveLength(2);
    expect(kitchen.kickBases.map((k) => k.length)).toEqual([3000, 600]);
  });

  it('builds every run unit without a warning', () => {
    expect(buildRunUnits(createSampleKitchen()).flatMap((u) => u.warnings)).toEqual([]);
  });
});

describe('a v9 job coming forward', () => {
  /** A v9 file: no benchtops, no plinths, no benchtop materials, no ladder figures. */
  const asV9 = (p: Project): Record<string, unknown> => {
    const { benchtops, kickBases, ...rest } = p;
    void benchtops;
    void kickBases;
    return {
      ...rest,
      schemaVersion: 9,
      constructions: p.constructions.map((c) => {
        const {
          ladderRailFloorGap,
          ladderFaceScribeAllowance,
          ladderFaceScribeEnd,
          ladderMaxRibGap,
          ...c9
        } = c;
        void ladderRailFloorGap;
        void ladderFaceScribeAllowance;
        void ladderFaceScribeEnd;
        void ladderMaxRibGap;
        return c9;
      }),
      materials: { sheets: p.materials.sheets, edgeBands: p.materials.edgeBands },
    };
  };

  /**
   * Both halves, asserted separately, because they are different promises.
   *
   * Unlike v8 → v9 — which deliberately re-priced a saved job upward by the hardware it always had
   * — this one moves nothing at all. A v9 job comes forward with no benchtops and no plinths, so
   * there is nothing new to cut and nothing new to charge.
   */
  it('arrives with no benchtops and no plinths', () => {
    const migrated = migrateProject(asV9(createSampleKitchen()));
    // The version this build reads, not a number typed here: what this test is about is that a
    // v9 job comes all the way forward with nothing in the new slots, and that stays true of
    // every schema change after it.
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.benchtops).toEqual([]);
    expect(migrated.kickBases).toEqual([]);
  });

  it('does not re-price it by a single cent', () => {
    // The v9 kitchen this is built from is one with no run units on it — the state a v9 file could
    // actually have been saved in.
    const kitchen = createSampleKitchen();
    const v9Equivalent: Project = { ...kitchen, benchtops: [], kickBases: [] };
    const migrated = migrateProject(asV9(v9Equivalent));
    expect(costProject(migrated).totalIncGst).toBe(costProject(v9Equivalent).totalIncGst);
  });

  it('fills in the ladder figures and the benchtop materials so the slots are never empty', () => {
    const migrated = migrateProject(asV9(createSampleKitchen()));
    expect(migrated.constructions[0]!.ladderRailFloorGap).toBe(10);
    expect(migrated.constructions[0]!.ladderFaceScribeEnd).toBe('floor');
    expect(migrated.materials.benchtops.length).toBeGreaterThan(0);
  });

  it('keeps a shop’s own benchtop materials rather than overwriting them', () => {
    const kitchen = createSampleKitchen();
    const mine = [{ ...kitchen.materials.benchtops[0]!, decor: 'My stone' }];
    const migrated = migrateProject({
      ...asV9(kitchen),
      materials: { ...kitchen.materials, benchtops: mine },
    });
    expect(migrated.materials.benchtops[0]!.decor).toBe('My stone');
  });

  it('refuses a job saved by a newer build', () => {
    expect(() => migrateProject({ ...asV9(createSampleKitchen()), schemaVersion: 99 })).toThrow(
      /newer version/,
    );
  });
});

/*
 * ── The colours, backfilled ───────────────────────────────────────────────────────────────────
 */

describe('a job saved before the screen colours existed', () => {
  /**
   * The bug this covers, stated as the bench stated it: *"changing the door to Notaio Walnut has
   * done nothing."*
   *
   * The material picker was working the whole time — the cutlist changed, the price changed, the
   * decor on the order changed. What did not change was the picture, because a job carries its own
   * copy of the material list and a job saved before `colour` existed has a copy with none in it.
   * Every part then falls back to the viewport's colour for its role, so every decor draws the same.
   */
  const withoutColours = (p: Project): Record<string, unknown> => ({
    ...p,
    schemaVersion: 10,
    materials: {
      ...p.materials,
      sheets: p.materials.sheets.map((sheet) => {
        const { colour, ...rest } = sheet;
        void colour;
        return rest;
      }),
    },
  });

  it('gets its colours back, matched by material id', () => {
    const kitchen = createSampleKitchen();
    const stripped = withoutColours(kitchen);
    // The state that produced the report: not one colour anywhere in the job.
    expect(
      (stripped.materials as { sheets: { colour?: string }[] }).sheets.every((s) => !s.colour),
    ).toBe(true);

    const migrated = migrateProject(stripped);
    const walnut = migrated.materials.sheets.find((s) => s.id === 'poly-notaio-walnut-16')!;
    expect(walnut.colour).toBe('#7a5a42');
    expect(migrated.materials.sheets.every((s) => s.colour)).toBe(true);
  });

  it('never overwrites a colour a shop has deliberately set', () => {
    const kitchen = createSampleKitchen();
    const mine: Record<string, unknown> = {
      ...withoutColours(kitchen),
      materials: {
        ...kitchen.materials,
        sheets: kitchen.materials.sheets.map((s) =>
          s.id === 'poly-notaio-walnut-16' ? { ...s, colour: '#123456' } : { ...s, colour: undefined },
        ),
      },
    };
    const migrated = migrateProject(mine);
    expect(migrated.materials.sheets.find((s) => s.id === 'poly-notaio-walnut-16')!.colour).toBe(
      '#123456',
    );
  });

  /**
   * The half that matters most, and the reason this migration is safe to make at all: a colour is
   * screen-only. Nothing is cut, priced or ordered from one — the decor *name* is the fact.
   */
  it('does not move a part or a cent', () => {
    const kitchen = createSampleKitchen();
    const migrated = migrateProject(withoutColours(kitchen));
    expect(costProject(migrated).totalIncGst).toBe(costProject(kitchen).totalIncGst);
    expect(allPanels(migrated).map((p) => [p.name, ...size(p)])).toEqual(
      allPanels(kitchen).map((p) => [p.name, ...size(p)]),
    );
  });

  it('fills a shop’s standards at the source, so new jobs stop inheriting the hole', () => {
    const { materials, ...rest } = AU_SHOP_STANDARDS;
    const v6 = {
      ...rest,
      version: 6,
      savedTypes: [],
      materials: {
        ...materials,
        sheets: materials.sheets.map(({ colour, ...s }) => {
          void colour;
          return s;
        }),
      },
    };
    const migrated = migrateStandards(v6);
    expect(migrated.version).toBe(CURRENT_STANDARDS_VERSION);
    expect(migrated.materials.sheets.every((s) => s.colour)).toBe(true);
    // Everything a shop actually set is untouched.
    expect(migrated.constructions[0]!.kickHeight).toBe(AU_SHOP_STANDARDS.constructions[0]!.kickHeight);
  });
});

describe('supplier decor textures', () => {
  it('backfills verified swatches into an existing job without touching custom texture data', () => {
    const project = createSampleKitchen();
    const old = {
      ...project,
      schemaVersion: 17,
      materials: {
        ...project.materials,
        sheets: project.materials.sheets.map((sheet) =>
          sheet.id === 'poly-sepia-oak-16'
            ? { ...sheet, texture: undefined }
            : sheet.id === 'poly-notaio-walnut-16'
              ? {
                  ...sheet,
                  texture: {
                    url: '/my-walnut.jpg',
                    repeatLength: 800,
                    repeatWidth: 600,
                    grainAxis: 'v',
                    sourceUrl: 'shop',
                  },
                }
              : sheet,
        ),
      },
    };

    const migrated = migrateProject(old);
    expect(migrated.materials.sheets.find((s) => s.id === 'poly-sepia-oak-16')!.texture?.url).toBe(
      '/materials/board/sepia-oak.jpg',
    );
    expect(migrated.materials.sheets.find((s) => s.id === 'poly-notaio-walnut-16')!.texture?.url).toBe(
      '/my-walnut.jpg',
    );
  });

  it('adds the swatches to saved shop standards for future jobs', () => {
    const old = {
      ...AU_SHOP_STANDARDS,
      version: 13,
      materials: {
        ...AU_SHOP_STANDARDS.materials,
        sheets: AU_SHOP_STANDARDS.materials.sheets.map((sheet) => ({ ...sheet, texture: undefined })),
      },
    };
    const migrated = migrateStandards(old);
    expect(migrated.materials.sheets.find((s) => s.id === 'poly-notaio-walnut-16')!.texture).toBeDefined();
  });
});
