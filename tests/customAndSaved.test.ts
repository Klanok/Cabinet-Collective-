/**
 * The custom configurable cabinet, and saved cabinet types.
 *
 * The custom spec is tested through the three cases it was built to cover — a banquette base,
 * a pigeon-hole unit and open shelving — rather than option by option, because whether it
 * covers real cabinets is the only thing that matters about it.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import {
  createCabinet,
  createEmptyProject,
  resetIdCounter,
} from '../src/core/project/factory.ts';
import {
  AU_SHOP_STANDARDS,
  standardsFromProject,
} from '../src/core/standards/standards.ts';
import {
  removeSavedType,
  resetSavedTypeIds,
  savedTypeFromCabinet,
  upsertSavedType,
} from '../src/core/standards/savedTypes.ts';
import type { CabinetOptions } from '../src/core/model/cabinet.ts';
import type { Project } from '../src/core/model/project.ts';
import { byName, namesOf, occupies, size } from './helpers.ts';

let project: Project;

const custom = (options: CabinetOptions, w = mm(900), h = mm(720), d = mm(560)) =>
  buildCabinet(
    createCabinet(
      { typeId: 'custom', name: 'C1', width: w, height: h, depth: d, x: mm(0), options },
      project.defaults,
      project.constructions,
    ),
    project,
  );

beforeEach(() => {
  resetIdCounter();
  resetSavedTypeIds();
  project = createEmptyProject('Test');
});

describe('the custom carcass covers a banquette base', () => {
  // A bench seat: long, low, no doors, open top with a lid you lift.
  const banquette = () =>
    custom(
      {
        topStyle: 'open',
        hasBack: true,
        shelfCount: 0,
        doorCount: 0,
        hasLid: true,
        lidOverhang: mm(20),
        hasKick: true,
      },
      mm(1800),
      mm(430),
      mm(500),
    );

  it('makes a box with a lid and no doors or top', () => {
    const { panels } = banquette();
    expect(namesOf(panels)).toEqual(['Side L', 'Side R', 'Bottom', 'Back', 'Lid', 'Kick']);
  });

  it('overhangs the lid on both ends and the front, but not the back', () => {
    const { panels } = banquette();
    // 1800 + 2×20 long, 500 + 20 deep.
    expect(size(byName(panels, 'Lid'))).toEqual([1840, 520]);

    const lid = occupies(byName(panels, 'Lid'), project);
    expect(lid.x).toEqual([-20, 1820]); // proud of both ends
    expect(lid.z).toEqual([0, 520]); // flush at the back, proud at the front
    expect(lid.y[0]).toBe(430); // sits on the carcass
  });

  it('bands every edge of the lid, since all of it is seen', () => {
    const { panels } = banquette();
    expect(Object.keys(byName(panels, 'Lid').edgeBanding).sort()).toEqual(['L1', 'L2', 'W1', 'W2']);
  });
});

describe('the custom carcass covers a pigeon-hole unit', () => {
  // Three dividers and two shelf levels: a 4 × 3 grid of holes.
  const pigeonHoles = () =>
    custom({
      topStyle: 'panel',
      hasBack: true,
      dividerCount: 3,
      shelfCount: 2,
      doorCount: 0,
      hasKick: false,
    });

  it('makes a grid of short shelves rather than full-width ones', () => {
    const { panels } = pigeonHoles();
    const shelves = namesOf(panels).filter((n) => n.startsWith('Shelf'));
    // 2 levels × 4 bays.
    expect(shelves).toHaveLength(8);
    expect(namesOf(panels).filter((n) => n.startsWith('Divider'))).toHaveLength(3);
  });

  it('sizes the bay shelves to the bay, not the cabinet', () => {
    const { panels } = pigeonHoles();
    // Interior 900 − 32 = 868, less three 16mm dividers = 820, ÷ 4 bays = 205 each.
    // A shelf is 2mm narrower for clearance.
    expect(size(byName(panels, 'Shelf 1 bay 1'))).toEqual([203, 534]);
  });

  it('spaces the dividers evenly across the interior', () => {
    const { panels } = pigeonHoles();
    const centres = ['Divider 1', 'Divider 2', 'Divider 3'].map((n) => {
      const o = occupies(byName(panels, n), project);
      return (o.x[0] + o.x[1]) / 2;
    });
    // Interior runs 16 → 884, divided in four: 233, 450, 667.
    expect(centres).toEqual([233, 450, 667]);
  });

  it('runs the dividers the full interior height', () => {
    const { panels } = pigeonHoles();
    expect(occupies(byName(panels, 'Divider 1'), project).y).toEqual([16, 704]);
  });

  it('warns when the dividers leave impractically narrow bays', () => {
    const { warnings } = custom({ dividerCount: 10, shelfCount: 0 }, mm(600));
    expect(warnings.join(' ')).toMatch(/very tight|leave no room/);
  });
});

describe('the custom carcass covers open shelving', () => {
  it('drops the back and the top when asked', () => {
    const { panels } = custom({
      topStyle: 'open',
      hasBack: false,
      shelfCount: 2,
      dividerCount: 1,
      doorCount: 0,
      hasKick: false,
    });
    expect(namesOf(panels)).not.toContain('Back');
    expect(namesOf(panels)).not.toContain('Top');
    expect(namesOf(panels)).toContain('Divider');
  });

  it('warns about a carcass with nothing bracing it', () => {
    const { warnings } = custom({
      topStyle: 'open',
      hasBack: false,
      dividerCount: 0,
      shelfCount: 0,
    });
    expect(warnings.join(' ')).toMatch(/nothing bracing it/);
  });
});

describe('the custom carcass takes rails or a full top', () => {
  it('gives rails when asked', () => {
    const { panels } = custom({ topStyle: 'rails', shelfCount: 0, doorCount: 0 });
    expect(namesOf(panels)).toContain('Top rail front');
    expect(namesOf(panels)).not.toContain('Top');
  });

  it('gives drawer fronts when drawers are set', () => {
    const { panels } = custom({ topStyle: 'rails', drawerCount: 3, shelfCount: 0 });
    expect(namesOf(panels).filter((n) => n.startsWith('Drawer front'))).toHaveLength(3);
  });

  it('fits explicit drawer fronts to the carcass, as a drawer bank does', () => {
    /*
     * §5.11 reached here too. This spec carried its own copy of the bank's height resolver, so a
     * custom carcass with fronts set past its own height ran them out the top in exactly the same
     * way — and nothing said so, because the assertion was on the bank. One resolver now, and this
     * is the test that says the custom spec is using it.
     */
    const { panels } = custom({
      topStyle: 'rails',
      shelfCount: 0,
      drawerCount: 2,
      drawerFrontHeights: [mm(400), mm(400)],
    });
    const top = byName(panels, 'Drawer front 2');
    expect(occupies(top, project).y[1]).toBeLessThanOrEqual(720);
    expect(size(top)[1]).toBe(357);
  });

  it('refuses doors and drawers on the same cabinet', () => {
    const { warnings } = custom({ doorCount: 2, drawerCount: 2 });
    expect(warnings.join(' ')).toMatch(/both doors and drawer fronts/);
  });
});

