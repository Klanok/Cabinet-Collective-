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
  withAppliedEnds,
  withFrontStandoff,
  withShelfPinClearance,
  withLadderKick,
  withSystemHoles,
} from './construction.ts';
import {
  type HardwareLibrary,
  withProfileFixingPositions,
  withShippedSideHeights,
} from './hardware.ts';
import { type MaterialLibrary, withResolvedColours, withResolvedTextures } from './material.ts';
import type { Room } from './room.ts';
import { type DoorStyle, DEFAULT_DOOR_STYLES, PLAIN_SLAB_STYLE } from '../standards/doorStyles.ts';
import {
  BLUM_HARDWARE_LIBRARY,
  DEFAULT_DRAWER_SIDE_HEIGHT_CODE,
  DEFAULT_HINGE_SYSTEM_ID,
  DEFAULT_RUNNER_SYSTEM_ID,
} from '../library/blum.ts';
import { AU_BENCHTOP_MATERIALS, AU_MATERIAL_LIBRARY, AU_SHEET_MATERIALS } from '../library/materials.au.ts';

export const CURRENT_SCHEMA_VERSION = 22 as const;

/**
 * The bendy ply an older job is given when it is migrated forward. It has no curved parts in
 * it, so nothing is cut from this — it is there so the slot is never empty.
 */
export const DEFAULT_SKIN_MATERIAL_ID = 'bendy-ply-8';

export const DEFAULT_NESTING_SETTINGS: NestingSettings = {
  kerf: mm(6),
  sheetEdgeTrim: mm(6),
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

export interface NestingSettings {
  readonly kerf: Mm;
  readonly sheetEdgeTrim: Mm;
  readonly usableOffcutMin: Mm;
  /**
   * The sheet size to cut a given material from, by material id, keyed by `sheetSizeKey`.
   *
   * **Absent means the nester chooses**, which is what it has always done: every size the
   * material comes in is nested in full and the cheapest job wins. That is the right default and
   * stays the default — this is an override for when the choice is not the tool's to make.
   *
   * It usually is not. What the supplier has on the rack this week, what fits in the van, what
   * two people can lift onto the saw, and what the shop has half a pallet of already are all
   * facts the optimiser cannot see, and all of them beat a few dollars per sheet. So a shop can
   * name the size and the nest cuts from that.
   *
   * A stale entry — a size the material no longer comes in, because the material was changed
   * under it — falls back to choosing and says so rather than failing. See `nestMaterial`.
   *
   * Optional with no migration behind it, and that is safe rather than lazy: an absent map is
   * byte-for-byte the behaviour every existing job already has, so no saved job cuts or prices
   * differently for this field arriving.
   */
  readonly sheetSizes?: Readonly<Record<string, string>>;
}

export interface ProjectSettings {
  readonly gstMode: GstMode;
  /** Legal entity the job is quoted under — the thing that determines `gstMode`. */
  readonly entityName: string;
  /** Margin applied to cost to reach the sell price, as a percentage of cost. */
  readonly marginPercent: number;
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

/** Phase 3 replaces the yield estimate with a real nest and whole-sheet costing. */
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
 * v11 → v12. **The screen colours, backfilled onto jobs that never had them.**
 *
 * Reported from the bench as "changing the door to Notaio Walnut has done nothing", and the
 * diagnosis is worth keeping because the symptom points away from the cause. The material picker
 * was working perfectly: the cutlist changed, the price changed, the decor on the order changed.
 * What did not change was the picture — because a job carries its **own copy** of the material
 * list, and a job saved before `SheetMaterial.colour` existed has a copy with no colours in it at
 * all. Every part falls back to the viewport's colour for its role, so every decor draws the same.
 *
 * `colour` was added as an optional field with no migration behind it. This is that migration.
 *
 * **Nothing is cut, priced or ordered from a colour** — the decor name is the fact — so this is the
 * safest change a migration in this file has ever made. A colour a shop has deliberately set is
 * left alone; only an absent one is filled, and only from the shipped material of the same id.
 *
 * The version is bumped for the ordinary reason, even though an older build would read a v11 job
 * quite happily: a file that has been repaired should say so, and running the repair once on load
 * is better than running it on every render.
 */
const migrateV11toV12 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const sheets = (materials.sheets as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    schemaVersion: 12,
    materials: { ...materials, sheets: withResolvedColours(sheets, AU_SHEET_MATERIALS) },
  };
};

/**
 * v12 → v13. **The front standoff — the 2mm gap the model never had.**
 *
 * From the bench, correcting an 18mm door drawn as finishing at 578 on a 560 carcass:
 *
 * > "an 18mm door would land at 580 not 578 because that is the natural position of the hinge and
 * > it also allows for a bump stop"
 *
 * The back of a front does not sit flat on the carcass. It stands off, and the model had that gap
 * at zero — which put the finished face of every kitchen 2mm shallower than it really is, and put a
 * radiused corner's finish 2mm out from the doors it is supposed to line up with.
 *
 * **This one moves things, and it is worth being plain rather than quiet about it.** Every door and
 * drawer front moves 2mm forward, the kick face moves with them, and on a radiused cabinet the
 * curved kick's developed length changes.
 *
 * **No cut size on a square cabinet changes.** A door is the same rectangle 2mm further forward,
 * the carcass is untouched, and an ordinary kitchen's cutlist comes out identical — the test
 * asserts exactly that. Migrating to zero instead would have kept every saved job's fronts flat on
 * the carcass, which is knowingly preserving a number the shop has told us is wrong.
 */
const migrateV12toV13 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  return { ...raw, schemaVersion: 13, constructions: constructions.map(withFrontStandoff) };
};

