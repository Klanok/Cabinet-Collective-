/**
 * Which way a bendy-ply skin is laid on the sheet.
 *
 * ## The fault, measured before it was fixed
 *
 * Bendy ply shipped with `grain: 'none'`, which is honest — it is a substrate with no decor — and
 * `none` is exactly what tells the nester a part may rotate freely. It does. On the first plain
 * radiused end that was measured, **both skins came off the sheet `turned`**, and bendy ply only
 * bends one way: the blank was the right size, off a sheet that will not go round the formers.
 *
 * That is the fault §7's whole standard exists for — *"a part of the right size in the wrong place
 * is the same part"* — arriving as an orientation rather than a position. The part carried a note
 * telling the operator to check the sheet, which is not the same thing: by the time anyone reads
 * it the cut plan has committed.
 *
 * ## What the constraint is, and what it deliberately is not
 *
 * `SheetMaterial.bendAxis` is **structural**, and lives beside `grain` rather than inside it. Grain
 * is appearance — whether two parts read as matched. A bend axis is whether the part can be made
 * at all. The old comment in `materials.au.ts` called this out and declined to conflate them, and
 * was right: putting the bend in `grain` would nest these correctly by accident and wrongly the
 * moment somebody touched the nester.
 *
 * Only a part with `forming` on it is constrained. A flat part cut from bendy ply bends nowhere.
 *
 * Reference figures, from the shop: **column form is the default** — *"generally column but
 * sometimes barrel depending on the application"* — and column bends **along the sheet's length**,
 * which was this library's own long-standing reading until the shop confirmed it: *"you have it
 * right on the column"*. So a skin's length must lie along the sheet length: `as-cut`, never
 * `turned`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createCabinet, createEmptyProject } from '../src/core/project/factory.ts';
import { nestParts, nestProject, orientationsFor } from '../src/core/nest/nest.ts';
import { mm } from '../src/core/units.ts';
import type { Project } from '../src/core/model/project.ts';

let project: Project;

const withCurve = (): Project => ({
  ...project,
  cabinets: [
    createCabinet(
      { typeId: 'radius-end', name: 'R1', width: mm(600), height: mm(720), depth: mm(600), x: mm(0) },
      project.defaults,
      project.constructions,
    ),
  ],
});

beforeEach(() => {
  project = createEmptyProject('Bend axis');
});

describe('the rule, on its own', () => {
  it('pins a formed part to the axis the board bends along', () => {
    // Column form: the sheet rolls along its length, so the part's length lies along the length.
    expect(orientationsFor('any', 'none', { axis: 'length', partIsFormed: true })).toEqual(['as-cut']);
    // Barrel form: it rolls across, so the part has to be turned.
    expect(orientationsFor('any', 'none', { axis: 'width', partIsFormed: true })).toEqual(['turned']);
  });

  it('leaves a flat part on a bendable board free to rotate', () => {
    // A kick cut from bendy ply bends nowhere and should not lose yield to a constraint it
    // does not have.
    expect(orientationsFor('any', 'none', { axis: 'length', partIsFormed: false })).toEqual([
      'as-cut',
      'turned',
    ]);
  });

  it('leaves a board with no bend axis exactly as it was', () => {
    // Every ordinary board. The bend check must be invisible to the 99% of parts it is not about.
    expect(orientationsFor('any', 'none', { axis: undefined, partIsFormed: true })).toEqual([
      'as-cut',
      'turned',
    ]);
    expect(orientationsFor('length-along-grain', 'length')).toEqual(['as-cut']);
    expect(orientationsFor('length-along-grain', 'width')).toEqual(['turned']);
  });

  /*
   * The bend beats the grain, and it has to.
   *
   * A grain constraint keeps a job looking right; a bend constraint is whether the part can be
   * bent at all. If a bendable board ever gains a decor, the two could disagree — and the answer
   * has to be the one that produces a part.
   */
  it('takes the bend over the grain when they disagree', () => {
    expect(orientationsFor('length-along-grain', 'width', { axis: 'length', partIsFormed: true }))
      .toEqual(['as-cut']);
  });
});

