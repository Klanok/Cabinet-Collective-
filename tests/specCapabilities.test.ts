/**
 * What each spec says it builds — §5.11.
 *
 * ## The bug this replaces
 *
 * `cornerRadiusProblems` decided whether a cabinet could take a rounded corner by asking
 * `['base', 'wall', 'tall'].includes(typeId)`. The banquette was rebuilt in §5.4 with
 * `carcassCornerFormers` and `wrapLayers` among its part rules and the Inspector was given the
 * radius control for it — and this list was not touched, so the app cut the formers, cut the
 * wrap, and told the user *"A rounded corner is only built on base, wall and tall cabinets"*.
 * Green suite, correct parts, wrong sentence.
 *
 * A list of type ids kept away from the specs is a second opinion about what a spec does, and it
 * is the one that goes stale, because adding a part rule and updating a list somewhere else are
 * two separate edits and only the first one is needed to make the cabinet come out right.
 *
 * ## What replaces it
 *
 * `CabinetSpec.capabilities`, required, one field per capability, and each field is either `true`
 * or **the reason in plain terms**. That shape is the point: a boolean lets a spec say no and
 * leaves somebody else to invent the sentence, which is exactly how one spec's reason — an
 * appliance space's *"a gap in the run rather than a cabinet"* — ended up written in a shared
 * builder and applied to everything that might ever refuse.
 *
 * So these tests assert three things and none of them is a count:
 *
 * - every registered spec answers every capability, with a sentence when it says no;
 * - a spec that produces the parts says `true`, checked by **building a cabinet and looking for
 *   the parts** rather than by trusting the declaration;
 * - a spec that says no produces a warning that is its own sentence, not a generic one.
 */

import { describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { createCabinet, createEmptyProject } from '../src/core/project/factory.ts';
import { CABINET_SPECS, allSpecs } from '../src/core/rules/registry.ts';
import { refusalOf } from '../src/core/rules/spec.ts';
import type { CabinetOptions, CabinetTypeId } from '../src/core/model/cabinet.ts';

const CAPABILITIES = ['cornerRadius', 'appliedEnds'] as const;

/** A cabinet of a given type, built at a size every type can be. */
const build = (typeId: CabinetTypeId, options: CabinetOptions) => {
  const project = createEmptyProject('Capabilities');
  const cabinet = createCabinet(
    { typeId, name: 'C1', x: mm(0), width: mm(900), height: mm(720), depth: mm(560), options },
    project.defaults,
    project.constructions,
  );
  const withCabinet = { ...project, cabinets: [cabinet] };
  return buildCabinet(cabinet, withCabinet);
};

describe('every spec answers for itself', () => {
  it('declares every capability — there is no default and no "assume yes"', () => {
    for (const spec of allSpecs()) {
      for (const capability of CAPABILITIES) {
        const value = spec.capabilities[capability];
        expect(
          value === true || (typeof value === 'string' && value.length > 0),
          `${spec.typeId}.${capability}`,
        ).toBe(true);
      }
    }
  });

  it('gives a reason worth reading whenever it refuses', () => {
    // Not a length check for its own sake: the whole reason a capability is `true | string` and
    // not a boolean is that the refusal has to be a sentence somebody can act on. A refusal that
    // reads "not supported" would pass a boolean and fail a person.
    for (const spec of allSpecs()) {
      for (const capability of CAPABILITIES) {
        const refusal = refusalOf(spec.capabilities[capability]);
        if (refusal === null) continue;
        expect(refusal.length, `${spec.typeId}.${capability}`).toBeGreaterThan(40);
        // It names what to do instead, or what the unit already is. Every shipped refusal does.
        expect(refusal, `${spec.typeId}.${capability}`).toMatch(/\.$/);
      }
    }
  });
});

describe('the declaration matches what the spec actually produces', () => {
  /*
   * The half that makes the declaration worth having. A spec could claim `cornerRadius: true`
   * and cut nothing; these build a real cabinet and look for the parts, so the claim is checked
   * against the rule engine rather than against itself.
   */
  const RADIUS: CabinetOptions = { radiusCorner: 'front-right', carcassRadius: mm(200) };

  it('cuts formers and a wrap on every type that claims a corner radius', () => {
    for (const [typeId, spec] of Object.entries(CABINET_SPECS)) {
      if (spec.capabilities.cornerRadius !== true) continue;
      const built = build(typeId as CabinetTypeId, RADIUS);
      expect(built.panels.some((p) => p.role === 'skin'), typeId).toBe(true);
      expect(built.panels.some((p) => p.role === 'former'), typeId).toBe(true);
      // Nothing said about the corner. Other warnings are allowed through — a 560-deep wall
      // cabinet is told it will foul the benchtop, which is true and is not this test's business.
      expect(built.warnings.filter((w) => /rounded corner|radius/i.test(w)), typeId).toEqual([]);
    }
  });

  it('cuts an end panel on every type that claims applied ends', () => {
    for (const [typeId, spec] of Object.entries(CABINET_SPECS)) {
      if (spec.capabilities.appliedEnds !== true) continue;
      const built = build(typeId as CabinetTypeId, { appliedEnds: ['left'] });
      expect(built.panels.some((p) => p.role === 'end-panel'), typeId).toBe(true);
    }
  });

  it('says why, in the spec’s own words, on every type that refuses', () => {
    for (const [typeId, spec] of Object.entries(CABINET_SPECS)) {
      const radiusRefusal = refusalOf(spec.capabilities.cornerRadius);
      if (radiusRefusal !== null) {
        expect(build(typeId as CabinetTypeId, RADIUS).warnings, typeId).toContain(radiusRefusal);
      }
      const endRefusal = refusalOf(spec.capabilities.appliedEnds);
      if (endRefusal !== null) {
        expect(
          build(typeId as CabinetTypeId, { appliedEnds: ['left'] }).warnings,
          typeId,
        ).toContain(endRefusal);
      }
    }
  });

  it('stays quiet on a type that refuses but was never asked', () => {
    // A capability nobody used says nothing at all — the property that lets this run over every
    // cabinet in every job without filling the warnings pane.
    for (const typeId of Object.keys(CABINET_SPECS) as CabinetTypeId[]) {
      const built = build(typeId, {});
      expect(built.warnings.filter((w) => /rounded corner|applied|apply a panel/.test(w)), typeId)
        .toEqual([]);
    }
  });
});

describe('the stale sentence is gone', () => {
  it('no longer tells a banquette that only base, wall and tall can be rounded', () => {
    const built = build('banquette', { radiusCorner: 'front-right', carcassRadius: mm(200) });
    expect(built.warnings.join(' ')).not.toContain('only built on base, wall and tall');
  });

  it('and the sentence exists nowhere in the specs, on any type', () => {
    for (const typeId of Object.keys(CABINET_SPECS) as CabinetTypeId[]) {
      const built = build(typeId, { radiusCorner: 'front-right', carcassRadius: mm(200) });
      expect(built.warnings.join(' '), typeId).not.toContain('base, wall and tall');
    }
  });
});
