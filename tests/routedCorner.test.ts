/**
 * The routed corner — the second way this shop builds a radius. §5.7.
 *
 * ## What actually differs, and what deliberately does not
 *
 * The shop builds a radiused corner two ways, and the section that specified this is emphatic
 * that **almost nothing changes**: *"the corner, the strip, the wrap to the back and the
 * square-notched shelf are all the same either way"*, and *"the only thing that changes between
 * the two is what covers the strip — laminated, or banded."*
 *
 * So the fork is one part:
 *
 * - **wrapped** — N layers of bendy ply over the formers, the outer one carrying a finish
 *   laminate. The ply runs over the 50mm strip and dies under the door edge.
 * - **routed** — **one** piece of the *door* board, pocket-routed on the rear so it bends over
 *   the same formers, with its **leading edge banded**. That band is the finished edge.
 *
 * How the piece bends is the shop's own answer and is the fact this is built on: *"it's a pocket
 * route on the rear"*, and the formers stay — *"yes, same formers"*.
 *
 * ## Reference figures, worked by hand
 *
 * A 900 × 560 base cabinet with an 18mm door board, a 200mm front-right radius and a 50mm strip:
 *
 *   finished radius   200            (the outside of the finished curve, in the door plane)
 *   former radius     200 − 18 = 182 (the routed board is *all* that sits outboard of them)
 *   arc, on the B face (182 + 18/2) × π/2 = 191 × 1.5708 = 300.0
 *
 * Against the wrapped method on the same cabinet: two 8mm plies and a 1mm laminate is 17mm
 * outboard, so the formers come out at 183 — **one millimetre different, and for a completely
 * different reason.** That is the pair `outboardOfFormers` exists to keep honest.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createCabinet, createEmptyProject } from '../src/core/project/factory.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { outboardOfFormers } from '../src/core/rules/radius.ts';
import { unconfirmedRoutedCurveFigures } from '../src/core/model/construction.ts';
import { costProject } from '../src/core/costing/costing.ts';
import { mm } from '../src/core/units.ts';
import type { CornerMethod } from '../src/core/model/construction.ts';
import type { Panel } from '../src/core/model/panel.ts';
import type { Project } from '../src/core/model/project.ts';
import { byName, size } from './helpers.ts';

let base: Project;

const jobWith = (method: CornerMethod): Project => ({
  ...base,
  constructions: base.constructions.map((c) => ({ ...c, cornerMethod: method })),
});

const curved = (method: CornerMethod) => {
  const project = jobWith(method);
  const cabinet = createCabinet(
    {
      typeId: 'base',
      name: 'B1',
      width: mm(900),
      height: mm(720),
      depth: mm(560),
      x: mm(0),
      options: { radiusCorner: 'front-right', carcassRadius: mm(200) },
    },
    project.defaults,
    project.constructions,
  );
  return { project, cabinet, built: buildCabinet(cabinet, project) };
};

const curvedParts = (panels: readonly Panel[]): Panel[] => panels.filter((p) => p.role === 'skin');

beforeEach(() => {
  base = createEmptyProject('Routed corner');
});

describe('what sits outboard of the formers', () => {
  it('is the ply stack and its laminate when wrapped, and the door board when routed', () => {
    // Hand-worked: 2 × 8mm ply + 1mm laminate = 17; one 18mm door board = 18.
    expect(
      outboardOfFormers({ cornerMethod: 'wrapped', layers: 2, ts: mm(8), td: mm(18), finishLaminate: mm(1) }),
    ).toBe(17);
    expect(
      outboardOfFormers({ cornerMethod: 'routed', layers: 2, ts: mm(8), td: mm(18), finishLaminate: mm(1) }),
    ).toBe(18);
  });

  /*
   * A routed curve carries no laminate, and the allowance must not reach it.
   *
   * This is the §5.14 trap pointed at the new method: the laminate figure is still on the
   * construction record, still 1mm, and still correct for a wrapped curve. Subtracting it here
   * as well would cut the formers a millimetre small on a curve that has nothing over it.
   */
  it('ignores the laminate allowance on a routed curve, whatever it is set to', () => {
    for (const finishLaminate of [mm(0), mm(1), mm(3)]) {
      expect(
        outboardOfFormers({ cornerMethod: 'routed', layers: 2, ts: mm(8), td: mm(18), finishLaminate }),
      ).toBe(18);
    }
  });

  it('treats an absent method as wrapped, which is what every older job was cut as', () => {
    expect(outboardOfFormers({ layers: 2, ts: mm(8), td: mm(18), finishLaminate: mm(1) })).toBe(17);
  });
});

