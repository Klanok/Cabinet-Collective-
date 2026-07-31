/**
 * Applied end panels — the board on the exposed end of a run.
 *
 * From the bench: *"I also need applied end panels asap — that's a huge miss"*, and it was. The
 * `end-panel` role had been in `PanelRole` since Phase 1, `STYLED_FRONT_ROLES` already listed it
 * so a shaker kitchen would get shaker ends, and `machineFront`'s comment named it as the thing
 * coming next. Nothing produced one. A kitchen drawn in this app ended a run in carcass melamine.
 *
 * ## The reference panel, worked longhand
 *
 * A base cabinet 900 W × 720 H × 560 D, 16mm carcass, 18mm doors, 150 kick, 2mm front standoff,
 * with the shipped end detail: 20mm scribe past the back, flush at the front, down to the floor.
 *
 * ```
 *   front face      560 + 2 standoff + 18 door + 0 overhang   = 580
 *   back edge       0 − 20 scribe                             = −20
 *   depth           580 − (−20)                               = 600
 *   bottom          0 − 150 kick                              = −150
 *   height          720 − (−150)                              = 870
 *   panel                                                       870 × 600
 * ```
 *
 * 580 is the number the shop gave for where an 18mm door lands on a 560 carcass, and it is not a
 * coincidence that it turns up here: the panel's whole job is to finish in the plane the fronts
 * finish in. Both read `finishedFrontZ`, resolved once in the context, so there is no second
 * place for the two to disagree by 2mm.
 *
 * ## What the tests are really guarding
 *
 * **Handedness.** An applied end on the wrong side of a cabinet is the right part in the wrong
 * place: same size, same banding, same cutlist line, and a remake. So the assertions here are
 * occupancy — the cabinet-space box — and not size. `x ∈ [−18, 0]` on the left and `[900, 918]`
 * on the right is the whole test; a builder that got the axes right and the origin wrong would
 * produce a panel of exactly the right dimensions inside the cabinet.
 *
 * **Which way it faces.** This is the one part in a carcass whose show face points *away* from
 * the cabinet. Every side, bottom and shelf has its A-face inward; get an end panel the same way
 * round and the decor goes against the melamine, which cannot be seen in a size or an occupancy.
 *
 * **That the carcass did not move.** Applying a panel is not a change to the cabinet. Every other
 * part has to come out identical, or the option has quietly re-cut a kitchen.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { createCabinet, createEmptyProject, resetIdCounter } from '../src/core/project/factory.ts';
import type { CabinetOptions, CabinetTypeId } from '../src/core/model/cabinet.ts';
import { hasAppliedEnd } from '../src/core/model/cabinet.ts';
import type { Project } from '../src/core/model/project.ts';
import { CURRENT_SCHEMA_VERSION, migrateProject } from '../src/core/model/project.ts';
import type { Panel } from '../src/core/model/panel.ts';
import { partToCabinet } from '../src/core/geom/placement.ts';
import { v3 } from '../src/core/geom/vec.ts';
import { actualThicknessOf, findSheet } from '../src/core/model/material.ts';
import { withAppliedEnds } from '../src/core/model/construction.ts';
import { byName, namesOf, occupies, size } from './helpers.ts';

interface Built {
  readonly project: Project;
  readonly panels: readonly Panel[];
  readonly warnings: readonly string[];
}

const build = (
  typeId: CabinetTypeId,
  dims: { W: number; H: number; D: number },
  options: CabinetOptions,
): Built => {
  const project = createEmptyProject('Applied ends');
  const cabinet = createCabinet({
    typeId,
    name: 'X1',
    x: mm(0),
    width: mm(dims.W),
    height: mm(dims.H),
    depth: mm(dims.D),
    options,
  });
  const withCabinet: Project = { ...project, cabinets: [cabinet] };
  const built = buildCabinet(cabinet, withCabinet);
  return { project: withCabinet, panels: built.panels, warnings: built.warnings };
};

const BASE = { W: 900, H: 720, D: 560 };
const base = (options: CabinetOptions = {}) => build('base', BASE, options);

/**
 * Where the panel's **show face** sits in cabinet space.
 *
 * The A-face is at part-space z = thickness, so pushing a point through the placement by the
 * board's thickness is what says which way round the panel is. Nothing else in this file can
 * catch a panel applied decor-inward: it is the same box either way.
 */