describe('a real curved cabinet', () => {
  /*
   * Everything on a radiused end that is bent, which is more than the skins.
   *
   * The **kick curves too** — it follows the same radius round the base — and it is cut from the
   * same bendy ply. This assertion was first written as "the skins, and nothing else" and the
   * kick failed it, correctly: the constraint has to cover every part that gets bent, not every
   * part called Skin. Naming the parts by hand is exactly the "wired into some and not others"
   * fault (§4.15), so the test asks the model rather than a list.
   */
  it('marks every bent part as formed, and no flat one', () => {
    const parts = nestParts(withCurve());
    const formed = parts.filter((p) => p.formed).map((p) => p.name).sort();
    expect(formed).toEqual(['Kick', 'Skin layer 1', 'Skin layer 2']);
  });

  /*
   * The regression, stated as the thing that was measured.
   *
   * Before `bendAxis` this asserted `turned` on both skins — that is what the nester actually
   * did, on the shipped sheet size, with no help.
   */
  it('never turns a skin on the sheet', () => {
    const nest = nestProject(withCurve());
    const bendy = nest.byMaterial.filter((m) => m.materialId.includes('bendy'));
    expect(bendy.length).toBeGreaterThan(0);

    let skinsChecked = 0;
    for (const material of bendy) {
      const byId = new Map(material.parts.map((p) => [p.panelId, p]));
      for (const sheet of material.sheets) {
        for (const placement of sheet.placements) {
          const part = byId.get(placement.partId);
          if (!part?.formed) continue;
          skinsChecked += 1;
          expect(placement.orientation, `${part.name} was laid ${placement.orientation}`).toBe(
            'as-cut',
          );
        }
      }
    }
    // Assert we actually looked at some — a loop over nothing passes and proves nothing, which
    // is the shape of vacuous assertion this project keeps catching.
    expect(skinsChecked).toBeGreaterThan(0);
  });

  it('still cuts the bent parts at the same size — this is where they lie, not what they are', () => {
    // The constraint moves blanks on the sheet. If it changed a developed length, something is
    // wrong upstream: a bent part is cut flat and its size comes from the radius, not the nest.
    // Hand-worked: the two skins are the cabinet's full 720 height; the kick is 150 tall, which
    // is the shipped kick height, and it is the part that proves the width is read rather than
    // assumed.
    const byName = new Map(nestParts(withCurve()).filter((p) => p.formed).map((p) => [p.name, p]));
    expect(byName.get('Skin layer 1')!.width).toBe(720);
    expect(byName.get('Skin layer 2')!.width).toBe(720);
    expect(byName.get('Kick')!.width).toBe(150);
    for (const part of byName.values()) expect(part.length).toBeGreaterThan(0);
  });
});

/*
 * **The reading became a measurement** — *"you have it right on the column"*.
 *
 * What was in doubt was never whether the shop buys column; it was which axis of the sheet that
 * word names. It names the **length**, confirmed at the bench, so the caution that used to stand
 * on the Materials tab is gone and this describes what ships instead of what to go and check.
 *
 * The assertion is on the shipped library rather than on a hand-built sheet, because the fault it
 * guards is a board being added later with the axis flipped: every bendable board in the library
 * bends along its length, and a barrel board is a deliberate per-board edit the shop makes.
 */
describe('which way the shipped boards bend', () => {
  it('sets every bendable board to column form — along the sheet length', () => {
    const bendable = project.materials.sheets.filter((s) => s.bendAxis !== undefined);
    expect(bendable.length).toBeGreaterThan(0);
    for (const sheet of bendable) {
      expect(sheet.bendAxis, `${sheet.decor} is not column form`).toBe('length');
    }
  });

  it('leaves every board that does not bend without an axis at all', () => {
    // A flat board has no axis to be wrong about, and giving it one would hand the nester a
    // constraint on parts that never get formed.
    const flat = project.materials.sheets.filter((s) => !s.decor.includes('Bendy'));
    expect(flat.length).toBeGreaterThan(0);
    for (const sheet of flat) expect(sheet.bendAxis).toBeUndefined();
  });
});
