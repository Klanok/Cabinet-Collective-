/**
 * When an owned run unit no longer matches the cabinets under it.
 *
 * ## What is being asserted, and why it is not obvious
 *
 * A benchtop is **owned**: generated from a run once, then left exactly where its owner put it.
 * That is the bargain in `model/runUnit.ts` and none of it changes here. What changes is that the
 * app can now say when the bargain has come due — reported from the bench as *"the benchtop radius
 * does not work"*, which was a correct model being silent about a top that predated the curve under
 * it.
 *
 * The claim these tests exist to hold is narrower than "it spots a difference". It is:
 *
 * > **What it reports is exactly what pressing Regenerate would change, and nothing else.**
 *
 * That has two failing directions and both are tested. Reporting something the button will *not*
 * fix sends somebody hunting a fault that is not there — which is why `no-run` is its own kind, and
 * why an owner's own edits are silent. Reporting *nothing* when the button would change something
 * is the original bug arriving again.
 *
 * ## The reference kitchen, worked longhand
 *
 * Three 900mm base cabinets in a row from x = 0, all 560 deep, 720 high, on a 150 kick:
 *
 *     run length     900 + 900 + 900                       = 2700
 *     carcass depth  the deepest member                     =  560
 *     datum (top)    kick 150 + carcass 720                 =  870   ← where a benchtop lands
 *     datum (floor)  the underside of the carcasses         =  150   ← how high a plinth is
 *
 * Deleting the third cabinet takes the run to 1800, which is 900 shorter — the figure the length
 * message has to print. Moving the *first* one 300 along takes the run's start to 300 and its
 * length to 2400, so a top made over the old run is both 300 out of position and 300 too long.
 *
 * The corner figures come from §4.13: a radiused cabinet at the end of a run hands the top its own
 * radius exactly, because the arc is struck about the door plane and the standard 20mm front
 * overhang puts the top's edge on that same plane. So a 200mm radius on the cabinet is a 200mm
 * radius on the top — no arithmetic in between, which is what makes the assertion a plain equality.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import type { Project } from '../src/core/model/project.ts';
import type { Benchtop } from '../src/core/model/benchtop.ts';
import type { KickBase } from '../src/core/model/kickBase.ts';
import {
  generateBenchtops,
  generateKickBases,
  regenerateBenchtop,
  regenerateKickBase,
} from '../src/core/project/generate.ts';
import {
  benchtopOutOfStep,
  kickBaseOutOfStep,
  projectOutOfStep,
} from '../src/core/project/outOfStep.ts';
import { createCabinet, createEmptyProject, resetIdCounter } from '../src/core/project/factory.ts';

let project: Project;

const withCabinets = (...args: Parameters<typeof createCabinet>[0][]): Project => ({
  ...project,
  cabinets: args.map((a) => createCabinet(a, project.defaults, project.constructions)),
});

/** Three 900s in a row — the run every figure in the header is worked from. */
const threeBases = (): Project =>
  withCabinets(
    { typeId: 'base', name: 'B1', width: mm(900), x: mm(0) },
    { typeId: 'base', name: 'B2', width: mm(900), x: mm(900) },
    { typeId: 'base', name: 'B3', width: mm(900), x: mm(1800) },
  );

/** A job with one generated top over the three, ready to be knocked out of step. */
const withTop = (): { project: Project; top: Benchtop } => {
  const base = threeBases();
  const tops = generateBenchtops(base, base.materials.benchtops[0]!.id);
  expect(tops).toHaveLength(1);
  return { project: { ...base, benchtops: tops }, top: tops[0]! };
};

/** The same, with a ladder base under the three. */
const withPlinth = (): { project: Project; base: KickBase } => {
  const start = threeBases();
  const { kickBases, cabinets } = generateKickBases(start);
  expect(kickBases).toHaveLength(1);
  return { project: { ...start, cabinets, kickBases }, base: kickBases[0]! };
};

const kinds = (rows: readonly { kind: string }[]): string[] => rows.map((r) => r.kind);

beforeEach(() => {
  resetIdCounter();
  project = createEmptyProject('Out of step test');
});

/*
 * ── Silence is the default ────────────────────────────────────────────────────────────────────
 *
 * Half the value of an indicator is that it is off. One that lights up on a job nobody has touched
 * is one the shop learns to ignore, and then it is worth less than nothing.
 */

describe('a unit that is in step', () => {
  it('reports nothing at all, the moment it is generated', () => {
    const { project: job, top } = withTop();
    expect(benchtopOutOfStep(job, top)).toEqual([]);
  });

  it('reports nothing after it has been regenerated', () => {
    const { project: job, top } = withTop();
    const moved = {
      ...job,
      cabinets: job.cabinets.filter((c) => c.name !== 'B3'),
    };
    const put = regenerateBenchtop(moved, top);
    expect(benchtopOutOfStep({ ...moved, benchtops: [put] }, put)).toEqual([]);
  });

  it('stays silent about the owner’s own edits', () => {
    /*
     * The whole point of an owned unit. A 40mm overhang, a sink, a join and a renamed end are the
     * things somebody set deliberately, and `regenerated` carries every one of them across — so
     * none of them is a difference the button would close, and none of them may be reported.
     */
    const { project: job, top } = withTop();
    const edited: Benchtop = {
      ...top,
      name: 'Island',
      overhangs: { ...top.overhangs, left: mm(40), front: mm(60) },
      ends: { left: 'exposed', right: 'waterfall' },
      joins: [mm(1350)],
      cutouts: [
        {
          id: 'sink-1',
          kind: 'sink',
          along: mm(600),
          fromBack: mm(280),
          width: mm(820),
          depth: mm(450),
          cornerRadius: mm(10),
        },
      ],
    };
    expect(benchtopOutOfStep({ ...job, benchtops: [edited] }, edited)).toEqual([]);
  });

  it('says nothing about a job with no run units in it', () => {
    expect(projectOutOfStep(threeBases())).toEqual([]);
  });
});

/*
 * ── The differences that Regenerate closes ────────────────────────────────────────────────────
 */

describe('a top over cabinets that have changed', () => {
  it('reports the run getting shorter, with the figure in millimetres', () => {
    const { project: job, top } = withTop();
    // 2700 − 900 = 1800, so the top is 900 longer than its run.
    const shorter = { ...job, cabinets: job.cabinets.filter((c) => c.name !== 'B3') };
    const rows = benchtopOutOfStep(shorter, top);

    expect(kinds(rows)).toEqual(['length']);
    expect(rows[0]!.message).toContain('1800mm');
    expect(rows[0]!.message).toContain('900mm shorter');
    expect(rows[0]!.regenerateFixesIt).toBe(true);
  });

  it('reports the run getting longer', () => {
    const { project: job, top } = withTop();
    const longer = {
      ...job,
      cabinets: [
        ...job.cabinets,
        createCabinet(
          { typeId: 'base', name: 'B4', width: mm(600), x: mm(2700) },
          job.defaults,
          job.constructions,
        ),
      ],
    };
    // 2700 + 600 = 3300, so 600 longer.
    const rows = benchtopOutOfStep(longer, job.benchtops[0]!);
    expect(kinds(rows)).toEqual(['length']);
    expect(rows[0]!.message).toContain('3300mm');
    expect(rows[0]!.message).toContain('600mm longer');
    void top;
  });

  it('reports a run that has slid out from under it, and how far', () => {
    const { project: job, top } = withTop();
    /*
     * The whole run pushed 300 along the wall. One run still, same three cabinets, same length —
     * so this is position on its own, with nothing else to hide behind.
     */
    const slid = {
      ...job,
      cabinets: job.cabinets.map((c) => ({
        ...c,
        placement: {
          ...c.placement,
          anchor: { ...c.placement.anchor, x: mm(c.placement.anchor.x + 300) },
        },
      })),
    };
    const rows = benchtopOutOfStep(slid, top);
    expect(kinds(rows)).toEqual(['position']);
    expect(rows[0]!.message).toContain('300mm');
  });

  it('follows the run Regenerate would follow when one run becomes two', () => {
    const { project: job, top } = withTop();
    /*
     * Pull B1 back 300 and it stops touching B2, so the one run becomes two: B1 alone from
     * x = −300, and B2 + B3 from x = 900. The top came from all three, so it shares a cabinet with
     * both — and `runUnder` takes the first in the sorted order, which is the one at −300.
     *
     * **This asserts the existing behaviour of the button, not a preference of this module's.**
     * That is the point of the whole design: whatever Regenerate would do is what gets reported, so
     * the two can never tell the shop different stories. The top would be put over B1 alone — 300mm
     * back and 1800mm shorter — and both facts are reported.
     */
    const split = {
      ...job,
      cabinets: job.cabinets.map((c) =>
        c.name === 'B1'
          ? { ...c, placement: { ...c.placement, anchor: { ...c.placement.anchor, x: mm(-300) } } }
          : c,
      ),
    };
    const rows = benchtopOutOfStep(split, top);
    expect(kinds(rows).sort()).toEqual(['length', 'position']);
    expect(rows.find((r) => r.kind === 'position')!.message).toContain('300mm');
    expect(rows.find((r) => r.kind === 'length')!.message).toContain('1800mm shorter');

    // And the button really does that, which is what makes the report above true.
    const put = regenerateBenchtop(split, top);
    expect(put.length).toBe(900);
    expect(put.placement.anchor.x).toBe(-300);
  });

  it('reports the carcasses under it getting deeper', () => {
    const { project: job, top } = withTop();
    // The run takes the depth of its deepest member: 560 → 600.
    const deeper = {
      ...job,
      cabinets: job.cabinets.map((c) => (c.name === 'B2' ? { ...c, depth: mm(600) } : c)),
    };
    const rows = benchtopOutOfStep(deeper, top);
    expect(kinds(rows)).toEqual(['carcass-depth']);
    expect(rows[0]!.message).toContain('600mm deep');
    expect(rows[0]!.message).toContain('560mm');
  });
});

