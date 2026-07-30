/**
 * Door styles — routed fronts as machining, not as geometry.
 *
 * A shaker door is the *same rectangle* a plain slab door already is. What differs is what is
 * cut into its face. So every figure below is checked twice over: the part still measures what
 * a slab door measured, and the machining lands where it would be set out by hand.
 *
 * Reference fronts, both from the sample kitchen, on the shipped Frameless 32mm method
 * (revealTop 3, revealBottom 0, revealSides 1.5, gaps 3) and 18mm door board:
 *
 *   B1 sink base, 900 × 720, a pair of doors
 *     door height   720 − 3 − 0            = 717
 *     door width    (900 − 2×1.5 − 3) / 2  = 447
 *     part space     length 717 × width 447   (a door's length runs *up* it)
 *
 *   D1 pot drawers, 600 × 720, three drawers
 *     front width   600 − 2×1.5            = 597
 *     opening       720 − 3 − 0            = 717
 *     three fronts  (717 − 2×3) / 3        = 237 each
 *     part space     length 597 × width 237   (a drawer front's length runs *across* it)
 *
 * Shaker 57 on those two, border 57 all round, recess 6mm deep:
 *
 *   door          recess corners (57,57) to (717−57, 447−57) = (660, 390)
 *                 clear centre  717 − 114 = 603  by  447 − 114 = 333
 *   drawer front  recess corners (57,57) to (597−57, 237−57) = (540, 180)
 *                 clear centre  597 − 114 = 483  by  237 − 114 = 123
 *
 * V-groove 100 on the same two, 90° vee, 4mm deep — grooves run vertically on the *hung*
 * front, which is a different part-space axis on a door than on a drawer front:
 *
 *   door          spaced across the 447 width: round(447/100) = 4 bays
 *                 grooves at 111.75, 223.5, 335.25, each running the full 717 length
 *   drawer front  spaced across the 597 length: round(597/100) = 6 bays
 *                 grooves at 99.5, 199, 298.5, 398, 497.5, each running the full 237 width
 *
 *   a 90° vee 4mm deep opens to 2 × 4 × tan45 = 8mm wide
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import {
  CURRENT_SCHEMA_VERSION,
  type Project,
  migrateProject,
} from '../src/core/model/project.ts';
import { type PocketFeature, type ProfiledCutFeature, cutWidthAtDepth } from '../src/core/model/feature.ts';
import { findTool } from '../src/core/library/tools.ts';
import { buildCabinet, buildProject } from '../src/core/rules/build.ts';
import { buildCutlist } from '../src/core/cutlist/cutlist.ts';
import { costProject } from '../src/core/costing/costing.ts';
import {
  PLAIN_SLAB_STYLE,
  newDoorStyle,
  removeDoorStyle,
  resolveDoorStyle,
  upsertDoorStyle,
} from '../src/core/standards/doorStyles.ts';
import { styleFront } from '../src/core/rules/frontStyle.ts';
import {
  createEmptyProject,
  createSampleKitchen,
  resetIdCounter,
} from '../src/core/project/factory.ts';
import {
  AU_SHOP_STANDARDS,
  CURRENT_STANDARDS_VERSION,
  differencesFromStandards,
  matchesStandards,
  migrateStandards,
} from '../src/core/standards/standards.ts';
import { byName, size } from './helpers.ts';

let slabJob: Project;

/** The same job, with every front machined to the named style. */
const styled = (p: Project, styleId: string): Project => ({
  ...p,
  defaults: { ...p.defaults, doorStyleId: styleId },
});

const panelsOf = (p: Project, cabinetName: string) => {
  const cabinet = p.cabinets.find((c) => c.name.startsWith(cabinetName));
  if (!cabinet) throw new Error(`No cabinet ${cabinetName}`);
  return buildCabinet(cabinet, p);
};

const pocketOn = (panel: { features: readonly { kind: string }[] }): PocketFeature => {
  const found = panel.features.find((f) => f.kind === 'pocket');
  if (!found) throw new Error('No pocket on this panel');
  return found as PocketFeature;
};

/**
 * Just the machining a door *style* put on a panel.
 *
 * Phase 2 puts hinge cups and system holes on the same panels, so "what did the style do?" and
 * "what features has this panel got?" are no longer the same question. Every assertion about a
 * style asks the first one.
 */
const styleFeatures = (panel: { features: readonly { purpose: string }[] }) =>
  panel.features.filter((f) => f.purpose === 'front-style');

const groovesOn = (panel: { features: readonly { kind: string }[] }): ProfiledCutFeature[] =>
  panel.features.filter((f) => f.kind === 'profiled-cut') as ProfiledCutFeature[];

beforeEach(() => {
  resetIdCounter();
  slabJob = createSampleKitchen();
});

describe('a style changes machining and nothing else', () => {
  it('leaves the sample kitchen exactly as it was, because it ships on a plain slab', () => {
    expect(slabJob.defaults.doorStyleId).toBe(PLAIN_SLAB_STYLE.id);
    const door = byName(panelsOf(slabJob, 'B1').panels, 'Door L');
    // Nothing the *style* put there. The door does carry hinge boring — it is a door — so this
    // asks the question it means rather than "has no features at all", which stopped being the
    // same question the moment hardware rules existed.
    expect(styleFeatures(door)).toEqual([]);
  });

  it('cuts a shaker door to the same size as a slab door', () => {
    const slab = byName(panelsOf(slabJob, 'B1').panels, 'Door L');
    const shaker = byName(panelsOf(styled(slabJob, 'shaker-57'), 'B1').panels, 'Door L');

    expect(size(slab)).toEqual([mm(717), mm(447)]);
    expect(size(shaker)).toEqual(size(slab));
    expect(shaker.placement).toEqual(slab.placement);
    expect(shaker.edgeBanding).toEqual(slab.edgeBanding);
    expect(shaker.materialId).toEqual(slab.materialId);
  });

  it('does not change the cutlist part count — a shaker door is still one line', () => {
    const slabLines = buildCutlist(slabJob);
    const shakerLines = buildCutlist(styled(slabJob, 'shaker-57'));

    const partsOf = (lines: readonly { quantity: number }[]) =>
      lines.reduce((s, l) => s + l.quantity, 0);
    expect(partsOf(shakerLines)).toBe(partsOf(slabLines));
    expect(shakerLines.length).toBe(slabLines.length);
  });
});

describe('shaker recess', () => {
  it('insets the recess by the border on all four edges of a door', () => {
    const door = byName(panelsOf(styled(slabJob, 'shaker-57'), 'B1').panels, 'Door L');
    const pocket = pocketOn(door);

    // Part space, counter-clockwise from the bottom-left: 57 in from each edge of 717 × 447.
    expect(pocket.outline).toEqual([
      { x: 57, y: 57 },
      { x: 660, y: 57 },
      { x: 660, y: 390 },
      { x: 57, y: 390 },
    ]);
    expect(pocket.depth).toBe(mm(6));
    expect(pocket.cornerRadius).toBe(mm(3));
  });

  it('machines the show face, so the door is not routed from behind', () => {
    const door = byName(panelsOf(styled(slabJob, 'shaker-57'), 'B1').panels, 'Door L');
    expect(pocketOn(door).face).toBe('A');
  });

  it('gives the drawer fronts the same border as the doors', () => {
    const fronts = panelsOf(styled(slabJob, 'shaker-57'), 'D1').panels;
    const front = byName(fronts, 'Drawer front 1');

    expect(size(front)).toEqual([mm(597), mm(237)]);
    expect(pocketOn(front).outline).toEqual([
      { x: 57, y: 57 },
      { x: 540, y: 57 },
      { x: 540, y: 180 },
      { x: 57, y: 180 },
    ]);
  });

  it('routes every front in the bank, not just the first', () => {
    const fronts = panelsOf(styled(slabJob, 'shaker-57'), 'D1').panels.filter(
      (p) => p.role === 'drawer-front',
    );
    expect(fronts).toHaveLength(3);
    expect(fronts.every((f) => styleFeatures(f).length === 1)).toBe(true);
  });

  it('leaves the carcass alone — a style is for fronts', () => {
    const built = panelsOf(styled(slabJob, 'shaker-57'), 'B1');
    const carcass = built.panels.filter((p) => p.role !== 'door');
    expect(carcass.every((p) => styleFeatures(p).length === 0)).toBe(true);
  });
});