const showFaceX = (panel: Panel, project: Project): number => {
  const t = actualThicknessOf(findSheet(project.materials, panel.materialId));
  return Math.round(partToCabinet(panel.placement, v3(0, 0, t)).x * 1e6) / 1e6;
};

/** Every part except the applied ends, as a comparable value. */
const carcass = (b: Built) =>
  b.panels
    .filter((p) => p.role !== 'end-panel')
    .map((p) => ({
      name: p.name,
      role: p.role,
      material: p.materialId,
      size: size(p),
      box: occupies(p, b.project),
      banding: p.edgeBanding,
      features: p.features,
    }));

beforeEach(() => resetIdCounter());

describe('an applied end does nothing until it is asked for', () => {
  it('produces no end panel on a cabinet that never named one', () => {
    for (const typeId of ['base', 'wall', 'tall', 'drawer-bank', 'custom'] as CabinetTypeId[]) {
      const { panels, warnings } = build(typeId, { W: 900, H: 720, D: 560 }, {});
      expect(panels.filter((p) => p.role === 'end-panel')).toEqual([]);
      expect(warnings.filter((w) => w.includes('applied'))).toEqual([]);
    }
  });

  it('produces none for an empty list, which is what a stored job comes forward with', () => {
    expect(base({ appliedEnds: [] }).panels.filter((p) => p.role === 'end-panel')).toEqual([]);
  });

  it('leaves every other part of the cabinet exactly as it was', () => {
    // The point of the whole option: applying a panel is not a change to the cabinet. If this
    // fails, some builder has started reading `appliedEnds` and re-cut a kitchen.
    const plain = base();
    const ended = base({ appliedEnds: ['left', 'right'] });
    expect(carcass(ended)).toEqual(carcass(plain));
    expect(ended.warnings).toEqual(plain.warnings);
  });
});

describe('the reference panel, as worked in the header', () => {
  const left = () => base({ appliedEnds: ['left'] });

  it('cuts it 870 × 600 — floor to carcass top, scribe to door face', () => {
    expect(size(byName(left().panels, 'End panel L'))).toEqual([mm(870), mm(600)]);
  });

  it('finishes in the door plane at 580, which is where the shop said a door lands', () => {
    const b = left();
    const panel = occupies(byName(b.panels, 'End panel L'), b.project);
    expect(panel.z[1]).toBe(mm(580));
    // And the doors are in the same plane, from the same figure. Asserted together rather than
    // separately on purpose: what matters is that they agree, not what either one is.
    expect(occupies(byName(b.panels, 'Door L'), b.project).z[1]).toBe(panel.z[1]);
  });

  it('is cut long at the back and runs down over the kick', () => {
    const b = left();
    const panel = occupies(byName(b.panels, 'End panel L'), b.project);
    expect(panel.z[0]).toBe(mm(-20));
    expect(panel.y).toEqual([mm(-150), mm(720)]);
    // Past the bottom of the kick face, not just to it — they finish together on the floor.
    expect(panel.y[0]).toBe(occupies(byName(b.panels, 'Kick'), b.project).y[0]);
  });

  it('is cut from the door board, not the carcass board', () => {
    const b = left();
    expect(byName(b.panels, 'End panel L').materialId).toBe(b.project.defaults.doorMaterialId);
    expect(byName(b.panels, 'End panel L').materialId).toBe(
      byName(b.panels, 'Door L').materialId,
    );
  });

  it('runs its grain up the panel, as a door does', () => {
    expect(byName(left().panels, 'End panel L').grain).toBe('length-along-grain');
  });
});

