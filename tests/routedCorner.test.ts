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
 *   finished radius     200                 (the outside of the finished curve, in the door plane)
 *   former, over the arc 200 − 2  = 198      (hard up against the 2mm web)
 *   former, on the flats 200 − 18 = 182      (full board — this is what gets screwed)
 *   the step             16
 *   arc                  (198 + 2/2) × π/2 = 199 × 1.5708 = 312.58
 *
 * Against the wrapped method on the same cabinet: two 8mm plies and a 1mm laminate is 17mm
 * outboard **all the way round**, so the formers come out at 183 with no step in them at all.
 * That pair is what `outboardOfFormers` and `outboardOverArc` exist to keep honest.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createCabinet, createEmptyProject } from '../src/core/project/factory.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { outboardOfFormers } from '../src/core/rules/radius.ts';
import { unconfirmedRoutedCurveFigures } from '../src/core/model/construction.ts';
import { costProject } from '../src/core/costing/costing.ts';
import { actualThicknessOf } from '../src/core/model/material.ts';
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
   * **The kick turns the corner the same way the front does.**
   *
   * This test was written the other way round first — pinning the kick in bendy ply and saying
   * out loud that nobody had been asked — and it did its job: the shop answered, *"the kick
   * would be kerfed and have a developed length"*, and this failed and pointed at itself.
   *
   * Kerfed means the same treatment as the curved front, so it is the **carcass** board a
   * straight kick is already cut from, banded on the same top edge. Not the door board: nothing
   * sees a kick, and a decor sheet bought to hide behind a plinth is the dearest board in the
   * job spent on the one part nobody looks at.
   */
  it('kerfs the kick from the carcass board on a routed corner', () => {
    const { project, built } = curved('routed');
    const kick = built.panels.find((p) => p.role === 'kick' && p.forming !== undefined);
    expect(kick, 'a radiused base cabinet should have a curved kick').toBeDefined();
    expect(kick!.materialId).toBe(project.defaults.carcassMaterialId);
    expect(kick!.features.filter((f) => f.purpose === 'bend-relief').length).toBeGreaterThan(0);
    // The same edge a straight kick bands — the only one anybody sees, under the door.
    expect(Object.values(kick!.edgeBanding).filter(Boolean).length).toBe(1);
  });

  it('leaves a wrapped corner kick in bendy ply, unbanded, exactly as it was', () => {
    const { project, built } = curved('wrapped');
    const kick = built.panels.find((p) => p.role === 'kick' && p.forming !== undefined)!;
    expect(kick.materialId).toBe(project.defaults.skinMaterialId);
    expect(kick.features.filter((f) => f.purpose === 'bend-relief')).toEqual([]);
    expect(Object.values(kick.edgeBanding).filter(Boolean)).toEqual([]);
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
    // 200 finished, less the 2mm web the former is hard up against — not less the whole board.
    expect(piece.forming!.innerRadius).toBe(mm(198));
    const [length, height] = size(piece);
    expect(height).toBe(mm(720));
    // 50 strip + the arc round the web + the tail down the end of the cabinet.
    expect(length).toBeGreaterThan(50 + 312);
  });
});

/*
 * The rear relief — one continuous pocket, not a run of kerfs.
 *
 * Asked directly, because the first cut of this built a row of 6mm slots at 40mm centres and the
 * shop did not recognise the setting: *"I'm not sure what 40mm pocket pitch means"*. Put as an
 * either/or — a row of slots, or one cleared area — the answer was *"yeah one continuous
 * pocket"*.
 *
 * So there is **no pitch at all**, and the setting is gone rather than left in meaning nothing.
 * What is left is the web, which is the shop's own 2mm and decides everything: the cut depth, the
 * former radius over the arc, and the length the blank is cut to.
 */
describe('the rear relief', () => {
  const relief = (panel: Panel) => panel.features.filter((f) => f.purpose === 'bend-relief');

  it('clears one pocket on the rear face, not a run of grooves', () => {
    const piece = byName(curved('routed').built.panels, 'Curved front');
    const found = relief(piece);
    expect(found.length).toBe(1);
    expect(found[0]!.kind).toBe('pocket');
    // The B face is the back. Clearing the decor face would be a trench down the front of it.
    expect((found[0] as { face: string }).face).toBe('B');
  });

  it('measures the cut from what is left, not from how deep to go', () => {
    const { project, built } = curved('routed');
    const piece = byName(built.panels, 'Curved front');
    const depth = (relief(piece)[0] as { depth: number }).depth;
    const method = project.constructions[0]!;
    // 18mm door board less the 2mm web the shop leaves.
    expect(depth).toBeCloseTo(18 - method.routedPocketResidual, 6);
    expect(method.routedPocketResidual).toBe(2);
  });

  /*
   * The pocket stops at the tangents, and that is a load-bearing fact rather than tidiness:
   * *"the run goes minimum 50mm past to allow screw fixing. The area that gets screw fixed is
   * still full depth."* Relieve the flats and there is nothing left for a screw to hold.
   */
  it('stops at the tangents, leaving the screw-fixed flats full depth', () => {
    const piece = byName(curved('routed').built.panels, 'Curved front');
    const [length] = size(piece);
    const outline = (relief(piece)[0] as { outline: readonly { x: number }[] }).outline;
    const xs = outline.map((v) => v.x);
    const from = Math.min(...xs);
    const to = Math.max(...xs);

    // Starts at the end of the 50mm fixing strip.
    expect(from).toBeCloseTo(50, 6);
    // And spans exactly the arc round the web — 199 × π/2.
    expect(to - from).toBeCloseTo(199 * (Math.PI / 2), 6);
    // Leaving a real flat tail beyond it.
    expect(length - to).toBeGreaterThan(0);
  });

  it('runs the full height of the piece', () => {
    const piece = byName(curved('routed').built.panels, 'Curved front');
    const ys = (relief(piece)[0] as { outline: readonly { y: number }[] }).outline.map((v) => v.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(720, 6);
  });

  it('relieves the kick the same way', () => {
    const kick = curved('routed').built.panels.find(
      (p) => p.role === 'kick' && p.forming !== undefined,
    )!;
    const found = relief(kick);
    expect(found.length).toBe(1);
    expect(found[0]!.kind).toBe('pocket');
  });

  it('puts none on a wrapped curve, which bends because the ply is thin', () => {
    for (const layer of curvedParts(curved('wrapped').built.panels)) {
      expect(layer.features.filter((f) => f.purpose === 'bend-relief')).toEqual([]);
    }
  });
});

/*
 * Where the formers sit, and what the piece is cut to — the shop's correction.
 *
 * The first cut of this feature had the former a **whole board** back from the finished face all
 * the way round, as a wrapped one is. It is not:
 *
 * > *"the web will be 2mm. the formers will be hard up to that 2mm. the route doesn't go full
 * > width, it ends at the radius and the run goes minimum 50mm past to allow screw fixing. the
 * > area that gets screw fixed is still full depth. so the formers are shaped to account for this
 * > offset in depth on the radius face piece"*
 *
 * So a routed former is **stepped**, and the two numbers are 16mm apart on an 18mm board:
 *
 *   over the arc      hard up to the web            200 − 2  = 198
 *   along the flats   full board, screwed to        200 − 18 = 182
 *   the step                                        16
 *
 * And the piece develops as **a 2mm strip wrapped at 198**, because the segments between the
 * pockets are rigid and only the web bends — so it needs no special k-factor at all, and the
 * neutral surface lands at `r − web/2` = 199:
 *
 *   arc   199 × π/2 = 312.58
 *
 * Against the model this replaced, which had the former at 182 and the piece hinging at 198 off
 * an 18mm board: the same 312.6 by arithmetic accident on those numbers, and **16mm of former**
 * wrong. The arc came out right for the wrong reason, which is exactly why the formers are
 * asserted here and not just the blank.
 */
describe('where the former sits, and what the piece is cut to', () => {
  it('cuts the former hard up to the web round the arc', () => {
    const { built } = curved('routed');
    const piece = byName(built.panels, 'Curved front');
    // 200 finished less the 2mm web.
    expect(piece.forming!.innerRadius).toBeCloseTo(198, 6);
  });

  /*
   * **The step, measured off the former's own outline.**
   *
   * This assertion was first written as "a routed job has a former and so does a wrapped one",
   * which is true of every radiused cabinet ever built and checks nothing whatsoever. The shape
   * is the claim, so the shape is what is read.
   *
   * Read back from the model, part space, 200 radius on an 18mm board with a 2mm web:
   *
   *   wrapped   (0,0) (50,0)~ (233,183) (0,183)                    four vertices, no step
   *   routed    (0,16) (50,16) (50,0)~ (248,198) (232,198) (0,198)  six, stepping 16 twice
   *
   * The routed flats sit at y = 16 — a whole board back — and drop to the arc plane at the
   * tangent, x = 50, which is where the 50mm screw-fixing run ends. The far end steps back the
   * same 16 for the tail. That is *"the formers are shaped to account for this offset in depth"*,
   * and 16 is 18 less 2.
   */
  it('steps the former at the tangent, by the board less the web', () => {
    const routed = byName(curved('routed').built.panels, 'Corner former 1');
    const ys = routed.profile.outline.map((v) => v.y);
    const step = Math.max(...ys) - Math.min(...ys);
    expect(step).toBeCloseTo(198, 6);

    /*
     * The flat that gets screwed sits a whole board proud of the arc plane.
     *
     * Read at the *inner* end of the strip, x = 0, rather than as a minimum over the strip: the
     * tangent at x = 50 carries **both** vertices of the step, so a min across it returns the
     * arc plane and the assertion passes on a former with no step in it at all. It did.
     */
    const inner = routed.profile.outline.filter((v) => Math.abs(v.x) < 1e-6);
    expect(inner.length).toBeGreaterThan(0);
    expect(Math.max(...inner.map((v) => v.y))).toBeCloseTo(198, 6);
    expect(Math.min(...inner.map((v) => v.y))).toBeCloseTo(18 - 2, 6);

    // And the step really is two vertices at the tangent, one on each plane.
    const atTangent = routed.profile.outline
      .filter((v) => Math.abs(v.x - 50) < 1e-6)
      .map((v) => v.y)
      .sort((a, b) => a - b);
    expect(atTangent.length).toBe(2);
    expect(atTangent[1]! - atTangent[0]!).toBeCloseTo(18 - 2, 6);

    // And the tail steps back by the same amount at the far end.
    const xs = routed.profile.outline.map((v) => v.x);
    expect(Math.max(...xs) - 232).toBeCloseTo(18 - 2, 6);
  });

  it('leaves a wrapped former unstepped, because the ply covers the flats too', () => {
    const wrapped = byName(curved('wrapped').built.panels, 'Corner former 1');
    // Four vertices, and the strip lies in the same plane the arc starts from.
    expect(wrapped.profile.outline.length).toBe(4);
    const strip = wrapped.profile.outline.filter((v) => v.x <= 50 + 1e-6);
    expect(Math.min(...strip.map((v) => v.y))).toBeCloseTo(0, 6);
  });

  it('develops the piece as a strip of the web, not of the board', () => {
    const piece = byName(curved('routed').built.panels, 'Curved front');
    const f = piece.forming!;
    // Neutral at r − web/2 = 199, whatever the board is: (r − web) + web/2.
    expect(f.innerRadius + f.kFactor * 2).toBeCloseTo(200 - 2 / 2, 6);
    expect(f.kFactor).toBeCloseTo(0.5, 6);
  });

  it('cuts the blank to the arc round the web plus both flats', () => {
    const piece = byName(curved('routed').built.panels, 'Curved front');
    const [length] = size(piece);
    const arc = 199 * (Math.PI / 2);
    expect(arc).toBeCloseTo(312.58, 1);
    // 50mm strip + the arc + a real tail down the end of the cabinet.
    expect(length - arc - 50).toBeGreaterThan(0);
  });

  /*
   * The blank still moves with the board, and only in the tail.
   *
   * The arc is now `r − web/2` and has nothing to do with the board at all, but the flat tail
   * runs down the end from the substrate face, which is a whole board back. So a thicker board
   * lengthens the tail and nothing else. This is the assertion that caught `wrapPart` measuring
   * every developed length off the bendy ply.
   */
  it('moves the blank by the board thickness and not a millimetre more', () => {
    const lengthOn = (doorMaterialId: string) => {
      const project = { ...jobWith('routed'), defaults: { ...base.defaults, doorMaterialId } };
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
      return size(byName(buildCabinet(cabinet, project).panels, 'Curved front'))[0];
    };

    const boards = base.materials.sheets.filter((sheet) => sheet.substrate !== 'plywood');
    const thin = boards.find((sheet) => sheet.thickness === 16);
    const thick = boards.find((sheet) => sheet.thickness === 18);
    expect(thin, 'the library should carry a 16mm door board').toBeDefined();
    expect(thick, 'the library should carry an 18mm door board').toBeDefined();
    const grew = lengthOn(thick!.id) - lengthOn(thin!.id);
    expect(grew).toBeCloseTo(actualThicknessOf(thick!) - actualThicknessOf(thin!), 6);
  });

  it('leaves a wrapped skin bending about its middle, as it always did', () => {
    for (const layer of curvedParts(curved('wrapped').built.panels)) {
      expect(layer.forming!.kFactor).toBeCloseTo(0.5, 6);
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
  it('reports the web and what is unchecked about it on a routed method', () => {
    const routed = jobWith('routed').constructions[0]!;
    const notes = unconfirmedRoutedCurveFigures(routed);
    expect(notes.length).toBe(1);
    // The web itself is the shop's figure. What nobody has checked is the tightest radius it
    // will turn — so the note must say which is which rather than casting doubt on both.
    expect(notes[0]).toMatch(/2mm web/);
    expect(notes[0]).toMatch(/tightest radius/);
  });

  it('says nothing on a wrapped method, where neither number is read', () => {
    // A warning about a figure nothing uses is the noise that trains people to skip warnings.
    expect(unconfirmedRoutedCurveFigures(jobWith('wrapped').constructions[0]!)).toEqual([]);
  });
});