/**
 * v13 → v14. **The applied-end figures on every construction method.**
 *
 * "I also need applied end panels asap — that's a huge miss", and it was: the board that goes on
 * the exposed end of a run so what you see is the door decor rather than the carcass melamine had
 * no model at all. The role existed and `STYLED_FRONT_ROLES` already listed it; nothing produced
 * one.
 *
 * **No part moves**, and unlike v12 this one can say so without qualification. The three figures
 * added here — the back scribe, the front overhang and whether the end runs to the floor — are read
 * by exactly one builder, and that builder produces nothing at all unless a cabinet names an end.
 * No cabinet saved before this version could have: the option did not exist, so every stored
 * cabinet arrives with no applied ends and cuts precisely what it cut.
 */
const migrateV13toV14 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  return { ...raw, schemaVersion: 14, constructions: constructions.map(withAppliedEnds) };
};

/**
 * v14 → v15. **The shelf-pin rows stop short of the ends, and are centred.**
 *
 * > "adjustable shelf holes should not go full height in the end panel, it should have a setting
 * > that sets how far off the top, bottom and fixed shelves. we also need to ensure that they are
 * > always equidistant so you can't end up with a flipped back and the holes offset."
 *
 * **This moves holes and cannot pretend otherwise**, which makes it the second of its kind after
 * `withFrontStandoff`. Every shelf-pin row in every saved job gets shorter at both ends, and the
 * holes that remain move, because the run is now centred rather than indexed off the bottom edge.
 *
 * **No part changes size and no part moves.** A side panel is the same rectangle in the same place
 * with a different set of Ø5 holes in it; nothing else in the cabinet reads those holes, and no
 * cutlist line changes. Migrating to a zero clearance would not have preserved the old positions
 * either — a zero clearance is centred too — so there was nothing to preserve them for. The reason
 * centring is the correct answer rather than a preference is argued in `rules/shelfPins.ts`.
 */
const migrateV14toV15 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const constructions = (raw.constructions as Record<string, unknown>[] | undefined) ?? [];
  return { ...raw, schemaVersion: 15, constructions: constructions.map(withShelfPinClearance) };
};

/**
 * v15 → v16. **The cabinet profile is fixed at four points, not two.**
 *
 * > "two holes for the cabinet side is wrong it should be 4"
 *
 * The runner's fixing data used to be a single spacing per length band — 128 or 256 — applied as
 * "this far behind the front fixing". Both halves were wrong. Those figures came off a table that
 * describes the drawer bottom rather than the cabinet side, and MERIVOBOX's profile takes four
 * screws a side, not two. They were adopted because both are whole multiples of 32 and a runner
 * landing on the frameless grid is a tidy story; it was a story, not a source.
 *
 * The record now holds **positions back from the front edge of the side panel**, which is the datum
 * Blum's "Cabinet profile fixing positions" sheet uses, so nothing has to be worked out between the
 * sheet and the drilling.
 *
 * **This moves drilling in every saved job with a drawer in it**, and there is no reading under
 * which it does not: the old holes were in the wrong places and there were two of them. **No part
 * changes size and no part moves** — a side panel is the same rectangle in the same place with a
 * different set of Ø5 holes. See `withProfileFixingPositions` for why a shop's own runner system
 * keeps its own figures instead of being handed Blum's.
 */
const migrateV15toV16 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const hardware = raw.hardware as Record<string, unknown> | undefined;
  if (!hardware) return { ...raw, schemaVersion: 16 };
  const systems = (hardware.runnerSystems as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    schemaVersion: 16,
    hardware: {
      ...hardware,
      runnerSystems: systems.map((s) =>
        withProfileFixingPositions(s, BLUM_HARDWARE_LIBRARY.runnerSystems),
      ),
    },
  };
};