describe('handedness — the failure this part is most likely to produce', () => {
  it('puts the left panel outboard of the left side, and the right outboard of the right', () => {
    const b = base({ appliedEnds: ['left', 'right'] });
    expect(occupies(byName(b.panels, 'End panel L'), b.project).x).toEqual([mm(-18), mm(0)]);
    expect(occupies(byName(b.panels, 'End panel R'), b.project).x).toEqual([mm(900), mm(918)]);
  });

  it('does not touch the carcass side it is laid over', () => {
    // "Applied" means applied. The side underneath is the same 720 × 544 panel in the same
    // place, which is what separates this from a finished end cut out of door board.
    const b = base({ appliedEnds: ['left'] });
    expect(occupies(byName(b.panels, 'Side L'), b.project).x).toEqual([mm(0), mm(16)]);
    expect(size(byName(b.panels, 'Side L'))).toEqual([mm(720), mm(544)]);
  });

  it('does not change the cabinet’s width — the panel is extra, on the outside', () => {
    const b = base({ appliedEnds: ['left', 'right'] });
    expect(b.project.cabinets[0]?.width).toBe(mm(900));
    expect(occupies(byName(b.panels, 'Bottom'), b.project).x).toEqual([mm(16), mm(884)]);
  });

  it('faces its decor outward on both hands', () => {
    // The one assertion in this file that a box cannot make. A panel applied the wrong way round
    // occupies exactly the same space with the melamine face showing.
    const b = base({ appliedEnds: ['left', 'right'] });
    expect(showFaceX(byName(b.panels, 'End panel L'), b.project)).toBe(-18);
    expect(showFaceX(byName(b.panels, 'End panel R'), b.project)).toBe(918);
  });

  it('asks for one end and gets one end', () => {
    expect(namesOf(base({ appliedEnds: ['right'] }).panels)).toContain('End panel R');
    expect(namesOf(base({ appliedEnds: ['right'] }).panels)).not.toContain('End panel L');
  });
});

describe('banding — never the edge that gets planed off', () => {
  it('leaves the scribed back edge bare', () => {
    // Banding an edge that is about to be planed into a wall is tape and time thrown away, and
    // it is worse than that: it tells whoever fits it that the edge is finished.
    const b = base({ appliedEnds: ['left'] });
    const panel = byName(b.panels, 'End panel L');
    // v = −Z on the left hand, so the back-facing edge is L2.
    expect(panel.edgeBanding.L2).toBeUndefined();
    expect(panel.edgeBanding.L1).toBeDefined();
  });

  it('leaves the top bare under a benchtop and bands it where it is seen', () => {
    const under = byName(base({ appliedEnds: ['left'] }).panels, 'End panel L');
    const seen = byName(
      build('wall', { W: 900, H: 720, D: 330 }, { appliedEnds: ['left'] }).panels,
      'End panel L',
    );
    // u = +Y, so the top edge is W2 on both.
    expect(under.edgeBanding.W2).toBeUndefined();
    expect(seen.edgeBanding.W2).toBeDefined();
  });

  it('bands the bottom, which stands on the floor', () => {
    expect(byName(base({ appliedEnds: ['left'] }).panels, 'End panel L').edgeBanding.W1)
      .toBeDefined();
  });
});

describe('the cabinets it goes on', () => {
  it('stops at the carcass bottom on a wall cabinet, which has no kick to cover', () => {
    const b = build('wall', { W: 900, H: 720, D: 330 }, { appliedEnds: ['left'] });
    expect(occupies(byName(b.panels, 'End panel L'), b.project).y).toEqual([mm(0), mm(720)]);
    // And says nothing about plinths, because a wall cabinet does not stand on one.
    expect(b.warnings.filter((w) => w.includes('plinth'))).toEqual([]);
  });

  it('runs the full height of a tall cabinet, kick included', () => {
    const b = build('tall', { W: 600, H: 2100, D: 560 }, { appliedEnds: ['right'] });
    expect(occupies(byName(b.panels, 'End panel R'), b.project).y).toEqual([mm(-150), mm(2100)]);
  });

  it('goes on a drawer bank, where the end of a run usually is', () => {
    const b = build('drawer-bank', BASE, { appliedEnds: ['left'], drawerCount: 3 });
    expect(size(byName(b.panels, 'End panel L'))).toEqual([mm(870), mm(600)]);
  });

  it('goes on a radiused end unit, on the side the curve is not', () => {
    const b = build('radius-end', { W: 560, H: 720, D: 560 }, { appliedEnds: ['left'] });
    expect(namesOf(b.panels)).toContain('End panel L');
  });
});