describe('the curved piece', () => {
  it('is one part on a routed corner and a stack on a wrapped one', () => {
    expect(curvedParts(curved('routed').built.panels).map((p) => p.name)).toEqual(['Curved front']);
    expect(curvedParts(curved('wrapped').built.panels).map((p) => p.name)).toEqual([
      'Skin layer 1',
      'Skin layer 2',
    ]);
  });

  it('comes off the door board, not the bendy ply', () => {
    const { project, built } = curved('routed');
    const piece = byName(built.panels, 'Curved front');
    expect(piece.materialId).toBe(project.defaults.doorMaterialId);
  });

  /*
   * **The kick is still bendy ply, and that is not settled — it is unasked.**
   *
   * This assertion was first written as "nothing in the job is cut from bendy ply any more", and
   * the kick failed it. The code is right and the assumption was mine: §5.7 specifies the curved
   * *piece* and says nothing whatsoever about the kick, which also turns the corner and is also
   * a bent part.
   *
   * It is pinned here rather than left drifting so that the day the shop answers, this test
   * fails and says where to look — a curved kick in a board the shop may not even stock is
   * exactly the kind of thing that goes unnoticed until it is on the cutlist.
   */
  it('leaves the kick in bendy ply, which nobody has been asked about', () => {
    const { project, built } = curved('routed');
    const kick = built.panels.find((p) => p.role === 'kick' && p.forming !== undefined);
    expect(kick, 'a radiused base cabinet should have a curved kick').toBeDefined();
    expect(kick!.materialId).toBe(project.defaults.skinMaterialId);
  });

  /*
   * The decor face **is** the finish, so there is nothing laid over it.
   *
   * `finishMaterialId` is what makes costing charge a laminate sheet and what makes the viewport
   * draw a decor over the board — see §4.23 and §4.26. A routed curve setting it would buy a
   * sheet of laminate for a piece that is already the decor.
   */
  it('carries no finish laminate, because it is the decor itself', () => {
    const piece = byName(curved('routed').built.panels, 'Curved front');
    expect(piece.finishMaterialId).toBeUndefined();
    expect(piece.finishGrain).toBeUndefined();

    const wrapped = curvedParts(curved('wrapped').built.panels);
    expect(wrapped.at(-1)!.finishMaterialId).toBeDefined();
  });

  it('bands its leading edge, and that is the only banded edge', () => {
    // The visible difference between the two methods, in the shop's own words: what covers the
    // strip is laminated, or banded.
    const piece = byName(curved('routed').built.panels, 'Curved front');
    const banded = Object.entries(piece.edgeBanding).filter(([, id]) => id !== undefined);
    expect(banded.length).toBe(1);

    for (const layer of curvedParts(curved('wrapped').built.panels)) {
      expect(Object.values(layer.edgeBanding).filter(Boolean)).toEqual([]);
    }
  });

  it('is cut flat and bent, like every other curved part', () => {
    // The part stored is the flat blank — what gets nested and cut. `forming` records the bend.
    const piece = byName(curved('routed').built.panels, 'Curved front');
    expect(piece.forming).toBeDefined();
    expect(piece.forming!.innerRadius).toBe(mm(182));
    const [length, height] = size(piece);
    expect(height).toBe(mm(720));
    // 50 strip + arc on the B face (182 + 9) × π/2 + the tail down the end of the cabinet.
    expect(length).toBeGreaterThan(50 + 300);
  });
});

