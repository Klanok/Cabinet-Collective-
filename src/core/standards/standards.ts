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

import {
  type MaterialLibrary,
  actualThicknessOf,
  withResolvedColours,
  withResolvedTextures,
} from '../model/material.ts';
import {
  type HardwareLibrary,
  withProfileFixingPositions,
  withShippedSideHeights,
} from '../model/hardware.ts';
import type { ConstructionMethod } from '../model/construction.ts';
import {
  DEFAULT_NESTING_SETTINGS,
  type Project,
  type ProjectDefaults,
  type ProjectSettings,
  withBackfilledLabourRates,
  withCushionOverhang,
  withRealLaminateSheets,
  withRealSheetSizes,
  withRekeyedSheetChoices,
} from '../model/project.ts';
import type { SavedCabinetType } from './savedTypes.ts';
import { type DoorStyle, DEFAULT_DOOR_STYLES, PLAIN_SLAB_STYLE } from './doorStyles.ts';
import {
  DEFAULT_CONSTRUCTIONS,
  collapseThicknessFields,
  withFixingStrip,
  withAppliedEnds,
  withFrontStandoff,
  withShelfPinClearance,
  withFinishLaminate,
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

export const CURRENT_STANDARDS_VERSION = 25 as const;

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
    finishLaminate: 'Finish laminate over a curve',
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
  if (data.version === 10) data = migrateStandardsV10toV11(data);
  if (data.version === 11) data = migrateStandardsV11toV12(data);
  if (data.version === 12) data = migrateStandardsV12toV13(data);
  if (data.version === 13) data = migrateStandardsV13toV14(data);
  if (data.version === 14) data = migrateStandardsV14toV15(data);
  if (data.version === 15) data = migrateStandardsV15toV16(data);
  if (data.version === 16) data = migrateStandardsV16toV17(data);
  if (data.version === 17) data = migrateStandardsV17toV18(data);
  if (data.version === 18) data = migrateStandardsV18toV19(data);
  if (data.version === 19) data = migrateStandardsV19toV20(data);
  if (data.version === 20) data = migrateStandardsV20toV21(data);
  if (data.version === 21) data = migrateStandardsV21toV22(data);
  if (data.version === 22) data = migrateStandardsV22toV23(data);
  if (data.version === 23) data = migrateStandardsV23toV24(data);
  if (data.version === 24) data = migrateStandardsV24toV25(data);

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

/** Phase 3 replaces the yield allowance with the shop's nesting settings. */
const migrateStandardsV6toV7 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const settings = (raw.settings as Record<string, unknown> | undefined) ?? {};
  const { sheetWastageFactor: _dropped, ...rest } = settings;
  return {
    ...raw,
    version: 7,
    settings: { ...rest, nesting: rest.nesting ?? DEFAULT_NESTING_SETTINGS },
  };
};

/**
 * Standards v7 → v8: the screen colours backfilled, matching the project's v11 → v12.
 *
 * A shop that saved its standards before `SheetMaterial.colour` existed has the same hole a job
 * does, and it is worse here — every job started from those standards inherits the colourless list
 * and renders every decor the same. Filling it at the source stops that repeating.
 *
 * A colour a shop has deliberately set is left alone. Nothing is cut, priced or ordered from one.
 */
const migrateStandardsV7toV8 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const sheets = (materials.sheets as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    version: 8,
    materials: { ...materials, sheets: withResolvedColours(sheets, AU_SHEET_MATERIALS) },
  };
};

/**
 * Standards v8 → v9: the front standoff, matching the project's v12 → v13.
 *
 * The shipped 2mm, filled in on every method. A shop that builds to a different gap changes one
 * number in one place, which is the point of it being on the construction method at all.
 */
const migrateStandardsV8toV9 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  return { ...raw, version: 9, constructions: constructions.map(withFrontStandoff) };
};

/**
 * Standards v9 → v10: the applied-end figures, matching the project's v13 → v14.
 *
 * A shop's ends are all detailed the same way — scribed the same amount, flush or proud the same
 * amount, to the floor or not — so these belong on the method beside the kick figures, and a shop
 * that details theirs differently changes three numbers once rather than per cabinet.
 */
const migrateStandardsV9toV10 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  return { ...raw, version: 10, constructions: constructions.map(withAppliedEnds) };
};

/**
 * Standards v10 → v11: the shelf-pin end clearance, matching the project's v14 → v15.
 *
 * How far a shop keeps its pin holes off the ends of a panel is one number for the whole shop, so
 * it belongs here beside the system pitch and the setbacks rather than on each cabinet.
 */
const migrateStandardsV10toV11 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  return { ...raw, version: 11, constructions: constructions.map(withShelfPinClearance) };
};

/**
 * Standards v11 → v12: the cabinet profile fixing positions, matching the project's v15 → v16.
 *
 * A shop's standards carry their own copy of the hardware library, so the corrected sheet figures
 * have to reach it too. Otherwise every *new* job would go on inheriting the two-hole pattern from
 * the standards long after the saved jobs had been fixed — which is exactly the hole the colour
 * backfill left in v7, and it is not being left again.
 */
const migrateStandardsV11toV12 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const hardware = raw.hardware as Record<string, unknown> | undefined;
  if (!hardware) return { ...raw, version: 12 };
  const systems = (hardware.runnerSystems as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    version: 12,
    hardware: {
      ...hardware,
      runnerSystems: systems.map((s) =>
        withProfileFixingPositions(s, BLUM_HARDWARE_LIBRARY.runnerSystems),
      ),
    },
  };
};

/** Standards v12 → v13: new jobs inherit the verified MERIVOBOX N, M and K choices. */
const migrateStandardsV12toV13 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const hardware = raw.hardware as Record<string, unknown> | undefined;
  const defaults = (raw.defaults as Record<string, unknown> | undefined) ?? {};
  const upgradedDefaults = {
    ...defaults,
    // Standards describe future jobs, not an already quoted cabinet. Keeping the legacy default
    // here would keep creating brand-new 3mm radius work indefinitely.
    skinMaterialId:
      defaults.skinMaterialId === 'bendy-ply-3' ? 'bendy-ply-8' : defaults.skinMaterialId,
  };
  if (!hardware) return { ...raw, version: 13, defaults: upgradedDefaults };
  const systems = (hardware.runnerSystems as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    version: 13,
    defaults: upgradedDefaults,
    hardware: {
      ...hardware,
      runnerSystems: systems.map((system) =>
        withShippedSideHeights(system, BLUM_HARDWARE_LIBRARY.runnerSystems),
      ),
    },
  };
};

/**
 * Standards v18 → v19: the finish laminate over a curved wrap, at zero on stored methods.
 *
 * Zero rather than the shipped 1mm, for the same reason project v23 does it — a shop's saved
 * method describes how its existing jobs were cut, and a curve cut without the allowance must
 * keep being cut that way until somebody decides otherwise. Setting it is one edit under
 * Settings → Construction.
 */
const migrateStandardsV18toV19 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  return { ...raw, version: 19, constructions: constructions.map(withFinishLaminate) };
};

/** Standards v13 → v14: new jobs inherit supplier-authored decor swatches. */
const migrateStandardsV13toV14 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const sheets = (materials.sheets as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    version: 14,
    materials: { ...materials, sheets: withResolvedTextures(sheets, AU_SHEET_MATERIALS) },
  };
};

/** Standards v14 → v15: expose the expanded supplier and upholstery libraries to future jobs. */
const migrateStandardsV14toV15 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const sheets = (materials.sheets as Record<string, unknown>[] | undefined) ?? [];
  const existing = new Set(sheets.map((sheet) => sheet.id));
  return {
    ...raw,
    version: 15,
    materials: {
      ...materials,
      sheets: [...sheets, ...AU_SHEET_MATERIALS.filter((sheet) => !existing.has(sheet.id))],
      upholstery: materials.upholstery ?? AU_MATERIAL_LIBRARY.upholstery ?? [],
    },
  };
};

