/**
 * Australian dimensional defaults.
 *
 * These are the numbers an AU kitchen actually gets built to, and they interlock — changing
 * one without the others breaks a standard elevation:
 *
 *   finished floor            0
 *   kick height             150
 *   base carcass top        870   (150 kick + 720 carcass)
 *   benchtop surface        900   (870 + 30mm top)
 *   wall cabinet underside 1500   (600mm splashback above the benchtop)
 *   wall cabinet top       2220   (1500 + 720 carcass)
 */

import { mm } from '../units.ts';
import { DEFAULT_NESTING_SETTINGS, type ProjectDefaults, type ProjectSettings } from '../model/project.ts';

export const AU_BASE_CARCASS_HEIGHT = mm(720);
export const AU_BASE_CARCASS_DEPTH = mm(560);
export const AU_KICK_HEIGHT = mm(150);
export const AU_BENCHTOP_THICKNESS = mm(30);
/** Finished benchtop surface height above floor. */
export const AU_BENCHTOP_HEIGHT = mm(900);
export const AU_SPLASHBACK_HEIGHT = mm(600);
export const AU_WALL_CARCASS_HEIGHT = mm(720);
export const AU_WALL_CARCASS_DEPTH = mm(300);
export const AU_WALL_MOUNT_HEIGHT = mm(1500);
/** Tall carcass height, set so its top lands level with the wall cabinets at 2220. */
export const AU_TALL_CARCASS_HEIGHT = mm(2070);
export const AU_TALL_CARCASS_DEPTH = mm(560);

export const AU_PROJECT_DEFAULTS: ProjectDefaults = {
  constructionId: 'frameless-32',
  // Carcass and back are board specs — white HMR particleboard is the shop standard.
  // Only the doors carry a decor, because only they are seen.
  carcassMaterialId: 'hmr-white-16',
  backMaterialId: 'hmr-white-16',
  doorMaterialId: 'poly-classic-white-door-18',
  // Only curved work cuts this, so on a kitchen with no radius in it the slot never resolves.
  skinMaterialId: 'bendy-ply-8',
  edgeBandId: 'eb-white-1mm',
  // A plain slab, because a door style is a choice a client makes rather than something the
  // shop assumes. It machines nothing, so a new job cuts exactly as jobs always have.
  doorStyleId: 'slab',
  // MERIVOBOX at M height is the shop's standard drawer, so every drawer bank is built on it
  // unless a cabinet says otherwise. Its nominal length is *not* a default: it is chosen to suit
  // each cabinet's real depth, which is what a 560 carcass and a 460 carcass need it to be.
  runnerSystemId: 'merivobox',
  drawerSideHeightCode: 'M',
  hingeSystemId: 'clip-top-blumotion',
  baseCabinetHeight: AU_BASE_CARCASS_HEIGHT,
  baseCabinetDepth: AU_BASE_CARCASS_DEPTH,
  wallCabinetHeight: AU_WALL_CARCASS_HEIGHT,
  wallCabinetDepth: AU_WALL_CARCASS_DEPTH,
  wallCabinetMountHeight: AU_WALL_MOUNT_HEIGHT,
  tallCabinetHeight: AU_TALL_CARCASS_HEIGHT,
  tallCabinetDepth: AU_TALL_CARCASS_DEPTH,
};

/**
 * Default settings assume a GST-registered entity. Switch `gstMode` per project — this is
 * not a preference, it follows from which entity is invoicing.
 */
export const AU_DEFAULT_SETTINGS: ProjectSettings = {
  gstMode: 'registered',
  entityName: '',
  marginPercent: 35,
  // A thin-kerf panel saw blade, no edge trim, and 300mm as the smallest offcut worth racking.
  // The one that matters is the kerf — see `NestingSettings` for why it is not zero.
  nesting: DEFAULT_NESTING_SETTINGS,
  deliveryFeeExGst: 0,
  labour: {
    ratePerHourExGst: 85,
    minutesPerPanel: 4,
    minutesPerBandedEdge: 1.5,
    minutesPerCabinet: 25,
    // Prep, spray both faces and wait ~15 minutes for it to tack off. Fixed per curve because
    // the wait is a wait. Unchecked — the shop reports wide variance between people.
    laminateSetupMinutesPerCurve: 25,
    // Cut oversize, lay on, trim-route. Unchecked, same reason.
    laminateMinutesPerM2: 20,
    installRatePerHourExGst: 85,
    installHoursMode: 'mirror-manufacturing',
    installFixedHours: 0,
  },
};
