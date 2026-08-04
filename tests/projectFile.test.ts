/**
 * Getting a job out of the browser, and back in.
 *
 * ## Why this is worth a test file
 *
 * A job lives in one browser's local storage. It does not travel between machines, and clearing
 * browsing data takes it with no warning — so the file is the only copy of a room somebody spent a
 * day measuring. That makes reading a file back the highest-consequence path in the app that is not
 * the rule engine, and the one place where "it threw an exception" is not an acceptable outcome.
 *
 * The specific failure being guarded is not a corrupt file. It is **the wrong file**: a cutlist
 * CSV, a set of shop standards, last month's tax return, anything sitting in the same downloads
 * folder. A file that parses as JSON and carries a plausible `schemaVersion` walks straight through
 * `migrateProject`, because the last line of a migration chain is a cast — and then it is written
 * to local storage on the way in and takes the app down on the first render. That is the reload
 * loop `app/ErrorScreen.tsx` exists to escape, arriving through the front door.
 *
 * The round trip is asserted too, and it is the claim that matters most: what comes back out is the
 * job that went in, to the cent and to the millimetre.
 */

import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  migrateProject,
  projectFileProblem,
} from '../src/core/model/project.ts';
import { createSampleKitchen, resetIdCounter } from '../src/core/project/factory.ts';
import { buildProject } from '../src/core/rules/build.ts';
import { costProject } from '../src/core/costing/costing.ts';
import { AU_SHOP_STANDARDS } from '../src/core/standards/standards.ts';

/** What the app really does: `JSON.stringify` out, `JSON.parse` in. Nothing clever in between. */
const throughAFile = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('a file that is not a job', () => {
  it('is refused when it is not an object at all', () => {
    expect(projectFileProblem(null)).toContain('does not contain a job');
    expect(projectFileProblem('a string')).toContain('does not contain a job');
    expect(projectFileProblem([1, 2, 3])).not.toBeNull();
  });

  it('is refused when it carries a plausible version and nothing else', () => {
    /*
     * The dangerous one. `migrateProject` is happy with this — the version is current, so no
     * migration runs and the cast at the end hands back something typed `Project` with no cabinets
     * in it. Nothing downstream survives that.
     */
    const problem = projectFileProblem({ schemaVersion: CURRENT_SCHEMA_VERSION, name: 'Nice try' });
    expect(problem).not.toBeNull();
    expect(problem).toContain('cabinets');

    // And this is what it would otherwise have got away with.
    expect(() => migrateProject({ schemaVersion: CURRENT_SCHEMA_VERSION })).not.toThrow();
  });

  it('names what is missing, so somebody can tell which file they picked', () => {
    resetIdCounter();
    const job = throughAFile(createSampleKitchen(AU_SHOP_STANDARDS)) as Record<string, unknown>;
    const { cabinets: _c, room: _r, ...gutted } = job;
    const problem = projectFileProblem(gutted)!;
    expect(problem).toContain('cabinets');
    expect(problem).toContain('room');
    expect(problem).not.toContain('materials');
  });

  it('refuses a set of shop standards, which is the file most likely to be picked by mistake', () => {
    // Same folder, same .json, and it even has `constructions` and `materials` in it.
    expect(projectFileProblem(throughAFile(AU_SHOP_STANDARDS))).not.toBeNull();
  });
});

describe('a file that is a job', () => {
  it('is accepted', () => {
    resetIdCounter();
    expect(projectFileProblem(throughAFile(createSampleKitchen(AU_SHOP_STANDARDS)))).toBeNull();
  });

  it('comes back out as the same job — same parts, same price', () => {
    resetIdCounter();
    const original = createSampleKitchen(AU_SHOP_STANDARDS);
    const reopened = migrateProject(throughAFile(original));

    // The whole record, field for field. JSON drops `undefined`, which is why this is the round
    // trip rather than a hand-picked list of fields somebody has to remember to extend.
    expect(reopened).toEqual(throughAFile(original));

    // And the two things a shop would actually notice if it were not.
    expect(buildProject(reopened).length).toBe(buildProject(original).length);
    expect(costProject(reopened).totalIncGst).toBe(costProject(original).totalIncGst);
  });

  it('still refuses one saved by a newer build, rather than cutting it wrong', () => {
    resetIdCounter();
    const fromTheFuture = {
      ...(throughAFile(createSampleKitchen(AU_SHOP_STANDARDS)) as object),
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    };
    // Structurally a job — so the guard passes it, and the migration chain is what turns it away.
    expect(projectFileProblem(fromTheFuture)).toBeNull();
    expect(() => migrateProject(fromTheFuture)).toThrow(/newer version/);
  });
});
