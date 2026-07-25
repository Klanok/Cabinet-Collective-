/**
 * The spec registry.
 *
 * Adding a cabinet type is: write a spec file, add it here. Nothing in the geometry engine,
 * the viewport or costing changes — they all work in terms of `Panel`, which every spec
 * produces.
 */

import type { CabinetTypeId } from '../model/cabinet.ts';
import type { CabinetSpec } from './spec.ts';
import { BASE_CABINET_SPEC } from './specs/baseCabinet.ts';
import { WALL_CABINET_SPEC } from './specs/wallCabinet.ts';
import { DRAWER_BANK_SPEC } from './specs/drawerBank.ts';

export const CABINET_SPECS: Readonly<Record<CabinetTypeId, CabinetSpec>> = {
  base: BASE_CABINET_SPEC,
  wall: WALL_CABINET_SPEC,
  'drawer-bank': DRAWER_BANK_SPEC,
};

export const getSpec = (typeId: CabinetTypeId): CabinetSpec => {
  const spec = CABINET_SPECS[typeId];
  if (!spec) throw new Error(`No spec registered for cabinet type: ${typeId}`);
  return spec;
};

export const allSpecs = (): readonly CabinetSpec[] => Object.values(CABINET_SPECS);
