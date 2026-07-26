/**
 * The versioned project schema — the single source of truth a whole job is stored as.
 *
 * Everything downstream (panels, cutlist, nesting result, CAM operations) is *derived* from
 * this and never stored back into it. That is what lets any layer be regenerated from
 * scratch instead of each keeping a copy that can drift.
 */

import type { Mm } from '../units.ts';
import type { Cabinet } from './cabinet.ts';
import type { ConstructionMethod } from './construction.ts';
import type { MaterialLibrary } from './material.ts';
import type { Room } from './room.ts';

export const CURRENT_SCHEMA_VERSION = 3 as const;

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
  readonly settings: ProjectSettings;

  /** Default materials used when a cabinet doesn't override them. */
  readonly defaults: ProjectDefaults;
}

export interface ProjectDefaults {
  readonly constructionId: string;
  readonly carcassMaterialId: string;
  readonly backMaterialId: string;
  readonly doorMaterialId: string;
  readonly edgeBandId: string;
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

  if (data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`migrateProject: could not migrate schema version ${String(version)}`);
  }
  return data as unknown as Project;
};

export const touchProject = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });
