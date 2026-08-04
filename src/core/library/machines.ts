/**
 * The machines this shop cuts on.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * NOTHING HERE HAS BEEN NEAR A SPINDLE. Not one program written by any of these profiles
 * has been run, so simulation is still the gate. `unconfirmed` on each profile lists what
 * specifically is unverified or missing, and that list is printed in the report, on screen,
 * and as a comment at the top of every program the profile writes.
 *
 * This is the same contract `library/blum.ts` has for hardware figures and
 * `library/materials.au.ts` has for money, and it is here for a sharper reason than either:
 * a wrong drawer figure costs a drawer box, and a wrong Z datum costs a spindle.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **The two profiles are not in the same state, and the difference is the whole point of this
 * header.** `WOODTRON_NESTING_ROUTER` was **read** — off twenty-one `.nc` files from one real job,
 * written down in `docs/woodtron-dialect.md`, with every figure traceable to a section of it.
 * `KDT_NESTING_ROUTER` is still **guessed**, apart from its Z datum, which the shop stated directly.
 * Nothing has been carried from one to the other, and nothing should be: they are different
 * machines and the only thing anybody has confirmed about both is where Z zero is.
 *
 * **How to make the KDT real, in about ten minutes.** Take one `.nc` file it already runs — ideally
 * one with drilling in it and one that cuts parts out — and compare it line for line against what
 * `post/iso.ts` writes. The Woodtron doc is the worked example of exactly this. What to look at, in
 * the order it matters:
 *
 *   1. ~~**Z zero.**~~ **Answered, and it was the one this list was written for.** Both machines
 *      work from the decking sheet up — Z0 is the top of the spoilboard, the sheet's top face is at
 *      +thickness, and a through cut finishes at a small *negative* Z inside the sacrificial board.
 *      Both profiles are `table`. It shipped as `material-top` and was wrong, so every program
 *      written before that correction cut air on this machine.
 *   2. **Two heads, or one?** The Woodtron keeps a separate work offset and a separate rapid height
 *      for its router and its drill head. Whether the KDT does has never been looked at, so both its
 *      heads carry the same numbers — see the note on them below. Getting this wrong puts every hole
 *      in the wrong place relative to every cut, in a file that looks entirely plausible.
 *   3. **Tool change.** Copy the exact lines the machine's own program uses. Some controllers want
 *      `M6 T3`, some `T3 M6`, some need a spindle stop and a Z retract first. The Woodtron wanted
 *      `G666 T1` with a `G49` in front of it, which is not on anybody's list of guesses.
 *   4. **Drilling.** Does it use `G81 … G80`, or explicit plunges? Set `drillStyle`. There is not
 *      one `G81` in the Woodtron's twenty-one files.
 *   5. **The drill bank.** If the existing program bores a row of shelf-pin holes in one hit, find
 *      the code that selects the spindles and fill in `drillBank`. Until then this bores every hole
 *      with the router, which is slower and works on any machine.
 *   6. **Feeds and speeds.** Copy them from the existing program rather than from this file. The
 *      Woodtron's real feeds are five times the conservative guesses below.
 */

import { mm } from '../units.ts';
import {
  type DrillBank,
  type DrillSpindle,
  type MachineProfile,
  type MachineTool,
  bitmaskSelect,
  drillRow,
} from '../post/machine.ts';

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

  /*
   * **Two heads carrying the same numbers, which is a statement rather than a placeholder.**
   *
   * The Woodtron's own programs proved that a real nesting machine's router and drill head differ
   * in every one of these four figures. Nothing of the kind has been observed on the KDT — twenty-
   * one files exist for the Woodtron and none for this machine — so copying the Woodtron's split
   * across would be inventing a KDT fact, which is the one thing this profile must not do. The two
   * heads carry identical figures until somebody reads this machine's own programs.
   *
   * One exception, and it is not an invention: the drill head's `throughOvercut` is **zero**. That
   * is not a dialect fact, it is what a drill is — a Ø5 that overcut would put a hole in the bed on
   * every through-hole, hundreds of times a sheet. It also records what this code has always done,
   * since CAM has never added an overcut to a bore.
   */
  heads: {
    router: {
      workOffset: 'G54',
      clearanceHeight: mm(20),
      plungeClearance: mm(3),
      throughOvercut: mm(0.5),
    },
    drill: {
      workOffset: 'G54',
      clearanceHeight: mm(20),
      plungeClearance: mm(3),
      throughOvercut: mm(0),
    },
  },

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

  // No work offset here any more: it moved onto the head, because two heads have two of them. The
  // writer emits it when the head changes, which for a machine with no drill bank is once, in the
  // same place this line used to put it.
  preamble: ['G21', 'G90', 'G17', 'G40'],
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
    'Both heads are given the same work offset and the same rapid height. The Woodtron has two of ' +
      'each; whether this machine does has never been looked at.',
  ],
};

/**
 * The Woodtron's tool table — the two bits that appear across the twenty-one files.
 *
 * `T1` is the 10mm compression spiral and `T8` the 12mm, so the numbers are the machine's own
 * pockets and the table is **sparse**: there is no T2–T7 here because nothing in the files uses
 * them, not because they are empty. Everything else the job does is on the drill head.
 *
 * `H` always equals `T` in the files, so the length-offset register needs no field of its own.
 */
const WOODTRON_TOOLS: readonly MachineTool[] = [
  {
    toolId: 'straight-10',
    pocket: 1,
    // §5. Cutting F21000, ramp F7000 on the carcass and F4000 on the door — the slower of the two
    // observed ramps is taken as the plunge feed, since it is the one the machine chose for the
    // straight plunge on a rip.
    feed: 21000,
    plungeFeed: 4000,
    spindleRpm: 24000,
    // The deepest single pass in the files: an 18mm door taken right through to Z-0.2 in one go.
    maxDepthOfCut: mm(18.2),
  },
  {
    toolId: 'straight-12',
    pocket: 8,
    feed: 21000,
    plungeFeed: 4000,
    spindleRpm: 24000,
    maxDepthOfCut: mm(18.2),
  },
];

/*
 * ── The Woodtron's drill bank ────────────────────────────────────────────────────────────────
 *
 * §6 of the dialect doc. Spindle *n* sits at (n − 1) × 32 along X, which every observation fits:
 * spindle 1 at X0, 2 at X32, 5 at X128, 7 at X192. It is System 32, which is the whole point of
 * the head — five Ø5 spindles firing together put a shelf-pin row down in one plunge.
 */
const WOODTRON_ROW_1: readonly DrillSpindle[] = drillRow({
  axis: 'X',
  pitch: mm(32),
  from: 1,
  // "1–15ish" — the files show up to spindle 7 and the row is clearly longer. Fifteen is the count
  // that makes spindle 16 the start of the second row, and it is the one soft number here.
  count: 15,
  base: mm(0),
  across: mm(0),
  diameter: mm(5),
  // A row is not all one size: `D3 7` in the files puts a Ø3 at position 7.
}).map((s) => (s.number === 7 ? { ...s, diameter: mm(3) } : s));

/**
 * The second row — 16 and 17, offset in **Y** rather than X, carrying the big bits.
 *
 * Y160 and Y192, also 32 apart, so the row keeps the pitch but not the numbering origin: spindle 16
 * sits at 160, not at 15 × 32. That is why `drillRow` takes a `base` at all. The hinge borer being
 * on its own axis is why a door program moves in Y between the cup and its dowels.
 *
 * Their position on **X** was never visible in the files — every reference to them is a Y offset —
 * so it is recorded as zero and is one of the things a bank check has to confirm.
 */
const WOODTRON_ROW_2: readonly DrillSpindle[] = [
  { number: 16, at: { x: mm(0), y: mm(160) }, diameter: mm(10) },
  { number: 17, at: { x: mm(0), y: mm(192) }, diameter: mm(35) },
];

