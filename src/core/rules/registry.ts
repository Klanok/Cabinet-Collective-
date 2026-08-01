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
import { TALL_CABINET_SPEC } from './specs/tallCabinet.ts';
import { CUSTOM_CABINET_SPEC } from './specs/customCabinet.ts';
import { RADIUS_END_SPEC } from './specs/radiusEnd.ts';
import { APPLIANCE_SPACE_SPEC } from './specs/applianceSpace.ts';
import { STANDALONE_PANEL_SPEC } from './specs/standalonePanel.ts';
import { BANQUETTE_SPEC } from './specs/banquette.ts';

export const CABINET_SPECS: Readonly<Record<CabinetTypeId, CabinetSpec>> = {
  base: BASE_CABINET_SPEC,
  wall: WALL_CABINET_SPEC,
  'drawer-bank': DRAWER_BANK_SPEC,
  tall: TALL_CABINET_SPEC,
  custom: CUSTOM_CABINET_SPEC,
  'radius-end': RADIUS_END_SPEC,
  banquette: BANQUETTE_SPEC,
  panel: STANDALONE_PANEL_SPEC,
  appliance: APPLIANCE_SPACE_SPEC,
};

export const getSpec = (typeId: CabinetTypeId): CabinetSpec => {
  const spec = CABINET_SPECS[typeId];
  if (!spec) throw new Error(`No spec registered for cabinet type: ${typeId}`);
  return spec;
};

export const allSpecs = (): readonly CabinetSpec[] => Object.values(CABINET_SPECS);