/** v16 → v17: existing jobs gain the verified MERIVOBOX N, M and K choices. */
const migrateV16toV17 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const hardware = raw.hardware as Record<string, unknown> | undefined;
  if (!hardware) return { ...raw, schemaVersion: 17 };
  const systems = (hardware.runnerSystems as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    schemaVersion: 17,
    hardware: {
      ...hardware,
      runnerSystems: systems.map((system) =>
        withShippedSideHeights(system, BLUM_HARDWARE_LIBRARY.runnerSystems),
      ),
    },
  };
};

/** v17 → v18: supplier-authored decor swatches reach existing job material snapshots. */
const migrateV17toV18 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const sheets = (materials.sheets as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    schemaVersion: 18,
    materials: { ...materials, sheets: withResolvedTextures(sheets, AU_SHEET_MATERIALS) },
  };
};

/** v18 → v19: add new supplier choices without changing any material already selected. */
const migrateV18toV19 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const sheets = (materials.sheets as Record<string, unknown>[] | undefined) ?? [];
  const existing = new Set(sheets.map((sheet) => sheet.id));
  const additions = AU_SHEET_MATERIALS.filter((sheet) => !existing.has(sheet.id));
  return {
    ...raw,
    schemaVersion: 19,
    materials: {
      ...materials,
      sheets: [...sheets, ...additions],
      upholstery: materials.upholstery ?? AU_MATERIAL_LIBRARY.upholstery ?? [],
    },
  };
};

/**
 * v19 → v20: repair material snapshots saved at v19 before texture metadata was shipped.
 *
 * A browser keeps localhost storage across separately extracted source folders. That meant an old
 * v19 material library could keep creating "new" jobs whose Notaio record had no texture field.
 * The earlier v17 migration never ran because the stored job was already marked current.
 */
const migrateV19toV20 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const sheets = (materials.sheets as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    schemaVersion: 20,
    materials: { ...materials, sheets: withResolvedTextures(sheets, AU_SHEET_MATERIALS) },
  };
};

/** Add newly shipped supplier finishes and upholstery without replacing user materials. */
const migrateV20toV21 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const materials = (raw.materials as Record<string, unknown> | undefined) ?? {};
  const sheets = (materials.sheets as Record<string, unknown>[] | undefined) ?? [];
  const upholstery = (materials.upholstery as Record<string, unknown>[] | undefined) ?? [];
  const sheetIds = new Set(sheets.map((item) => item.id));
  const upholsteryIds = new Set(upholstery.map((item) => item.id));
  return {
    ...raw,
    schemaVersion: 21,
    materials: {
      ...materials,
      sheets: [...sheets, ...AU_SHEET_MATERIALS.filter((item) => !sheetIds.has(item.id))],
      upholstery: [...upholstery, ...(AU_MATERIAL_LIBRARY.upholstery ?? []).filter((item) => !upholsteryIds.has(item.id))],
    },
  };
};

/** Add the complete shipped MERIVOBOX height range to current browser snapshots. */
const migrateV21toV22 = (raw: Record<string, unknown>): Record<string, unknown> => {
  const hardware = (raw.hardware as Record<string, unknown> | undefined) ?? {};
  const systems = (hardware.runnerSystems as Record<string, unknown>[] | undefined) ?? [];
  return {
    ...raw,
    schemaVersion: 22,
    hardware: {
      ...hardware,
      runnerSystems: systems.map((system) =>
        withShippedSideHeights(system, BLUM_HARDWARE_LIBRARY.runnerSystems),
      ),
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
  if (data.schemaVersion === 11) data = migrateV11toV12(data);
  if (data.schemaVersion === 12) data = migrateV12toV13(data);
  if (data.schemaVersion === 13) data = migrateV13toV14(data);
  if (data.schemaVersion === 14) data = migrateV14toV15(data);
  if (data.schemaVersion === 15) data = migrateV15toV16(data);
  if (data.schemaVersion === 16) data = migrateV16toV17(data);
  if (data.schemaVersion === 17) data = migrateV17toV18(data);
  if (data.schemaVersion === 18) data = migrateV18toV19(data);
  if (data.schemaVersion === 19) data = migrateV19toV20(data);
  if (data.schemaVersion === 20) data = migrateV20toV21(data);
  if (data.schemaVersion === 21) data = migrateV21toV22(data);

  if (data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`migrateProject: could not migrate schema version ${String(version)}`);
  }
  return data as unknown as Project;
};

export const touchProject = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });
