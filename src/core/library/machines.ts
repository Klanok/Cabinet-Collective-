/**
 * The machines this shop cuts on.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * EVERY PROFILE HERE IS UNVERIFIED. None of it has been compared against a program the
 * machine actually runs, and none of it has been near a spindle. `unconfirmed` on each
 * profile lists what specifically is a guess, and that list is printed in the report, on
 * screen, and as a comment at the top of every program the profile writes.
 *
 * This is the same contract `library/blum.ts` has for hardware figures and
 * `library/materials.au.ts` has for money, and it is here for a sharper reason than either:
 * a wrong drawer figure costs a drawer box, and a wrong Z datum costs a spindle.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **How to make one of these real, in about ten minutes.** Take one `.nc` file the machine already
 * runs — ideally one with drilling in it and one that cuts parts out — and compare it line for line
 * against what `post/iso.ts` writes. The five things to look at, in the order they matter:
 *
 *   1. ~~**Z zero.**~~ **Answered, and it was the one this list was written for.** Both machines
 *      work from the decking sheet up — Z0 is the top of the spoilboard, the sheet's top face is at
 *      +thickness, and a through cut finishes at a small *negative* Z inside the sacrificial board.
 *      Both profiles are `table`. It shipped as `material-top` and was wrong, so every program
 *      written before that correction cut air on this machine.
 *   2. **Tool change.** Copy the exact lines the machine's own program uses. Some controllers want
 *      `M6 T3`, some `T3 M6`, some need a spindle stop and a Z retract first.
 *   3. **Drilling.** Does it use `G81 … G80`, or explicit plunges? Set `drillStyle`.
 *   4. **The drill bank.** If the existing program bores a row of shelf-pin holes in one hit, find
 *      the code that selects the spindles and fill in `drillBank`. Until then this bores every hole
 *      with the router, which is slower and works on any machine.
 *   5. **Feeds and speeds.** Copy them from the existing program rather than from this file.
 */

import { mm } from '../units.ts';
import type { MachineProfile, MachineTool } from '../post/machine.ts';

/**
 * A conservative tool table.
 *
 * The feeds are deliberately slow. A feed that is too low wastes time and polishes an edge; a feed
 * that is too high breaks a bit and ruins a sheet, and only one of those is worth risking on
 * numbers nobody has checked.
 */
const CONSERVATIVE_TOOLS: readonly MachineTool[] = [
  {
    toolId: 'straight-6',
    pocket: 1,
    feed: 4000,
    plungeFeed: 1200,
    spindleRpm: 18000,
    maxDepthOfCut: mm(9),
  },
  {
    toolId: 'straight-12',
    pocket: 2,
    feed: 3500,
    plungeFeed: 1000,
    spindleRpm: 16000,
    maxDepthOfCut: mm(12),
  },
  {
    toolId: 'straight-16',
    pocket: 3,
    feed: 3000,
    plungeFeed: 900,
    spindleRpm: 15000,
    maxDepthOfCut: mm(14),
  },
  { toolId: 'vee-90', pocket: 4, feed: 3000, plungeFeed: 900, spindleRpm: 18000, maxDepthOfCut: mm(6) },
  { toolId: 'vee-60', pocket: 5, feed: 3000, plungeFeed: 900, spindleRpm: 18000, maxDepthOfCut: mm(6) },
  {
    toolId: 'round-6',
    pocket: 6,
    feed: 3000,
    plungeFeed: 900,
    spindleRpm: 18000,
    maxDepthOfCut: mm(6),
  },

  /*
   * Drills. Note the spindle speeds: a boring bit is not run at router speed, and a 35mm hinge bit
   * at 18,000rpm would burn. They step down with diameter, which is the direction the rule goes,
   * and every one of these numbers is a guess flagged in `unconfirmed`.
   *
   * `maxDepthOfCut` is the full depth for all of them — a hole is drilled in one plunge, not
   * pecked, which is right for 13mm into board and would not be for deep drilling in steel.
   */
  { toolId: 'drill-3', pocket: 7, feed: 1200, plungeFeed: 800, spindleRpm: 6000, maxDepthOfCut: mm(20) },
  { toolId: 'drill-5', pocket: 8, feed: 1200, plungeFeed: 800, spindleRpm: 6000, maxDepthOfCut: mm(20) },
  { toolId: 'drill-8', pocket: 9, feed: 1000, plungeFeed: 700, spindleRpm: 5000, maxDepthOfCut: mm(20) },
  { toolId: 'drill-35', pocket: 10, feed: 600, plungeFeed: 400, spindleRpm: 3000, maxDepthOfCut: mm(20) },
];

/**
 * KDT nesting router.
 *
 * KDT is the machine builder; what decides the G-code is the **controller** inside it, and that has
 * not been established. Syntec, LNC and Weihong are all common on this class of machine and they
 * differ in the places listed below. What the `.nc` extension does tell us is worth something: the
 * machine takes plain-text ISO G-code rather than a proprietary geometry format the way a Homag
 * (`.mpr`) or a Biesse (`.bpp`) does, so the shape of what is written here is right even where the
 * detail is not.
 *
 * Nothing here should be run before it has been checked against a program the machine already
 * runs. See the note at the top of this file for what to compare.
 */
export const KDT_NESTING_ROUTER: MachineProfile = {
  id: 'kdt-nesting',
  name: 'KDT nesting router',
  fileExtension: '.nc',

  /*
   * **Zero at the table, confirmed from the shop — and this replaces a guess that was wrong.**
   *
   * > "With both the KDT and the Woodtron the gcode works from the decking sheet up, that is to say
   * > a Z value of -0.2mm would be cutting 0.2mm into the sacrificial board."
   *
   * That is `table` exactly: Z0 is the top of the spoilboard, the sheet's own top face sits at
   * +thickness, and a through cut finishes at **negative** Z by the overcut. It shipped as
   * `material-top` on the reasoning that it was the safer way to be wrong — a material-top program
   * run on a table-zero machine cuts air, where the reverse drives the full thickness into the bed.
   *
   * **The reasoning was sound and the answer was still wrong, which is the point of asking.** Every
   * program written before this cut air on this machine: at 16mm the contour went to Z-16.5 where
   * the material does not start until Z+16.
   *
   * This is the first figure to come off the unchecked list, and it is the one the list was written
   * for — see the header. The rest of the dialect is still unverified.
   */
  zDatum: 'table',
  clearanceHeight: mm(20),
  plungeClearance: mm(3),
  throughOvercut: mm(0.5),
  // Onion skin rather than tabs: a nesting machine holds the sheet on vacuum, and 0.2mm left under
  // a part is enough to stop a small one lifting into the cutter while still snapping out by hand.
  leaveUncut: mm(0.2),

  envelope: { x: mm(3700), y: mm(1900), z: mm(120) },

  drillStyle: 'canned-g81',
  // Deliberately absent. A drill bank would put a System 32 row down in one hit instead of
  // twenty-one plunges, and it is the single biggest time saving available here — but a bank
  // configured wrong fires a spindle that is not over the hole it thinks it is. It stays off until
  // somebody reads the codes off the machine.
  drillBank: undefined,

  partCutterToolId: 'straight-6',
  tools: CONSERVATIVE_TOOLS,

  preamble: ['G21', 'G90', 'G17', 'G40', 'G54'],
  postamble: ['G0 Z50', 'M5', 'M9', 'M30'],
  toolChange: (tool) => [`M6 T${tool.pocket}`],
  startSpindle: (tool) => [`S${tool.spindleRpm} M3`, 'M8'],
  stopSpindle: ['M5', 'M9'],

  unconfirmed: [
    'Which controller is in this machine (Syntec, LNC, Weihong all differ) — the whole dialect follows from it.',
    'Everything except the Z datum. That one is confirmed from the shop; nothing else here has been.',
    'Tool change: assumed "M6 Tn". Copy the exact lines from an existing program.',
    'Drilling: assumed a G81/G80 canned cycle rather than explicit plunges.',
    'Feeds, speeds and depth of cut are conservative guesses, not this machine\'s numbers.',
    'Which pocket each bit lives in is invented. Match the T numbers to the machine\'s own tool table.',
    'The drill bank is switched off, so every hole is bored with the router spindle. Slow but safe.',
    'Bed size 3700x1900 and Z travel 120mm are assumed from the sheet sizes, not measured.',
  ],
};

/**
 * A generic ISO machine, for simulating.
 *
 * Not a machine anybody owns — the point of it is that free simulators and LinuxCNC read this
 * dialect, so a program can be *looked at* moving before any of the KDT questions are settled.
 * Checking the toolpath and checking the dialect are two different jobs and this separates them.
 */
export const GENERIC_ISO_ROUTER: MachineProfile = {
  ...KDT_NESTING_ROUTER,
  id: 'generic-iso',
  name: 'Generic ISO router (for simulation)',
  fileExtension: '.nc',
  drillStyle: 'explicit',
  envelope: { x: mm(3700), y: mm(1900), z: mm(150) },
  unconfirmed: [
    'A simulation target, not a machine. Use it to check the toolpath, not the dialect.',
  ],
};

export const MACHINE_PROFILES: readonly MachineProfile[] = [
  KDT_NESTING_ROUTER,
  GENERIC_ISO_ROUTER,
];

export const DEFAULT_MACHINE_ID = KDT_NESTING_ROUTER.id;

export const findMachine = (id: string): MachineProfile => {
  const found = MACHINE_PROFILES.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown machine profile: ${id}`);
  return found;
};

/** True when any machine a program is written for is still carrying unverified figures. */
export const hasUnverifiedMachine = (profile: MachineProfile): boolean =>
  profile.unconfirmed.length > 0;
