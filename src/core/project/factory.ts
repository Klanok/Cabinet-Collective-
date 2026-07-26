/**
 * Project construction helpers, and the sample kitchen the Phase 1 gate is checked against.
 */

import { type Mm, mm } from '../units.ts';
import type { Cabinet, CabinetOptions, CabinetTypeId } from '../model/cabinet.ts';
import {
  type ConstructionMethod,
  DEFAULT_CONSTRUCTIONS,
  findConstruction,
} from '../model/construction.ts';
import {
  CURRENT_SCHEMA_VERSION,
  type Project,
  type ProjectDefaults,
} from '../model/project.ts';
import { rectangularRoom } from '../model/room.ts';
import { v3 } from '../geom/vec.ts';
import { AU_PROJECT_DEFAULTS } from '../library/defaults.au.ts';
import { AU_SHOP_STANDARDS, type ShopStandards, snapshotOf } from '../standards/standards.ts';
import { getSpec } from '../rules/registry.ts';

let counter = 0;
const nextId = (prefix: string): string => `${prefix}-${(++counter).toString(36)}`;

/** Reset id generation. Tests call this so ids are stable run to run. */
export const resetIdCounter = (): void => {
  counter = 0;
};

export interface NewCabinetArgs {
  readonly typeId: CabinetTypeId;
  readonly name: string;
  readonly width: Mm;
  readonly height?: Mm;
  readonly depth?: Mm;
  /** World position of the carcass bottom-back-left corner. */
  readonly x: Mm;
  readonly z?: Mm;
  /** Overrides the type's natural mounting height. */
  readonly y?: Mm;
  readonly yawDeg?: number;
  readonly options?: CabinetOptions;
  readonly constructionId?: string;
}

/**
 * Natural height above the floor for a cabinet's carcass origin.
 *
 * A base cabinet's carcass sits on top of its kick, and a wall cabinet hangs at the job's
 * mount height — so the caller places cabinets by type rather than by remembering offsets.
 *
 * Both numbers come from the job, not from the shipped Australian defaults. A job built to a
 * 100mm kick has to place its cabinets at 100mm, or every carcass in it sits 50mm proud of
 * where the drawing says.
 */
export const naturalAnchorY = (
  typeId: CabinetTypeId,
  constructionId: string,
  options: CabinetOptions,
  constructions: readonly ConstructionMethod[] = DEFAULT_CONSTRUCTIONS,
  defaults: ProjectDefaults = AU_PROJECT_DEFAULTS,
): Mm => {
  if (typeId === 'wall') return defaults.wallCabinetMountHeight;
  const construction = findConstruction(constructions, constructionId);
  return options.hasKick === false ? mm(0) : construction.kickHeight;
};

export const createCabinet = (
  args: NewCabinetArgs,
  defaults = AU_PROJECT_DEFAULTS,
  constructions: readonly ConstructionMethod[] = DEFAULT_CONSTRUCTIONS,
): Cabinet => {
  const constructionId = args.constructionId ?? defaults.constructionId;
  const spec = getSpec(args.typeId);
  const options = { ...spec.defaultOptions, ...args.options };

  const naturalHeight =
    args.typeId === 'wall'
      ? defaults.wallCabinetHeight
      : args.typeId === 'tall'
        ? defaults.tallCabinetHeight
        : defaults.baseCabinetHeight;
  const naturalDepth =
    args.typeId === 'wall'
      ? defaults.wallCabinetDepth
      : args.typeId === 'tall'
        ? defaults.tallCabinetDepth
        : defaults.baseCabinetDepth;

  const height = args.height ?? naturalHeight;
  const depth = args.depth ?? naturalDepth;

  return {
    id: nextId(args.typeId),
    typeId: args.typeId,
    name: args.name,
    constructionId,
    width: args.width,
    height,
    depth,
    placement: {
      anchor: v3(
        args.x,
        args.y ?? naturalAnchorY(args.typeId, constructionId, options, constructions, defaults),
        args.z ?? 0,
      ),
      yawDeg: args.yawDeg ?? 0,
    },
    options,
    materials: {},
  };
};

/**
 * Start a job.
 *
 * The job takes a *copy* of the shop standards, not a reference to them. Changing your
 * standards later must never reach back and alter a job you have already quoted or cut.
 */
export const createEmptyProject = (
  name: string,
  client?: string,
  standards: ShopStandards = AU_SHOP_STANDARDS,
): Project => {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: nextId('project'),
    name,
    client,
    createdAt: now,
    updatedAt: now,
    room: rectangularRoom(nextId('room'), 'Kitchen', mm(4200), mm(3600), mm(2400)),
    cabinets: [],
    ...snapshotOf(standards),
  };
};

/**
 * A real kitchen run, used as the Phase 1 gate.
 *
 * A 3000mm base run against one wall — sink base, drawer bank, bin cupboard, pot drawers —
 * with 2400mm of wall cabinets over it. Widths are the ones actually ordered, not round
 * numbers chosen to make the arithmetic tidy.
 */
export const createSampleKitchen = (standards: ShopStandards = AU_SHOP_STANDARDS): Project => {
  const base = createEmptyProject('Sample kitchen', 'Demo', standards);
  // Cabinets are built against the job's own standards, so a shop with a 100mm kick gets a
  // sample kitchen on a 100mm kick.
  const make = (args: NewCabinetArgs) => createCabinet(args, base.defaults, base.constructions);

  const cabinets: Cabinet[] = [
    make({ typeId: 'base', name: 'B1 Sink base', width: mm(900), x: mm(0), options: { doorCount: 2, shelfCount: 0 } }),
    make({ typeId: 'drawer-bank', name: 'D1 Pot drawers', width: mm(600), x: mm(900), options: { drawerCount: 3 } }),
    make({ typeId: 'base', name: 'B2 Bin cupboard', width: mm(600), x: mm(1500), options: { doorCount: 1, shelfCount: 0 } }),
    make({ typeId: 'base', name: 'B3 Pantry base', width: mm(900), x: mm(2100), options: { doorCount: 2, shelfCount: 1 } }),

    make({ typeId: 'wall', name: 'W1', width: mm(900), x: mm(0) }),
    make({ typeId: 'wall', name: 'W2', width: mm(600), x: mm(900), options: { doorCount: 1 } }),
    make({ typeId: 'wall', name: 'W3', width: mm(900), x: mm(1500) }),
  ];

  return {
    ...base,
    cabinets,
    settings: { ...base.settings, entityName: 'Ethereal', gstMode: 'registered' },
  };
};