/*
 * ── The corner, which is what this was reported for ───────────────────────────────────────────
 */

describe('a corner radius appearing under a square top', () => {
  /** B3 at the right-hand end of the run, given a 200mm radius on its front-right corner. */
  const withRadiusedEnd = (job: Project): Project => ({
    ...job,
    cabinets: job.cabinets.map((c) =>
      c.name === 'B3'
        ? { ...c, options: { ...c.options, carcassRadius: mm(200), radiusCorner: 'front-right' } }
        : c,
    ),
  });

  it('is the exact bench report: the top is square, the cabinet is round, and the app says so', () => {
    const { project: job, top } = withTop();
    expect(top.corners.right).toBe(0);

    const rows = benchtopOutOfStep(withRadiusedEnd(job), top);

    expect(kinds(rows)).toEqual(['corners']);
    expect(rows[0]!.message).toContain('200mm');
    expect(rows[0]!.message).toContain('still square');
    expect(rows[0]!.regenerateFixesIt).toBe(true);
  });

  it('goes quiet again once the top has been regenerated — and the top really took the curve', () => {
    const { project: job, top } = withTop();
    const curved = withRadiusedEnd(job);
    const put = regenerateBenchtop(curved, top);

    // §4.13: the radius the top takes is the cabinet's own, exactly. Not an approximation.
    expect(put.corners.right).toBe(200);
    expect(benchtopOutOfStep({ ...curved, benchtops: [put] }, put)).toEqual([]);
  });

  it('reports the other direction too — a rounded top over a cabinet gone square', () => {
    const { project: job, top } = withTop();
    const curved = withRadiusedEnd(job);
    const put = regenerateBenchtop(curved, top);

    // Take the radius off the cabinet and the top is left with a curve nothing under it justifies.
    const rows = benchtopOutOfStep(job, put);
    expect(kinds(rows)).toEqual(['corners']);
    expect(rows[0]!.message).toContain('square now');
    expect(rows[0]!.message).toContain('200mm');
  });
});

/*
 * ── A plinth ─────────────────────────────────────────────────────────────────────────────────
 */