describe('the rear pockets — how the piece bends', () => {
  const pockets = (panel: Panel) => panel.features.filter((f) => f.purpose === 'bend-relief');

  it('cuts a run of grooves on the rear face and nowhere else', () => {
    const piece = byName(curved('routed').built.panels, 'Curved front');
    const found = pockets(piece);
    expect(found.length).toBeGreaterThan(0);
    for (const f of found) {
      expect(f.kind).toBe('groove');
      // The B face is the back. Pocketing the decor face would be a curve with grooves in it.
      expect((f as { face: string }).face).toBe('B');
    }
  });

  it('measures the cut from what is left, not from how deep to go', () => {
    // The method stores the residual — the web the curve bends on — and the depth is derived,
    // so a thicker door board deepens the cut instead of eating the web.
    const { project, built } = curved('routed');
    const piece = byName(built.panels, 'Curved front');
    const depth = (pockets(piece)[0] as { depth: number }).depth;
    const board = project.constructions[0]!;
    // 18mm door board less the 4mm residual.
    expect(depth).toBeCloseTo(18 - board.routedPocketResidual, 6);
  });

  it('puts no pockets in the flat lead or the flat tail', () => {
    /*
     * Relief only where the piece bends. The lead is the fixing strip and the tail runs down the
     * end of the cabinet — both are flat, and grooving them would weaken a part that is not
     * being asked to do anything.
     */
    const { built } = curved('routed');
    const piece = byName(built.panels, 'Curved front');
    const [length] = size(piece);
    const arcEnd = 50 + (182 + 9) * (Math.PI / 2);
    for (const f of pockets(piece)) {
      const x = (f as { path: readonly { x: number }[] }).path[0]!.x;
      expect(x, 'a pocket fell before the bend').toBeGreaterThanOrEqual(50);
      expect(x, 'a pocket fell after the bend').toBeLessThanOrEqual(arcEnd);
      expect(x).toBeLessThan(length);
    }
  });

  it('spaces them at the method pitch', () => {
    const piece = byName(curved('routed').built.panels, 'Curved front');
    const xs = pockets(piece).map((f) => (f as { path: readonly { x: number }[] }).path[0]!.x);
    expect(xs.length).toBeGreaterThan(2);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeCloseTo(40, 6);
  });

  it('puts none on a wrapped curve, which bends because the ply is thin', () => {
    for (const layer of curvedParts(curved('wrapped').built.panels)) {
      expect(layer.features.filter((f) => f.purpose === 'bend-relief')).toEqual([]);
    }
  });
});

describe('what the change costs, and what it must not', () => {
  /*
   * A routed curve buys no laminate sheet.
   *
   * Costing charges the sheet off `role === 'skin' && finishMaterialId !== undefined`, which is
   * §5.14's one predicate. A routed curve is a skin with no finish, so it falls out of that
   * count without costing.ts knowing this feature exists — which is the test of whether the
   * predicate was the right one.
   */
  it('charges no curve laminate when the corners are routed', () => {
    const routed = curved('routed');
    const wrapped = curved('wrapped');
    expect(costProject({ ...wrapped.project, cabinets: [wrapped.cabinet] }).laminatedCurves).toBe(1);
    expect(costProject({ ...routed.project, cabinets: [routed.cabinet] }).laminatedCurves).toBe(0);
  });
});

describe('the two figures nobody has checked', () => {
  it('reports the pocket figures on a routed method', () => {
    const routed = jobWith('routed').constructions[0]!;
    const notes = unconfirmedRoutedCurveFigures(routed);
    expect(notes.length).toBe(1);
    expect(notes[0]).toMatch(/40mm centres/);
    expect(notes[0]).toMatch(/4mm of board/);
  });

  it('says nothing on a wrapped method, where neither number is read', () => {
    // A warning about a figure nothing uses is the noise that trains people to skip warnings.
    expect(unconfirmedRoutedCurveFigures(jobWith('wrapped').constructions[0]!)).toEqual([]);
  });
});
