import { mm } from '../../units.ts';
import type { CabinetSpec } from '../spec.ts';
import { carcassCornerFormers, wrapLayers } from '../parts.ts';
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
    backCushionHeight: mm(400), backCushionThickness: mm(80), backCushionAngle: 0,
    cushionCornerRadius: mm(18), leftEndCushion: false, rightEndCushion: false,
  },
  parts: [
    ...CUSTOM_CABINET_SPEC.parts,
    // A banquette has an open carcass beneath its lift-up lid. The bottom carries the curve,
    // while intermediate formers support the bendy-ply wrap up to the top of the carcass.
    { key: 'formers', produce: (ctx) => carcassCornerFormers(ctx, { hasTopPanel: false }) },
    { key: 'skin', produce: (ctx) => (ctx.radius ? wrapLayers(ctx, ctx.radius) : []) },
  ],
};
