/**
 * Every fold in the Settings window, and what is open before anybody has an opinion.
 *
 * The Joinery tab's groups are keyed to the model and live in `joineryGroups.ts`, because they
 * carry an obligation nothing else here does: **every setting on a construction method must be in
 * exactly one of them**, asserted in Node. The other tabs fold at seams the screen already had —
 * "Drawer runners", "Hinges", "Install" were headings before they were folds — so they need ids
 * and defaults and nothing more.
 *
 * All of them share one reader and one stored record, which is the point of this file: an id with
 * no default renders shut with no way to say so, and two readers with two defaults is how that
 * happens. One list, one place to add to.
 */

import { type MaterialLibrary, isOversize } from '../../core/model/material.ts';
import { JOINERY_GROUPS, type JoineryGroupId } from './joineryGroups.ts';

export type SettingsSectionId =
  | JoineryGroupId
  | 'hardware:runners'
  | 'hardware:hinges'
  | 'materials:thickness'
  | 'costing:sheet'
  | 'costing:labour'
  | 'costing:install';

/**
 * Shut unless a shop changes it between jobs.
 *
 * The two Joinery groups that open are the ones somebody genuinely re-types — a different kick
 * height is an ordinary Tuesday. Everything else here is set once and left: the runner catalogue,
 * what a board really measures, the install rate. Those are the folds that pay.
 */
const OTHER_DEFAULTS = {
  'hardware:runners': false,
  'hardware:hinges': false,
  'materials:thickness': false,
  'costing:sheet': false,
  'costing:labour': false,
  'costing:install': false,
} as const;

export const SETTINGS_DEFAULT_OPEN: Readonly<Record<SettingsSectionId, boolean>> = {
  ...(Object.fromEntries(JOINERY_GROUPS.map((g) => [g.id, g.openByDefault])) as Record<
    JoineryGroupId,
    boolean
  >),
  ...OTHER_DEFAULTS,
};

export const SETTINGS_SECTION_IDS = Object.keys(SETTINGS_DEFAULT_OPEN) as SettingsSectionId[];

/**
 * Fold state read back from storage, with anything unrecognised dropped.
 *
 * Same contract as the Inspector's: a stored preference is a set of overrides on the defaults,
 * never a replacement for them, so a fold added in a later version arrives at its own default
 * rather than at `undefined`.
 */
export const readOpenSettingsSections = (raw: unknown): Record<SettingsSectionId, boolean> => {
  const out: Record<SettingsSectionId, boolean> = { ...SETTINGS_DEFAULT_OPEN };
  if (typeof raw !== 'object' || raw === null) return out;
  const record = raw as Record<string, unknown>;
  for (const id of SETTINGS_SECTION_IDS) {
    const value = record[id];
    if (typeof value === 'boolean') out[id] = value;
  }
  return out;
};

/**
 * What the folded "What the boards really measure" group has to keep saying.
 *
 * A board cut at 16.3 against a nominal 16 is the difference between a bottom panel fitting
 * between two sides and not — §4.13's whole point — so **the one thing this fold must never hide
 * is that a board is not what it says on the label**. Boards that measure what they claim are the
 * quiet case and produce no badge.
 *
 * Counted over the boards the job actually uses, not the whole library: a decor nobody has picked
 * measuring 0.3 over is not this job's problem, and badging it would train somebody to ignore the
 * badge that matters.
 */
export const oversizeSummary = (
  library: MaterialLibrary,
  sheetIds: readonly string[],
): string | null => {
  const n = library.sheets.filter((s) => sheetIds.includes(s.id) && isOversize(s)).length;
  return n === 0 ? null : `${n} cut over nominal`;
};
