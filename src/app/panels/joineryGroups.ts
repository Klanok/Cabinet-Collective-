/**
 * The Joinery tab, grouped the way a cabinetmaker would group it.
 *
 * That tab is 26 settings in one list — 1474px in a 439px window on a small laptop, three and a
 * half screens of numbers with nothing between the kick height and the shelf-pin pitch to say
 * they are about different things. Folding fixes the height; **grouping is what fixes the
 * finding**, and the two are not the same job.
 *
 * ## Why the grouping is declared, and asserted
 *
 * `CONSTRUCTION_FIELDS` is a flat list, so a group written as "the keys I remember" would silently
 * drop the next setting somebody adds to the model — the field would exist, drift against the shop
 * standards, and have nowhere on screen to be. That is §4.15's fault exactly: *"does this cabinet
 * type support X?" answered by whether somebody remembered to call a function*. So the mapping is
 * total by construction and `tests/joineryGroups.test.ts` asserts it: **every setting on a
 * construction method is in exactly one group**, and a new one fails the suite rather than
 * disappearing.
 *
 * ## What a shut group still has to say
 *
 * The same rule the Inspector folds under: fold away the controls, never the facts. Here the fact
 * worth carrying is **how far this job has drifted from the shop standards** — that is what the
 * screen is for, it is already computed for the footer, and it is precisely what you would want to
 * know before opening a group. A group in step with the standards says nothing.
 */

import type { ConstructionMethod } from '../../core/model/construction.ts';

export type JoineryGroupId =
  | 'joinery:carcass'
  | 'joinery:kick'
  | 'joinery:fronts'
  | 'joinery:shelves'
  | 'joinery:curves'
  | 'joinery:appliedEnds';

/**
 * Keys that describe *what a method is* rather than a setting somebody tunes.
 *
 * `id` and `name` identify the method and `family` selects which rules build it — changing that
 * is choosing a different method, not adjusting this one, which is what the segmented control at
 * the top of the tab already does.
 */
export const NOT_A_SETTING: readonly (keyof ConstructionMethod)[] = ['id', 'name', 'family'];

export interface JoineryGroup {
  readonly id: JoineryGroupId;
  readonly title: string;
  readonly keys: readonly (keyof ConstructionMethod)[];
  /** Open before anybody has an opinion. */
  readonly openByDefault: boolean;
}

/**
 * Six groups, in the order you would build the cabinet.
 *
 * Carcass and kick are open because they are the two a shop actually changes between jobs — a
 * different kick height is an ordinary Tuesday. The rest are set once and left, which is what
 * makes them worth folding: the System 32 pitch is not a number anybody edits twice.
 */
export const JOINERY_GROUPS: readonly JoineryGroup[] = [
  {
    id: 'joinery:carcass',
    title: 'Carcass and back',
    openByDefault: true,
    keys: ['backStyle', 'stretcherWidth'],
  },
  {
    id: 'joinery:kick',
    title: 'Kick and plinth',
    openByDefault: true,
    keys: [
      'kickHeight',
      'kickSetback',
      'ladderRailFloorGap',
      'ladderFaceScribeAllowance',
      'ladderFaceScribeEnd',
      'ladderMaxRibGap',
    ],
  },
  {
    id: 'joinery:fronts',
    title: 'Fronts, reveals and gaps',
    openByDefault: false,
    keys: [
      'revealTop',
      'revealBottom',
      'revealSides',
      'frontStandoff',
      'gapBetweenDoors',
      'gapBetweenDrawers',
    ],
  },
  {
    id: 'joinery:shelves',
    title: 'Shelves and system holes',
    openByDefault: false,
    keys: [
      'shelfSetback',
      'shelfSideClearance',
      'systemPitch',
      'systemFrontSetback',
      'systemBackSetback',
      'systemHoleDiameter',
      'systemHoleDepth',
      'systemHoleEndClearance',
    ],
  },
  {
    id: 'joinery:curves',
    title: 'Curves',
    openByDefault: false,
    keys: [
      'cornerMethod',
      'fixingStripWidth',
      'finishLaminate',
      'routedPocketResidual',
    ],
  },
  {
    id: 'joinery:appliedEnds',
    title: 'Applied ends',
    openByDefault: false,
    keys: ['appliedEndBackScribe', 'appliedEndFrontOverhang', 'appliedEndToFloor'],
  },
];

export const JOINERY_DEFAULT_OPEN: Readonly<Record<JoineryGroupId, boolean>> =
  Object.fromEntries(JOINERY_GROUPS.map((g) => [g.id, g.openByDefault])) as Record<
    JoineryGroupId,
    boolean
  >;

/** Which group a setting belongs to, or `null` if it is not a setting at all. */
export const groupOfKey = (key: keyof ConstructionMethod): JoineryGroupId | null =>
  JOINERY_GROUPS.find((g) => g.keys.includes(key))?.id ?? null;

/**
 * Fold state read back from storage, with anything unrecognised dropped.
 *
 * The same contract as the Inspector's: a stored preference is a set of overrides on the
 * defaults, never a replacement for them, so a group added in a later version arrives at its own
 * default rather than at `undefined`.
 */
export const readOpenGroups = (raw: unknown): Record<JoineryGroupId, boolean> => {
  const out: Record<JoineryGroupId, boolean> = { ...JOINERY_DEFAULT_OPEN };
  if (typeof raw !== 'object' || raw === null) return out;
  const record = raw as Record<string, unknown>;
  for (const group of JOINERY_GROUPS) {
    const value = record[group.id];
    if (typeof value === 'boolean') out[group.id] = value;
  }
  return out;
};

/**
 * How many settings in this group differ between what is on screen and the shop standards.
 *
 * `undefined` for the standard method means there is nothing to compare against — a method this
 * job has and the shop does not — and that is **not** a drift of every key: it is a different
 * thing entirely, already reported by name in `differencesFromStandards`, and counting all 26
 * here would drown the groups that genuinely differ.
 */
export const driftedInGroup = (
  group: JoineryGroup,
  job: ConstructionMethod,
  standard: ConstructionMethod | undefined,
): number => {
  if (standard === undefined) return 0;
  return group.keys.filter((key) => job[key] !== standard[key]).length;
};

/** The line a shut group shows. `null` when it is in step with the shop standards. */
export const groupSummary = (
  group: JoineryGroup,
  job: ConstructionMethod,
  standard: ConstructionMethod | undefined,
): string | null => {
  const n = driftedInGroup(group, job, standard);
  if (n === 0) return null;
  return `${n} differ${n === 1 ? 's' : ''} from standards`;
};
