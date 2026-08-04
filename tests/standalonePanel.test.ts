import { describe, expect, it } from 'vitest';
import { type Mm, mm } from '../src/core/units.ts';
import { actualThicknessOf, findSheet } from '../src/core/model/material.ts';
import { panelExtent } from '../src/core/model/panel.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { createCabinet, createEmptyProject, resetIdCounter } from '../src/core/project/factory.ts';
import { migrateProject } from '../src/core/model/project.ts';
import { occupies } from './helpers.ts';

/** A migrated job read back as plain data, which is what these assertions are about. */
const asRaw = (p: unknown): Record<string, unknown> => p as Record<string, unknown>;

describe('standalone panel', () => {
  it('produces one material-driven, fully edged panel', () => {
    resetIdCounter();
    const project = createEmptyProject('Panels');
    const cabinet = createCabinet(
      { typeId: 'panel', name: 'Loose end', width: mm(650), height: mm(2300), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    const built = buildCabinet(cabinet, project);

    expect(built.warnings).toEqual([]);
    expect(built.panels).toHaveLength(1);
    const panel = built.panels[0]!;
    expect(panel.role).toBe('panel');
    expect(panel.materialId).toBe(project.defaults.carcassMaterialId);
    expect(panelExtent(panel)).toEqual({ length: mm(2300), width: mm(650) });
    expect(Object.keys(panel.edgeBanding).sort()).toEqual(['L1', 'L2', 'W1', 'W2']);
    expect(actualThicknessOf(findSheet(project.materials, panel.materialId))).toBe(16);
  });

  it('uses a selected sheet without an independent manufacturing thickness', () => {
    const project = createEmptyProject('Panels');
    const cabinet = {
      ...createCabinet(
        { typeId: 'panel', name: 'Backing', width: mm(900), height: mm(1200), x: mm(0) },
        project.defaults,
        project.constructions,
      ),
      materials: { carcass: 'mdf-raw-18' },
      /*
       * Deliberately unrelated: this compatibility footprint must not size the manufactured part.
       *
       * **It is `width` that is the spare field, and it used to be `depth`.** A panel stands edge
       * out, so its depth is now its face width and does size the part; what runs along the run is
       * a nominal board thickness that nothing is manufactured from. The assertion did not move —
       * the axis under it did, and a test still naming `depth` here would be pinning the old build
       * in place while passing.
       */
      width: mm(99),
    };
    const panel = buildCabinet(cabinet, project).panels[0]!;
    expect(panel.materialId).toBe('mdf-raw-18');
    expect(actualThicknessOf(findSheet(project.materials, panel.materialId))).toBe(18);
    // The part is still 1200 × 900, taken from height and depth and nothing else.
    expect(panelExtent(panel)).toEqual({ length: mm(1200), width: mm(900) });
  });
});

/**
 * A panel stands edge out.
 *
 * > "it faces edge out, it has to sit next to the cabinet like an applied panel"
 *
 * and the earlier half of the same bench report,
 *
 * > "a standalone panel should stand perpendicular to the wall, not flat against it"
 *
 * **Both are one fix.** A panel that sits like an applied end against a cabinet is, by
 * construction, perpendicular to the wall that cabinet backs onto — so there is no snapping change
 * and no panel special case in the placement code at all. What changed is which plane the board is
 * built in.
 *
 * Longhand, for a 600 wide × 2400 high panel on 16mm board:
 *
 *                          along the run (cabinet X)   into the room (cabinet Z)
 *   built flat (old)               600                          16
 *   built edge out (new)            16                         600
 *
 * The part is the same 2400 × 600 rectangle in both. **Only the way it stands changes** — which is
 * why this needed a migration for placement and none for parts.
 *
 * These assert *occupancy* rather than size, which is the §4.4 standard: a panel turned the wrong
 * way is exactly the same rectangle in exactly the same material, and passes any assertion that
 * counts millimetres of board.
 */
describe('a standalone panel stands edge out', () => {
  const panelOf = (project: ReturnType<typeof createEmptyProject>, width: Mm, height: Mm) => {
    const cabinet = createCabinet(
      { typeId: 'panel', name: 'End', width, height, x: mm(0) },
      project.defaults,
      project.constructions,
    );
    return { cabinet, panel: buildCabinet(cabinet, project).panels[0]! };
  };

  it('runs its face into the room and its thickness along the run', () => {
    const project = createEmptyProject('Panels');
    const { panel } = panelOf(project, mm(600), mm(2400));
    const box = occupies(panel, project);

    // Thickness along the run, face width into the room. Built flat, these were the other way up.
    expect(box.x).toEqual([0, 16]);
    expect(box.y).toEqual([0, 2400]);
    expect(box.z).toEqual([0, 600]);
  });

  it('takes only a board thickness of the run, so the next cabinet butts against it', () => {
    /*
     * The reported symptom, as a number. `snapToNeighbour` butts the next cabinet along by
     * `neighbour.width`, so a panel whose width was its 600mm face left a 600mm hole in the run
     * where an applied end leaves 16.
     */
    const project = createEmptyProject('Panels');
    const { cabinet } = panelOf(project, mm(600), mm(2400));
    expect(cabinet.width).toBe(16);
    expect(cabinet.depth).toBe(600);
  });

  it('still asks for one dimension, and calling it the width still means the face', () => {
    // `createCabinet` is the only place the swap happens, so every caller says `width` and means
    // the wide way across the board — which is what a person types.
    const project = createEmptyProject('Panels');
    const { panel } = panelOf(project, mm(450), mm(900));
    expect(panelExtent(panel)).toEqual({ length: mm(900), width: mm(450) });
  });

  it('does not change the part it cuts', () => {
    /*
     * The half of the migration rule that must hold: same rectangle, same material, same four
     * banded edges, one identical line on the cutlist. Nothing on the saw is affected by a panel
     * standing a different way up, and nothing re-prices.
     */
    const project = createEmptyProject('Panels');
    const { panel } = panelOf(project, mm(600), mm(2400));
    expect(panelExtent(panel)).toEqual({ length: mm(2400), width: mm(600) });
    expect(panel.materialId).toBe(project.defaults.carcassMaterialId);
    expect(Object.keys(panel.edgeBanding).sort()).toEqual(['L1', 'L2', 'W1', 'W2']);
    expect(panel.role).toBe('panel');
  });

  it('follows the board when the board is thicker', () => {
    // The footprint's 16 is a nominal placeholder, but the part is never sized from it.
    const project = createEmptyProject('Panels');
    const base = createCabinet(
      { typeId: 'panel', name: 'End', width: mm(600), height: mm(2400), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    const cabinet = { ...base, materials: { carcass: 'mdf-raw-18' } };
    const panel = buildCabinet(cabinet, project).panels[0]!;
    expect(occupies(panel, project).x).toEqual([0, 18]);
    expect(occupies(panel, project).z).toEqual([0, 600]);
  });
});

/**
 * Grain on a loose panel.
 *
 * Asked for from the bench after the per-cabinet control shipped for fronts: *"standalone panels
 * need grain direction"*. A loose panel is nothing but a show part, so it is in
 * `GRAIN_CHOICE_ROLES` — but pointedly **not** in `STYLED_FRONT_ROLES`, and the last test here is
 * what keeps those two apart.
 */
describe('standalone panel grain', () => {
  const panelOf = (options: Record<string, unknown> = {}, styleId?: string) => {
    const base = createEmptyProject('Grain');
    const project = styleId
      ? { ...base, defaults: { ...base.defaults, doorStyleId: styleId } }
      : base;
    const cabinet = createCabinet(
      { typeId: 'panel', name: 'Loose end', width: mm(650), height: mm(2300), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    return buildCabinet({ ...cabinet, options: { ...cabinet.options, ...options } }, project)
      .panels[0]!;
  };

  it('runs the grain up the panel when nothing is asked for', () => {
    const panel = panelOf();
    expect(panel.placement.u).toBe('+Y'); // length runs up the part
    expect(panel.grain).toBe('length-along-grain');
  });

  it('turns the grain across the panel when asked for horizontal', () => {
    // Its length runs vertically, so a horizontal grain has to cross the length. The panel is
    // still cut 2300 x 650 — only the constraint moves, which is what tells the nester to turn it.
    const panel = panelOf({ grainDirection: 'horizontal' });
    expect(panel.grain).toBe('width-along-grain');
    expect(panelExtent(panel)).toEqual({ length: mm(2300), width: mm(650) });
  });

  it('keeps vertical as vertical when asked for it explicitly', () => {
    expect(panelOf({ grainDirection: 'vertical' }).grain).toBe('length-along-grain');
  });

  it('is still never routed by a door style, whatever its grain', () => {
    // The reason `panel` is in GRAIN_CHOICE_ROLES and not in STYLED_FRONT_ROLES. A filler or a
    // scribe has no business coming off the machine with shaker grooves in it.
    const panel = panelOf({ grainDirection: 'horizontal' }, 'shaker-57');
    expect(panel.features.filter((f) => f.purpose === 'front-style')).toEqual([]);
  });
});

/**
 * v27 → v28, the migration that turns a saved panel.
 *
 * The rule this file exists to protect is that **a migration must never quietly change anyone's
 * parts**, and this one keeps it in full: a panel comes forward the same rectangle, the same size,
 * the same material, banded the same, one identical line on the cutlist. What moves is where it
 * stands, and it has to — a panel's `width` was its face and its `depth` a nominal 16, and standing
 * edge out those are the wrong way round.
 */
describe('a saved panel comes forward standing the right way', () => {
  const saved = (extra: Record<string, unknown> = {}) => ({
    schemaVersion: 27,
    cabinets: [
      { id: 'p1', typeId: 'panel', name: 'End', width: 600, depth: 16, height: 2400, ...extra },
      { id: 'b1', typeId: 'base', name: 'Base', width: 900, depth: 560, height: 720 },
    ],
  });

  it('swaps a panel’s two footprint fields and leaves every other cabinet alone', () => {
    const out = asRaw(migrateProject(saved()));
    const [panel, base] = out.cabinets as Record<string, unknown>[];
    expect(panel!.width).toBe(16);
    expect(panel!.depth).toBe(600);
    // A base cabinet's width runs along the run and always did. Nothing here touches it.
    expect(base!.width).toBe(900);
    expect(base!.depth).toBe(560);
  });

  it('keeps the panel exactly as big as it was', () => {
    // The two numbers are the same two numbers. A 600-wide panel is still 600 wide; it is standing
    // a different way up, not resized, which is why no part and no price moves.
    const out = asRaw(migrateProject(saved()));
    const panel = (out.cabinets as Record<string, unknown>[])[0]!;
    expect([panel.width, panel.depth].sort()).toEqual([16, 600]);
    expect(panel.height).toBe(2400);
  });

  it('leaves a panel somebody had already turned by hand still turned', () => {
    /*
     * The one visible cost, and it is deliberate. A panel turned 90° as a workaround for the old
     * build ends up 90° from where its owner left it, and turning it back is one field in the
     * Inspector. Un-turning it automatically would mean guessing which panels were workarounds and
     * which were meant — and a rule that silently straightened a panel somebody meant to turn is
     * not something you would notice until the job was built.
     */
    const out = asRaw(migrateProject(saved({ placement: { anchor: { x: 0, y: 0, z: 0 }, yawDeg: 90 } })));
    const panel = (out.cabinets as Record<string, unknown>[])[0]!;
    expect((panel.placement as { yawDeg: number }).yawDeg).toBe(90);
  });

  it('survives a job with no cabinets in it at all', () => {
    expect(() => migrateProject({ schemaVersion: 27 })).not.toThrow();
  });
});
