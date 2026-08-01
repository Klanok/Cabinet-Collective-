import { mm } from '../../units.ts';
import type { CabinetSpec } from '../spec.ts';
import { CUSTOM_CABINET_SPEC } from './customCabinet.ts';

/** A ready-to-use upholstered seat base, built by the proven custom-carcass rules. */
export const BANQUETTE_SPEC: CabinetSpec = {
  ...CUSTOM_CABINET_SPEC,
  typeId: 'banquette',
  name: 'Banquette seating',
  defaultOptions: {
    topStyle: 'open', hasBack: true, shelfCount: 0, dividerCount: 1,
    doorCount: 0, drawerCount: 0, hasLid: true, lidOverhang: mm(20), hasKick: false,
    seatCushionThickness: mm(80), seatCushionInset: mm(5), hasBackCushion: true,
    backCushionHeight: mm(400), backCushionThickness: mm(80),
  },
};
