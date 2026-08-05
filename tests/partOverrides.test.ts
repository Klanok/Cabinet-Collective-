/**
 * Parts deleted, and parts cut from another board — §5.13 item 3.
 *
 * ## What the shop asked for, and the two answers that decided the shape
 *
 * > *"add and delete any part — left end, back, bottom, each individually — and choose the
 * > material per part"*
 *
 * > *"if you delete an end it re-derives"*
 *
 * > *"genuinely different thicknesses depending on real world availability"*
 *
 * Both of those are bigger than they sound, and they land on the same two figures. `interiorWidth`
 * was `W − 2t` and every horizontal was placed at `x = ctx.t`: one thickness, twice, on the
 * assumption that a carcass has two sides and they are the same board. Neither half is safe.
 *
 * ## The reference cabinet, worked longhand
 *
 * A 600 × 720 × 560 custom cabinet on 16mm carcass board:
 *
 * ```
 *   as built          interior 600 − 16 − 16 = 568, starting at x = 16
 *   no left end       interior 600 − 0  − 16 = 584, starting at x = 0
 *   18mm left end     interior 600 − 18 − 16 = 566, starting at x = 18
 *   neither end       interior 600, starting at x = 0 — and reported, because nothing braces it
 * ```
 *
 * **A deleted end is not a panel switched off.** The bottom of a cabinet with no left end is a
 * different part — wider, and starting somewhere else — which is what "it re-derives" means and
 * why this is not a visibility flag.
 */

import { describe, expect, it } from 'vitest';
import { createCabinet, createEmptyProject } from '../src/core/project/factory.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { mm } from '../src/core/units.ts';
import type { Project } from '../src/core/model/project.ts';
import { type PartOverride, withPartOverride } from '../src/core/model/partOverride.ts';
import { byName, namesOf, occupies, size } from './helpers.ts';

const W = 600;
const H = 720;
const D = 560;
const T = 16;

const unit = (partOverrides?: readonly PartOverride[], options: Record<string, unknown> = {}) => {
  const project = createEmptyProject('Overrides');
  const base = createCabinet(
    { typeId: 'custom', name: 'C1', width: mm(W), height: mm(H), depth: mm(D), x: mm(0) },
    project.defaults,
    project.constructions,
  );
  const cabinet = {
    ...base,
    options: { ...base.options, ...options },
    ...(partOverrides ? { partOverrides } : {}),
  };
  const withCabinet: Project = { ...project, cabinets: [cabinet] };
  return { project: withCabinet, cabinet, built: buildCabinet(cabinet, withCabinet) };
};

describe('a cabinet with nothing overridden', () => {
  it('is built exactly as it was — the whole suite depends on this', () => {
    /*
     * The assertion that makes every other test in the repo the control for this one. A uniform
     * shell has to reproduce `W − 2t` and `x = t` to the millimetre, or 1068 tests are measuring
     * something else.
     */
    const plain = unit().built;
    const empty = unit([]).built;
    expect(namesOf(empty.panels)).toEqual(namesOf(plain.panels));
    expect(empty.panels.map(size)).toEqual(plain.panels.map(size));
    expect(plain.warnings).toEqual([]);

    const { project, built } = unit();
    expect(size(byName(built.panels, 'Bottom'))).toEqual([mm(W - 2 * T), mm(D - T)]);
    expect(occupies(byName(built.panels, 'Bottom'), project).x).toEqual([mm(T), mm(W - T)]);
  });
});

describe('deleting an end re-derives the carcass around it', () => {
  it('widens the bottom and starts it at the cabinet face', () => {
    // 584 wide from x = 0, where it was 568 from x = 16. A panel switched off would have left the
    // bottom exactly where it was, with a 16mm strip of nothing beside it.
    const { project, built } = unit([{ key: 'side-left', omit: true }]);
    expect(namesOf(built.panels)).not.toContain('Side L');
    expect(size(byName(built.panels, 'Bottom'))).toEqual([mm(W - T), mm(D - T)]);
    expect(occupies(byName(built.panels, 'Bottom'), project).x).toEqual([mm(0), mm(W - T)]);
  });

  it('leaves the end that is still there exactly where it was', () => {
    // The half that says this is a re-derivation and not a shove: deleting the left end must not
    // move the right one, or the cabinet is no longer the width it was drawn at.
    const asBuilt = unit();
    const noLeft = unit([{ key: 'side-left', omit: true }]);
    expect(occupies(byName(noLeft.built.panels, 'Side R'), noLeft.project).x).toEqual(
      occupies(byName(asBuilt.built.panels, 'Side R'), asBuilt.project).x,
    );
  });

  it('carries the new opening to everything measured off it, not just the bottom', () => {
    // The top, the back and the shelves are all sized on the same figure, which is the whole
    // reason `interiorWidth` was worth deriving rather than each part working it out again.
    const { built } = unit([{ key: 'side-left', omit: true }], { shelfCount: 1 });
    expect(size(byName(built.panels, 'Top'))[0]).toBe(mm(W - T));
    /*
     * **The back deliberately does not move**, and that is not an oversight. The shipped
     * construction lays the back *over* the carcass rather than housing it inside — an applied
     * back is the full width of the cabinet by definition, so it is the one part a deleted end
     * leaves alone. Housed into the sides, it would follow the opening like the top does.
     */
    expect(size(byName(built.panels, 'Back'))[0]).toBe(mm(W));
    // A shelf keeps its own side clearance off the new opening rather than off the old one.
    expect(size(byName(built.panels, 'Shelf'))[0]).toBeLessThan(mm(W - T));
    expect(size(byName(built.panels, 'Shelf'))[0]).toBeGreaterThan(mm(W - T - 10));
  });

  it('says so when the box has no ends left to brace it', () => {
    const { built } = unit([
      { key: 'side-left', omit: true },
      { key: 'side-right', omit: true },
    ]);
    // Built, and reported — the same contract every other impossible cabinet gets. A carcass with
    // no ends is a stack of shelves in mid-air, and the shop is told rather than stopped.
    expect(built.warnings.join(' ').toLowerCase()).toContain('end');
    expect(size(byName(built.panels, 'Bottom'))[0]).toBe(mm(W));
  });
});

