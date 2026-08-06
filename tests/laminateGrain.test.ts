/**
 * Which way the laminate over a curve runs — reported from the bench as *"I cannot rotate the
 * laminate even if I change the grain direction on the cabinet"*.
 *
 * ## What was actually wrong, because it is not what the report says
 *
 * There was no grain to rotate. A laminated curve carries the decor as `Panel.finishMaterialId` —
 * an appearance on the outer skin, deliberately not a second part (§5.0: the laminate is *a
 * dimension, not a part*, hand-applied and hand-trimmed after machining). So it had **no
 * direction of its own at all**, and the viewport drew it through the *substrate's* nest
 * placement: the decor took its direction from wherever the bendy-ply blank happened to land on a
 * bendy-ply sheet. The nester turns those freely for yield — measured, it turns them — so a
 * grained curve came out cross-grained beside its own doors, and nothing on the cabinet changed
 * it, because the cabinet's grain control only ever reached `GRAIN_CHOICE_ROLES`.
 *
 * The shop's own words settle what it should do instead: *"I just want the image to look correct
 * — it needs to present accurately to the client, I can cut it on the saw any way I want."* So
 * the laminate is unconstrained by the sheet and follows the cabinet, and unset means **vertical**
 * — up the curve, like the door beside it.
 *
 * ## Why `finishGrain` is its own field
 *
 * A laminated curve has two directions and they answer different questions. `grain` is the
 * **board's** constraint — on bendy ply that is the way the sheet bends, which is a fact about
 * the product and decides how the blank may be nested. `finishGrain` is how the **decor** reads.
 * Putting them in one field is what made the report impossible to fix without breaking the nest.
 *
 * Reference figures, worked by hand from the part's own axes: a skin's length runs **around** the
 * curve (`u = +X`) and its width is the cabinet height, so
 *   - grain vertical (default)  → across the part's width → `width-along-grain`
 *   - grain horizontal          → along the part's length → `length-along-grain`
 * A door's length runs **up** it, so the same two answers come out the other way round — which is
 * the whole reason this is translated per part rather than stored as a constraint.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createCabinet, createEmptyProject } from '../src/core/project/factory.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { mm } from '../src/core/units.ts';
import type { Cabinet, CabinetOptions } from '../src/core/model/cabinet.ts';
import type { Panel } from '../src/core/model/panel.ts';
import type { Project } from '../src/core/model/project.ts';

let project: Project;

/** A radiused end, laminated — the cabinet the report was about. */
const curve = (options: CabinetOptions = {}) => {
  const cabinet: Cabinet = createCabinet(
    {
      typeId: 'radius-end',
      name: 'R1',
      width: mm(600),
      height: mm(720),
      depth: mm(600),
      x: mm(0),
      options,
    },
    project.defaults,
    project.constructions,
  );
  return buildCabinet(cabinet, project);
};

/** The outer skin — the only layer that carries the finish. */
const laminatedSkin = (panels: readonly Panel[]): Panel => {
  const found = panels.find((p) => p.role === 'skin' && p.finishMaterialId !== undefined);
  if (!found) throw new Error('no laminated skin was built');
  return found;
};

beforeEach(() => {
  project = createEmptyProject('Laminate grain');
  // The shipped method laminates at 1mm; be explicit, because this whole file is meaningless on
  // a curve that carries no laminate.
  project = {
    ...project,
    constructions: project.constructions.map((c) => ({ ...c, finishLaminate: mm(1) })),
  };
});

describe('the laminate has a direction of its own', () => {
  it('runs up the curve when nothing is asked for', () => {
    const skin = laminatedSkin(curve().panels);
    // Vertical by default: a curve sits between doors and has to match them, and "either way
    // round" is not something a client can be shown.
    expect(skin.finishGrain).toBe('width-along-grain');
  });

  it('follows the cabinet when the grain direction is set', () => {
    expect(laminatedSkin(curve({ grainDirection: 'vertical' }).panels).finishGrain).toBe(
      'width-along-grain',
    );
    expect(laminatedSkin(curve({ grainDirection: 'horizontal' }).panels).finishGrain).toBe(
      'length-along-grain',
    );
  });

  /*
   * The report in one assertion: changing the control has to change the answer.
   *
   * Stated as a difference rather than as two values because that is what was broken — both
   * settings produced the same picture, and a test that only checked one of them would have
   * passed throughout.
   */
  it('gives a different answer for vertical than for horizontal', () => {
    const up = laminatedSkin(curve({ grainDirection: 'vertical' }).panels).finishGrain;
    const across = laminatedSkin(curve({ grainDirection: 'horizontal' }).panels).finishGrain;
    expect(up).not.toBe(across);
  });
});

describe('the board keeps its own answer', () => {
  it('leaves the substrate grain alone whatever the finish does', () => {
    // `grain` is the bendy ply's constraint and has nothing to do with the decor over it. If
    // setting the laminate direction moved this, it would move the nest with it.
    const up = laminatedSkin(curve({ grainDirection: 'vertical' }).panels);
    const across = laminatedSkin(curve({ grainDirection: 'horizontal' }).panels);
    expect(up.grain).toBe(across.grain);
  });

  it('puts no finish direction on a part with no finish', () => {
    // Every carcass part, and the inner skin layers — a field set on a part with nothing on it
    // would be a direction nothing draws, which is the safety-net-nobody-renders shape.
    const built = curve();
    for (const panel of built.panels) {
      if (panel.finishMaterialId === undefined) {
        expect(panel.finishGrain, `${panel.name} carries a finish grain with no finish`).toBeUndefined();
      } else {
        expect(panel.finishGrain, `${panel.name} is finished with no direction`).toBeDefined();
      }
    }
  });

  it('says nothing about the finish on a curve that carries no laminate', () => {
    project = {
      ...project,
      constructions: project.constructions.map((c) => ({ ...c, finishLaminate: mm(0) })),
    };
    const skins = curve().panels.filter((p) => p.role === 'skin');
    expect(skins.length).toBeGreaterThan(0);
    for (const skin of skins) {
      expect(skin.finishMaterialId).toBeUndefined();
      expect(skin.finishGrain).toBeUndefined();
    }
  });
});

describe('a door and a curve translate the same request in opposite ways', () => {
  it('reads the part\'s own axes rather than storing one constraint for both', () => {
    const built = curve({ grainDirection: 'vertical' });
    const skin = laminatedSkin(built.panels);
    // The skin's length runs around the curve, so vertical grain is across its width.
    expect(skin.placement.u).toBe('+X');
    expect(skin.finishGrain).toBe('width-along-grain');

    // A door's length runs up it, so the same request is along its length. Same words, opposite
    // constraint — which is why `grainDirection` is stored as a real-world direction.
    const base = buildCabinet(
      createCabinet(
        { typeId: 'base', name: 'B1', width: mm(900), x: mm(0), options: { grainDirection: 'vertical' } },
        project.defaults,
        project.constructions,
      ),
      project,
    );
    const door = base.panels.find((p) => p.role === 'door');
    expect(door).toBeDefined();
    expect(door!.placement.u).toBe('+Y');
    expect(door!.grain).toBe('length-along-grain');
  });
});