describe('a ladder base under cabinets that have moved', () => {
  it('reports the cabinets standing at a different height', () => {
    const { project: job, base } = withPlinth();
    // Generated at the kick height: the underside of the carcasses, 150 off the floor.
    expect(base.height).toBe(150);

    const lifted = {
      ...job,
      cabinets: job.cabinets.map((c) => ({
        ...c,
        placement: { ...c.placement, anchor: { ...c.placement.anchor, y: mm(170) } },
      })),
    };
    const rows = kickBaseOutOfStep(lifted, base);
    expect(kinds(rows)).toEqual(['height']);
    expect(rows[0]!.message).toContain('170mm off the floor');
    expect(rows[0]!.message).toContain('150mm high');
  });

  it('stays silent about a depth the owner pulled back', () => {
    /*
     * `regenerateKickBase` carries `height` across from the run and leaves `depth` alone, because
     * the height is not a choice and the depth is — somebody may well have pulled the frame back to
     * clear a skirting. So a changed depth is an edit, not a fault, and must not be reported.
     */
    const { project: job, base } = withPlinth();
    const pulledBack = { ...base, depth: mm(400) };
    expect(kickBaseOutOfStep({ ...job, kickBases: [pulledBack] }, pulledBack)).toEqual([]);
  });
});

/*
 * ── The button that would do nothing ─────────────────────────────────────────────────────────
 *
 * §2's scar tissue: a control that silently does nothing is the worst failure available. Pointing
 * somebody at Regenerate when Regenerate cannot help is the same failure wearing a label.
 */

describe('a unit whose run has gone', () => {
  it('says so as its own thing, and says the button will not fix it', () => {
    const { project: job, top } = withTop();
    const emptied = { ...job, cabinets: [] };

    const rows = benchtopOutOfStep(emptied, top);
    expect(kinds(rows)).toEqual(['no-run']);
    expect(rows[0]!.regenerateFixesIt).toBe(false);
    expect(rows[0]!.message).toContain('will not move it');
  });

  it('is telling the truth — regenerating really does change nothing', () => {
    const { project: job, top } = withTop();
    const emptied = { ...job, cabinets: [] };
    expect(regenerateBenchtop(emptied, top)).toEqual(top);
  });

  it('does the same for a plinth', () => {
    const { project: job, base } = withPlinth();
    const emptied = { ...job, cabinets: [] };

    expect(kinds(kickBaseOutOfStep(emptied, base))).toEqual(['no-run']);
    expect(regenerateKickBase(emptied, base)).toEqual(base);
  });

  it('reports it once the survivors no longer meet, not only when they are all deleted', () => {
    const { project: job, top } = withTop();
    /*
     * B1 and B3 left, with a 900 hole where B2 was. Neither survivor touches the other, so there is
     * no run — but `fromCabinetIds` still names cabinets that exist, which is the case a
     * "have they all been deleted?" check would wave through.
     *
     * Two 900mm runs now exist and `runUnder` finds the first one that shares a cabinet, so this is
     * genuinely regenerable rather than orphaned: the top gets put over B1 alone. What matters is
     * that the app reports *something* — the top is 2700 over a run of 900.
     */
    const holed = { ...job, cabinets: job.cabinets.filter((c) => c.name !== 'B2') };
    const rows = benchtopOutOfStep(holed, top);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.regenerateFixesIt)).toBe(true);
    expect(kinds(rows)).toContain('length');
  });
});

/*
 * ── The whole job ────────────────────────────────────────────────────────────────────────────
 */

describe('across a whole job', () => {
  it('gathers tops and frames together, tops first', () => {
    const start = threeBases();
    const { kickBases, cabinets } = generateKickBases(start);
    const withBoth = { ...start, cabinets, kickBases };
    const tops = generateBenchtops(withBoth, withBoth.materials.benchtops[0]!.id);
    const job = { ...withBoth, benchtops: tops };

    // One edit that knocks both out of step at once: delete the end cabinet.
    const shorter = { ...job, cabinets: job.cabinets.filter((c) => c.name !== 'B3') };
    const rows = projectOutOfStep(shorter);

    expect(rows.map((r) => r.unitKind)).toEqual(['benchtop', 'kick-base']);
    expect(kinds(rows)).toEqual(['length', 'length']);
    expect(rows[0]!.unitName).toBe(tops[0]!.name);
    expect(rows[1]!.unitName).toBe(kickBases[0]!.name);
  });

  it('names the unit in every message, so a report reads without the surrounding UI', () => {
    const { project: job, top } = withTop();
    const shorter = { ...job, cabinets: job.cabinets.filter((c) => c.name !== 'B3') };
    for (const row of projectOutOfStep({ ...shorter, benchtops: [top] })) {
      expect(row.message).toContain(top.name);
      expect(row.message.endsWith('.')).toBe(true);
    }
  });
});