describe('a part cut from another board', () => {
  it('takes that board’s real thickness out of the opening', () => {
    /*
     * *"genuinely different thicknesses depending on real world availability."* An 18mm end in a
     * 16mm cabinet is 2mm more out of the opening and 2mm further in — a decor swap would have
     * left both figures alone, which is exactly why this is not one.
     */
    const { project, built } = unit([{ key: 'side-left', materialId: 'mdf-raw-18' }]);
    expect(size(byName(built.panels, 'Bottom'))[0]).toBe(mm(W - 18 - T));
    expect(occupies(byName(built.panels, 'Bottom'), project).x).toEqual([mm(18), mm(W - T)]);
  });

  it('puts that board on the part, so the cutlist and the order follow', () => {
    // `materialId` is what the cutlist groups by, the nest buys and costing prices, so the one
    // field carries the whole of "cut that end from 18mm MDF" without any of them knowing why.
    const { built } = unit([{ key: 'side-left', materialId: 'mdf-raw-18' }]);
    expect(byName(built.panels, 'Side L').materialId).toBe('mdf-raw-18');
    expect(byName(built.panels, 'Side R').materialId).not.toBe('mdf-raw-18');
  });

  it('keeps the cabinet the size it was drawn at, whatever the board', () => {
    // The driving dimensions are the driving dimensions: a thicker end eats the opening, it does
    // not make the cabinet wider. Getting this backwards is a run that no longer fits its wall.
    const { project, built } = unit([{ key: 'side-left', materialId: 'mdf-raw-18' }]);
    expect(occupies(byName(built.panels, 'Side R'), project).x).toEqual([mm(W - T), mm(W)]);
  });

  it('falls back to the carcass rather than resizing on a board the job does not have', () => {
    // A price list that has lost the board must not silently give the cabinet a different opening.
    const { built } = unit([{ key: 'side-left', materialId: 'no-such-board' }]);
    expect(size(byName(built.panels, 'Bottom'))[0]).toBe(mm(W - 2 * T));
  });
});

describe('individual parts, where a rule makes several', () => {
  it('deletes the one named and leaves its neighbours where they were', () => {
    // *"individual shelves."* Shelf 2 of 3 goes; 1 and 3 stay at the heights they were at, which
    // is what makes this a delete rather than a re-space.
    const three = unit(undefined, { shelfCount: 3 });
    const heights = three.built.panels
      .filter((p) => p.role === 'shelf-adjustable')
      .map((p) => occupies(p, three.project).y[0]);
    expect(heights).toHaveLength(3);

    const two = unit([{ key: 'shelves', index: 1, omit: true }], { shelfCount: 3 });
    const left = two.built.panels
      .filter((p) => p.role === 'shelf-adjustable')
      .map((p) => occupies(p, two.project).y[0]);
    expect(left).toEqual([heights[0], heights[2]]);
  });

  it('keeps the survivors’ own numbers, so an override does not re-point itself', () => {
    /*
     * §5.12's stable-key argument, one level down. If deleting shelf 2 renumbered shelf 3 to 2,
     * every override and every custom feature naming a later part would quietly move to a
     * different part — and the only sign would be a hole in the wrong shelf.
     */
    const two = unit([{ key: 'shelves', index: 1, omit: true }], { shelfCount: 3 });
    expect(two.built.partKeys.filter((k) => k.key === 'shelves').map((k) => k.index)).toEqual([0, 2]);
  });

  it('takes a rule-wide setting and a named one together', () => {
    // "18mm shelves, except the middle one is not there" is one sentence a shop says, so the
    // indexed entry only has to say what differs from the rule-wide one.
    const { built } = unit(
      [
        { key: 'shelves', materialId: 'mdf-raw-18' },
        { key: 'shelves', index: 1, omit: true },
      ],
      { shelfCount: 3 },
    );
    const shelves = built.panels.filter((p) => p.role === 'shelf-adjustable');
    expect(shelves).toHaveLength(2);
    expect(shelves.every((p) => p.materialId === 'mdf-raw-18')).toBe(true);
  });
});

describe('an override that names a part this cabinet does not build', () => {
  it('is reported rather than quietly doing nothing', () => {
    // The same contract §4.16 gives a custom feature whose part has gone. A setting that matches
    // nothing is one somebody made and the job forgot, and the only sign would be a cabinet that
    // looks slightly wrong.
    const { built } = unit([{ key: 'lift-up', omit: true }]);
    expect(built.warnings.join(' ')).toContain('lift-up');
  });
});

/* ── What the app needs from the model, and what each spec will allow ────────────────────────── */

describe('the parts the app offers', () => {
  it('keeps a deleted part on the list so it can be put back', () => {
    /*
     * **Without this, deleting is a one-way door.** `partKeys` is what the cabinet has; a part that
     * was taken away is in neither list unless the build says what it *would* have built, and the
     * app can only offer what it is told about.
     */
    const { built } = unit([{ key: 'side-left', omit: true }]);
    expect(built.partKeys.some((k) => k.key === 'side-left')).toBe(false);
    expect(built.offeredParts.some((k) => k.key === 'side-left')).toBe(true);
    // And it is named, because a row reading "side-left" helps nobody at a bench.
    expect(built.offeredParts.find((k) => k.key === 'side-left')!.name).toBe('Side L');
  });

  it('offers exactly what it builds when nothing is deleted', () => {
    const { built } = unit();
    expect(built.offeredParts.map((k) => k.panelId)).toEqual(built.partKeys.map((k) => k.panelId));
  });
});

describe('what each cabinet type allows', () => {
  const build = (typeId: string, overrides: readonly PartOverride[]) => {
    const project = createEmptyProject('Capability');
    const base = createCabinet(
      { typeId: typeId as 'base', name: 'X1', width: mm(W), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    const cabinet = { ...base, partOverrides: overrides };
    const withCabinet: Project = { ...project, cabinets: [cabinet] };
    return buildCabinet(cabinet, withCabinet);
  };

  it('lets an ordinary carcass lose an end, because a run sharing one is real joinery', () => {
    // The same re-derivation the custom cabinet gets: this is the shared carcass builders, so
    // enabling it on a base unit is a declaration rather than a second implementation.
    const built = build('base', [{ key: 'side-left', omit: true }]);
    expect(built.panels.some((p) => p.name === 'Side L')).toBe(false);
    expect(size(byName(built.panels, 'Bottom'))[0]).toBe(mm(W - T));
  });

  it('refuses on a banquette, in the spec’s own words, and builds it whole', () => {
    /*
     * **A refusal is not a warning with the feature still on.** A banquette that said "you cannot
     * delete this" and then deleted it would be worse than either answer — so the override is
     * resolved to nothing and the front is still there.
     */
    const built = build('banquette', [{ key: 'front', omit: true }]);
    expect(built.warnings.join(' ')).toContain('leaves a seat over a hole');
    expect(built.panels.length).toBeGreaterThan(0);
    expect(built.offeredParts.length).toBe(built.partKeys.length);
  });

  it('refuses on a radiused end, because the skin and the formers need each other', () => {
    const built = build('radius-end', [{ key: 'skin', omit: true }]);
    expect(built.warnings.join(' ')).toContain('The curve is the cabinet');
    expect(built.panels.some((p) => p.role === 'skin')).toBe(true);
  });
});

describe('editing the list', () => {
  it('drops an entry that has stopped saying anything', () => {
    // Putting a part back and setting its board to "as the cabinet" must leave a clean cabinet,
    // not a list of entries that change nothing and a warning naming parts nobody touched.
    const deleted = withPartOverride(undefined, 'side-left', 0, { omit: true });
    expect(deleted).toHaveLength(1);
    expect(withPartOverride(deleted, 'side-left', 0, { omit: undefined })).toEqual([]);
  });

  it('changes one part without disturbing another', () => {
    const two = withPartOverride(
      withPartOverride(undefined, 'side-left', 0, { omit: true }),
      'bottom',
      0,
      { materialId: 'mdf-raw-18' },
    );
    expect(two).toHaveLength(2);
    const back = withPartOverride(two, 'side-left', 0, { omit: undefined });
    expect(back).toEqual([{ key: 'bottom', index: 0, materialId: 'mdf-raw-18' }]);
  });

  it('keeps a board when a part is deleted and put back', () => {
    // Deleting is not a way to lose the board somebody chose for that part.
    const withBoard = withPartOverride(undefined, 'bottom', 0, { materialId: 'mdf-raw-18' });
    const gone = withPartOverride(withBoard, 'bottom', 0, { omit: true });
    const back = withPartOverride(gone, 'bottom', 0, { omit: undefined });
    expect(back).toEqual([{ key: 'bottom', index: 0, materialId: 'mdf-raw-18' }]);
  });
});
