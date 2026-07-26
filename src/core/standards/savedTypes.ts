/**
 * Saved cabinet types — "I built this once, I'll build it again."
 *
 * A saved type is a *recipe*, not a cabinet: a name, a base type, sizes and options. Placing
 * one creates an ordinary cabinet from that recipe, which you are then free to change without
 * affecting the recipe or anything else placed from it.
 *
 * They live in the shop standards rather than in a job, because the whole value is that they
 * outlast the job you first worked them out on.
 */

import type { Mm } from '../units.ts';
import type { CabinetMaterials, CabinetOptions, CabinetTypeId } from '../model/cabinet.ts';

export interface SavedCabinetType {
  readonly id: string;
  /** What you'd call it on a job sheet — "Sink base 900", "Banquette 1800", "Pigeon holes". */
  readonly name: string;
  /** Which spec builds it. */
  readonly typeId: CabinetTypeId;
  readonly width: Mm;
  readonly height: Mm;
  readonly depth: Mm;
  readonly options: CabinetOptions;
  /**
   * Material overrides, if this type is always cut from something specific — a wet-area sink
   * base in HMR, say. Usually empty, so the type follows the job's defaults.
   */
  readonly materials: CabinetMaterials;
  /** Optional note for your own benefit. */
  readonly note?: string;
}

let counter = 0;
export const nextSavedTypeId = (): string => `type-${Date.now().toString(36)}-${(++counter).toString(36)}`;

/** Reset id generation, so tests get stable ids. */
export const resetSavedTypeIds = (): void => {
  counter = 0;
};

export interface CabinetLikeInput {
  readonly typeId: CabinetTypeId;
  readonly width: Mm;
  readonly height: Mm;
  readonly depth: Mm;
  readonly options: CabinetOptions;
  readonly materials: CabinetMaterials;
}

/**
 * Turn a placed cabinet into a reusable type.
 *
 * Position is deliberately not captured — where a cabinet happened to sit in one kitchen says
 * nothing about the next.
 */
export const savedTypeFromCabinet = (
  cabinet: CabinetLikeInput,
  name: string,
  note?: string,
): SavedCabinetType => ({
  id: nextSavedTypeId(),
  name,
  typeId: cabinet.typeId,
  width: cabinet.width,
  height: cabinet.height,
  depth: cabinet.depth,
  options: { ...cabinet.options },
  materials: { ...cabinet.materials },
  note,
});

export const upsertSavedType = (
  types: readonly SavedCabinetType[],
  type: SavedCabinetType,
): SavedCabinetType[] => {
  // Saving over an existing name replaces it — otherwise the list fills with near-duplicates.
  const withoutSameName = types.filter(
    (t) => t.id !== type.id && t.name.trim().toLowerCase() !== type.name.trim().toLowerCase(),
  );
  return [...withoutSameName, type].sort((a, b) => a.name.localeCompare(b.name));
};

export const removeSavedType = (
  types: readonly SavedCabinetType[],
  id: string,
): SavedCabinetType[] => types.filter((t) => t.id !== id);
