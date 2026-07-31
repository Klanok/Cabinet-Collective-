/**
 * The versioned project schema — the single source of truth a whole job is stored as.
 *
 * Everything downstream (panels, cutlist, nesting result, CAM operations) is *derived* from
 * this and never stored back into it. That is what lets any layer be regenerated from
 * scratch instead of each keeping a copy that can drift.
 */

import { type Mm, mm } from '../units.ts';
import type { Benchtop } from './benchtop.ts';
import type { Cabinet } from './cabinet.ts';
import type { KickBase } from './kickBase.ts';
import {
  type ConstructionMethod,
  collapseThicknessFields,
  withFixingStrip,
  withLadderKick,
  withSystemHoles,
} from './construction.ts';
import type { HardwareLibrary } from './hardware.ts';
import type { MaterialLibrary } from './material.ts';
import type { Room } from './room.ts';
import { type DoorStyle, DEFAULT_DOOR_STYLES, PLAIN_SLAB_STYLE } from '../standards/doorStyles.ts';
import {
  BLUM_HARDWARE_LIBRARY,
  DEFAULT_DRAWER_SIDE_HEIGHT_CODE,
  DEFAULT_HINGE_SYSTEM_ID,
  DEFAULT_RUNNER_SYSTEM_ID,
} from '../library/blum.ts';
import { AU_BENCHTOP_MATERIALS } from '../library/materials.au.ts';

export const CURRENT_SCHEMA_VERSION = 11 as const;

/**
 * The bendy ply an older job is given when it is migrated forward. It has no curved parts in
 * it, so nothing is cut from this — it is there so the slot is never empty.
 */
export const DEFAULT_SKIN_MATERIAL_ID = 'bendy-ply-3';

/**
 * What a job nests to until somebody says otherwise. See `NestingSettings` for why each is what
 * it is. Defined here rather than in the AU library because the v10 → v11 migration needs the
 * values, and that module imports this one for its types.
 */
export const DEFAULT_NESTING_SETTINGS: NestingSettings = {
  kerf: mm(3.2),
  sheetEdgeTrim: mm(0),
  usableOffcutMin: mm(300),
};

/**
 * GST treatment. These are genuinely different arithmetic, not a display toggle:
 *
 * - `registered`: GST paid on materials is claimed back, so the cost base is the ex-GST
 *   price, and 10% GST is charged on top of the sell price.
 * - `not-registered`: GST paid on materials cannot be claimed, so it is a real cost and the
 *   cost base is the GST-inclusive price. No GST is charged on the invoice.
 *
 * Getting this backwards understates cost by ~9% on an unregistered job, which is the kind
 * of error that quietly eats a margin.
 */
export type GstMode = 'registered' | 'not-registered';

export interface LabourRates {
  /** Manufacturing charge-out rate, ex-GST. */
  readonly ratePerHourExGst: number;
  /** Cutting/handling allowance per panel. */
  readonly minutesPerPanel: number;
  /** Edgebanding allowance per banded edge. */
  readonly minutesPerBandedEdge: number;
  /** Assembly allowance per cabinet. */
  readonly minutesPerCabinet: number;

  /** On-site install rate, ex-GST. Usually differs from the shop rate. */
  readonly installRatePerHourExGst: number;
  /**
   * How install time is worked out.
   *
   * `mirror-manufacturing` bills the same hours as the shop time — a rough but defensible
   * first pass, and the one in use until there is a real per-cabinet install model to
   * replace it with.
   */
  readonly installHoursMode: 'mirror-manufacturing' | 'fixed';
  /** Hours used when `installHoursMode` is 'fixed'. */
  readonly installFixedHours: number;
}

/**
 * The three numbers a nest depends on that are the **shop's**, not the board's.
 *
 * A sheet size and a price belong to the material; how much your blade takes out and how much you
 * trim off an edge belong to your saw, and they change what fits. They live here rather than on
 * the material for the same reason the hinge drilling distance lives on the construction method
 * rather than on the hinge: a product fact is the manufacturer's, a shop fact is yours.
 */
