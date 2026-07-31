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

import { type MaterialLibrary, actualThicknessOf, withResolvedColours } from '../model/material.ts';
import type { HardwareLibrary } from '../model/hardware.ts';
import type { ConstructionMethod } from '../model/construction.ts';
import type { Project, ProjectDefaults, ProjectSettings } from '../model/project.ts';
import type { SavedCabinetType } from './savedTypes.ts';
import { type DoorStyle, DEFAULT_DOOR_STYLES, PLAIN_SLAB_STYLE } from './doorStyles.ts';
import {
  DEFAULT_CONSTRUCTIONS,
  collapseThicknessFields,
  withFixingStrip,
  withAppliedEnds,
  withFrontStandoff,
  withShelfPinClearance,
  withLadderKick,
  withSystemHoles,
} from '../model/construction.ts';
import {
  AU_BENCHTOP_MATERIALS,
  AU_MATERIAL_LIBRARY,
  AU_SHEET_MATERIALS,
} from '../library/materials.au.ts';
import { AU_DEFAULT_SETTINGS, AU_PROJECT_DEFAULTS } from '../library/defaults.au.ts';
import {
  BLUM_HARDWARE_LIBRARY,
  DEFAULT_DRAWER_SIDE_HEIGHT_CODE,
  DEFAULT_HINGE_SYSTEM_ID,
  DEFAULT_RUNNER_SYSTEM_ID,
} from '../library/blum.ts';

export const CURRENT_STANDARDS_VERSION = 10 as const;

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
   * Door styles. Unlike saved cabinet types, these *are* snapshotted into a job — a style
   * decides how a part is machined, so a job has to keep the one it was quoted and cut to.
   */
  readonly doorStyles: readonly DoorStyle[];
  /**
   * Runner and hinge systems. Snapshotted into a job like the door styles, and for a harder reason:
   * a runner system decides how big a drawer bottom is cut.
   */
  readonly hardware: HardwareLibrary;
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
  doorStyles: DEFAULT_DOOR_STYLES,
  hardware: BLUM_HARDWARE_LIBRARY,
  savedTypes: [],
};

/**
 * The standards-derived part of a project. Kept separate so "start a job from standards" and
 * "reset this job back to standards" are the same operation.
 */
export type StandardsSnapshot = Pick<
  Project,
  'constructions' | 'defaults' | 'settings' | 'materials' | 'doorStyles' | 'hardware'
>;

/**
 * Pull out just the snapshotted fields. Takes the structural type rather than `ShopStandards`
 * so a job and a set of standards go through the same function — which is what stops
 * "snapshot it" and "compare it to the snapshot" drifting apart when a field is added.
 */
const snapshotFieldsOf = (source: StandardsSnapshot): StandardsSnapshot => ({
  constructions: source.constructions,
  defaults: source.defaults,
  settings: source.settings,
  materials: source.materials,
  doorStyles: source.doorStyles,
  hardware: source.hardware,
});

export const snapshotOf = (standards: ShopStandards): StandardsSnapshot =>
  snapshotFieldsOf(standards);

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
  doorStyles: project.doorStyles,
  hardware: project.hardware,
  // Saved types belong to the catalogue, not to any one job, so promoting a job's setup
  // leaves them alone.
  savedTypes: previous?.savedTypes ?? [],
});

/** True when a job's settings still match the standards it came from. */
export const matchesStandards = (project: Project, standards: ShopStandards): boolean =>
  JSON.stringify(snapshotOf(standards)) === JSON.stringify(snapshotFieldsOf(project));

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
    /*
     * A colour is screen-only and nothing is cut from it — but `matchesStandards` compares the whole
     * snapshot, so a changed colour already makes a job read as out of sync. Reporting it keeps the
     * two from disagreeing: "this job has drifted" with an empty list of differences is worse than
     * either answer on its own.
     */
    if (jobSheet.colour !== standardSheet.colour) {
      notes.push(
        `${standardSheet.decor} is drawn in ${jobSheet.colour ?? 'the default colour'}, standard is ` +
          `${standardSheet.colour ?? 'the default'}. Screen only — nothing is cut from it.`,
      );
    }
  }

  /*
   * The door styles.
   *
   * A style decides machining, so a job whose shaker border has been nudged is genuinely
   * cutting different doors from the standard — the same class of drift as a measured board,
   * and it has to be visible for the same reason.
   */
  for (const standardStyle of standards.doorStyles) {
    const jobStyle = project.doorStyles.find((s) => s.id === standardStyle.id);
    if (!jobStyle) {
      notes.push(`Door style "${standardStyle.name}" is not in this job.`);
      continue;
    }
    for (const [key, label] of Object.entries(DOOR_STYLE_LABELS) as [keyof DoorStyle, string][]) {
      if (jobStyle[key] !== standardStyle[key]) {
        notes.push(
          `${standardStyle.name}: ${label} is ${String(jobStyle[key])}, standard is ${String(standardStyle[key])}.`,
        );
      }
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

/** The numbers on a door style that actually change what gets machined. */
export const DOOR_STYLE_LABELS: Partial<Record<keyof DoorStyle, string>> = {
  kind: 'Style',
  borderWidth: 'Border width',
  recessDepth: 'Recess depth',
  cornerRadius: 'Internal corner radius',
  pocketToolId: 'Recess cutter',
  grooveSpacing: 'Groove spacing',
  grooveDepth: 'Groove depth',
  grooveToolId: 'Groove cutter',
  grooveDirection: 'Groove direction',
  grooveMargin: 'Groove edge margin',
  minimumCentre: 'Smallest centre',
  machiningMinutesPerFront: 'Machining time per front',
};

/** Plain-English names for the job defaults, used when listing drift from the standards. */
const DEFAULT_LABELS: Partial<Record<keyof ProjectDefaults, string>> = {
  carcassMaterialId: 'Carcass board',
  backMaterialId: 'Back board',
  doorMaterialId: 'Front board',
  skinMaterialId: 'Bendy ply',
  edgeBandId: 'Edge banding',
  constructionId: 'Construction method',
  doorStyleId: 'Door style',
  runnerSystemId: 'Drawer runner system',
  drawerSideHeightCode: 'Drawer box height',
  hingeSystemId: 'Hinge system',
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
    backStyle: 'Back style',
    kickHeight: 'Kick height',
    kickSetback: 'Kick setback',
    stretcherWidth: 'Top rail depth',
    revealTop: 'Reveal — top',
    revealBottom: 'Reveal — bottom',
    revealSides: 'Reveal — left and right',
    frontStandoff: 'Front standoff behind a front',
    gapBetweenDoors: 'Gap between doors',
    gapBetweenDrawers: 'Gap between drawer fronts',
    shelfSetback: 'Shelf setback',
    shelfSideClearance: 'Shelf side clearance',
    fixingStripWidth: 'Fixing strip at a radius',
    systemPitch: 'System hole pitch',
    systemFrontSetback: 'First hole from front',
    systemBackSetback: 'First hole from back',
    systemHoleDiameter: 'System hole diameter',
    systemHoleDepth: 'System hole depth',
    systemHoleEndClearance: 'Shelf pins — clear of each end',
    ladderRailFloorGap: 'Plinth rails cut short by',
    ladderFaceScribeAllowance: 'Kick face scribe allowance',
    ladderFaceScribeEnd: 'Kick face scribe end',
    ladderMaxRibGap: 'Greatest gap between plinth ribs',
    appliedEndBackScribe: 'Applied end — scribe past the back',
    appliedEndFrontOverhang: 'Applied end — proud of the door face',
    appliedEndToFloor: 'Applied end runs to the floor',
  };
  return labels[key] ?? String(key);
};

/** Load standards from storage, migrating older versions forward. */
export const migrateStandards = (raw: unknown): ShopStandards => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('migrateStandards: standards data is not an object');
  }
  let data = raw as Record<string, unknown>;
  const version = data.version;
  if (typeof version !== 'number') {
    throw new Error('migrateStandards: missing version');
  }
  if (version > CURRENT_STANDARDS_VERSION) {
    throw new Error(
      `migrateStandards: these standards were saved by a newer version (${version}, this build reads ${CURRENT_STANDARDS_VERSION})`,
    );
  }

  if (data.version === 1) data = migrateStandardsV1toV2(data);
  if (data.version === 2) data = migrateStandardsV2toV3(data);
  if (data.version === 3) data = migrateStandardsV3toV4(data);
  if (data.version === 4) data = migrateStandardsV4toV5(data);
  if (data.version === 5) data = migrateStandardsV5toV6(data);
  if (data.version === 6) data = migrateStandardsV6toV7(data);
  if (data.version === 7) data = migrateStandardsV7toV8(data);
  if (data.version === 8) data = migrateStandardsV8toV9(data);
  if (data.version === 9) data = migrateStandardsV9toV10(data);
  if (data.version === 9) data = migrateStandardsV9toV10(data);

  if (data.version !== CURRENT_STANDARDS_VERSION) {
    throw new Error(`migrateStandards: could not migrate version ${String(version)}`);
  }
  // Saved types arrived after the first standards were written, so fill them in rather than
  // rejecting a file that is otherwise current.
  return { ...(data as unknown as ShopStandards), savedTypes: (data.savedTypes as never) ?? [] };
};

/**
 * Standards v1 → v2: construction methods lose their thicknesses, matching the project's
 * v4 → v5.
 *
 * This has to be a real migration rather than a version bump that rejects the old file. A
 * shop's standards are their kick height, their reveals, their saved cabinet types — years of
 * accumulated preference. Refusing to load them silently replaces the lot with the shipped
 * Australian defaults, which is a far worse outcome than the schema change it was protecting
 * against.
 */
/**
 * Standards v2 → v3: a door style library arrives, matching the project's v5 → v6.
 *
 * A real migration again rather than a rejection, for the reason the last one was: a shop's
 * standards are years of accumulated preference, and throwing them away to add a field would
 * be a far worse outcome than the change it was protecting against. The shipped styles are
 * added and the default is the plain slab, so nothing a shop has already set is touched.
 */
const migrateStandardsV2toV3 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const defaults = (raw.defaults as Record<string, unknown> | undefined) ?? {};
  const existing = raw.doorStyles as DoorStyle[] | undefined;
  return {
    ...raw,
    version: 3,
    doorStyles: existing && existing.length > 0 ? existing : DEFAULT_DOOR_STYLES,
    defaults: { ...defaults, doorStyleId: defaults.doorStyleId ?? PLAIN_SLAB_STYLE.id },
  };
};

/**
 * Standards v3 → v4: construction methods gain a fixing strip, matching the project's
 * v7 → v8.
 *
 * A real migration again, and this one changes nothing a shop has set: the strip is only read
 * by a cabinet carrying a corner radius, and it is filled with the shipped 50mm.
 */
const migrateStandardsV3toV4 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  return { ...raw, version: 4, constructions: constructions.map(withFixingStrip) };
};

/**
 * Standards v4 → v5: runner and hinge systems arrive, matching the project's v8 → v9.
 *
 * A real migration again rather than a rejection, for the reason every standards migration here is
 * one: a shop's standards are years of accumulated kick heights, reveals, door styles and saved
 * types, and throwing them away to add a field is a far worse outcome than the change it was
 * protecting against.
 *
 * Nothing a shop has set is touched. What is added is the shipped Blum library and the three ids
 * pointing at it, plus the system-hole figures on each construction method — and no hole had ever
 * been bored before this version, so there is nothing for them to move.
 */
const migrateStandardsV4toV5 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  const defaults = (raw.defaults as Record<string, unknown> | undefined) ?? {};
  const existing = raw.hardware as HardwareLibrary | undefined;
  return {
    ...raw,
    version: 5,
    constructions: constructions.map(withSystemHoles),
    hardware: existing && existing.runnerSystems?.length > 0 ? existing : BLUM_HARDWARE_LIBRARY,
    defaults: {
      ...defaults,
      runnerSystemId: defaults.runnerSystemId ?? DEFAULT_RUNNER_SYSTEM_ID,
      drawerSideHeightCode: defaults.drawerSideHeightCode ?? DEFAULT_DRAWER_SIDE_HEIGHT_CODE,
      hingeSystemId: defaults.hingeSystemId ?? DEFAULT_HINGE_SYSTEM_ID,
    },
  };
};

/**
 * Standards v5 → v6: benchtop materials and the ladder-base figures arrive, matching the project's
 * v9 → v10.
 *
 * A real migration again, and nothing a shop has set is touched. The benchtop materials are a new
 * list that was empty before, and the ladder figures are read by nothing except a ladder base — an
 * object no set of standards saved before this version could have produced.
 */
const migrateStandardsV5toV6 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const existing = materials.benchtops as unknown[] | undefined;
  return {
    ...raw,
    version: 6,
    constructions: constructions.map(withLadderKick),
    materials: {
      ...materials,
      benchtops: existing && existing.length > 0 ? existing : AU_BENCHTOP_MATERIALS,
    },
  };
};

/**
 * Standards v6 → v7: the screen colours backfilled, matching the project's v10 → v11.
 *
 * A shop that saved its standards before `SheetMaterial.colour` existed has the same hole a job
 * does, and it is worse here — every job started from those standards inherits the colourless list
 * and renders every decor the same. Filling it at the source stops that repeating.
 *
 * A colour a shop has deliberately set is left alone. Nothing is cut, priced or ordered from one.
 */
const migrateStandardsV6toV7 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const sheets = (materials.sheets as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    version: 7,
    materials: { ...materials, sheets: withResolvedColours(sheets, AU_SHEET_MATERIALS) },
  };
};

/**
 * Standards v7 → v8: the front standoff, matching the project's v11 → v12.
 *
 * The shipped 2mm, filled in on every method. A shop that builds to a different gap changes one
 * number in one place, which is the point of it being on the construction method at all.
 */
const migrateStandardsV7toV8 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  return { ...raw, version: 8, constructions: constructions.map(withFrontStandoff) };
};

/**
 * Standards v8 → v9: the applied-end figures, matching the project's v12 → v13.
 *
 * A shop's ends are all detailed the same way — scribed the same amount, flush or proud the same
 * amount, to the floor or not — so these belong on the method beside the kick figures, and a shop
 * that details theirs differently changes three numbers once rather than per cabinet.
 */
const migrateStandardsV8toV9 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  return { ...raw, version: 9, constructions: constructions.map(withAppliedEnds) };
};

/**
 * Standards v9 → v10: the shelf-pin end clearance, matching the project's v13 → v14.
 *
 * How far a shop keeps its pin holes off the ends of a panel is one number for the whole shop, so
 * it belongs here beside the system pitch and the setbacks rather than on each cabinet.
 */
const migrateStandardsV9toV10 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  return { ...raw, version: 10, constructions: constructions.map(withShelfPinClearance) };
};

const migrateStandardsV1toV2 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const { constructions, idMap } = collapseThicknessFields(
    (raw.constructions as Record<string, unknown>[] | undefined) ?? [],
  );
  const defaults = (raw.defaults as Record<string, unknown> | undefined) ?? {};
  const currentId = defaults.constructionId;
  return {
    ...raw,
    version: 2,
    constructions,
    defaults: {
      ...defaults,
      constructionId: typeof currentId === 'string' ? (idMap[currentId] ?? currentId) : currentId,
    },
  };
};
