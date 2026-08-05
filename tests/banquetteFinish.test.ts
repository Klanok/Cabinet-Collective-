/**
 * The banquette finishing pass — §5.14, reported from the bench with photographs.
 *
 * Three faults, one branch, because two of them deliberately re-price and that argument is better
 * made once than twice.
 *
 * ## 1. The cushion sat inside the carcass
 *
 * > *"standard straight run cushion is exposing the carcass"* — and the answer:
 * > *"it should be adjustable — but generally should be 10mm proud of the finish panel/door"*
 *
 * `seatCushionInset` held the cushion 5mm inside **every** carcass face. `seatCushionOverhang`
 * stands it 10mm proud of the finished front and flush at the ends and the back. Worked longhand on
 * the shipped 1200 × 400 × 500 banquette, 18mm doors on a 2mm standoff:
 *
 * ```
 *   finished front face   500 + 2 + 18          = 520
 *   cushion front edge    520 + 10 proud        = 530
 *   cushion plan          1200 × 530            (was 1190 × 490)
 * ```
 *
 * The tests below assert **occupancy** rather than size, per §7: a cushion of the right size sitting
 * 40mm too far back is the same rectangle and still shows carcass at the front.
 *
 * ## 2. The front was cut 3mm short at the top
 *
 * `fixedFrontPanel` cut `H − revealTop − revealBottom` by `zone.width − 2 × revealSides`. A reveal
 * is clearance for a **door to swing** — `revealTop` is 3mm so a door can open under a benchtop —
 * and a false front takes no hinges, never opens, and has a cushion above it rather than a benchtop.
 * So it is now cut to fill its zone exactly, and the white band along the top of the photograph is
 * gone. **This re-cuts every banquette front in every saved job**, which is why the door invariant
 * below is asserted in the same file: a base cabinet's door has to be untouched.
 *
 * ## 3. The finish laminate was charged, dimensioned, and drawn nowhere
 *
 * `LAMINATE_MATERIAL_ID` appeared in exactly one place in the codebase — `costing.ts`, charged as
 * sheet goods — while `wrapPart` set `material: 'skin'` and the viewport drew every panel in its own
 * material. So a curved end rendered in cream bendy ply beside a walnut front.
 *
 * **The second half is the one that would have wasted an afternoon.** `finishLaminate` migrates to
 * **zero** on saved jobs and standards, deliberately, so a shop's curve may have no laminate at all
 * rather than an unrendered one — and nothing on screen told those apart. Which turned out to be
 * worse than §5.14 knew: the quote charged a laminate sheet plus its labour on **every** curve,
 * laminate or none, while `substrateRadius` sized the formers off the allowance and got the other
 * answer. So the three tests here are the three things that now agree, off one predicate.
 */

import { describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { createCabinet, createEmptyProject } from '../src/core/project/factory.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { costProject } from '../src/core/costing/costing.ts';
import { cushionCharges } from '../src/core/costing/cushionCost.ts';
import { seatCushionPlan } from '../src/core/model/cushion.ts';
import {
  CURRENT_SCHEMA_VERSION,
  type Project,
  migrateProject,
} from '../src/core/model/project.ts';
import {
  AU_SHOP_STANDARDS,
  CURRENT_STANDARDS_VERSION,
  migrateStandards,
} from '../src/core/standards/standards.ts';
import { softEdge, wedgeBackPlacement } from '../src/app/viewport/cushionMesh.ts';
import { byName, occupies, size } from './helpers.ts';

const W = 1200;
const H = 400;
const D = 500;
/** 500 carcass + 2 standoff + 18 door. */
const FINISHED_FRONT = 520;
const OVERHANG = 10;

const banquette = (options: Record<string, unknown> = {}, width = W) => {
  const project = createEmptyProject('Banquette finish');
  const base = createCabinet(
    { typeId: 'banquette', name: 'BQ1', width: mm(width), x: mm(0) },
    project.defaults,
    project.constructions,
  );
  const cabinet = { ...base, options: { ...base.options, ...options } };
  const withCabinet: Project = { ...project, cabinets: [cabinet] };
  return { project: withCabinet, cabinet, built: buildCabinet(cabinet, withCabinet) };
};

/** The same job with the finish laminate switched off, as every migrated job has it. */
const withoutLaminate = (project: Project): Project => ({
  ...project,
  constructions: project.constructions.map((c) => ({ ...c, finishLaminate: mm(0) })),
});

/* ── 1. The cushion stands proud of the front ────────────────────────────────────────────────── */

describe('the seat cushion covers the carcass', () => {
  const planOf = (built: ReturnType<typeof banquette>['built'], overhang = OVERHANG) =>
    seatCushionPlan({
      W: mm(W),
      D: mm(D),
      finishedFrontZ: built.finishedFrontZ,
      overhang: mm(overhang),
      round: built.radius ? { corner: built.radius.corner, radius: built.radius.r } : null,
    });

  it('reads the finished front the rule engine settled on, rather than working it out again', () => {
    // Carried on the built cabinet for the same reason the radius is: the cushion is the one
    // thing on a banquette nobody can check against a cutlist, so a second opinion about where
    // the front of the kitchen is would go unnoticed.
    expect(banquette().built.finishedFrontZ).toBe(mm(FINISHED_FRONT));
  });

  it('runs flush to both ends and 10mm past the door face', () => {
    const plan = planOf(banquette().built);
    expect([plan.x0, plan.x1]).toEqual([mm(0), mm(W)]);
    expect([plan.z0, plan.z1]).toEqual([mm(0), mm(FINISHED_FRONT + OVERHANG)]);
  });

  it('leaves no carcass on show anywhere around it — the reported fault, as occupancy', () => {
    /*
     * Stated as the thing that was wrong rather than as the shape that fixes it. The old plan was
     * 5 → 1195 by 5 → 495 on a 1200 × 500 carcass: a 5mm strip of white board visible along both
     * ends, the back and the front, plus everything in front of the carcass to the door face. Any
     * size assertion passes with the cushion in the wrong place, so this asks about the carcass's
     * own footprint instead.
     */
    const plan = planOf(banquette().built);
    expect(plan.x0).toBeLessThanOrEqual(0);
    expect(plan.x1).toBeGreaterThanOrEqual(W);
    expect(plan.z0).toBeLessThanOrEqual(0);
    expect(plan.z1).toBeGreaterThanOrEqual(D);
  });

  it('is adjustable, and the adjustment moves the front edge only', () => {
    // The shop's first word on it was "adjustable". A control that also moved the ends would be a
    // control that pushes two cushions in a run into each other.
    const wide = planOf(banquette().built, 50);
    expect(wide.z1).toBe(mm(FINISHED_FRONT + 50));
    expect([wide.x0, wide.x1, wide.z0]).toEqual([mm(0), mm(W), mm(0)]);
  });

  it('charges the seat at what it now measures', () => {
    // §4.19 charges the cushion's own width because the upholsterer makes and measures it. The
    // cushion grew, so the charge grew — the fourth deliberate re-price in this codebase.
    const [charge] = cushionCharges(banquette().project);
    expect(charge!.lines[0]!.linealMm).toBe(mm(W));
  });
});

/* ── The migration, both chains ──────────────────────────────────────────────────────────────── */

describe('a job saved with the old cushion inset', () => {
  /** A v29 job carrying the field as it was: an inset, on the cabinet. */
  const asV29 = (job: Project): Record<string, unknown> => {
    const raw = JSON.parse(JSON.stringify(job)) as Record<string, unknown>;
    return {
      ...raw,
      schemaVersion: 29,
      cabinets: (raw.cabinets as Record<string, unknown>[]).map((c) => {
        const { seatCushionOverhang: _gone, ...rest } = c.options as Record<string, unknown>;
        return { ...c, options: { ...rest, seatCushionInset: 5 } };
      }),
    };
  };

  it('drops the inset and adopts the shop’s 10mm, because no arithmetic converts one to the other', () => {
    const migrated = migrateProject(asV29(banquette().project));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const options = migrated.cabinets[0]!.options as Record<string, unknown>;
    expect(options.seatCushionInset).toBeUndefined();
    expect(options.seatCushionOverhang).toBe(10);
  });

  it('says out loud that it re-prices', () => {
    // The half that admits to it, asserted separately per §2. A 1200 banquette with a back goes
    // from 2 × 1190mm of upholstery to 2 × 1200mm.
    const migrated = migrateProject(asV29(banquette().project));
    const [charge] = cushionCharges(migrated);
    expect(charge!.lines.map((l) => l.linealMm)).toEqual([mm(1200), mm(1200)]);
  });

  it('leaves a cabinet that never had a cushion completely untouched', () => {
    const project = createEmptyProject('Base');
    const base = createCabinet(
      { typeId: 'base', name: 'B1', width: mm(600), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    const job: Project = { ...project, cabinets: [base] };
    const raw = { ...(JSON.parse(JSON.stringify(job)) as object), schemaVersion: 29 };
    expect(migrateProject(raw).cabinets[0]!.options).toEqual(base.options);
  });

  it('repairs the saved cabinet type in the standards, not only the job', () => {
    /*
     * §4.22's fault, which is what this assertion exists for: a repair that reaches the job and
     * not the standards it is copied from looks fixed until somebody places a saved banquette,
     * which then arrives carrying a field nothing reads and no overhang at all.
     */
    const old = {
      ...(JSON.parse(JSON.stringify(AU_SHOP_STANDARDS)) as object),
      version: 21,
      savedTypes: [
        {
          id: 'type-1',
          name: 'Banquette 1800',
          typeId: 'banquette',
          width: 1800,
          height: 400,
          depth: 500,
          materials: {},
          options: { seatCushionInset: 5, hasBackCushion: true },
        },
      ],
    };
    const migrated = migrateStandards(old);
    expect(migrated.version).toBe(CURRENT_STANDARDS_VERSION);
    const options = migrated.savedTypes[0]!.options as Record<string, unknown>;
    expect(options.seatCushionInset).toBeUndefined();
    expect(options.seatCushionOverhang).toBe(10);
    // And nothing else about the recipe moved.
    expect(options.hasBackCushion).toBe(true);
  });
});

/* ── 2. The front takes no reveal ────────────────────────────────────────────────────────────── */

describe('the fixed front does not take a door’s reveal', () => {
  it('is cut to the full carcass height and the full width', () => {
    // Was 1197 × 397: 3mm off the top for a swing that never happens, 1.5mm off each end.
    const front = byName(banquette().built.panels, 'Front');
    expect(size(front)).toEqual([mm(W), mm(H)]);
  });

  it('reaches the top of the carcass, where the white band was', () => {
    const { project, built } = banquette();
    expect(occupies(byName(built.panels, 'Front'), project).y).toEqual([mm(0), mm(H)]);
  });

  it('lets two of them in a run meet rather than leaving a line of daylight', () => {
    const { project, built } = banquette();
    // Flush to both ends of its own carcass, so the next unit's front starts where this one stops.
    expect(occupies(byName(built.panels, 'Front'), project).x).toEqual([mm(0), mm(W)]);
  });

  it('leaves a real door exactly as it was — the invariant that protects every other job', () => {
    /*
     * The reveal is not gone; it is not applied to a part that does not swing. A base cabinet's
     * door still carries all three, and this is what says so rather than trusting that a change in
     * a shared builder stayed where it was aimed.
     */
    const project = createEmptyProject('Door');
    const base = createCabinet(
      { typeId: 'base', name: 'B1', width: mm(600), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    const built = buildCabinet(base, project);
    const door = byName(built.panels, 'Door L');
    // 720 − 3 top − 0 bottom = 717 long, and the pair share the width less two side reveals and
    // the gap between them.
    expect(size(door)[0]).toBe(mm(base.height - 3));
    expect(occupies(door, project).y).toEqual([mm(0), mm(base.height - 3)]);
  });
});

/* ── 3. The finish laminate is drawn, and its absence is said ────────────────────────────────── */

describe('the finish laminate over a curve', () => {
  const curved = (project?: (p: Project) => Project) => {
    const b = banquette({ radiusCorner: 'front-right', carcassRadius: mm(200) });
    const job = project ? project(b.project) : b.project;
    return { project: job, built: buildCabinet(job.cabinets[0]!, job) };
  };

  it('puts the door decor on the outer layer, and on that layer only', () => {
    const { project, built } = curved();
    const skins = built.panels.filter((p) => p.role === 'skin');
    expect(skins).toHaveLength(2);
    // The laminate is one sheet over the outside of the finished wrap, not something between the
    // plies — `substrateRadius` already takes it off once rather than once per layer.
    expect(skins[0]!.finishMaterialId).toBeUndefined();
    expect(skins[1]!.finishMaterialId).toBe(project.defaults.doorMaterialId);
  });

  it('does not change what the part is cut from, which is the whole reason it is not a part', () => {
    // §5.0 settled that the laminate is a dimension rather than a part: hand-applied and
    // trim-routed, so it has no blank, no nest and no cutlist line. What was missing was never a
    // part — it was that the finished face is not the face of the board.
    const { project, built } = curved();
    const outer = built.panels.filter((p) => p.role === 'skin').at(-1)!;
    expect(outer.materialId).toBe(project.defaults.skinMaterialId);
    expect(outer.materialId).not.toBe(outer.finishMaterialId);
  });

  it('says in words when a curve has no laminate on it at all', () => {
    /*
     * The trap §5.14 named. `finishLaminate` migrates to zero on purpose, so a shop's curve may
     * genuinely be bare bendy ply — and drawing it honestly is not enough, because bare ply is
     * also what a curve looks like when nobody has noticed. §4.18's lesson in a new hat.
     */
    const { built } = curved(withoutLaminate);
    expect(built.panels.every((p) => p.finishMaterialId === undefined)).toBe(true);
    expect(built.warnings.some((w) => w.includes('no finish laminate'))).toBe(true);
  });

  it('says nothing at all about a cabinet with no curve in it', () => {
    const project = createEmptyProject('Square');
    const base = createCabinet(
      { typeId: 'base', name: 'B1', width: mm(600), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    expect(buildCabinet(base, withoutLaminate(project)).warnings).toEqual([]);
  });

  it('stops charging a laminate the build does not have', () => {
    /*
     * The third disagreement, and the sharpest: costing counted **every** curve as laminated and
     * charged a sheet plus its labour, while the formers were being sized off an allowance of
     * zero. So a job migrated by v23 — whose comment says *"nothing is re-priced"* — was cut with
     * no laminate in it and quoted with one, up to a $400 sheet for material nobody buys.
     */
    const { project } = curved();
    const withIt = costProject(project);
    const without = costProject(withoutLaminate(project));

    expect(withIt.laminatedCurves).toBe(1);
    expect(withIt.laminateCost).toBeGreaterThan(0);
    expect(withIt.laminateLabourCost).toBeGreaterThan(0);

    expect(without.laminatedCurves).toBe(0);
    expect(without.laminateCost).toBe(0);
    expect(without.laminateLabourCost).toBe(0);
    expect(without.totalCost).toBeLessThan(withIt.totalCost);
  });

  it('still cuts the same parts either way — the charge moved, the board did not', () => {
    // Sizes do move by the millimetre the allowance takes off the substrate, which is asserted in
    // tests/cornerRadiusParts.test.ts and is not this file's claim. What must not change is the
    // part *list*: a finish is not a part, so nothing appears or disappears.
    const { built } = curved();
    const bare = curved(withoutLaminate).built;
    expect(bare.panels.map((p) => p.name)).toEqual(built.panels.map((p) => p.name));
    expect(bare.panels.map((p) => p.materialId)).toEqual(built.panels.map((p) => p.materialId));
  });
});

/* ── The cushion mesh, which is where the last two faults have both been ─────────────────────── */

/**
 * The back cushion's mesh placement.
 *
 * **The fault this covers is one the last pass's own fix could not see.** `bevelSize` grows an
 * extrusion outward on every face, so a shape built `b` smaller finishes at the stated size — that
 * shipped. What did not is that the growth runs from `−b` to `length − b` rather than being
 * symmetrical about the origin, so a cushion of exactly the right size sat one bevel out of place
 * on all three axes. Every size assertion passes on it.
 *
 * Worked longhand for the shipped back cushion — 1200 run, 400 high, 80 thick, 18mm soft edge,
 * sitting on a seat whose top is at y = 480:
 *
 * ```
 *   bevel      min(18, 80/4, 1200/4, 400/4)       =   18
 *   depth      1200 − 2 × 18                      = 1164
 *   origin x   0 + 1200 − 18                      = 1182   ← the run goes back from here
 *   origin y   480 + 18                           =  498
 *   origin z   18                                 =   18
 * ```
 *
 * The occupancy those produce — x 0 → 1200, y 480 → 880, z 0 → 80 — was **measured in the running
 * three.js scene**, not derived a second time here (§7). Before the fix the same scene read
 * x 18 → 1218, y 462 → 862, z −18 → 62: the right cushion, one bevel into the wall.
 */
describe('a bevelled cushion finishes where it says it does', () => {
  it('takes the bevel off the placement as well as off the size', () => {
    const placed = wedgeBackPlacement({
      x: 0,
      y: 480,
      width: 1200,
      height: 400,
      thickness: 80,
      radius: 18,
    });
    expect(placed.bevel).toBe(18);
    expect(placed.depth).toBe(1164);
    expect(placed.position).toEqual([1182, 498, 18]);
  });

  it('moves the origin with the soft edge rather than by a fixed amount', () => {
    // How the fault was confirmed as real: the displacement tracked the radius exactly, which no
    // off-by-one or rounding error does.
    const soft = (radius: number) =>
      wedgeBackPlacement({ x: 0, y: 480, width: 1200, height: 400, thickness: 80, radius });
    expect(soft(4).position).toEqual([1196, 484, 4]);
    expect(soft(18).position).toEqual([1182, 498, 18]);
  });

  it('clamps the soft edge to a quarter of the smallest face it has to turn', () => {
    // A bevel bigger than that eats the face it is softening. 80mm thick is the binding one here.
    expect(softEdge(200, 80, 1200, 400)).toBe(20);
    // And never nothing: `bevelEnabled` with no bevel produces a degenerate cap.
    expect(softEdge(18, 0, 0, 0)).toBe(0.5);
  });

  it('places an end bolster inside the seat it stands on, not one bevel off the end of it', () => {
    // The returns go through the same function inside a rotated group, so the correction reaches
    // all four bolsters rather than the one somebody happened to be looking at.
    const placed = wedgeBackPlacement({
      x: 0,
      y: 480,
      width: 450,
      height: 400,
      thickness: 80,
      radius: 18,
    });
    expect(placed.position[0]).toBe(450 - 18);
    expect(placed.depth).toBe(450 - 36);
  });
});