export interface NestingSettings {
  /**
   * How much width the blade removes on every cut.
   *
   * 3.2mm is a thin-kerf panel saw blade and is the shipped figure; a standard blade is nearer
   * 4.4, and a job nested for a CNC router is nested to the **cutter** diameter, usually 6 or 8.
   * Unlike the board-thickness figure in §4.1 this does *not* ship at zero, because zero is not a
   * conservative default here — it is a claim that the saw removes no material, which would nest
   * two parts into a space that only holds one.
   */
  readonly kerf: Mm;
  /**
   * Trimmed off each edge of a sheet before anything is cut from it.
   *
   * **Ships at zero**, and that is the honest default: a shop that does not trim is not trimming,
   * and a guessed 10mm would quietly shrink every sheet in every job. Enter what your saw actually
   * takes off to square a sheet up. Note it comes off all four edges — a shop that only
   * straightens two reference edges is trimming half this and should say so.
   */
  readonly sheetEdgeTrim: Mm;
  /**
   * The smallest offcut worth putting back on the rack, measured on its shorter side.
   *
   * Reporting only. Nothing is cut from an offcut and nothing is priced off one — a nest that
   * quietly consumed last job's leftovers would be a nest nobody could check against the stock
   * actually in the shop. It is here so the board a job buys and does not use is visible as
   * something you still have rather than as waste.
   */
  readonly usableOffcutMin: Mm;
}

export interface ProjectSettings {
  readonly gstMode: GstMode;
  /** Legal entity the job is quoted under — the thing that determines `gstMode`. */
  readonly entityName: string;
  /** Margin applied to cost to reach the sell price, as a percentage of cost. */
  readonly marginPercent: number;
  /** Kerf, edge trim and the smallest offcut worth keeping. See `NestingSettings`. */
  readonly nesting: NestingSettings;
  readonly labour: LabourRates;
  /**
   * Flat delivery charge, ex-GST.
   *
   * Added after margin rather than marked up — it is a charge passed to the customer, not a
   * cost being sold on. If you'd rather carry margin on it, that is a one-line change in
   * costing.ts and worth saying so.
   */
  readonly deliveryFeeExGst: number;
}

export interface Project {
  readonly schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  readonly id: string;
  readonly name: string;
  readonly client?: string;
  readonly createdAt: string;
  readonly updatedAt: string;

  readonly room: Room;
  readonly cabinets: readonly Cabinet[];
  /**
   * Benchtops and ladder bases — the two things that span a run of cabinets and belong to none of
   * them.
   *
   * **These are the only stored things in this file that are also derivable**, and the exception is
   * argued in `model/runUnit.ts`. In short: a panel is derived from a cabinet every time because
   * nothing else decides it, and a benchtop stops being derived the moment somebody sets an
   * overhang on one end. They are generated from a run once and owned from then on.
   */
  readonly benchtops: readonly Benchtop[];
  readonly kickBases: readonly KickBase[];
  readonly materials: MaterialLibrary;
  readonly constructions: readonly ConstructionMethod[];
  /**
   * The door styles this job's fronts are machined to.
   *
   * Copied in from the shop standards, never referenced, for the same reason the materials are:
   * a style decides how a part is cut, so editing your shaker border next year must not
   * re-machine a kitchen you already quoted.
   */
  readonly doorStyles: readonly DoorStyle[];
  /**
   * The runner and hinge systems this job's boxes are cut to and its carcasses bored for.
   *
   * Snapshotted, not referenced, for the same reason the materials and the door styles are — and
   * with a sharper edge than either. A runner system decides **how big a drawer bottom is cut**.
   * Change your standard runner next year and a kitchen already quoted must still cut to the runner
   * it was quoted for, or the boxes come back from the saw fitting nothing.
   */
  readonly hardware: HardwareLibrary;
  readonly settings: ProjectSettings;

  /** Default materials used when a cabinet doesn't override them. */
  readonly defaults: ProjectDefaults;
}