describe('what it refuses, and says so', () => {
  it('leaves the panel off the radiused corner and explains why', () => {
    const b = base({
      radiusCorner: 'front-right',
      carcassRadius: mm(200),
      appliedEnds: ['right'],
    });
    expect(namesOf(b.panels)).not.toContain('End panel R');
    expect(b.warnings.some((w) => w.includes('radiused one'))).toBe(true);
  });

  it('still builds the panel at the square end of a radiused cabinet', () => {
    const b = base({
      radiusCorner: 'front-right',
      carcassRadius: mm(200),
      appliedEnds: ['left', 'right'],
    });
    expect(namesOf(b.panels)).toContain('End panel L');
    expect(namesOf(b.panels)).not.toContain('End panel R');
  });

  it('drops to the floor by whatever the cabinet is standing on, not by the method’s kick', () => {
    /*
     * The case the browser found and the unit tests did not: this app puts a run on a ladder
     * base, which switches `hasKick` off on every cabinet under it *without moving them* — the
     * plinth is built to fill the gap that is already there. Reading the drop off the method's
     * kick height gave that cabinet a 720mm panel with the plinth's end left open beside it.
     *
     * A plinth owns its height and says so in `model/kickBase.ts`. The one figure that is right
     * whatever is under the cabinet is the cabinet's own anchor: how far its carcass bottom is
     * off the floor. So that is what the panel drops by.
     */
    const project = createEmptyProject('On a plinth');
    const cabinet = createCabinet({
      typeId: 'base',
      name: 'X1',
      x: mm(0),
      width: mm(BASE.W),
      height: mm(BASE.H),
      depth: mm(BASE.D),
      options: { appliedEnds: ['left'], hasKick: false },
    });
    // Standing on a 190mm plinth, which is not the method's 150 — the whole point of the test.
    const onPlinth = {
      ...cabinet,
      placement: { ...cabinet.placement, anchor: { ...cabinet.placement.anchor, y: mm(190) } },
    };
    const p = { ...project, cabinets: [onPlinth] } as Project;
    const built = buildCabinet(onPlinth, p);
    const panel = occupies(byName(built.panels, 'End panel L'), p);
    expect(panel.y).toEqual([mm(-190), mm(720)]);
    expect(built.warnings.filter((w) => w.includes('plinth'))).toEqual([]);
  });

  it('stops at the carcass bottom when the cabinet stands on nothing at all', () => {
    // No kick and anchored on the floor: there is nothing to run past, and nothing to say.
    const b = base({ appliedEnds: ['left'], hasKick: false });
    expect(occupies(byName(b.panels, 'End panel L'), b.project).y).toEqual([mm(0), mm(720)]);
    expect(b.warnings.filter((w) => w.includes('plinth'))).toEqual([]);
  });

  it('refuses one on an appliance space, which has no side to apply it to', () => {
    const b = build('appliance', { W: 600, H: 720, D: 560 }, { appliedEnds: ['left'] });
    expect(b.panels).toEqual([]);
    expect(b.warnings.some((w) => w.includes('gap in the run'))).toBe(true);
  });
});

describe('the shop’s own detail', () => {
  const withMethod = (patch: Record<string, unknown>, options: CabinetOptions): Built => {
    const project = createEmptyProject('Applied ends');
    const constructions = project.constructions.map((c) => ({ ...c, ...patch }));
    const cabinet = createCabinet({
      typeId: 'base',
      name: 'X1',
      x: mm(0),
      width: mm(BASE.W),
      height: mm(BASE.H),
      depth: mm(BASE.D),
      options,
    });
    const p = { ...project, constructions, cabinets: [cabinet] } as Project;
    const built = buildCabinet(cabinet, p);
    return { project: p, panels: built.panels, warnings: built.warnings };
  };

  it('takes the scribe allowance off the method', () => {
    const b = withMethod({ appliedEndBackScribe: mm(35) }, { appliedEnds: ['left'] });
    expect(occupies(byName(b.panels, 'End panel L'), b.project).z[0]).toBe(mm(-35));
    expect(size(byName(b.panels, 'End panel L'))).toEqual([mm(870), mm(615)]);
  });

  it('runs the end proud of the doors when the shop details it that way', () => {
    const b = withMethod({ appliedEndFrontOverhang: mm(6) }, { appliedEnds: ['left'] });
    const panel = occupies(byName(b.panels, 'End panel L'), b.project);
    expect(panel.z[1]).toBe(mm(586));
    // 6mm proud of the doors, which is the whole point of the number.
    expect(panel.z[1] - occupies(byName(b.panels, 'Door L'), b.project).z[1]).toBe(6);
  });

  it('lands it on the plinth instead of the floor when the shop says so', () => {
    const b = withMethod({ appliedEndToFloor: false }, { appliedEnds: ['left'] });
    expect(occupies(byName(b.panels, 'End panel L'), b.project).y).toEqual([mm(0), mm(720)]);
  });
});

describe('a job saved before applied ends existed', () => {
  it('comes forward with the figures filled in and nothing named', () => {
    const project = createEmptyProject('Old job');
    const stored = JSON.parse(JSON.stringify(project)) as Record<string, unknown>;
    stored.schemaVersion = 12;
    stored.constructions = (stored.constructions as Record<string, unknown>[]).map((c) => {
      const { appliedEndBackScribe, appliedEndFrontOverhang, appliedEndToFloor, ...rest } = c;
      void appliedEndBackScribe;
      void appliedEndFrontOverhang;
      void appliedEndToFloor;
      return rest;
    });

    const migrated = migrateProject(stored);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.constructions[0]?.appliedEndBackScribe).toBe(20);
    expect(migrated.constructions[0]?.appliedEndFrontOverhang).toBe(0);
    expect(migrated.constructions[0]?.appliedEndToFloor).toBe(true);
    for (const cabinet of migrated.cabinets) {
      expect(cabinet.options.appliedEnds).toBeUndefined();
    }
  });

  it('never overwrites a detail a shop has already set', () => {
    const filled = withAppliedEnds({
      appliedEndBackScribe: 35,
      appliedEndFrontOverhang: 6,
      appliedEndToFloor: false,
    });
    expect(filled.appliedEndBackScribe).toBe(35);
    expect(filled.appliedEndFrontOverhang).toBe(6);
    expect(filled.appliedEndToFloor).toBe(false);
  });

  it('fills a front overhang of zero rather than reading it as missing', () => {
    // The trap in every one of these migrations, and the reason `typeof === 'number'` is the
    // test rather than `??`: zero is the shipped value here, so `c.x ?? 0` and a real stored
    // zero are indistinguishable and the bug hides until somebody sets a non-zero one.
    expect(withAppliedEnds({ appliedEndFrontOverhang: 0 }).appliedEndFrontOverhang).toBe(0);
    expect(withAppliedEnds({ appliedEndToFloor: false }).appliedEndToFloor).toBe(false);
  });
});

describe('hasAppliedEnd', () => {
  it('reads the list, and reads an absent list as neither end', () => {
    expect(hasAppliedEnd({ appliedEnds: ['left'] }, 'left')).toBe(true);
    expect(hasAppliedEnd({ appliedEnds: ['left'] }, 'right')).toBe(false);
    expect(hasAppliedEnd({}, 'left')).toBe(false);
  });
});
