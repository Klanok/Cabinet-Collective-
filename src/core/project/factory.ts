/**
 * Project construction helpers, and the sample kitchen the Phase 1 gate is checked against.
 */

import { type Mm, mm } from '../units.ts';
import {
  type Cabinet,
  type CabinetOptions,
  type CabinetTypeId,
  radiusDefaultOptions,
} from '../model/cabinet.ts';
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
import { generateBenchtops, generateKickBases } from './generate.ts';

let counter = 0;
const nextId = (prefix: string): string => `${prefix}-${(++counter).toString(36)}`;

/** A new id with the given prefix. Shared so benchtops and plinths number the same way. */
export const newId = (prefix: string): string => nextId(prefix);

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
  // An appliance space is the whole opening, floor to the underside of the top — it has no kick
  // under it, because the appliance stands on the floor and has its own feet.
  if (typeId === 'appliance' || typeId === 'panel') return mm(0);
  const construction = findConstruction(constructions, constructionId);
  return options.hasKick === false ? mm(0) : construction.kickHeight;
};

/**
 * How thick a standalone panel's footprint is taken to be, along the run.
 *
 * A **nominal placeholder, not a manufacturing figure.** The panel's real thickness comes from the
 * board it is made of and nothing else (§2: the board decides how thick a board is), so this only
 * ever decides how wide its box is drawn on the plan and how far the next cabinet butts along. It
 * is the same nominal 16 the panel's `depth` carried before panels stood edge out — the axis
 * changed, the placeholder did not.
 */
export const PANEL_FOOTPRINT_THICKNESS: Mm = mm(16);

export const createCabinet = (
  args: NewCabinetArgs,
  defaults = AU_PROJECT_DEFAULTS,
  constructions: readonly ConstructionMethod[] = DEFAULT_CONSTRUCTIONS,
): Cabinet => {
  const constructionId = args.constructionId ?? defaults.constructionId;
  const spec = getSpec(args.typeId);
  // Three layers, and the order is the point: the type's own defaults, then what a corner
  // radius changes about them, then whatever was actually asked for. Anything explicit wins.
  const options = {
    ...spec.defaultOptions,
    ...radiusDefaultOptions(args.options ?? {}),
    ...args.options,
  };

  const naturalHeight =
    args.typeId === 'wall'
      ? defaults.wallCabinetHeight
      : args.typeId === 'tall'
        ? defaults.tallCabinetHeight
        : args.typeId === 'appliance'
          ? // Floor to the underside of the benchtop: the carcass height plus the kick the
            // cabinets either side of it are standing on. That is what makes the space line up
            // with its neighbours' tops, which is what lets one benchtop span all three.
            mm(defaults.baseCabinetHeight + findConstruction(constructions, constructionId).kickHeight)
          : args.typeId === 'panel'
            ? mm(2400)
          : args.typeId === 'banquette' || args.typeId === 'banquette-corner'
            ? mm(400)
            : defaults.baseCabinetHeight;
  const naturalDepth =
    args.typeId === 'wall'
      ? defaults.wallCabinetDepth
      : args.typeId === 'tall'
        ? defaults.tallCabinetDepth
        : args.typeId === 'banquette' || args.typeId === 'banquette-corner'
          ? mm(500)
          : defaults.baseCabinetDepth;

  const height = args.height ?? naturalHeight;

  /*
   * **A standalone panel's two footprint fields come out swapped, and this is the one place it
   * happens.**
   *
   * A panel stands **edge out** — see `specs/standalonePanel.ts`. It sits beside a cabinet the way
   * an applied end does, so what runs *along the run* is the board's thickness and what runs *into
   * the room* is the panel's own width. That is the opposite way round to every other cabinet,
   * where the width runs along the run.
   *
   * Doing the swap here rather than at each call site means every caller still says `width` and
   * still means the panel's face width, which is the thing a person types. And it means the
   * placement code needs no panel special case at all: `snapToNeighbour` butts the next cabinet
   * along by `neighbour.width`, and for a panel that is now a board thickness rather than 600mm,
   * which is exactly what butting an applied end does.
   */
  const isPanel = args.typeId === 'panel';
  const depth = isPanel ? (args.depth ?? args.width) : (args.depth ?? naturalDepth);

  return {
    id: nextId(args.typeId),
    typeId: args.typeId,
    name: args.name,
    constructionId,
    width: isPanel ? PANEL_FOOTPRINT_THICKNESS : args.width,
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
    // Empty on purpose. A benchtop is generated from a run once there is a run, and a ladder base
    // is a choice about how the job is built — neither is something a new job comes with.
    benchtops: [],
    kickBases: [],
    ...snapshotOf(standards),
  };
};

/**
 * A real kitchen run, used as the Phase 1 gate.
 *
 * A 4200mm base run against one wall — sink base, drawer bank, bin cupboard, pot drawers and a
 * dishwasher — with 2400mm of wall cabinets over it. Widths are the ones actually ordered, not
 * round numbers chosen to make the arithmetic tidy.
 *
 * **The dishwasher is in it on purpose**, and it is what makes this a fair test of the run rules
 * rather than a demonstration of the easy case: the benchtop runs straight over the space and comes
 * out as one 3600mm top, while the plinth stops either side of it and comes out as two. One run
 * finder, two answers, from the one gap.
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
    make({ typeId: 'appliance', name: 'DW Dishwasher', width: mm(600), x: mm(3000) }),
    make({ typeId: 'base', name: 'B4 End base', width: mm(600), x: mm(3600), options: { doorCount: 1, shelfCount: 1 } }),

    make({ typeId: 'wall', name: 'W1', width: mm(900), x: mm(0) }),
    make({ typeId: 'wall', name: 'W2', width: mm(600), x: mm(900), options: { doorCount: 1 } }),
    make({ typeId: 'wall', name: 'W3', width: mm(900), x: mm(1500) }),
  ];

  const placed: Project = {
    ...base,
    cabinets,
    settings: { ...base.settings, entityName: 'Ethereal', gstMode: 'registered' },
  };

  /*
   * A stone top and a ladder base — generated exactly the way the app generates them, from the run
   * finder, rather than written out by hand here. Anything hand-written would be a second opinion
   * about where a top goes, and the point of the sample kitchen is that it is checkable.
   *
   * Stone because that is what the top of an ordinary AU kitchen is, and because it exercises the
   * half of the costing that produces no parts at all: a square-metre rate, a sink cutout, a join
   * and a run of edge profiling, against a minimum.
   */
  const benchtops = generateBenchtops(placed, 'stone-quartz-20').map((top) => ({
    ...top,
    ends: { left: 'wall' as const, right: 'exposed' as const },
    cutouts: [
      {
        id: 'sink',
        kind: 'sink' as const,
        along: mm(450),
        fromBack: mm(280),
        width: mm(820),
        depth: mm(450),
        cornerRadius: mm(10),
      },
      {
        id: 'tap',
        kind: 'tap-hole' as const,
        along: mm(450),
        fromBack: mm(60),
        width: mm(35),
        depth: mm(35),
        cornerRadius: mm(17.5),
      },
    ],
    joins: [mm(1800)],
  }));

  const plinths = generateKickBases(placed);

  return { ...placed, cabinets: plinths.cabinets, benchtops, kickBases: plinths.kickBases };
};
