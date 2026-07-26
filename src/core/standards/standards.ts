/**
 * Shop standards — the way this shop builds, by default.
 *
 * The relationship between standards and a job is **copy, never reference**. Starting a job
 * takes a snapshot of the standards; from then on the job owns its numbers.
 *
 * That matters for a real reason, not a technical one. If you change your standard kick
 * height next year, a kitchen you quoted this year must not silently re-price or re-cut to
 * the new number. A job is a record of what was agreed, so it keeps the standards that were
 * in force when it was created — and any later change to it is a deliberate edit to that job,
 * visible as such.
 */

import { type MaterialLibrary, actualThicknessOf } from '../model/material.ts';
import type { ConstructionMethod } from '../model/construction.ts';
import type { Project, ProjectDefaults, ProjectSettings } from '../model/project.ts';
import type { SavedCabinetType } from './savedTypes.ts';
import { DEFAULT_CONSTRUCTIONS } from '../model/construction.ts';
import { AU_MATERIAL_LIBRARY } from '../library/materials.au.ts';
import { AU_DEFAULT_SETTINGS, AU_PROJECT_DEFAULTS } from '../library/defaults.au.ts';

export const CURRENT_STANDARDS_VERSION = 1 as const;

export interface ShopStandards {
  readonly version: typeof CURRENT_STANDARDS_VERSION;
  /** What this set of standards is called — "Ethereal", "Personal ABN", "Commercial fitout". */
  readonly name: string;
  readonly updatedAt: string;

  /** How the shop builds: thicknesses, kick, reveals, gaps, shelf clearances. */
  readonly constructions: readonly ConstructionMethod[];
  /** Standard sizes and default materials for new cabinets. */
  readonly defaults: ProjectDefaults;
  /** Margin, labour rates, GST context, yield allowance. */
  readonly settings: ProjectSettings;
  /** The price list. */
  readonly materials: MaterialLibrary;
  /**
   * Reusable cabinet recipes. Unlike the rest of the standards these are *not* snapshotted
   * into a job — a job records the cabinets you placed, not the catalogue you picked them
   * from, so adding a type later makes it available everywhere at once.
   */
  readonly savedTypes: readonly SavedCabinetType[];
}

/** The shipped starting point. Australian conventions, as everything else here is. */
export const AU_SHOP_STANDARDS: ShopStandards = {
  version: CURRENT_STANDARDS_VERSION,
  name: 'Australian defaults',
  updatedAt: new Date(0).toISOString(),
  constructions: DEFAULT_CONSTRUCTIONS,
  defaults: AU_PROJECT_DEFAULTS,
  settings: AU_DEFAULT_SETTINGS,
  materials: AU_MATERIAL_LIBRARY,
  savedTypes: [],
};

/**
 * The standards-derived part of a project. Kept separate so "start a job from standards" and
 * "reset this job back to standards" are the same operation.
 */
export type StandardsSnapshot = Pick<
  Project,
  'constructions' | 'defaults' | 'settings' | 'materials'
>;

export const snapshotOf = (standards: ShopStandards): StandardsSnapshot => ({
  constructions: standards.constructions,
  defaults: standards.defaults,
  settings: standards.settings,
  materials: standards.materials,
});

/** Apply standards to a project, leaving its room and cabinets alone. */
export const applyStandards = (project: Project, standards: ShopStandards): Project => ({
  ...project,
  ...snapshotOf(standards),
  updatedAt: new Date().toISOString(),
});

/**
 * Promote a job's current setup to become the shop standards.
 *
 * The obvious workflow: get one job exactly right on the bench, then make it the default for
 * everything after it.
 */
export const standardsFromProject = (
  project: Project,
  name: string,
  previous?: ShopStandards,
): ShopStandards => ({
  version: CURRENT_STANDARDS_VERSION,
  name: name || previous?.name || 'Shop standards',
  updatedAt: new Date().toISOString(),
  constructions: project.constructions,
  defaults: project.defaults,
  settings: project.settings,
  materials: project.materials,
  // Saved types belong to the catalogue, not to any one job, so promoting a job's setup
  // leaves them alone.
  savedTypes: previous?.savedTypes ?? [],
});

/** True when a job's settings still match the standards it came from. */
export const matchesStandards = (project: Project, standards: ShopStandards): boolean =>
  JSON.stringify(snapshotOf(standards)) ===
  JSON.stringify({
    constructions: project.constructions,
    defaults: project.defaults,
    settings: project.settings,
    materials: project.materials,
  });

/**
 * A plain-language list of where a job differs from the standards it was started from.
 *
 * Shown in the settings screen so a job that has drifted says so, rather than quietly cutting
 * to numbers you have since changed your mind about.
 */
export const differencesFromStandards = (
  project: Project,
  standards: ShopStandards,
): readonly string[] => {
  const notes: string[] = [];

  for (const standard of standards.constructions) {
    const jobVersion = project.constructions.find((c) => c.id === standard.id);
    if (!jobVersion) {
      notes.push(`Construction "${standard.name}" is not used by this job.`);
      continue;
    }
    for (const key of Object.keys(standard) as (keyof ConstructionMethod)[]) {
      if (key === 'id' || key === 'name') continue;
      if (jobVersion[key] !== standard[key]) {
        notes.push(`${standard.name}: ${labelForConstructionKey(key)} is ${String(jobVersion[key])}, standard is ${String(standard[key])}.`);
      }
    }
  }

  /*
   * The boards themselves.
   *
   * Both halves matter and neither used to be reported: *which* board a job defaults to, and
   * what that board has been measured at. A job cut to 16.3mm stock against a standard that
   * still says 16 has genuinely drifted — that is the difference between a part fitting and
   * not — so it has to appear here rather than only registering as a silent "not in sync".
   */
  for (const [key, label] of Object.entries(DEFAULT_LABELS) as [keyof ProjectDefaults, string][]) {
    const jobValue = project.defaults[key];
    const standardValue = standards.defaults[key];
    if (jobValue !== standardValue) {
      notes.push(`${label} is ${String(jobValue)}, standard is ${String(standardValue)}.`);
    }
  }

  for (const standardSheet of standards.materials.sheets) {
    const jobSheet = project.materials.sheets.find((s) => s.id === standardSheet.id);
    if (!jobSheet) continue;
    const jobActual = actualThicknessOf(jobSheet);
    const standardActual = actualThicknessOf(standardSheet);
    if (jobActual !== standardActual) {
      notes.push(
        `${standardSheet.decor} ${standardSheet.thickness}mm is cut at ${jobActual}mm, standard is ${standardActual}mm.`,
      );
    }
  }

  if (project.settings.marginPercent !== standards.settings.marginPercent) {
    notes.push(
      `Margin is ${project.settings.marginPercent}%, standard is ${standards.settings.marginPercent}%.`,
    );
  }
  if (project.settings.gstMode !== standards.settings.gstMode) {
    notes.push(`GST context differs from standard.`);
  }
  if (project.settings.labour.ratePerHourExGst !== standards.settings.labour.ratePerHourExGst) {
    notes.push(
      `Labour rate is $${project.settings.labour.ratePerHourExGst}/h, standard is $${standards.settings.labour.ratePerHourExGst}/h.`,
    );
  }

  return notes;
};

/** Plain-English names for the job defaults, used when listing drift from the standards. */
const DEFAULT_LABELS: Partial<Record<keyof ProjectDefaults, string>> = {
  carcassMaterialId: 'Carcass board',
  backMaterialId: 'Back board',
  doorMaterialId: 'Front board',
  edgeBandId: 'Edge banding',
  constructionId: 'Construction method',
  baseCabinetHeight: 'Base cabinet height',
  baseCabinetDepth: 'Base cabinet depth',
  wallCabinetHeight: 'Wall cabinet height',
  wallCabinetDepth: 'Wall cabinet depth',
  wallCabinetMountHeight: 'Wall cabinet mount height',
  tallCabinetHeight: 'Tall cabinet height',
  tallCabinetDepth: 'Tall cabinet depth',
};

/** Plain-English names for the construction numbers, used in the UI and in diffs. */
export const labelForConstructionKey = (key: keyof ConstructionMethod): string => {
  const labels: Partial<Record<keyof ConstructionMethod, string>> = {
    carcassThickness: 'Carcass thickness',
    backThickness: 'Back thickness',
    doorThickness: 'Door thickness',
    backStyle: 'Back style',
    kickHeight: 'Kick height',
    kickSetback: 'Kick setback',
    stretcherWidth: 'Top rail depth',
    revealTop: 'Reveal — top',
    revealBottom: 'Reveal — bottom',
    revealSides: 'Reveal — left and right',
    gapBetweenDoors: 'Gap between doors',
    gapBetweenDrawers: 'Gap between drawer fronts',
    shelfSetback: 'Shelf setback',
    shelfSideClearance: 'Shelf side clearance',
    systemPitch: 'System hole pitch',
    systemFrontSetback: 'First hole from front',
  };
  return labels[key] ?? String(key);
};

/** Load standards from storage, migrating older versions forward. */
export const migrateStandards = (raw: unknown): ShopStandards => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('migrateStandards: standards data is not an object');
  }
  const data = raw as Record<string, unknown>;
  const version = data.version;
  if (version !== CURRENT_STANDARDS_VERSION) {
    throw new Error(
      `migrateStandards: version ${String(version)} is not supported (current is ${CURRENT_STANDARDS_VERSION})`,
    );
  }
  // Saved types arrived after the first standards were written, so fill them in rather than
  // rejecting a file that is otherwise current.
  return { ...(data as unknown as ShopStandards), savedTypes: (data.savedTypes as never) ?? [] };
};
