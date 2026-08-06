/**
 * The Joinery tab's grouping — and the one assertion that stops a setting going missing.
 *
 * The tab was 26 settings in one list. Grouping them makes them findable; **it also makes them
 * losable**, and that is what this file is really for. `CONSTRUCTION_FIELDS` is flat, so a group
 * written as "the keys I remembered" drops the next setting somebody adds to the model: the field
 * would exist, be read by the rule engine, drift against the shop standards, and have nowhere on
 * screen to be edited.
 *
 * That is §4.15's fault in a new place — *"does this cabinet type support X?" answered by whether
 * somebody remembered to call a function*. So the mapping is asserted **total and disjoint**
 * against `ConstructionMethod` itself, taken from a real method rather than from a second list
 * that could drift alongside the first.
 *
 * `finishLaminate` is the proof that this was not hypothetical. It has been on the method and in
 * `labelForConstructionKey` since §4.23, and until this pass there was no control in the app to
 * change it — in either direction. v36's own migration comment promised one: *"a shop that veneers
 * or paints its curves still says so in one setting, and the carcass warning names the field"*.
 * There was no such setting, so a shop migrated to 1mm that does not laminate could not say so.
 */

import { describe, expect, it } from 'vitest';
import { FRAMELESS_32, type ConstructionMethod } from '../src/core/model/construction.ts';
import { labelForConstructionKey } from '../src/core/standards/standards.ts';
import {
  JOINERY_DEFAULT_OPEN,
  JOINERY_GROUPS,
  NOT_A_SETTING,
  driftedInGroup,
  groupOfKey,
  groupSummary,
  readOpenGroups,
} from '../src/app/panels/joineryGroups.ts';

const method = FRAMELESS_32;
const settingKeys = (Object.keys(method) as (keyof ConstructionMethod)[]).filter(
  (k) => !NOT_A_SETTING.includes(k),
);

describe('every setting has somewhere to be', () => {
  it('puts every settings key in exactly one group', () => {
    const missing = settingKeys.filter((k) => groupOfKey(k) === null);
    expect(missing, `ungrouped settings: ${missing.map(labelForConstructionKey).join(', ')}`).toEqual(
      [],
    );

    const seen = new Map<string, number>();
    for (const group of JOINERY_GROUPS) {
      for (const key of group.keys) seen.set(String(key), (seen.get(String(key)) ?? 0) + 1);
    }
    const twice = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    expect(twice, `settings in more than one group: ${twice.join(', ')}`).toEqual([]);
  });

  it('groups nothing that is not a setting', () => {
    // `id`, `name` and `family` identify the method rather than tune it — offering `family` as a
    // number would let somebody type a cabinet into a set of rules that does not build it.
    for (const key of NOT_A_SETTING) {
      expect(groupOfKey(key)).toBeNull();
    }
  });

  it('covers the whole method, so the count cannot drift quietly', () => {
    // Hand-worked: 33 keys on a construction method, less id, name and family, is 30 settings.
    // It was 27 until §4.27 added `cornerMethod` and the two routed-pocket figures — and this
    // assertion is what said so, which is the whole point of counting against the model.
    const grouped = JOINERY_GROUPS.flatMap((g) => g.keys).length;
    expect(settingKeys.length).toBe(30);
    expect(grouped).toBe(30);
  });

  it('gives finishLaminate a home, because v36 promised the shop a setting for it', () => {
    // The regression this guards is precise: v36 migrated every method to 1mm and told the shop
    // that a curve it veneers or paints "still says so in one setting". There was no setting.
    expect(groupOfKey('finishLaminate')).not.toBeNull();
  });
});

describe('what is open before anybody has an opinion', () => {
  it('opens the two a shop actually changes between jobs, and shuts the rest', () => {
    expect(JOINERY_DEFAULT_OPEN['joinery:carcass']).toBe(true);
    expect(JOINERY_DEFAULT_OPEN['joinery:kick']).toBe(true);
    expect(JOINERY_DEFAULT_OPEN['joinery:fronts']).toBe(false);
    expect(JOINERY_DEFAULT_OPEN['joinery:shelves']).toBe(false);
    expect(JOINERY_DEFAULT_OPEN['joinery:curves']).toBe(false);
    expect(JOINERY_DEFAULT_OPEN['joinery:appliedEnds']).toBe(false);
  });

  it('has a default for every group and a group for every default', () => {
    expect(Object.keys(JOINERY_DEFAULT_OPEN).sort()).toEqual(
      JOINERY_GROUPS.map((g) => g.id).sort(),
    );
  });

  it('applies a stored preference over the defaults and drops a stale id', () => {
    const read = readOpenGroups({ 'joinery:fronts': true, 'joinery:gone': true });
    expect(read['joinery:fronts']).toBe(true);
    expect(read['joinery:kick']).toBe(JOINERY_DEFAULT_OPEN['joinery:kick']);
    expect('joinery:gone' in read).toBe(false);
    expect(readOpenGroups(null)).toEqual(JOINERY_DEFAULT_OPEN);
  });
});

describe('a shut group still says how far this job has drifted', () => {
  const kick = JOINERY_GROUPS.find((g) => g.id === 'joinery:kick')!;

  it('says nothing when the job is in step with the standards', () => {
    expect(driftedInGroup(kick, method, method)).toBe(0);
    expect(groupSummary(kick, method, method)).toBeNull();
  });

  it('counts only the keys in its own group', () => {
    // A different kick height is in `joinery:kick`; a different top rail depth is not — it is in
    // `joinery:carcass`. A group that counted the whole method would badge all six.
    const job: ConstructionMethod = { ...method, kickHeight: 100, stretcherWidth: 120 };
    expect(driftedInGroup(kick, job, method)).toBe(1);
    expect(groupSummary(kick, job, method)).toBe('1 differs from standards');

    const carcass = JOINERY_GROUPS.find((g) => g.id === 'joinery:carcass')!;
    expect(driftedInGroup(carcass, job, method)).toBe(1);
  });

  it('says how many when more than one in a group has moved', () => {
    const job: ConstructionMethod = { ...method, kickHeight: 100, kickSetback: 60 };
    expect(groupSummary(kick, job, method)).toBe('2 differ from standards');
  });

  /*
   * A method the shop standards do not have at all.
   *
   * Counting every key as drifted would badge all six groups on a job whose only sin is using a
   * method the shop has not saved — and `differencesFromStandards` already reports that by name,
   * in one line, which is the honest place for it.
   */
  it('reports nothing per group when there is no standard to compare against', () => {
    const job: ConstructionMethod = { ...method, kickHeight: 100, kickSetback: 60 };
    expect(driftedInGroup(kick, job, undefined)).toBe(0);
    expect(groupSummary(kick, job, undefined)).toBeNull();
  });
});
