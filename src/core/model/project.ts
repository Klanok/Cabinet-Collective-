/**
 * The versioned project schema — the single source of truth a whole job is stored as.
 *
 * Everything downstream (panels, cutlist, nesting result, CAM operations) is *derived* from
 * this and never stored back into it. That is what lets any layer be regenerated from
 * scratch instead of each keeping a copy that can drift.
 */

import type { Mm } from '../units.ts';
import type { Cabinet } from './cabinet.ts';
import { type ConstructionMethod, collapseThicknessFields } from './construction.ts';
import type { MaterialLibrary } from './material.ts';
import type { Room } from './room.ts';
import { type DoorStyle, DEFAULT_DOOR_STYLES, PLAIN_SLAB_STYLE } from '../standards/doorStyles.ts';

export const CURRENT_SCHEMA_VERSION = 7 as const;

/**
 * The bendy ply an older job is given when it is migrated forward. It has no curved parts in
 * it, so nothing is cut from this — it is there so the slot is never empty.
 */
export const DEFAULT_SKIN_MATERIAL_ID = 'bendy-ply-3';

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

export interface ProjectSettings {
  readonly gstMode: GstMode;
  /** Legal entity the job is quoted under — the thing that determines `gstMode`. */
  readonly entityName: string;
  /** Margin applied to cost to reach the sell price, as a percentage of cost. */
  readonly marginPercent: number;
  /**
   * Sheet-yield allowance used to turn part area into sheet cost before Phase 3 nesting can
   * give a real sheet count. 0.15 means 15% of sheet area is assumed unusable.
   * Phase 3 replaces this estimate with an actual nest.
   */
  readonly sheetWastageFactor: number;
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

  if (data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`migrateProject: could not migrate schema version ${String(version)}`);
  }
  return data as unknown as Project;
};

export const touchProject = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });
