/**
 * A corner radius on an ordinary cabinet — the two invariants, written before the builders.
 *
 * §5.0 asks for these two first, and for a reason: between them they pin both ends of the
 * range, so the judgement calls in the middle have something to fail against. Everything else
 * about a radiused corner was settled with the shop; these two are arithmetic.
 *
 * ## Invariant 1 — radius 0 is today's cabinet, untouched
 *
 * Every job already quoted was drawn without a corner radius. Setting one to zero, or naming
 * a corner and giving it no radius, has to produce the parts it produced yesterday: same
 * names, same sizes, same cabinet-space boxes, same banding, no arcs anywhere.
 *
 * Asserted two ways on purpose. Unset against explicit zero catches the option leaking into a
 * cabinet that never asked for it; the hand-calculated reference below catches a change that
 * moves both paths identically, which the first comparison would happily pass.
 *
 * Reference base cabinet, as in tests/baseCabinet.test.ts:
 * 900 W × 720 H × 560 D, 16mm carcass, 16mm applied back, 18mm doors, 150 kick, 100 rails.
 *
 *   side depth       560 − 16                 = 544
 *   interior width   900 − 2×16               = 868
 *   shelf            868 − 2 clearance        = 866   ×   544 − 10 setback = 534
 *   door             (900 − 2×1.5 − 3) ÷ 2    = 447   ×   720 − 3 = 717
 *
 * ## Invariant 2 — radius = width = depth is the quarter-round unit
 *
 * A corner radius grown until it equals both the width and the depth is not merely *like* the
 * enclosed radiused end — it is one. The arc centre lands on the back-left corner and what is
 * left is the quarter disc `radiusEnd.ts` already cuts. So the two have to agree, and the
 * figures below are the ones tests/radiusParts.test.ts pins for that unit today.
 *
 * A 560 quarter, 720 high, 16mm formers, two layers of 8mm bendy ply:
 *
 *   former radius   560 − 2×8                = 544
 *   skin layer 1    (544 + 4) × π/2          = 860.7964
 *   skin layer 2    (552 + 4) × π/2          = 873.3628
 *   difference      8 × π/2                  = 12.566371
 *
 * Three things have to fall to zero of their own accord for this to hold, and each is a
 * settled decision rather than a coincidence:
 *
 *   fixing strip    W − r = 0, so no flat front is left to fix the curved piece to
 *   side return     D − r = 0, so the wrap has no straight run back to the back
 *   end panel       its depth is the full depth less the radius, so it disappears
 *
 * If any one of them were unconditional — a 50mm strip that is always present, say — a
 * full-radius cabinet would come out as a quarter plus a tail, and would no longer be the
 * unit that already exists. That is the whole value of writing this one down first.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { createCabinet, createEmptyProject, resetIdCounter } from '../src/core/project/factory.ts';
import type { CabinetOptions, CabinetTypeId } from '../src/core/model/cabinet.ts';
import type { Project } from '../src/core/model/project.ts';
import { type Panel, panelArea, panelExtent } from '../src/core/model/panel.ts';
import { profileHasArcs } from '../src/core/geom/profile.ts';
import { byName, namesOf, occupies, size } from './helpers.ts';

const QUARTER = Math.PI / 2;

interface Built {
  readonly project: Project;
  readonly panels: readonly Panel[];
  readonly warnings: readonly string[];
}

const build = (
  typeId: CabinetTypeId,
  dims: { W: number; H: number; D: number },
  options: CabinetOptions,
): Built => {
  const project = createEmptyProject('Corner radius');
  const cabinet = createCabinet({
    typeId,
    name: 'X1',
    x: mm(0),
    width: mm(dims.W),
    height: mm(dims.H),
    depth: mm(dims.D),
    options,
  });
  const withCabinet: Project = { ...project, cabinets: [cabinet] };
  const built = buildCabinet(cabinet, withCabinet);
  return { project: withCabinet, panels: built.panels, warnings: built.warnings };
};

/**
 * Everything about a part that a job depends on, in one comparable value.
 *
 * Ids are left out because they are minted per build and would differ between two runs of the
 * same cabinet. Everything else is in — and in particular the cabinet-space box is, because
 * comparing sizes alone is exactly the comparison that passes when a part comes out the right
 * shape in the wrong quarter. That is the section 7 standard, and it is the failure this
 * whole feature is most likely to produce.
 */
const fingerprint = (b: Built) =>
  b.panels.map((p) => ({
    name: p.name,
    role: p.role,
    material: p.materialId,
    size: size(p),
    area: Math.round(panelArea(p) * 1e6) / 1e6,
    box: occupies(p, b.project),
    banding: p.edgeBanding,
    grain: p.grain,
    note: p.note ?? null,
    curved: profileHasArcs(p.profile),
    formed: p.forming ?? null,
  }));

const CARCASSES: readonly { typeId: CabinetTypeId; W: number; H: number; D: number }[] = [
  { typeId: 'base', W: 900, H: 720, D: 560 },
  { typeId: 'wall', W: 900, H: 720, D: 330 },
  { typeId: 'tall', W: 900, H: 2100, D: 560 },
];

beforeEach(() => resetIdCounter());

describe('invariant 1 — radius 0 is today’s cabinet, untouched', () => {
  for (const c of CARCASSES) {
    const dims = { W: c.W, H: c.H, D: c.D };

    it(`leaves a ${c.typeId} cabinet alone at radius zero`, () => {
      const square = build(c.typeId, dims, {});
      const zero = build(c.typeId, dims, {
        radiusCorner: 'front-right',
        carcassRadius: mm(0),
      });
      expect(fingerprint(zero)).toEqual(fingerprint(square));
      expect(zero.warnings).toEqual(square.warnings);
    });

    it(`leaves a ${c.typeId} cabinet alone when only the corner is named`, () => {
      // A corner with no radius on it is not a radius. Naming one has to do nothing at all,
      // or a half-filled form quietly reshapes a cabinet somebody has already priced.
      const square = build(c.typeId, dims, {});
      const named = build(c.typeId, dims, { radiusCorner: 'front-left' });
      expect(fingerprint(named)).toEqual(fingerprint(square));
    });
  }

  it('cuts the reference base cabinet exactly as it always did', () => {
    // Worked longhand in the header. Pinned as well as compared, so a change that moves the
    // square path and the radiused path identically still fails here.
    const { panels } = build('base', { W: 900, H: 720, D: 560 }, {});
    expect(namesOf(panels)).toEqual([
      'Side L',
      'Side R',
      'Bottom',
      'Top rail front',
      'Top rail back',
      'Back',
      'Shelf',
      'Door L',
      'Door R',
      'Kick',
    ]);
    expect(size(byName(panels, 'Side L'))).toEqual([mm(720), mm(544)]);
    expect(size(byName(panels, 'Side R'))).toEqual([mm(720), mm(544)]);
    expect(size(byName(panels, 'Bottom'))).toEqual([mm(868), mm(544)]);
    expect(size(byName(panels, 'Shelf'))).toEqual([mm(866), mm(534)]);
    expect(size(byName(panels, 'Door L'))).toEqual([mm(717), mm(447)]);
    expect(size(byName(panels, 'Kick'))).toEqual([mm(900), mm(150)]);
  });

  it('puts no curve anywhere in a cabinet that was not asked for one', () => {
    // Cheap, and it is the assertion that fails loudest if a radius ever defaults to
    // something other than none.
    for (const c of CARCASSES) {
      const { panels } = build(c.typeId, { W: c.W, H: c.H, D: c.D }, {});
      for (const p of panels) {
        expect(profileHasArcs(p.profile)).toBe(false);
        expect(p.forming).toBeUndefined();
      }
    }
  });
});

describe('invariant 2 — radius = width = depth is the quarter-round unit', () => {
  /** The unit that already exists, and the thing the other half has to reproduce. */
  const quarterRound = () => build('radius-end', { W: 560, H: 720, D: 560 }, {});

  it('pins what the quarter-round unit produces, since that is the target', () => {
    const { panels, warnings } = quarterRound();
    expect(warnings).toEqual([]);
    expect(namesOf(panels)).toEqual([
      'Former 1',
      'Former 2',
      'Former 3',
      'Former 4',
      'Skin layer 1',
      'Skin layer 2',
      'Kick',
    ]);
    // Cut under the skin, not to the finished radius: 560 less two 8mm layers.
    expect(size(byName(panels, 'Former 1'))).toEqual([mm(544), mm(544)]);
    expect(panelExtent(byName(panels, 'Skin layer 1')).length).toBeCloseTo(860.7964, 3);
    expect(panelExtent(byName(panels, 'Skin layer 2')).length).toBeCloseTo(873.3628, 3);
  });

  /*
   * The other half of the invariant, and the target the builders were written against.
   *
   * Was skipped until `radiusCorner` reached the part builders — a red test on main teaches
   * everyone to ignore red tests. Unskipped by the commit that made it pass.
   */
  it('reproduces the quarter-round unit from a base cabinet at radius = width = depth', () => {
    const target = quarterRound();
    const full = build(
      'base',
      { W: 560, H: 720, D: 560 },
      { radiusCorner: 'front-right', carcassRadius: mm(560) },
    );

    // The end panel and the doors have to go of their own accord — the end panel because its
    // depth is the full depth less the radius, the doors because the door zone is the width
    // less the radius less the fixing strip. Neither is special-cased at the limit.
    expect(namesOf(full.panels)).not.toContain('Side R');
    expect(namesOf(full.panels)).not.toContain('Door L');
    expect(namesOf(full.panels)).not.toContain('Door R');

    // Both skins are the quarter-round unit's, exactly: with no flat front to land on and no
    // straight run back to the back, the wrap is nothing but the quarter.
    for (const layer of ['Skin layer 1', 'Skin layer 2']) {
      expect(panelExtent(byName(full.panels, layer)).length).toBeCloseTo(
        panelExtent(byName(target.panels, layer)).length,
        6,
      );
    }
    // And the outer layer is still exactly one board thickness longer round the turn.
    expect(
      panelExtent(byName(full.panels, 'Skin layer 2')).length -
        panelExtent(byName(full.panels, 'Skin layer 1')).length,
    ).toBeCloseTo(8 * QUARTER, 5);

    // The bottom is doing a former's job by then, so it is cut to a former's shape.
    expect(size(byName(full.panels, 'Bottom'))).toEqual(size(byName(target.panels, 'Former 1')));
    expect(profileHasArcs(byName(full.panels, 'Bottom').profile)).toBe(true);
  });
});