export interface ProjectDefaults {
  readonly constructionId: string;
  readonly carcassMaterialId: string;
  readonly backMaterialId: string;
  readonly doorMaterialId: string;
  /** Bendy ply for formed skins. Only curved work uses it, but it has to be orderable. */
  readonly skinMaterialId: string;
  readonly edgeBandId: string;
  /** Style used for every front unless a cabinet says otherwise. */
  readonly doorStyleId: string;
  /** Drawer runner system every drawer bank is built on unless a cabinet says otherwise. */
  readonly runnerSystemId: string;
  /** Which of that system's box heights — Blum's 'M', 'K', 'N'. */
  readonly drawerSideHeightCode: string;
  /** Hinge system every door is bored for unless a cabinet says otherwise. */
  readonly hingeSystemId: string;
  readonly baseCabinetHeight: Mm;
  readonly baseCabinetDepth: Mm;
  readonly wallCabinetHeight: Mm;
  readonly wallCabinetDepth: Mm;
  readonly tallCabinetHeight: Mm;
  readonly tallCabinetDepth: Mm;
  /** Height above finished floor of the underside of a wall cabinet. */
  readonly wallCabinetMountHeight: Mm;
}

/**
 * v1 → v2.
 *
 * v1 had a single `frontReveal` applied to all four edges of a front, and a single `frontGap`
 * used both between side-by-side doors and between stacked drawer fronts. v2 splits both by
 * direction. The old value carries into both halves of each pair, so a migrated job cuts
 * exactly as it did before — a migration must never quietly change anyone's parts.
 *
 * v2 also adds install rates and a delivery fee, defaulted so an existing job's total moves
 * only by what the user then chooses to charge.
 */
const migrateV1toV2 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  const settings = (raw.settings as Record<string, unknown> | undefined) ?? {};
  const labour = (settings.labour as Record<string, unknown> | undefined) ?? {};

  return {
    ...raw,
    schemaVersion: 2,
    constructions: constructions.map((c) => {
      const { frontReveal, frontGap, ...rest } = c;
      const reveal = typeof frontReveal === 'number' ? frontReveal : 1.5;
      const gap = typeof frontGap === 'number' ? frontGap : 3;
      return {
        ...rest,
        revealTopBottom: reveal,
        revealSides: reveal,
        gapBetweenDoors: gap,
        gapBetweenDrawers: gap,
      };
    }),
    settings: {
      ...settings,
      deliveryFeeExGst: settings.deliveryFeeExGst ?? 0,
      labour: {
        ...labour,
        installRatePerHourExGst:
          labour.installRatePerHourExGst ?? labour.ratePerHourExGst ?? 85,
        installHoursMode: labour.installHoursMode ?? 'mirror-manufacturing',
        installFixedHours: labour.installFixedHours ?? 0,
      },
    },
  };
};

/**
 * v2 → v3.
 *
 * v2 carried one `revealTopBottom` for both ends of a front. That is wrong for a base
 * cabinet, where the door is normally flush with the bottom of the carcass and carries its
 * reveal only at the top, under the benchtop.
 *
 * The old value carries into both, so a migrated job still cuts as it did. Choosing the new
 * flush-bottom default is then a deliberate edit, not something that happens to a saved job
 * behind your back.
 */
const migrateV2toV3 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    schemaVersion: 3,
    constructions: constructions.map((c) => {
      const { revealTopBottom, ...rest } = c;
      const reveal = typeof revealTopBottom === 'number' ? revealTopBottom : 1.5;
      return {
        ...rest,
        revealTop: rest.revealTop ?? reveal,
        revealBottom: rest.revealBottom ?? reveal,
      };
    }),
  };
};

/**
 * v3 → v4.
 *
 * Sheet materials gain `actualThickness` — what the board really measures, as against what it
 * is called. Parts are now calculated from that figure, because a panel that fits *between*
 * two boards has to match the boards that will really be cut.
 *
 * Every existing material is migrated to "it measures what it says", so a saved job cuts to
 * exactly the same sizes as before. Entering 16.3 for nominal 16mm board is then a deliberate
 * edit, per material — as it has to be, because it moves every part in every cabinet by a
 * fraction of a millimetre.
 *
 * The version is bumped even though the field could have simply defaulted, so that a build
 * from before this change **refuses** a file whose boards have been measured rather than
 * quietly cutting it to nominal. That silent version is the dangerous one.
 */
const migrateV3toV4 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const sheets = (materials.sheets as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    schemaVersion: 4,
    materials: {
      ...materials,
      sheets: sheets.map((s) => ({ ...s, actualThickness: s.actualThickness ?? s.thickness })),
    },
  };
};

