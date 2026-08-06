/**
 * Which parts of the Inspector are folded away, and what a folded one still has to say.
 *
 * The Inspector grew a heading at a time until one drawer bank was 2242px of controls in a 712px
 * window — three screens of scrolling to change a drawer height. Folding is the fix, and it brings
 * its own risk with it, which is the whole reason this file is not just a `useState` in the panel:
 *
 * **A folded section that says nothing is indistinguishable from one with nothing in it.** That is
 * §4.18's lesson in a new place — *a model that is right and silent looks, from the bench, exactly
 * like a model that is wrong*. So every section that can hold a departure from the default carries
 * a summary of that departure on its header, visible while it is shut: a deleted part, a material
 * override, a cutout. Fold away the controls, never the facts.
 *
 * Kept out of the component so both halves can be checked in Node — what opens by default, what a
 * stored preference is allowed to do to that, and what each summary says.
 */

import type { Cabinet } from '../../core/model/cabinet.ts';
import type { BuiltCabinet } from '../../core/rules/build.ts';
import { overrideFor } from '../../core/model/partOverride.ts';

export type SectionId =
  | 'stands'
  | 'configuration'
  | 'hardware'
  | 'finish'
  | 'cutouts'
  | 'parts'
  | 'reuse';

export const SECTION_IDS: readonly SectionId[] = [
  'stands',
  'configuration',
  'hardware',
  'finish',
  'cutouts',
  'parts',
  'reuse',
];

/**
 * What is open before anybody has an opinion.
 *
 * Open: the two a cabinet is actually drawn by — where it stands and how it is configured. Those
 * are what somebody changes on the way to a finished kitchen, and burying them behind a click
 * would trade one complaint for another.
 *
 * Shut: hardware, finish, cutouts, parts and reuse. Each is a real thing to reach for and none of
 * them is reached for often, which is exactly the test — a control you touch on one cabinet in
 * twenty costs nothing shut and costs a screen of scrolling open.
 */
export const DEFAULT_OPEN: Readonly<Record<SectionId, boolean>> = {
  stands: true,
  configuration: true,
  hardware: false,
  finish: false,
  cutouts: false,
  parts: false,
  reuse: false,
};

/**
 * Fold state read back from storage, with anything unrecognised dropped.
 *
 * A stored preference is a set of overrides on `DEFAULT_OPEN`, never a replacement for it: a
 * section added in a later version has to arrive at its own default rather than at `undefined`,
 * and a stale id left behind by a renamed section has to disappear rather than sit in the record
 * forever. Both are the same failure this codebase keeps finding — something saved quietly
 * deciding what a new feature does.
 */
export const readOpenSections = (raw: unknown): Record<SectionId, boolean> => {
  const out: Record<SectionId, boolean> = { ...DEFAULT_OPEN };
  if (typeof raw !== 'object' || raw === null) return out;
  const record = raw as Record<string, unknown>;
  for (const id of SECTION_IDS) {
    const value = record[id];
    if (typeof value === 'boolean') out[id] = value;
  }
  return out;
};

/** Toggling one section leaves every other alone — folds are independent, not an accordion. */
export const withSectionOpen = (
  current: Record<SectionId, boolean>,
  id: SectionId,
  open: boolean,
): Record<SectionId, boolean> => ({ ...current, [id]: open });

const plural = (n: number, one: string): string => `${n} ${n === 1 ? one : `${one}s`}`;

/**
 * How many of this cabinet's finish choices depart from the job default.
 *
 * Counted rather than listed because the header has one line: the number is what tells you to
 * open it, and the names are inside. The door style counts too — a cabinet in a different style
 * is as much a departure as one on a different board, and it lives in the same section.
 */
export const materialOverrideCount = (cabinet: Cabinet): number =>
  Object.values(cabinet.materials).filter((id) => id !== undefined).length +
  (cabinet.doorStyleId === undefined ? 0 : 1) +
  (cabinet.options.grainDirection === undefined ? 0 : 1);

/** Parts taken out of this cabinet, and parts cut from a board other than the cabinet's own. */
export const partOverrideCounts = (
  cabinet: Cabinet,
  built: BuiltCabinet,
): { deleted: number; rematerialled: number } => {
  let deleted = 0;
  let rematerialled = 0;
  for (const part of built.offeredParts) {
    const override = overrideFor(cabinet.partOverrides, part.key, part.index);
    if (override?.omit === true) deleted += 1;
    else if (override?.materialId !== undefined) rematerialled += 1;
  }
  return { deleted, rematerialled };
};

/**
 * The line a shut section shows on its header.
 *
 * `null` means there is nothing worth saying, and the header then shows nothing rather than
 * "none" — a row of zeroes is its own kind of clutter, and clutter is what this is for. A string
 * comes back only where the answer is **not** the default, so a badge on screen always means
 * something has been done to this cabinet and is currently out of sight.
 *
 * Hardware is the exception and earns it: it summarises what the cabinet *resolved to* rather
 * than whether anybody overrode it, because the runner system is the line that ends up on the
 * Blum order and a cabinet on the shop default is as worth reading as one that names its own.
 */
export const sectionSummary = (
  id: SectionId,
  cabinet: Cabinet,
  built: BuiltCabinet,
): string | null => {
  switch (id) {
    case 'finish': {
      const n = materialOverrideCount(cabinet);
      return n === 0 ? null : plural(n, 'override');
    }
    case 'cutouts': {
      const n = cabinet.customFeatures?.length ?? 0;
      return n === 0 ? null : plural(n, 'cutout');
    }
    case 'parts': {
      const { deleted, rematerialled } = partOverrideCounts(cabinet, built);
      const said: string[] = [];
      if (deleted > 0) said.push(`${deleted} deleted`);
      if (rematerialled > 0) said.push(`${rematerialled} on another board`);
      return said.length === 0 ? null : said.join(', ');
    }
    case 'hardware': {
      if (built.panels.some((p) => p.role === 'drawer-front')) {
        return built.hardware.runnerSystem.name;
      }
      return built.panels.some((p) => p.role === 'door') ? built.hardware.hinge.name : null;
    }
    default:
      return null;
  }
};
