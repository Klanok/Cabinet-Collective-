/**
 * The Inspector's folding sections — what opens by default, and what a shut one still says.
 *
 * The panel folds because one drawer bank was 2242px of controls in a 712px window. Folding is
 * cheap to get right and expensive to get *silently* wrong, and the expensive half is the reason
 * this file exists rather than a screenshot:
 *
 * **A section that hides a deleted part and says nothing is worse than the scrolling was.** That
 * is §4.18's lesson — a model that is right and silent looks, from the bench, exactly like a
 * model that is wrong — arriving in the UI. So the summaries are asserted here against real built
 * cabinets, and the one thing checked hardest is that a *departure from the default* always
 * produces a line, and a cabinet on the defaults never produces a row of zeroes.
 *
 * Reference figures, worked by hand:
 *   - a base cabinet on the job defaults      → no override, no cutout, no part change
 *   - one part deleted                        → "1 deleted"
 *   - two parts deleted                       → "2 deleted"
 *   - one part on another board               → "1 on another board"
 *   - one of each                             → "1 deleted, 1 on another board"
 *   - carcass + door overridden, own style    → "3 overrides"
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { createCabinet, createEmptyProject, resetIdCounter } from '../src/core/project/factory.ts';
import { withPartOverride } from '../src/core/model/partOverride.ts';
import type { Cabinet } from '../src/core/model/cabinet.ts';
import type { CustomFeature } from '../src/core/model/partFeature.ts';
import type { Project } from '../src/core/model/project.ts';
import {
  DEFAULT_OPEN,
  SECTION_IDS,
  materialOverrideCount,
  partOverrideCounts,
  readOpenSections,
  sectionSummary,
  withSectionOpen,
} from '../src/app/panels/inspectorSections.ts';

let project: Project;

const base = (patch: Partial<Cabinet> = {}): Cabinet => ({
  ...createCabinet(
    { typeId: 'base', name: 'B1', width: mm(900), height: mm(720), depth: mm(560), x: mm(0) },
    project.defaults,
    project.constructions,
  ),
  ...patch,
});

const built = (cabinet: Cabinet) => buildCabinet(cabinet, project);

beforeEach(() => {
  resetIdCounter();
  project = createEmptyProject('Inspector sections');
});

describe('what is open before anybody has an opinion', () => {
  it('opens the two a cabinet is actually drawn by, and shuts the rest', () => {
    expect(DEFAULT_OPEN.stands).toBe(true);
    expect(DEFAULT_OPEN.configuration).toBe(true);
    expect(DEFAULT_OPEN.hardware).toBe(false);
    expect(DEFAULT_OPEN.finish).toBe(false);
    expect(DEFAULT_OPEN.cutouts).toBe(false);
    expect(DEFAULT_OPEN.parts).toBe(false);
    expect(DEFAULT_OPEN.reuse).toBe(false);
  });

  it('has a default for every section it lists, and lists every section it defaults', () => {
    // The two drifting apart is how a new section arrives at `undefined` and renders shut with
    // no way to say so — the same class of fault as a spec that forgets to declare a capability.
    expect(SECTION_IDS.slice().sort()).toEqual(Object.keys(DEFAULT_OPEN).sort());
  });
});

describe('reading a stored preference back', () => {
  it('takes the defaults when there is nothing stored', () => {
    expect(readOpenSections(null)).toEqual(DEFAULT_OPEN);
    expect(readOpenSections(undefined)).toEqual(DEFAULT_OPEN);
    expect(readOpenSections('nonsense')).toEqual(DEFAULT_OPEN);
  });

  it('applies what is stored over the defaults, one section at a time', () => {
    const read = readOpenSections({ parts: true, configuration: false });
    expect(read.parts).toBe(true);
    expect(read.configuration).toBe(false);
    // Untouched sections keep their own default rather than falling to `undefined`.
    expect(read.stands).toBe(true);
    expect(read.hardware).toBe(false);
  });

  it('drops a stale id, and ignores a value that is not a boolean', () => {
    const read = readOpenSections({ oldSectionName: true, parts: 'yes', cutouts: 1 });
    expect('oldSectionName' in read).toBe(false);
    // A section added later must arrive at its own default, not at whatever was written by a
    // version that spelled it differently.
    expect(read.parts).toBe(DEFAULT_OPEN.parts);
    expect(read.cutouts).toBe(DEFAULT_OPEN.cutouts);
  });

  it('toggles one section without touching another', () => {
    const next = withSectionOpen(DEFAULT_OPEN, 'parts', true);
    expect(next.parts).toBe(true);
    expect(next.stands).toBe(DEFAULT_OPEN.stands);
    expect(next.finish).toBe(DEFAULT_OPEN.finish);
    // Folds are independent, not an accordion — opening one closes nothing.
    expect(Object.values(next).filter((v) => v).length).toBe(
      Object.values(DEFAULT_OPEN).filter((v) => v).length + 1,
    );
  });
});

describe('a shut section still says what is set inside it', () => {
  it('says nothing at all about a cabinet on the job defaults', () => {
    const cabinet = base();
    const b = built(cabinet);
    expect(sectionSummary('finish', cabinet, b)).toBeNull();
    expect(sectionSummary('cutouts', cabinet, b)).toBeNull();
    expect(sectionSummary('parts', cabinet, b)).toBeNull();
    expect(sectionSummary('reuse', cabinet, b)).toBeNull();
  });

  it('counts a deleted part, and says how many', () => {
    const b0 = built(base());
    const first = b0.offeredParts[0]!;
    const second = b0.offeredParts[1]!;

    const one = base({
      partOverrides: withPartOverride(undefined, first.key, first.index, { omit: true }),
    });
    expect(sectionSummary('parts', one, built(one))).toBe('1 deleted');

    const two = base({
      partOverrides: withPartOverride(
        withPartOverride(undefined, first.key, first.index, { omit: true }),
        second.key,
        second.index,
        { omit: true },
      ),
    });
    expect(sectionSummary('parts', two, built(two))).toBe('2 deleted');
  });

  it('counts a part cut from another board separately from a deleted one', () => {
    const b0 = built(base());
    const first = b0.offeredParts[0]!;
    const second = b0.offeredParts[1]!;
    const other = project.materials.sheets.find((s) => s.id !== project.defaults.carcassMaterialId);
    expect(other).toBeDefined();

    const mixed = base({
      partOverrides: withPartOverride(
        withPartOverride(undefined, first.key, first.index, { omit: true }),
        second.key,
        second.index,
        { materialId: other!.id },
      ),
    });
    const counts = partOverrideCounts(mixed, built(mixed));
    expect(counts).toEqual({ deleted: 1, rematerialled: 1 });
    expect(sectionSummary('parts', mixed, built(mixed))).toBe('1 deleted, 1 on another board');
  });

  /*
   * A part told to differ and then told to differ back is not a difference.
   *
   * **Two things have to agree for this to hold, and only one of them is in this file.**
   * `withPartOverride` prunes a record that no longer says anything, so today a put-back part
   * leaves nothing behind at all — and this assertion survives a summary that counts *records*
   * rather than departures, because there is no record to count. It was written believing
   * otherwise; the mutation is what said so.
   *
   * It is kept because it is the end-to-end claim rather than either half: it fails the moment
   * the pruning stops and the counting is loose at the same time, which is exactly the pair a
   * later refactor would separate. What it is *not* is a test of the counting on its own — the
   * case above, with a real deletion beside a real re-material, is that.
   */
  it('stops counting a deleted part once it is put back', () => {
    const b0 = built(base());
    const first = b0.offeredParts[0]!;
    const putBack = base({
      partOverrides: withPartOverride(
        withPartOverride(undefined, first.key, first.index, { omit: true }),
        first.key,
        first.index,
        { omit: undefined },
      ),
    });
    expect(sectionSummary('parts', putBack, built(putBack))).toBeNull();
  });

  it('counts every kind of finish departure, including the door style and the grain', () => {
    const other = project.materials.sheets.find((s) => s.id !== project.defaults.carcassMaterialId);
    const cabinet = base({
      materials: { carcass: other!.id, door: other!.id },
      doorStyleId: project.doorStyles[0]!.id,
    });
    // Two boards and a door style — worked by hand, and the reason the door style counts is that
    // a cabinet in a different style is as much a departure as one on a different board.
    expect(materialOverrideCount(cabinet)).toBe(3);
    expect(sectionSummary('finish', cabinet, built(cabinet))).toBe('3 overrides');

    const withGrain = base({ options: { grainDirection: 'horizontal' } });
    expect(sectionSummary('finish', withGrain, built(withGrain))).toBe('1 override');
  });

  it('counts cutouts', () => {
    const cabinet = base();
    expect(sectionSummary('cutouts', cabinet, built(cabinet))).toBeNull();
    // The waste hole through a sink base's end — the real reason this control exists.
    const wasteHole: CustomFeature = {
      id: 'cf-waste',
      kind: 'hole',
      part: 'side-left',
      at: [
        { from: 'bottom', at: mm(250) },
        { from: 'front', at: mm(100) },
      ],
      diameter: mm(50),
    };
    const one = base({ customFeatures: [wasteHole] });
    expect(sectionSummary('cutouts', one, built(one))).toBe('1 cutout');
    const two = base({ customFeatures: [wasteHole, { ...wasteHole, id: 'cf-vent' }] });
    expect(sectionSummary('cutouts', two, built(two))).toBe('2 cutouts');
  });

  /*
   * Hardware is the one summary that reports what the cabinet *resolved to* rather than what
   * somebody overrode, because the runner system is the line that ends up on the Blum order.
   */
  it('names the hinge on a doored cabinet and the runner on a drawer bank', () => {
    const cabinet = base();
    const b = built(cabinet);
    expect(sectionSummary('hardware', cabinet, b)).toBe(b.hardware.hinge.name);

    const bank = createCabinet(
      { typeId: 'drawer-bank', name: 'D1', width: mm(600), height: mm(720), depth: mm(560), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    const bb = built(bank);
    expect(sectionSummary('hardware', bank, bb)).toBe(bb.hardware.runnerSystem.name);
  });

  it('says nothing about hardware on a cabinet with no fronts', () => {
    // A standalone panel has neither a door nor a drawer, and the fold is left out entirely —
    // an empty section with a heading and nothing under it is worse than no section.
    const panel = createCabinet(
      { typeId: 'panel', name: 'P1', width: mm(600), height: mm(720), depth: mm(18), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    expect(sectionSummary('hardware', panel, built(panel))).toBeNull();
  });
});
