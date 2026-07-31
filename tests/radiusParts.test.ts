/**
 * Curved parts, end to end: open radius shelving and an enclosed radiused end.
 *
 * Reference figures worked longhand. These are the two things the arc work was for, and the
 * two places a mistake costs material rather than pixels.
 *
 * ## Open radius shelving
 *
 * A 900 open shelving unit, 16mm carcass, 300 deep, shelves bowed 40mm at the front.
 *
 *   shelf length   interiorWidth − shelfSideClearance = (900 − 32) − 2 = 866
 *   shelf depth    horizontalDepth − shelfSetback = (300 − 16) − 10 = 274
 *   with the bow   the part is 274 + 40 = 314 deep at its middle
 *   front edge     chord 866, sagitta 40
 *                  r = (866²/4 + 40²) / (2×40) = (187489 + 1600) / 80 = 189089 / 80 = 2363.6125
 *                  b = 2×40/866 = 0.09237875…
 *                  θ = 4·atan(b) = 0.36899…
 *                  arc = r·θ
 *
 * The arc comes out about 4.9mm longer than the 866 chord. That is the banding the shelf
 * actually uses, and it is what was being under-bought before arcs existed.
 *
 * ## The enclosed radiused end
 *
 * A 560 radius quarter — the AU base depth — 720 high, 16mm formers, two layers of 8mm
 * bendy ply, formers no more than 300 apart.
 *
 *   former radius   560 − 2×8 = 544        (finished radius, less the skin that goes over it)
 *   former span     H − t = 720 − 16 = 704
 *   former count    gaps = ceil(704 / (300 + 16)) = ceil(2.228) = 3, so 4 formers
 *   former heights  0, 234.667, 469.333, 704
 *   clear gap       704/3 − 16 = 218.667   (inside the 300 asked for)
 *   former area     π × 544² / 4 = 232427.591
 *
 *   skin layer 1    inner 544, developed (544 + 4) × π/2 = 860.7964
 *   skin layer 2    inner 557, developed (557 + 1.5) × π/2 = 877.2897
 *   difference      8 × π/2 = 12.566371    — exactly one board thickness round a quarter turn
 *
 * That last line is the one that matters. Cut both layers the same and the outer one is 4.7mm
 * short, which you find out with the glue on.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { createCabinet, createEmptyProject, resetIdCounter } from '../src/core/project/factory.ts';
import type { CabinetOptions } from '../src/core/model/cabinet.ts';
import type { Project } from '../src/core/model/project.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { buildCutlist } from '../src/core/cutlist/cutlist.ts';
import { bandedLength, panelEdgeLengths, panelExtent } from '../src/core/model/panel.ts';
import { developedLength } from '../src/core/model/forming.ts';
import { actualThicknessOf, findSheet } from '../src/core/model/material.ts';
import { profileHasArcs } from '../src/core/geom/profile.ts';
import { byName, namesOf, occupies, size } from './helpers.ts';

const QUARTER = Math.PI / 2;

/** A one-cabinet job, so the figures in the header are the only ones in play. */
const jobWith = (
  typeId: 'custom' | 'radius-end',
  width: number,
  depth: number,
  options: CabinetOptions,
): { project: Project; built: ReturnType<typeof buildCabinet> } => {
  const project = createEmptyProject('Curves');
  const cabinet = createCabinet({
    typeId,
    name: 'X1',
    x: mm(0),
    width: mm(width),
    depth: mm(depth),
    options,
  });
  const withCabinet: Project = { ...project, cabinets: [cabinet] };
  return { project: withCabinet, built: buildCabinet(cabinet, withCabinet) };
};

beforeEach(() => resetIdCounter());

describe('open radius shelving', () => {
  const OPEN_SHELVING: CabinetOptions = {
    topStyle: 'open',
    hasBack: false,
    doorCount: 0,
    dividerCount: 1,
    shelfCount: 2,
  };

  const straight = () => jobWith('custom', 900, 300, { ...OPEN_SHELVING, dividerCount: 0 });
  const bowed = () =>
    jobWith('custom', 900, 300, { ...OPEN_SHELVING, dividerCount: 0, shelfBow: mm(40) });

  it('cuts a straight shelf 866 × 274, exactly as it always did', () => {
    const shelf = byName(straight().built.panels, 'Shelf 1');
    expect(size(shelf)).toEqual([mm(866), mm(274)]);
    expect(profileHasArcs(shelf.profile)).toBe(false);
  });

  it('makes the bowed shelf 40mm deeper, and nothing else about it moves', () => {
    const shelf = byName(bowed().built.panels, 'Shelf 1');
    expect(size(shelf)).toEqual([mm(866), mm(314)]);
    expect(profileHasArcs(shelf.profile)).toBe(true);
  });

  it('reaches forward of the carcass rather than eating into it', () => {
    // The back of the shelf must not move: it is housed between the sides either way. The
    // extra 40 has to appear in front of where a straight shelf's front was.
    const flat = occupies(byName(straight().built.panels, 'Shelf 1'), straight().project);
    const bow = occupies(byName(bowed().built.panels, 'Shelf 1'), bowed().project);
    expect(bow.z[0]).toBeCloseTo(flat.z[0], 6); // same back
    expect(bow.z[1]).toBeCloseTo(flat.z[1] + 40, 6); // 40 further forward
    expect(bow.x).toEqual(flat.x);
    expect(bow.y).toEqual(flat.y);
  });

  it('bands the curved front along the arc, not across the chord', () => {
    const shelf = byName(bowed().built.panels, 'Shelf 1');
    const edges = panelEdgeLengths(shelf);

    // The chord is 866; the arc over a 40mm bow is longer, by a little under 5mm.
    const r = (866 * 866) / 4 / (2 * 40) + 40 / 2;
    const theta = 4 * Math.atan((2 * 40) / 866);
    expect(r).toBeCloseTo(2363.6125, 4);
    expect(edges.L1).toBeCloseTo(r * theta, 4);
    expect(edges.L1 - 866).toBeGreaterThan(4.8);
    expect(edges.L1 - 866).toBeLessThan(5.0);
  });

  it('puts the curve on the front edge, which for a shelf is L1 and not L2', () => {
    // A shelf lies in with v = −Z, so part +Y runs toward the back. Bowing L2 would put the
    // radius against the wall, where it would look completely fine in a photograph of the
    // cutlist and completely wrong in the room.
    const shelf = byName(bowed().built.panels, 'Shelf 1');
    const edges = panelEdgeLengths(shelf);
    expect(edges.L2).toBeCloseTo(866, 6); // the back stays a straight 866
    expect(edges.L1).toBeGreaterThan(866);
    // And it is the front edge that carries the banding, so the two agree.
    expect(Object.keys(shelf.edgeBanding)).toEqual(['L1']);
    expect(bandedLength(shelf)).toBeCloseTo(edges.L1, 6);
  });

  it('bows every shelf in a pigeon-hole grid, not just the first', () => {
    const { built } = jobWith('custom', 900, 300, {
      ...OPEN_SHELVING,
      shelfBow: mm(40),
    });
    const shelves = built.panels.filter((p) => p.role === 'shelf-adjustable');
    expect(shelves.length).toBe(4); // 2 levels × 2 bays
    for (const s of shelves) expect(profileHasArcs(s.profile)).toBe(true);
  });

  it('tells the person at the saw that the front is radiused', () => {
    expect(byName(bowed().built.panels, 'Shelf 1').note).toBe('Radiused front, 40mm bow');
  });

  it('refuses a bow that would reach past the back of the shelf', () => {
    expect(() => jobWith('custom', 900, 300, { ...OPEN_SHELVING, shelfBow: mm(300) })).toThrow(
      /reaches past the back/,
    );
  });
});

describe('the enclosed radiused end', () => {
  const end = () => jobWith('radius-end', 560, 560, {});

  it('builds four formers, two skins and a kick', () => {
    const { built } = end();
    expect(built.warnings).toEqual([]);
    expect(namesOf(built.panels)).toEqual([
      'Former 1',
      'Former 2',
      'Former 3',
      'Former 4',
      'Skin layer 1',
      'Skin layer 2',
      'Kick',
    ]);
  });

  it('cuts the formers under the skin, not to the finished radius', () => {
    // 560 finished, less two 8mm layers, is 544. A former cut to 560 gives a curve standing
    // 6mm proud of the run's front face — a step exactly where a hand lands.
    const former = byName(end().built.panels, 'Former 1');
    expect(size(former)).toEqual([mm(544), mm(544)]);
    expect(profileHasArcs(former.profile)).toBe(true);
  });

  it('spaces the formers by the gap between them rather than by a count', () => {
    const { built } = end();
    const formers = built.panels.filter((p) => p.role === 'former');
    const tops = formers.map((f) => occupies(f, end().project).y[0]);
    expect(tops.map((n) => Math.round(n * 1000) / 1000)).toEqual([0, 234.667, 469.333, 704]);
    // Every clear gap is inside the 300 asked for.
    for (let i = 1; i < tops.length; i++) expect(tops[i]! - tops[i - 1]! - 16).toBeLessThanOrEqual(300);
  });

  it('adds formers when a taller unit needs them', () => {
    const short = jobWith('radius-end', 560, 560, {}).built.panels.filter((p) => p.role === 'former');
    const project = createEmptyProject('Tall curve');
    const cabinet = createCabinet({
      typeId: 'radius-end',
      name: 'R1',
      x: mm(0),
      width: mm(560),
      depth: mm(560),
      height: mm(2070),
      options: {},
    });
    const tall = buildCabinet(cabinet, { ...project, cabinets: [cabinet] }).panels.filter(
      (p) => p.role === 'former',
    );
    expect(tall.length).toBeGreaterThan(short.length);
  });

  it('cuts each skin layer flat, to its own developed length', () => {
    const { built } = end();
    const first = byName(built.panels, 'Skin layer 1');
    const second = byName(built.panels, 'Skin layer 2');

    // Flat rectangles, developed length × carcass height.
    expect(panelExtent(first).length).toBeCloseTo(860.7964, 3);
    expect(panelExtent(second).length).toBeCloseTo(873.3628, 3);
    expect(panelExtent(first).width).toBe(mm(720));
    expect(profileHasArcs(first.profile)).toBe(false);
  });

  it('makes the outer layer exactly one board thickness longer, round the turn', () => {
    // The outer layer wraps the inner one, so it is a whole thickness further out all the way
    // round: t × θ, and nothing else. Cutting both the same is the classic way to be short.
    const { built } = end();
    const first = panelExtent(byName(built.panels, 'Skin layer 1')).length;
    const second = panelExtent(byName(built.panels, 'Skin layer 2')).length;
    // 5 places, not 9: a part's extent is snapped to the nanometre on the way out, so two of
    // them differ by up to 2nm more than the exact arithmetic does.
    expect(second - first).toBeCloseTo(8 * QUARTER, 5);
    expect(second - first).toBeCloseTo(12.566371, 5);
  });

  it('keeps the flat shape in the profile and the bend in the forming', () => {
    // The whole architectural point. A skin's profile is what the saw cuts; how it then bends
    // lives somewhere nothing dimensional reads.
    const { built, project } = end();
    const skin = byName(built.panels, 'Skin layer 1');
    const ts = actualThicknessOf(findSheet(project.materials, skin.materialId));
    expect(skin.forming).toBeDefined();
    expect(skin.forming!.kind).toBe('cylindrical');
    expect(skin.forming!.innerRadius).toBe(mm(544));
    expect(skin.forming!.sweep).toBeCloseTo(QUARTER, 9);
    expect(skin.forming!.axis).toBe('x');
    // And the two agree: the flat length is the developed length of that bend.
    expect(developedLength(skin.forming!, ts)).toBeCloseTo(panelExtent(skin).length, 5);
  });

  it('cuts the skin from bendy ply and the formers from carcass board', () => {
    const { built, project } = end();
    expect(byName(built.panels, 'Skin layer 1').materialId).toBe(project.defaults.skinMaterialId);
    expect(byName(built.panels, 'Skin layer 1').materialId).toBe('bendy-ply-8');
    expect(byName(built.panels, 'Former 1').materialId).toBe(project.defaults.carcassMaterialId);
  });

  it('bands nothing, because every edge is buried or under the skin', () => {
    for (const p of end().built.panels.filter((p) => p.role !== 'kick')) {
      expect(p.edgeBanding).toEqual({});
      expect(bandedLength(p)).toBe(0);
    }
  });

  it('warns rather than drawing an ellipse when width and depth disagree', () => {
    const { built } = jobWith('radius-end', 900, 560, {});
    expect(built.warnings.join(' ')).toMatch(/quarter circle/);
  });

  it('says so when asked for a single layer of bendy ply', () => {
    const { built } = jobWith('radius-end', 560, 560, { skinLayers: 1 });
    expect(built.warnings.join(' ')).toMatch(/takes up the shape of every former/);
    expect(built.panels.filter((p) => p.role === 'skin')).toHaveLength(1);
  });

  it('reaches the cutlist as two skins of different sizes, not one line of two', () => {
    // If the two layers ever collapse onto one cutlist line, they have been cut the same and
    // the outer one is short.
    const { project } = end();
    const skins = buildCutlist(project).filter((l) => l.name.startsWith('Skin'));
    expect(skins).toHaveLength(2);
    expect(skins.every((l) => l.quantity === 1)).toBe(true);
    expect(skins[0]!.length).not.toBe(skins[1]!.length);
  });

  it('tells the person at the saw to check which way the sheet bends', () => {
    const note = byName(end().built.panels, 'Skin layer 1').note ?? '';
    expect(note).toMatch(/bend to 544mm inside radius/);
    expect(note).toMatch(/barrel or column form/);
  });
});
