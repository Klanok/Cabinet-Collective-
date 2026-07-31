/**
 * Construction methods.
 *
 * A construction method is *data*: the set of dimensional conventions a shop builds to.
 * Cabinet specs read these values rather than hard-coding them, which is what lets the same
 * base-cabinet spec produce an inset-back carcass or an applied-back one, on a 150mm kick or a
 * 100mm one, without a branch anywhere in the rule engine.
 *
 * **A method has no opinion about how thick the boards are.** That is the sheet's business —
 * see `model/material.ts` and `rules/context.ts`. It used to carry a nominal thickness for
 * each of carcass, back and door, which meant two places claimed to know one fact and were
 * free to disagree. Choosing an 18mm carcass is choosing an 18mm board; there is nothing left
 * for the method to say about it.
 *
 * The default is frameless (European 32mm system) because that is how cabinets are built
 * here. Face-frame is a construction method to be added later, not the baseline this engine
 * is shaped around.
 */

import { type Mm, mm } from '../units.ts';

export type ConstructionFamily = 'frameless-32' | 'face-frame';

/**
 * How the back panel is housed.
 *
 * - `applied`: back covers the full rear face of the carcass. Carcass depth includes it, so
 *   sides and horizontals are `depth - backThickness` deep.
 * - `inset`: back sits between the sides, flush with the rear. Sides run the full depth;
 *   horizontals are `depth - backThickness`.
 */
export type BackStyle = 'applied' | 'inset';

export interface ConstructionMethod {
  readonly id: string;
  readonly name: string;
  readonly family: ConstructionFamily;

  readonly backStyle: BackStyle;

  /** Height of the toe kick a base cabinet stands on. */
  readonly kickHeight: Mm;
  /** How far the kick is recessed behind the door face. */
  readonly kickSetback: Mm;

  /*
   * The ladder base — a frame on the floor that a whole run sits on, instead of a kick panel per
   * cabinet. These live here, beside the kick height, because they are conventions a shop builds
   * to rather than anything the geometry can work out. See model/kickBase.ts.
   */

  /**
   * How far short of the floor the front and back rails are cut.
   *
   * They hang clear so the frame beds down on the **ribs alone**. On a floor that is never flat,
   * that is the difference between packing three ribs and fighting a rail that rocks.
   */
  readonly ladderRailFloorGap: Mm;
  /** How much taller than the ribs the kick face is cut, to be planed in on site. */
  readonly ladderFaceScribeAllowance: Mm;
  /**
   * Which end of the face that extra sits at.
   *
   * **This is a reading, not a confirmed figure**, and it is reported as unconfirmed by name until
   * somebody checks it — see `unconfirmedLadderFigures`. A scribe allowance belongs at the floor,
   * where the out-of-true is; cutting it at the wrong end is a whole run of kick faces.
   */
  readonly ladderFaceScribeEnd: 'floor' | 'top';
  /** Greatest clear gap between ribs before another one goes in. */
  readonly ladderMaxRibGap: Mm;
  /** Depth (front-to-back size) of the top rails on a base cabinet. */
  readonly stretcherWidth: Mm;

  /*
   * Applied end panels — the board that goes on the exposed end of a run so what you see is the
   * door decor rather than the carcass melamine. These are shop conventions, which is why they
   * live here; *which* end gets one is a fact about the cabinet and lives in its options.
   */

  /**
   * How far past the back of the carcass an applied end is cut, to be scribed to the wall.
   *
   * The same idea as `ladderFaceScribeAllowance` and for the same reason: the panel is the one
   * part of the kitchen whose back edge meets an unplanned wall in full view, so it is cut long
   * and planed in. **Unconfirmed** — see `unconfirmedAppliedEndFigures`.
   */
  readonly appliedEndBackScribe: Mm;
  /**
   * How far the front edge of an applied end stands **proud of the door face**.
   *
   * Zero is flush, which is the usual detail and what ships. A shop that runs its ends proud to
   * throw a shadow line sets it here; a negative number sets the end back behind the doors.
   *
   * Measured off the door face rather than off the carcass on purpose. The whole job of this
   * panel is to finish in the same plane as the fronts either side of it — the same plane a
   * radiused corner has to finish in — so that is the plane it is dimensioned from.
   */
  readonly appliedEndFrontOverhang: Mm;
  /**
   * Whether an applied end runs down past the kick to the floor.
   *
   * True ships, because that is the point of a finished end: stopping at the carcass bottom
   * leaves the kick returning across the end of the run in carcass board, in full view. A shop
   * that lands its ends on the plinth instead sets this false.
   */
  readonly appliedEndToFloor: boolean;

  /*
   * Reveals and gaps are split by *where they physically are*, not by calling them
   * "horizontal" and "vertical" — those terms are read both ways in the trade (the direction
   * the gap is measured in, or the direction the gap line runs) and getting it backwards
   * produces doors that are wrong on both axes.
   */

  /**
   * Reveal at the top edge of a front.
   *
   * Kept separate from the bottom because on a base cabinet they are not the same: the door
   * is normally flush with the bottom of the carcass and carries its reveal only at the top,
   * under the benchtop.
   */
  readonly revealTop: Mm;
  /** Reveal at the bottom edge of a front. Commonly zero — flush with the carcass. */
  readonly revealBottom: Mm;
  /** Reveal at the left and right edges of a front, each. */
  readonly revealSides: Mm;

  /**
   * How far the **back of a front sits off the carcass front** — the gap in the depth direction.
   *
   * Its own field and deliberately not called a reveal or a gap, because it is measured in a
   * different direction from every other clearance here. `revealSides` and `gapBetweenDoors` are
   * seen from the front of the cabinet; this one is only visible from the side, and it is the one
   * that decides where the finished face of the kitchen actually is.
   *
   * **2mm, from the bench.** It is the hinge's natural position, and it leaves room for a bump
   * stop. The model had it at zero — the back of every door flat on the carcass — which is not how
   * a cabinet goes together and which put the finished face 2mm shallower than it really is.
   *
   * Nothing about a **cut size** on a square cabinet depends on it: a door is the same rectangle
   * either way. What it moves is where fronts sit in space, where the kick face lands, and — on a
   * radiused cabinet — where the curve has to finish, which is the reason it had to be modelled.
   */
  readonly frontStandoff: Mm;
  /** Gap between two doors sitting side by side — reads as a vertical line. */
  readonly gapBetweenDoors: Mm;
  /** Gap between stacked drawer fronts — reads as a horizontal line. */
  readonly gapBetweenDrawers: Mm;

  /** How much shallower an adjustable shelf is than the opening. */
  readonly shelfSetback: Mm;
  /** Total side clearance for an adjustable shelf — half taken off each end. */
  readonly shelfSideClearance: Mm;

  /**
   * The flat run of front face between the door edge and where a corner radius starts.
   *
   * It is there to **fix the curved piece to**, so it exists whenever there is a curve —
   * doors or no doors. It is *not* a door clearance, and reading it as one is the mistake to
   * avoid: that reading makes it vanish exactly when the cabinet has no doors, which for a
   * radiused end used as a decorative end is the common case.
   *
   * A radius leaving less than this much flat front is reported rather than drawn with a strip
   * too small to fix to.
   */
  readonly fixingStripWidth: Mm;

  /** System 32 hole pitch. */
  readonly systemPitch: Mm;
  /** Distance from the front edge to the front line of system holes. */
  readonly systemFrontSetback: Mm;
  /**
   * Distance from the **back** edge of a side panel to the rear line of system holes.
   *
   * Its own number rather than a reuse of the front setback, because the two are measured off
   * different edges and a shop that moves one has not necessarily moved the other. It ships equal
   * to the front setback, which is what the 32mm system assumes.
   */
  readonly systemBackSetback: Mm;
  /**
   * Diameter and depth of a system hole — a shelf pin, a hinge plate screw, a runner fixing.
   *
   * These belong to the *construction method* rather than to a piece of hardware, because Ø5 at
   * 13mm deep is what a frameless 32mm carcass is bored to whoever made the hinge. A hardware
   * system that genuinely wants something else says so on its own record; the runner system does,
   * because a runner's fixing hole is the runner's business.
   */
  readonly systemHoleDiameter: Mm;
  readonly systemHoleDepth: Mm;
}

/**
 * The default: applied back, 150mm kick, 100mm top rails, flush-bottom doors.
 * These are AU volume-kitchen conventions, not a generic starting point.
 *
 * There used to be a second method here, identical but for its nominal thicknesses. With
 * thickness gone to the board, the two were the same method written twice.
 */
export const FRAMELESS_32: ConstructionMethod = {
  id: 'frameless-32',
  name: 'Frameless 32mm',
  family: 'frameless-32',
  backStyle: 'applied',
  kickHeight: mm(150),
  kickSetback: mm(50),
  ladderRailFloorGap: mm(10),
  ladderFaceScribeAllowance: mm(10),
  ladderFaceScribeEnd: 'floor',
  ladderMaxRibGap: mm(600),
  stretcherWidth: mm(100),
  appliedEndBackScribe: mm(20),
  appliedEndFrontOverhang: mm(0),
  appliedEndToFloor: true,
  revealTop: mm(3),
  revealBottom: mm(0),
  revealSides: mm(1.5),
  frontStandoff: mm(2),
  gapBetweenDoors: mm(3),
  gapBetweenDrawers: mm(3),
  shelfSetback: mm(10),
  shelfSideClearance: mm(2),
  fixingStripWidth: mm(50),
  systemPitch: mm(32),
  systemFrontSetback: mm(37),
  systemBackSetback: mm(37),
  systemHoleDiameter: mm(5),
  systemHoleDepth: mm(13),
};

export const DEFAULT_CONSTRUCTIONS: readonly ConstructionMethod[] = [FRAMELESS_32];

/**
 * Give a stored method a fixing strip if it predates the field.
 *
 * Shared by the project and the standards migration, because both store the same list. The
 * shipped 50mm is used, and it moves no part: only a cabinet with a corner radius on it reads
 * this number, and no job saved before the field existed could have had one.
 */
export const withFixingStrip = (c: Record<string, unknown>): Record<string, unknown> => ({
  ...c,
  fixingStripWidth: typeof c.fixingStripWidth === 'number' ? c.fixingStripWidth : 50,
});

/**
 * Fill in the system-hole figures on a stored method that predates them.
 *
 * Shared by the project and the standards migration, as `withFixingStrip` is. **No part moves**:
 * these three numbers decide where holes are *bored*, and nothing that existed before this could
 * have had a hole bored in it — Phase 1 emitted no drilling at all.
 *
 * The rear setback follows whatever the method's front setback already is rather than the shipped
 * 37, because a shop that had moved its front line to 40 means both lines.
 */
export const withSystemHoles = (c: Record<string, unknown>): Record<string, unknown> => {
  const front = typeof c.systemFrontSetback === 'number' ? c.systemFrontSetback : 37;
  return {
    ...c,
    systemBackSetback: typeof c.systemBackSetback === 'number' ? c.systemBackSetback : front,
    systemHoleDiameter: typeof c.systemHoleDiameter === 'number' ? c.systemHoleDiameter : 5,
    systemHoleDepth: typeof c.systemHoleDepth === 'number' ? c.systemHoleDepth : 13,
  };
};

/**
 * Give a stored method its front standoff.
 *
 * **This one moves something, and unlike `withFixingStrip` and `withSystemHoles` it cannot pretend
 * otherwise**, so it is worth being plain. Filling in the shipped 2mm moves every door and drawer
 * front 2mm forward in space, moves the kick face with them, and on a radiused cabinet changes the
 * developed length of the curved kick and the wrap.
 *
 * **No cut size on a square cabinet changes.** A door is the same rectangle 2mm further forward,
 * the carcass is untouched, and the cutlist for an ordinary kitchen comes out identical. The
 * alternative was to migrate to zero and leave every existing job with its doors flat on the
 * carcass — which is knowingly preserving a number the shop has told us is wrong, on the same
 * reasoning v9 used when it re-priced a job by the hardware it always had.
 */
export const withFrontStandoff = (c: Record<string, unknown>): Record<string, unknown> => ({
  ...c,
  frontStandoff: typeof c.frontStandoff === 'number' ? c.frontStandoff : 2,
});

/**
 * Fill in the ladder-base figures on a stored method that predates them.
 *
 * Shared by the project and the standards migration, as `withFixingStrip` and `withSystemHoles`
 * are. **No part moves.** Only a ladder base reads these, and no job saved before this version
 * could have had one — the object did not exist.
 */
export const withLadderKick = (c: Record<string, unknown>): Record<string, unknown> => ({
  ...c,
  ladderRailFloorGap: typeof c.ladderRailFloorGap === 'number' ? c.ladderRailFloorGap : 10,
  ladderFaceScribeAllowance:
    typeof c.ladderFaceScribeAllowance === 'number' ? c.ladderFaceScribeAllowance : 10,
  ladderFaceScribeEnd: c.ladderFaceScribeEnd === 'top' ? 'top' : 'floor',
  ladderMaxRibGap: typeof c.ladderMaxRibGap === 'number' ? c.ladderMaxRibGap : 600,
});

/**
 * Fill in the applied-end figures on a stored method that predates them.
 *
 * **No part moves.** Only a cabinet with `appliedEnds` on it reads these, and no job saved before
 * this version could have had one — the option did not exist, so every stored cabinet comes
 * forward with an empty list and cuts exactly what it cut.
 */
export const withAppliedEnds = (c: Record<string, unknown>): Record<string, unknown> => ({
  ...c,
  appliedEndBackScribe: typeof c.appliedEndBackScribe === 'number' ? c.appliedEndBackScribe : 20,
  appliedEndFrontOverhang:
    typeof c.appliedEndFrontOverhang === 'number' ? c.appliedEndFrontOverhang : 0,
  appliedEndToFloor: typeof c.appliedEndToFloor === 'boolean' ? c.appliedEndToFloor : true,
});

/**
 * The applied-end figures nobody has checked, named as the fields they are.
 *
 * Only the back scribe is on the list, and only because the number itself is a guess: 20mm is a
 * reasonable allowance for planing a panel into a wall, but it is not this shop's allowance until
 * somebody says so. Flush at the front and down to the floor are *details*, not measurements —
 * they are either what you do or not, and they are on screen where they can be seen and changed.
 */
export const unconfirmedAppliedEndFigures = (c: ConstructionMethod): readonly string[] => [
  `appliedEndBackScribe — an applied end is cut ${c.appliedEndBackScribe}mm past the back of the ` +
    'carcass to scribe into the wall. Confirm the allowance before a run is cut.',
];

/**
 * The ladder-base figures nobody has checked, named as the fields they are.
 *
 * The same treatment the unconfirmed hardware figures get, and for the same reason: a figure that
 * is unchecked and *says* it is unchecked costs ten seconds with a tape, and one that is unchecked
 * and silent costs a run of kick faces.
 *
 * Only the scribe end is on the list. The 10mm gaps came with the spec; where the extra sits did
 * not, and is a reading of it.
 */
export const unconfirmedLadderFigures = (c: ConstructionMethod): readonly string[] => {
  const end = c.ladderFaceScribeEnd === 'top' ? 'top' : 'floor';
  return [
    `ladderFaceScribeEnd — the kick face is cut ${c.ladderFaceScribeAllowance}mm over-height ` +
      `with the extra at the ${end}. Confirm which end before a run is cut.`,
  ];
};

/** Ids the shipped methods used to have, and the one they all become. */
export const LEGACY_CONSTRUCTION_IDS: readonly string[] = ['frameless-32-16', 'frameless-32-18'];

/** Names the shipped methods used to have, now that the thickness in them means nothing. */
const LEGACY_CONSTRUCTION_NAMES: Record<string, string> = {
  'Frameless 32mm — 16mm carcass': 'Frameless 32mm',
  'Frameless 32mm — 18mm carcass': 'Frameless 32mm',
};

/**
 * Everything about a method except the label it goes by, as a comparable string.
 *
 * The name is left out on purpose: two methods called different things but built identically
 * *are* the same method, and that is exactly the case this has to catch. Keys are sorted so
 * two records written in a different order still compare equal.
 */
const behaviourKey = (c: Record<string, unknown>): string =>
  JSON.stringify(
    Object.keys(c)
      .filter((k) => k !== 'id' && k !== 'name')
      .sort()
      .map((k) => [k, c[k]]),
  );

export interface CollapsedConstructions {
  readonly constructions: Record<string, unknown>[];
  /** Old construction id → the id that replaced it. Only ids that moved appear. */
  readonly idMap: Record<string, string>;
}

/**
 * Take the thicknesses off a stored list of construction methods, and fold together any that
 * were only ever telling them apart.
 *
 * Shared by the project and standards migrations, because both store the same list and both
 * have to come out the other side pointing at methods that still exist.
 *
 * Two methods are folded together only when everything that *makes a difference to a part* is
 * identical. A shop that edited one method's kick height has two genuinely different methods
 * and keeps both — losing one would silently re-cut their cabinets, which is the one thing a
 * migration must never do.
 */
export const collapseThicknessFields = (
  raw: readonly Record<string, unknown>[],
): CollapsedConstructions => {
  const survivors: Record<string, unknown>[] = [];
  const idMap: Record<string, string> = {};

  for (const original of raw) {
    const stripped: Record<string, unknown> = { ...original };
    delete stripped.carcassThickness;
    delete stripped.backThickness;
    delete stripped.doorThickness;
    if (typeof stripped.name === 'string') {
      stripped.name = LEGACY_CONSTRUCTION_NAMES[stripped.name] ?? stripped.name;
    }

    const key = behaviourKey(stripped);
    const existing = survivors.find((s) => behaviourKey(s) === key);

    if (existing) idMap[String(stripped.id)] = String(existing.id);
    else survivors.push(stripped);
  }

  // Two methods that survived but now read the same on screen need telling apart.
  const seen = new Map<string, number>();
  for (const s of survivors) {
    const name = String(s.name);
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count > 0) s.name = `${name} (${count + 1})`;
  }

  return { constructions: survivors, idMap };
};

export const findConstruction = (
  methods: readonly ConstructionMethod[],
  id: string,
): ConstructionMethod => {
  const found = methods.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown construction method: ${id}`);
  return found;
};

/*
 * The back thickness is passed in rather than read off the method, because what a part has to
 * fit around is the board that will really be cut — see `rules/context.ts`. The method's own
 * `backThickness` is the nominal it is designed around, which is a different question.
 */

/**
 * Front-to-back depth of the carcass horizontals (bottom, top, stretchers), which stop short
 * of the back panel under both back styles.
 */
export const horizontalDepth = (cabinetDepth: Mm, backThickness: Mm): Mm =>
  mm(cabinetDepth - backThickness);

/** Front-to-back depth of a side panel — the one dimension the back style actually changes. */
export const sideDepth = (c: ConstructionMethod, cabinetDepth: Mm, backThickness: Mm): Mm =>
  c.backStyle === 'applied' ? mm(cabinetDepth - backThickness) : cabinetDepth;