describe('a front too small for the style', () => {
  /**
   * A 720-tall door and a 140-tall drawer front take the same border, and on the drawer front
   * that leaves 140 − 2×57 = 26mm of centre. Machining it would be a rebate through the whole
   * part, so it comes out a plain slab and says so.
   */
  const mixedBank = (p: Project): Project => ({
    ...p,
    defaults: { ...p.defaults, doorStyleId: 'shaker-57' },
    cabinets: p.cabinets.map((c) =>
      c.name.startsWith('D1')
        ? { ...c, options: { ...c.options, drawerFrontHeights: [mm(300), mm(140)] } }
        : c,
    ),
  });

  it('routes the front that has room and leaves the one that does not', () => {
    const built = panelsOf(mixedBank(slabJob), 'D1');
    const tall = byName(built.panels, 'Drawer front 1');
    const narrow = byName(built.panels, 'Drawer front 2');

    expect(size(tall)).toEqual([mm(597), mm(300)]);
    expect(styleFeatures(tall)).toHaveLength(1);

    expect(size(narrow)).toEqual([mm(597), mm(140)]);
    expect(styleFeatures(narrow)).toEqual([]);
  });

  it('says why, rather than quietly shipping a plain front on a shaker kitchen', () => {
    const built = panelsOf(mixedBank(slabJob), 'D1');
    const warning = built.warnings.find((w) => w.includes('minimum'));
    expect(warning).toBeDefined();
    expect(warning).toContain('26mm of centre');
    expect(warning).toContain('plain slab');
  });

  it('reports one warning for a bank of identical fronts, not one per front', () => {
    const built = panelsOf(styled(slabJob, 'shaker-57'), 'D1');
    // All three fronts are 237 tall and all clear the minimum, so nothing to report at all.
    expect(built.warnings.filter((w) => w.includes('minimum'))).toHaveLength(0);

    const narrowBank: Project = {
      ...styled(slabJob, 'shaker-57'),
      cabinets: slabJob.cabinets.map((c) =>
        c.name.startsWith('D1') ? { ...c, options: { ...c.options, drawerCount: 5 } } : c,
      ),
    };
    const built5 = panelsOf(narrowBank, 'D1');
    expect(built5.panels.filter((p) => p.role === 'drawer-front')).toHaveLength(5);
    expect(built5.warnings.filter((w) => w.includes('minimum'))).toHaveLength(1);
  });

  it('refuses a recess deeper than the board, which would cut clean through', () => {
    const tooDeep = newDoorStyle('shaker', 'Deep');
    const result = styleFront(
      { ...tooDeep, recessDepth: mm(18) },
      { length: mm(717), width: mm(447), thickness: mm(18), upright: 'length' },
    );
    expect(result.features).toEqual([]);
    expect(result.warnings[0]).toContain('straight through');
  });
});

describe('V-grooves run vertically on the hung front', () => {
  it('spaces them across a door, running the full height', () => {
    const door = byName(panelsOf(styled(slabJob, 'v-groove-100'), 'B1').panels, 'Door L');
    const grooves = groovesOn(door);

    // 447mm of width divides into 4 bays nearest 100mm, so 3 grooves.
    expect(grooves).toHaveLength(3);
    expect(grooves.map((g) => g.path[1]!.y)).toEqual([111.75, 223.5, 335.25]);
    // Each runs the full 717mm length of the door.
    expect(grooves[0]!.path[0]).toEqual({ x: 0, y: 111.75 });
    expect(grooves[0]!.path[1]).toEqual({ x: 717, y: 111.75 });
  });

  it('turns them onto the other part-space axis for a drawer front', () => {
    const front = byName(panelsOf(styled(slabJob, 'v-groove-100'), 'D1').panels, 'Drawer front 1');
    const grooves = groovesOn(front);

    // A drawer front's length runs across it, so a vertical groove is a line of constant X.
    expect(grooves).toHaveLength(5);
    expect(grooves.map((g) => g.path[0]!.x)).toEqual([99.5, 199, 298.5, 398, 497.5]);
    expect(grooves[0]!.path[0]).toEqual({ x: 99.5, y: 0 });
    expect(grooves[0]!.path[1]).toEqual({ x: 99.5, y: 237 });
  });

  it('takes its width from the cutter, because a vee has no width of its own', () => {
    const door = byName(panelsOf(styled(slabJob, 'v-groove-100'), 'B1').panels, 'Door L');
    const groove = groovesOn(door)[0]!;
    expect(groove.depth).toBe(mm(4));
    // 90° vee, 4mm deep: 2 × 4 × tan(45°).
    expect(cutWidthAtDepth(findTool(groove.toolId), groove.depth)).toBeCloseTo(8, 9);
  });

  it('measures a straight cutter by its diameter and a round nose by its radius', () => {
    expect(cutWidthAtDepth(findTool('straight-12'), mm(6))).toBe(12);
    // A 6mm round nose is 3mm radius: past 3mm deep it is a plain cylinder, 6mm wide.
    expect(cutWidthAtDepth(findTool('round-6'), mm(3))).toBeCloseTo(6, 9);
    expect(cutWidthAtDepth(findTool('round-6'), mm(10))).toBeCloseTo(6, 9);
  });
});

describe('choosing a style', () => {
  it('takes the job default when a cabinet says nothing', () => {
    const built = panelsOf(styled(slabJob, 'shaker-57'), 'B1');
    expect(built.doorStyle.id).toBe('shaker-57');
  });

  it('lets one cabinet be a plain slab in a shaker kitchen', () => {
    const shakerJob = styled(slabJob, 'shaker-57');
    const withOverride: Project = {
      ...shakerJob,
      cabinets: shakerJob.cabinets.map((c) =>
        c.name.startsWith('B2') ? { ...c, doorStyleId: 'slab' } : c,
      ),
    };

    expect(styleFeatures(byName(panelsOf(withOverride, 'B1').panels, 'Door L'))).toHaveLength(1);
    expect(styleFeatures(byName(panelsOf(withOverride, 'B2').panels, 'Door'))).toEqual([]);
  });

  it('falls back to a plain slab when a style has been deleted out from under a cabinet', () => {
    const styles = removeDoorStyle(slabJob.doorStyles, 'shaker-57');
    expect(resolveDoorStyle(styles, 'shaker-57', 'slab').id).toBe('slab');
  });

  it('will not delete the plain slab, because it is what everything falls back to', () => {
    const after = removeDoorStyle(slabJob.doorStyles, PLAIN_SLAB_STYLE.id);
    expect(after.find((s) => s.id === PLAIN_SLAB_STYLE.id)).toBeDefined();
  });

  it('replaces a style saved over the same name rather than accumulating near-copies', () => {
    const first = { ...newDoorStyle('shaker', 'House shaker'), borderWidth: mm(57) };
    const second = { ...newDoorStyle('shaker', 'House shaker'), borderWidth: mm(60) };
    const list = upsertDoorStyle(upsertDoorStyle([], first), second);
    expect(list).toHaveLength(1);
    expect(list[0]!.borderWidth).toBe(mm(60));
  });
});

describe('costing the machine time', () => {
  it('charges nothing extra for plain slabs', () => {
    const cost = costProject(slabJob);
    expect(cost.machinedFrontCount).toBe(0);
    expect(cost.machiningMinutes).toBe(0);
    expect(cost.machiningCost).toBe(0);
  });

  it('charges the style allowance on every front that came out routed', () => {
    const shakerJob = styled(slabJob, 'shaker-57');
    const cost = costProject(shakerJob);

    // Sample kitchen fronts: B1 pair, D1 three drawers, B2 single, B3 pair, B4 single, W1 pair,
    // W2 single, W3 pair = 14, all big enough to take the style. The dishwasher space has none —
    // an appliance door is the appliance's, not this job's.
    const fronts = buildProject(shakerJob)
      .flatMap((b) => b.panels)
      .filter((p) => p.role === 'door' || p.role === 'drawer-front');
    expect(fronts).toHaveLength(14);
    expect(cost.machinedFrontCount).toBe(14);
    expect(cost.machiningMinutes).toBe(84);

    // 14 fronts × 6 min = 84 min at the $85/h shop rate = $119.00.
    expect(cost.machiningCost).toBe(11900);
  });

  it('does not charge for a front that fell back to a slab', () => {
    const job: Project = {
      ...styled(slabJob, 'shaker-57'),
      cabinets: slabJob.cabinets.map((c) =>
        c.name.startsWith('D1')
          ? { ...c, options: { ...c.options, drawerFrontHeights: [mm(300), mm(140)] } }
          : c,
      ),
    };
    const cost = costProject(job);
    const fronts = buildProject(job)
      .flatMap((b) => b.panels)
      .filter((p) => p.role === 'door' || p.role === 'drawer-front');

    // One of the two drawer fronts is too narrow to route.
    expect(cost.machinedFrontCount).toBe(fronts.length - 1);
  });

  it('keeps router time out of the install estimate that mirrors shop hours', () => {
    const slabCost = costProject(slabJob);
    const shakerCost = costProject(styled(slabJob, 'shaker-57'));

    expect(shakerCost.installHours).toBe(slabCost.installHours);
    expect(shakerCost.labourMinutes).toBe(slabCost.labourMinutes);
    // But the job as a whole does cost more.
    expect(shakerCost.totalCost).toBe(slabCost.totalCost + shakerCost.machiningCost);
  });
});

describe('migration', () => {
  /** A job saved before door styles existed. */
  const asV5 = (p: Project): Record<string, unknown> => {
    const { doorStyles, defaults, ...rest } = p;
    void doorStyles;
    const { doorStyleId, ...restDefaults } = defaults;
    void doorStyleId;
    return { ...rest, schemaVersion: 5, defaults: restDefaults };
  };

  it('gives an older job the shipped styles and a plain slab default', () => {
    const migrated = migrateProject(asV5(slabJob));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.defaults.doorStyleId).toBe(PLAIN_SLAB_STYLE.id);
    expect(migrated.doorStyles.find((s) => s.id === 'shaker-57')).toBeDefined();
  });

  it('moves no part — a migrated job cuts exactly as it did', () => {
    const before = buildCutlist(slabJob);
    const after = buildCutlist(migrateProject(asV5(slabJob)));
    expect(after).toEqual(before);
  });

  it('re-prices nothing', () => {
    expect(costProject(migrateProject(asV5(slabJob))).totalIncGst).toBe(
      costProject(slabJob).totalIncGst,
    );
  });

  it('refuses a job saved by a newer build rather than cutting it as slabs', () => {
    expect(() => migrateProject({ ...asV5(slabJob), schemaVersion: 99 })).toThrow(/newer version/);
  });

  it('keeps a shop’s own styles rather than replacing them with the shipped ones', () => {
    const mine = newDoorStyle('shaker', 'My shaker');
    const migrated = migrateProject({ ...asV5(slabJob), doorStyles: [PLAIN_SLAB_STYLE, mine] });
    expect(migrated.doorStyles.map((s) => s.name)).toEqual(['Plain slab', 'My shaker']);
  });

  it('carries a shop’s standards forward instead of throwing them away', () => {
    const { doorStyles, defaults, ...rest } = AU_SHOP_STANDARDS;
    void doorStyles;
    const { doorStyleId, ...restDefaults } = defaults;
    void doorStyleId;
    const v2 = { ...rest, version: 2, defaults: restDefaults, savedTypes: [] };

    const migrated = migrateStandards(v2);
    expect(migrated.version).toBe(CURRENT_STANDARDS_VERSION);
    expect(migrated.defaults.doorStyleId).toBe(PLAIN_SLAB_STYLE.id);
    expect(migrated.doorStyles.length).toBeGreaterThan(1);
    // The shop's own kick height, reveals and materials are untouched.
    expect(migrated.constructions).toEqual(AU_SHOP_STANDARDS.constructions);
  });
});

describe('a style is part of what a job was quoted to', () => {
  it('starts in sync with the standards it came from', () => {
    // A fresh job, not the sample kitchen — that one deliberately names its entity, so it has
    // drifted from the standards before a door style is anywhere near it.
    expect(matchesStandards(createEmptyProject('Fresh'), AU_SHOP_STANDARDS)).toBe(true);
  });

  it('reports a nudged border as drift, the same as a measured board', () => {
    const drifted: Project = {
      ...slabJob,
      doorStyles: slabJob.doorStyles.map((s) =>
        s.id === 'shaker-57' ? { ...s, borderWidth: mm(60) } : s,
      ),
    };

    expect(matchesStandards(drifted, AU_SHOP_STANDARDS)).toBe(false);
    expect(differencesFromStandards(drifted, AU_SHOP_STANDARDS)).toContain(
      'Shaker 57: Border width is 60, standard is 57.',
    );
  });

  it('reports a changed job default', () => {
    expect(differencesFromStandards(styled(slabJob, 'shaker-57'), AU_SHOP_STANDARDS)).toContain(
      'Door style is shaker-57, standard is slab.',
    );
  });
});