describe('saved cabinet types', () => {
  const cabinet = () =>
    createCabinet(
      {
        typeId: 'custom',
        name: 'Banquette',
        width: mm(1800),
        height: mm(430),
        depth: mm(500),
        x: mm(2400),
        options: { topStyle: 'open', hasLid: true, doorCount: 0, shelfCount: 0 },
      },
      project.defaults,
      project.constructions,
    );

  it('captures the recipe but not where the cabinet sat', () => {
    const saved = savedTypeFromCabinet(cabinet(), 'Banquette 1800');

    expect(saved.name).toBe('Banquette 1800');
    expect(saved.typeId).toBe('custom');
    expect([saved.width, saved.height, saved.depth]).toEqual([1800, 430, 500]);
    expect(saved.options.hasLid).toBe(true);
    // Position is deliberately absent — it says nothing about the next job.
    expect(saved).not.toHaveProperty('placement');
    expect(saved).not.toHaveProperty('x');
  });

  it('rebuilds the same parts when placed again', () => {
    const original = cabinet();
    const saved = savedTypeFromCabinet(original, 'Banquette 1800');

    const replaced = createCabinet(
      {
        typeId: saved.typeId,
        name: 'B-new',
        width: saved.width,
        height: saved.height,
        depth: saved.depth,
        x: mm(0),
        options: saved.options,
      },
      project.defaults,
      project.constructions,
    );

    expect(namesOf(buildCabinet(replaced, project).panels)).toEqual(
      namesOf(buildCabinet(original, project).panels),
    );
  });

  it('replaces a type saved under the same name rather than piling up duplicates', () => {
    const first = savedTypeFromCabinet(cabinet(), 'Banquette 1800');
    const revised = savedTypeFromCabinet({ ...cabinet(), width: mm(2000) }, 'banquette 1800');

    const list = upsertSavedType(upsertSavedType([], first), revised);
    expect(list).toHaveLength(1);
    expect(list[0]!.width).toBe(2000);
  });

  it('keeps types sorted by name', () => {
    const make = (name: string) => savedTypeFromCabinet(cabinet(), name);
    const list = [make('Sink base'), make('Banquette'), make('Pigeon holes')].reduce(
      upsertSavedType,
      [] as ReturnType<typeof make>[],
    );
    expect(list.map((t) => t.name)).toEqual(['Banquette', 'Pigeon holes', 'Sink base']);
  });

  it('forgets a type on request', () => {
    const saved = savedTypeFromCabinet(cabinet(), 'Banquette 1800');
    const list = upsertSavedType([], saved);
    expect(removeSavedType(list, saved.id)).toEqual([]);
  });

  it('survives promoting a job to become the shop standards', () => {
    const saved = savedTypeFromCabinet(cabinet(), 'Banquette 1800');
    const withTypes = { ...AU_SHOP_STANDARDS, savedTypes: [saved] };

    // Promoting a job replaces the joinery numbers but must not wipe the catalogue.
    const promoted = standardsFromProject(project, 'My shop', withTypes);
    expect(promoted.savedTypes).toHaveLength(1);
    expect(promoted.savedTypes[0]!.name).toBe('Banquette 1800');
  });
});