/** Repair v15 standards saved before the bundled texture metadata was added. */
const migrateStandardsV15toV16 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const sheets = (materials.sheets as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    version: 16,
    materials: { ...materials, sheets: withResolvedTextures(sheets, AU_SHEET_MATERIALS) },
  };
};

/** Add newly shipped supplier finishes and upholstery without replacing shop choices. */
const migrateStandardsV16toV17 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const sheets = (materials.sheets as Record<string, unknown>[] | undefined) ?? [];
  const upholstery = (materials.upholstery as Record<string, unknown>[] | undefined) ?? [];
  const sheetIds = new Set(sheets.map((item) => item.id));
  const upholsteryIds = new Set(upholstery.map((item) => item.id));
  return {
    ...raw,
    version: 17,
    materials: {
      ...materials,
      sheets: [...sheets, ...AU_SHEET_MATERIALS.filter((item) => !sheetIds.has(item.id))],
      upholstery: [...upholstery, ...(AU_MATERIAL_LIBRARY.upholstery ?? []).filter((item) => !upholsteryIds.has(item.id))],
    },
  };
};

/**
 * v19 → v20: the upholsterer's rate onto the shop's own fabric list (§4.19).
 *
 * The standards half of the project's v27, and it is the *additive* half: standards are what new
 * jobs start from, so nothing already quoted changes because of this. Written only where a rate is
 * absent, matched by id, so a shop that has typed its own is left alone.
 */
const migrateStandardsV19toV20 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const upholstery = (materials.upholstery as Record<string, unknown>[] | undefined) ?? [];
  const shipped = (AU_MATERIAL_LIBRARY.upholstery ?? []) as unknown as Record<string, unknown>[];
  return {
    ...raw,
    version: 20,
    materials: {
      ...materials,
      upholstery: upholstery.map((item) => {
        if (item.charges !== undefined) return item;
        const match = shipped.find((s) => s.id === item.id);
        return match ? { ...item, charges: match.charges, indicativePricing: match.indicativePricing } : item;
      }),
    },
  };
};

/**
 * v20 → v21: **the labour rates this chain has never once repaired.**
 *
 * This is the migration that should have shipped beside project v23, and its absence is why the
 * `$NaN` quote came back months after §4.14 fixed it.
 *
 * **What actually happened.** §5.0's curve laminate added two rates to `LabourRates`. Project v25
 * backfills them into a saved *job*. Nothing ever backfilled them into the **standards** — read all
 * twenty migrations above and not one of them touches `settings.labour`; v18 → v19, the laminate's
 * own standards migration, fills in `constructions` and stops there. So a shop's stored standards
 * keep the holes forever, `createEmptyProject` copies them into every new job, and that job is
 * stamped at the current schema — so the project chain that knows how to repair it never runs on
 * it. Then `laminatedCurves * laminateSetupMinutesPerCurve` is `0 * undefined`, which is `NaN`, and
 * it takes the whole quote from Total cost down **on a job with no curve in it at all**.
 *
 * **Standards are what new jobs are built from, so repairing them here is the fix that lasts.**
 * The project side gets the same treatment at v28 → v29 for jobs already made from broken
 * standards; this is the one that stops it happening to the next job.
 *
 * **Nothing a shop has typed is touched**, including a deliberate zero — the shared backfill tests
 * for the key, not for falsiness. This is the same class of change as v15 → v16: a repair to
 * something that was silently incomplete, not a change of anybody's mind.
 */
const migrateStandardsV20toV21 = (raw: Record<string, unknown>): Record<string, unknown> => ({
  ...raw,
  version: 21,
  settings: withBackfilledLabourRates(raw.settings),
});

/**
 * v21 → v22: **the saved banquette recipe gets the cushion overhang too.**
 *
 * The other half of project v29 → v30, and it ships in the same commit on purpose. A shop's saved
 * cabinet types are recipes — a "Banquette 1800" carries a full `CabinetOptions` of its own — so a
 * type saved before this holds a `seatCushionInset` the app no longer reads, and every banquette
 * placed from it would come out with **no overhang at all** while the job it was placed into had
 * been repaired.
 *
 * That is §4.22's fault written out: a repair that reaches the job and not the standards it is
 * copied from, so the app looks fixed until somebody uses the feature the standards exist for.
 * `withCushionOverhang` is shared with the project chain rather than reimplemented here, for the
 * same reason `withBackfilledLabourRates` is — a second copy is free to drift, and drift is how
 * this happened last time.
 */
const migrateStandardsV21toV22 = (raw: Record<string, unknown>): Record<string, unknown> => ({
  ...raw,
  version: 22,
  savedTypes: ((raw.savedTypes as Record<string, unknown>[] | undefined) ?? []).map(
    withCushionOverhang,
  ),
});

/**
 * v22 → v23: **the shop's price list gets the real sheet sizes too.**
 *
 * The other half of project v31 → v32, and it ships in the same commit for the reason §4.22 exists:
 * a repair that reaches the job and not the standards it is copied from looks fixed until the next
 * job is started, which then arrives nesting into the usable area again. `withRealSheetSizes` and
 * `withRekeyedSheetChoices` are shared with the project chain rather than written twice.
 */
/**
 * v23 → v24: **the shop's allowance applies to every board of its class.**
 *
 * The other half of project v32 → v33, shipping in the same commit for the reason §4.22 exists: a
 * repair that reaches the job and not the standards it is copied from looks fixed until the next
 * job is started, which then arrives with the old footprints. This is the chain that has burnt this
 * codebase before — a job is born from the standards, so standards left unrepaired re-infect every
 * new job at the current schema version, where nothing is left to fix it.
 */
/**
 * v24 → v25: **the ply and laminate footprints, on the standards as well as on the job.**
 *
 * The other half of project v33 → v34. Same reason as every one of these: a job takes a *copy* of
 * the standards, so standards left unrepaired quietly re-infect the next job at the current schema
 * version, where there is no migration left to fix it.
 */
const migrateStandardsV24toV25 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const settings = (raw.settings as Record<string, unknown> | undefined) ?? {};
  const nesting = (settings.nesting as Record<string, unknown> | undefined) ?? {};
  return {
    ...raw,
    version: 25,
    materials: {
      ...materials,
      sheets: withRealLaminateSheets(withRealSheetSizes(materials.sheets)),
    },
    settings: {
      ...settings,
      nesting: { ...nesting, sheetSizes: withRekeyedSheetChoices(nesting.sheetSizes) },
    },
  };
};

const migrateStandardsV23toV24 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const settings = (raw.settings as Record<string, unknown> | undefined) ?? {};
  const nesting = (settings.nesting as Record<string, unknown> | undefined) ?? {};
  return {
    ...raw,
    version: 24,
    materials: { ...materials, sheets: withRealSheetSizes(materials.sheets) },
    settings: {
      ...settings,
      nesting: { ...nesting, sheetSizes: withRekeyedSheetChoices(nesting.sheetSizes) },
    },
  };
};

const migrateStandardsV22toV23 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const settings = (raw.settings as Record<string, unknown> | undefined) ?? {};
  const nesting = (settings.nesting as Record<string, unknown> | undefined) ?? {};
  return {
    ...raw,
    version: 23,
    materials: { ...materials, sheets: withRealSheetSizes(materials.sheets) },
    settings: {
      ...settings,
      nesting: { ...nesting, sheetSizes: withRekeyedSheetChoices(nesting.sheetSizes) },
    },
  };
};

/** Add the complete shipped MERIVOBOX height range to current shop standards. */
const migrateStandardsV17toV18 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const hardware = (raw.hardware as Record<string, unknown> | undefined) ?? {};
  const systems = (hardware.runnerSystems as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    version: 18,
    hardware: {
      ...hardware,
      runnerSystems: systems.map((system) =>
        withShippedSideHeights(system, BLUM_HARDWARE_LIBRARY.runnerSystems),
      ),
    },
  };
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