/**
 * The Woodtron's bank, **missing the one field that would let it be used.**
 *
 * `datum` is deliberately absent, and the type says so rather than a comment: there is no value
 * that could be put here honestly, because the twenty-one files cannot distinguish the two
 * readings — every drilled row in them is symmetric about its part. Guessing costs 128mm on the
 * first asymmetric pattern somebody runs.
 *
 * So the profile below cannot plug this in by accident. When the answer is known, it becomes:
 *
 *     drillBank: { ...WOODTRON_DRILL_BANK_WITHOUT_DATUM, datum: 'reference-spindle' }
 *
 * with whichever of the two the check says.
 */
export const WOODTRON_DRILL_BANK_WITHOUT_DATUM: Omit<DrillBank, 'datum'> = {
  spindles: [...WOODTRON_ROW_1, ...WOODTRON_ROW_2],
  // §6: `B31` is spindles 1+2+3+4+5, `B64` is spindle 7, `B65536` is spindle 17. Bit n−1.
  select: bitmaskSelect('B'),
  allUp: 'B0',
};

/**
 * Woodtron nesting router.
 *
 * **The one profile here that is read rather than guessed.** Every figure below comes off
 * `docs/woodtron-dialect.md`, which is twenty-one `.nc` files from one real job, and the section
 * each figure came from is named beside it. Read that document before changing anything here.
 *
 * ## What is still not right, and it is the important paragraph
 *
 * The machine cuts a sheet in **two passes over the whole sheet** — every contour down to a 1.0mm
 * onion skin first, and only then a second pass taking them all through to Z−0.2. Not two passes
 * per part. That is what keeps each part held on the vacuum while its neighbours are cut, and the
 * post does not write it: it finishes each part before starting the next.
 *
 * So this profile ships with `leaveUncut` at the machine's own **1.0mm first-pass figure**, which
 * means parts come off the machine still attached to the sheet and somebody has to take them
 * through. That is deliberate. Setting it to zero would match the machine's finished depth and
 * would have the post cut each part clean out in turn, freeing the first one under a spinning
 * cutter — which is precisely the failure the two-pass structure exists to prevent. A program that
 * does not finish is an inconvenience; one that drops a part loose is not.
 */
export const WOODTRON_NESTING_ROUTER: MachineProfile = {
  id: 'woodtron-nesting',
  name: 'Woodtron nesting router',
  fileExtension: '.nc',

  // §2. `Z46.3` / `Z36.3` / `Z26.3` on a 16.3mm sheet, and `G1 Z-0.2` through — so Z0 is the table.
  zDatum: 'table',

  /*
   * **The two heads, and all four figures differ.** §2 and §5.
   *
   *   drill  rapid  Z46.3 on 16.3 board  →  +30      router  rapid  Z36.3  →  +20
   *   drill  plunge Z26.3                →  +10      router  plunge Z26.3  →  +10
   *   drill  through Z0.0                →   0       router  through Z-0.2 →  0.2
   *   drill  origin G54 (MULTIDRILL)               router  origin G55 (ROUTER)
   *
   * The work offsets are the finding that matters most: the heads are physically apart and the
   * machine keeps an origin for each. One origin for both puts every hole wrong relative to every
   * cut, in a file that looks entirely plausible.
   */
  heads: {
    router: {
      workOffset: 'G55',
      clearanceHeight: mm(20),
      plungeClearance: mm(10),
      throughOvercut: mm(0.2),
    },
    drill: {
      workOffset: 'G54',
      clearanceHeight: mm(30),
      plungeClearance: mm(10),
      throughOvercut: mm(0),
    },
  },

  // The machine's own first pass — see the note above. Not its finished depth.
  leaveUncut: mm(1.0),

  // The bigger sheet in the files is 3115 x 1205, so the bed takes at least that. Both figures are
  // a lower bound off the material rather than a measurement, which is why they are flagged.
  envelope: { x: mm(3700), y: mm(1900), z: mm(120) },

  // §2: there is not a single G81 in twenty-one files. Holes are explicit plunges.
  drillStyle: 'explicit',

  /*
   * **Off, and one field is why.** §6 solved the spindle map — 32mm pitch, spindle n at (n−1)×32,
   * a second row at Y160/Y192 carrying the Ø10 and the Ø35, fired by a bitmask `B<n>`. Every group
   * and offset across all twenty-one files fits it with nothing left over. What is *not* solved is
   * `DrillBank.datum`: whether a programmed coordinate positions the reference spindle or the head
   * origin. Both give identical holes on a symmetric pattern, and every drilled row in the files is
   * symmetric — so the files cannot settle it and neither can any amount of re-reading them.
   *
   * Answer that against one part whose true hole positions are known and this becomes:
   *
   *     drillBank: WOODTRON_DRILL_BANK,
   *
   * and a System 32 row stops costing twenty-one separate router plunges. Until then every hole is
   * bored with the router, which is slower and is right whichever way the answer goes.
   */
  drillBank: undefined,

  // §5: `(TOOL: 10COMP3W)` / `G666 T1`. The 10mm compression spiral is what cuts parts out.
  partCutterToolId: 'straight-10',
  tools: WOODTRON_TOOLS,

  /*
   * §1, verbatim from the top of every file. The sheet declaration `G100 X.. Y.. Z..` is *not* here
   * because it is not a constant — it restates the sheet, and the writer has no way to emit it yet.
   * That is named in `unconfirmed` rather than left as a silent omission.
   */
  preamble: [
    'G8000',
    'G665',
    'M60 M82',
    'G90 G17',
    'G40 G80',
    'M91',
    'M82',
    'M32 M05',
    'M29',
    'G0 G53 Z0',
  ],

  // §8, verbatim.
  postamble: ['B0 M47', 'M05 M32', 'G0 G53 Z0.', 'G0 G53 X0. Y0.', 'G667', 'M29', 'M30'],

  // §5: `G666 T<n>`, not M6. H always equals T, so one number covers both registers, and `G49`
  // cancels the previous length offset before the next `G43` sets it.
  toolChange: (tool) => ['G49', `G666 T${tool.pocket}`],
  startSpindle: (tool) => ['M28', `M3 S${tool.spindleRpm}`, 'G0 G53 Z0.', `G43 H${tool.pocket}`, 'M31'],
  stopSpindle: ['M29', 'G49', 'G0 G53 Z0.'],

  unconfirmed: [
    'PARTS DO NOT COME FREE. The machine cuts every contour on the sheet to a 1.0mm skin and then ' +
      'takes them all through in a second sheet-wide pass; this post finishes each part before ' +
      'starting the next, so it writes the first pass only. Take them through by hand, or add the ' +
      'second pass before running a job on this.',
    'NO HOLES ARE DRILLED. Every drill on this machine lives on the multidrill head, which is ' +
      'switched off, and there is no evidence in the files of a boring bit on the router — so the ' +
      'tool table has none and every hole is reported by name and left out. Drill them on the ' +
      'borer, or turn the bank on.',
    'The drill bank is switched off. Its spindle map is solved (32mm pitch, spindle n at (n-1)x32, ' +
      'two rows) but whether a programmed coordinate is the reference spindle or the head origin ' +
      'is not — the two differ by 128mm on an asymmetric pattern. Check it against a part whose ' +
      'hole positions are known.',
    'The bank carries Ø3, Ø5, Ø10 and Ø35. This shop\'s hardware wants Ø8 dowels, which nothing on ' +
      'the head matches — so even with the bank on, dowel holes would still want the borer.',
    'Arcs are written G2/G3 with I and J. The real programs use the R form, and every arc in ' +
      'twenty-one files is G3 — so the direction round a part is fixed there and is not here.',
    'A rip across the sheet plunges straight down with no lead-in ramp on the real machine. This ' +
      'post writes every cut the same way.',
    'The sheet declaration "G100 X.. Y.. Z.." at the top of every real program is not written.',
    'Bed size 3700x1900 and Z travel 120mm are a lower bound off the 3115mm sheet, not measured.',
    'Feeds are the two tools seen in the files. Any other bit in the rack is unknown.',
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
  WOODTRON_NESTING_ROUTER,
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