/**
 * v4 → v5.
 *
 * Construction methods lose their carcass, back and door thicknesses. v4 had already stopped
 * calculating from them — the board decides that — leaving them as a nominal the method was
 * "built around" and checked against. Two places claiming to know one fact is the thing this
 * codebase exists not to do, so they are gone, and with them the check.
 *
 * No part moves. The thicknesses stopped sizing anything in v4, so removing them changes
 * nothing dimensional; what changes is that the two shipped methods, which differed only in
 * those numbers, are now visibly one method. Any construction a shop genuinely edited stays
 * as its own method, and every cabinet is repointed at whichever method survived, so a saved
 * job cuts exactly as it did.
 */
const migrateV4toV5 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const { constructions, idMap } = collapseThicknessFields(
    (raw.constructions as Record<string, unknown>[] | undefined) ?? [],
  );
  const remap = (id: unknown): unknown => (typeof id === 'string' ? (idMap[id] ?? id) : id);
  const defaults = (raw.defaults as Record<string, unknown> | undefined) ?? {};
  const cabinets = (raw.cabinets as Record<string, unknown>[] | undefined) ?? [];

  return {
    ...raw,
    schemaVersion: 5,
    constructions,
    defaults: { ...defaults, constructionId: remap(defaults.constructionId) },
    cabinets: cabinets.map((c) => ({ ...c, constructionId: remap(c.constructionId) })),
  };
};

/**
 * v5 → v6.
 *
 * Fronts gain a door style: a named, parametric recipe for what is machined into a door's
 * face. The job carries its own copy of the style library, because a style decides how a part
 * is cut and a job is a record of what was agreed.
 *
 * **No part moves and nothing re-prices.** Every existing job is given the shipped style list
 * and defaulted to the plain slab, which machines nothing and costs nothing — so a job cuts,
 * quotes and looks exactly as it did. Choosing a shaker is then a deliberate edit.
 *
 * The version is bumped even though the fields could have simply defaulted, and for the same
 * reason v4 was: an older build loading a shaker kitchen would quietly quote and machine it as
 * plain slabs. Refusing the file is the honest failure; silently cutting the wrong doors is
 * not.
 */
const migrateV5toV6 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const defaults = (raw.defaults as Record<string, unknown> | undefined) ?? {};
  const existing = raw.doorStyles as DoorStyle[] | undefined;
  return {
    ...raw,
    schemaVersion: 6,
    doorStyles: existing && existing.length > 0 ? existing : DEFAULT_DOOR_STYLES,
    defaults: { ...defaults, doorStyleId: defaults.doorStyleId ?? PLAIN_SLAB_STYLE.id },
  };
};

/**
 * v6 → v7.
 *
 * Curved work arrives, and with it a board no previous job could have needed: bendy ply for a
 * skin wrapped over formers. It gets its own material slot rather than borrowing the door
 * board, because it is a different sheet bought for a different reason — and because its
 * thickness decides how *long* a skin is cut, not just how it fits.
 *
 * **No part moves and nothing re-prices.** A job with no curved parts in it never resolves the
 * new slot, so the only change to an existing file is a default id sitting unused. Every
 * existing cabinet keeps every dimension it had.
 *
 * The version is bumped anyway, for the reason v4 and v6 were: an older build opening a job
 * with a radiused end in it would not know the type, and the honest failure is refusing the
 * file rather than quietly dropping a cabinet out of a kitchen.
 */
const migrateV6toV7 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const defaults = (raw.defaults as Record<string, unknown> | undefined) ?? {};
  return {
    ...raw,
    schemaVersion: 7,
    defaults: {
      ...defaults,
      // Named rather than imported from the AU library: that module imports this one for its
      // types, and reaching back for a value would close the loop.
      skinMaterialId: defaults.skinMaterialId ?? DEFAULT_SKIN_MATERIAL_ID,
    },
  };
};

/**
 * v7 → v8.
 *
 * Construction methods gain a **fixing strip** — the flat run of front face a curved corner
 * piece is fixed to. It belongs to the method, beside the kick setback and the shelf setback,
 * because it is a number a shop builds to rather than something the geometry can work out.
 *
 * **No part moves and nothing re-prices.** Only a cabinet carrying a corner radius reads the
 * figure, and no job saved before this version could have had one — `radiusCorner` and
 * `carcassRadius` did nothing until now.
 *
 * The version is bumped anyway, for the reason v4, v6 and v7 were: an older build opening a
 * job with a radiused corner in it would draw the cabinet square, quote it square and cut it
 * square, and never say so. Refusing the file is the honest failure.
 */
const migrateV7toV8 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    schemaVersion: 8,
    constructions: constructions.map(withFixingStrip),
  };
};

/**
 * v8 → v9. **Hardware arrives, and this is the one migration that changes what a job costs.**
 *
 * Every other migration in this file was written to move nothing: an old job comes forward and cuts
 * and prices exactly as it did. This one cannot honour that, and pretending otherwise would be the
 * dishonest option, so it is worth being plain about what happens and why it is right.
 *
 * **Nothing that already existed moves.** Every panel a v8 job had comes out the same size, in the
 * same place, with the same banding. That half of the rule is kept, and it is the half that
 * protects a job on the saw.
 *
 * **What appears is what was missing.** A drawer bank now cuts the drawer boxes Phase 1 deliberately
 * left out, because the runner that dictates their size is finally chosen. Hinges, mounting plates,
 * runners and shelf pins now appear on a BOM and on the quote. A saved kitchen therefore gets
 * *dearer*, and the reason is that it always had hinges and runners in it and was never being
 * charged for them. Leaving that under-quote in place to protect a number would be the worse
 * outcome by a wide margin.
 *
 * The alternative was a flag that kept hardware switched off for migrated jobs. That was rejected:
 * it means two code paths, and it means opening last year's kitchen and finding no drawer boxes with
 * nothing on screen to say why.
 *
 * The version bump does its usual job — an older build opening a v9 job would draw the drawer boxes
 * as nothing at all and quote the hardware at zero, and refusing the file is the honest failure.
 */
const migrateV8toV9 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  const defaults = (raw.defaults as Record<string, unknown> | undefined) ?? {};
  const existing = raw.hardware as HardwareLibrary | undefined;
  return {
    ...raw,
    schemaVersion: 9,
    constructions: constructions.map(withSystemHoles),
    hardware:
      existing && existing.runnerSystems?.length > 0 ? existing : BLUM_HARDWARE_LIBRARY,
    defaults: {
      ...defaults,
      runnerSystemId: defaults.runnerSystemId ?? DEFAULT_RUNNER_SYSTEM_ID,
      drawerSideHeightCode: defaults.drawerSideHeightCode ?? DEFAULT_DRAWER_SIDE_HEIGHT_CODE,
      hingeSystemId: defaults.hingeSystemId ?? DEFAULT_HINGE_SYSTEM_ID,
    },
  };
};

/**
 * v9 → v10. **Benchtops and ladder bases become objects the job owns.**
 *
 * This one moves nothing, and unlike v9 it can honour that completely.
 *
 * A v9 job comes forward with **no benchtops and no ladder bases at all**. Every part is the same
 * part, every price is the same price, and the 3D view keeps showing a top over each run — but that
 * slab is now drawn as a **ghost**, explicitly labelled as nothing having been specified yet,
 * rather than as a benchtop the job does not have. Generating a real one is a deliberate action.
 *
 * The alternative was to generate a top for every run on the way through, and it was rejected for a
 * reason worth writing down: a benchtop's *material* is the whole question. Guessing stone would
 * add thousands to a saved quote; guessing laminate would add hundreds; guessing nothing at all
 * would produce an object with no price and no honest way to say so. Under-quoting a job the user
 * has already sent is worse than showing them an empty list with a button on it.
 *
 * Three things arrive alongside:
 *
 *   - `materials.benchtops`, the shipped list of top materials, so the slot is never empty.
 *   - the ladder-base figures on every construction method — see `withLadderKick`. No part moves;
 *     nothing but a ladder base reads them, and no v9 job could have had one.
 *   - `appliance` becomes a cabinet type. Nothing is migrated *to* it; it is there to be used.
 *
 * The version is bumped for the usual reason: an older build opening a v10 job would drop the
 * benchtops and the plinths on the floor and quote the kitchen without them, silently. Refusing the
 * file is the honest failure.
 */
const migrateV9toV10 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const existingTops = materials.benchtops as unknown[] | undefined;
  return {
    ...raw,
    schemaVersion: 10,
    constructions: constructions.map(withLadderKick),
    benchtops: raw.benchtops ?? [],
    kickBases: raw.kickBases ?? [],
    materials: {
      ...materials,
      benchtops:
        existingTops && existingTops.length > 0 ? existingTops : AU_BENCHTOP_MATERIALS,
    },
  };
};

/**
 * v10 → v11. **The job is nested, and this is the second migration that changes what a job costs.**
 *
 * **No part moves.** Every panel a v10 job had comes out the same size, in the same place, with the
 * same banding, the same features and the same hardware. Nesting reads the parts; it does not
 * produce them, and nothing in the rule engine was touched to add it. That half of the rule is
 * kept, and it is the half that protects a job on the saw.
 *
 * **What changes is the board.** `sheetWastageFactor` is gone, and with it the estimate that turned
 * part area into sheet cost by dividing by an assumed yield. Two things were wrong with that number
 * and only one of them was that it was a guess:
 *
 *   - It charged **fractional sheets.** The sample kitchen's 17.80m² of parts came to 20.94m² at a
 *     15% allowance, which is 3.23 sheets of 3600×1800 — and the same screen said "~4 sheets"
 *     beside it, because the count was rounded up and the money was not. Nobody sells a third of a
 *     sheet. A shop buys whole ones, and the leftover goes on the rack whether or not the quote
 *     admits it exists.
 *   - It was **one allowance for every material and every part size.** A job of small parts and a
 *     job with a 3000mm plinth rail in it wasted the same assumed proportion of every sheet.
 *
 * So a migrated job gets **dearer**, and the reason is that it was being charged for less board
 * than it takes to cut. Leaving that under-quote in place to protect a number would be the worse
 * outcome, which is the argument v9 made about the hardware and it has not got weaker. What the job
 * gets in exchange is a nest it can be cut from and a yield figure that was measured rather than
 * assumed — `tests/nesting.test.ts` asserts both halves separately, so nobody has to wonder whether
 * the re-price was an accident.
 *
 * A shop that had tuned `sheetWastageFactor` to its own experience loses that setting, and should:
 * it was a knob for guessing at a number that is now counted. What replaces it is `kerf` and
 * `sheetEdgeTrim`, which are facts about the saw rather than a fudge factor over the outcome.
 *
 * The version bump does its usual job — an older build opening a v11 job would find no wastage
 * factor, divide by an undefined and quote the sheet goods as `NaN`, and refusing the file is the
 * honest failure.
 */
const migrateV10toV11 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const settings = (raw.settings as Record<string, unknown> | undefined) ?? {};
  const { sheetWastageFactor: _dropped, ...rest } = settings;
  return {
    ...raw,
    schemaVersion: 11,
    settings: {
      ...rest,
      nesting: (rest.nesting as NestingSettings | undefined) ?? DEFAULT_NESTING_SETTINGS,
    },
  };
};

/**
 * Load a project from stored JSON, migrating older schema versions forward.
 *
 * Migrations run in sequence, so a v1 file loaded after several schema changes still arrives
 * intact rather than needing a v1→vN special case for every version.
 */
export const migrateProject = (raw: unknown): Project => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('migrateProject: project data is not an object');
  }
  let data = raw as Record<string, unknown>;
  const version = data.schemaVersion;
  if (typeof version !== 'number') {
    throw new Error('migrateProject: missing schemaVersion');
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `migrateProject: this file was saved by a newer version (schema ${version}, this build reads ${CURRENT_SCHEMA_VERSION})`,
    );
  }

  if (data.schemaVersion === 1) data = migrateV1toV2(data);
  if (data.schemaVersion === 2) data = migrateV2toV3(data);
  if (data.schemaVersion === 3) data = migrateV3toV4(data);
  if (data.schemaVersion === 4) data = migrateV4toV5(data);
  if (data.schemaVersion === 5) data = migrateV5toV6(data);
  if (data.schemaVersion === 6) data = migrateV6toV7(data);
  if (data.schemaVersion === 7) data = migrateV7toV8(data);
  if (data.schemaVersion === 8) data = migrateV8toV9(data);
  if (data.schemaVersion === 9) data = migrateV9toV10(data);
  if (data.schemaVersion === 10) data = migrateV10toV11(data);

  if (data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`migrateProject: could not migrate schema version ${String(version)}`);
  }
  return data as unknown as Project;
};

export const touchProject = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });
