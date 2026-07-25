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

export const CURRENT_SCHEMA_VERSION = 1 as const;

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
  /** Charge-out rate, ex-GST. */
  readonly ratePerHourExGst: number;
  /** Cutting/handling allowance per panel. */
  readonly minutesPerPanel: number;
  /** Edgebanding allowance per banded edge. */
  readonly minutesPerBandedEdge: number;
  /** Assembly allowance per cabinet. */
  readonly minutesPerCabinet: number;
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
  /** Height above finished floor of the underside of a wall cabinet. */
  readonly wallCabinetMountHeight: Mm;
}

/**
 * Load a project from stored JSON, migrating older schema versions forward.
 *
 * There is exactly one version today, so this is a stub with a real shape rather than real
 * migrations — but the entry point exists now so that the first schema change has an
 * obvious place to go, instead of becoming a scatter of optional fields.
 */
export const migrateProject = (raw: unknown): Project => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('migrateProject: project data is not an object');
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version === CURRENT_SCHEMA_VERSION) return raw as Project;
  if (typeof version !== 'number') {
    throw new Error('migrateProject: missing schemaVersion');
  }
  throw new Error(
    `migrateProject: schema version ${version} is not supported (current is ${CURRENT_SCHEMA_VERSION})`,
  );
};

export const touchProject = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });
