/**
 * The drilling — hinge cups, mounting plates, runner fixings and system holes.
 *
 * This is what Phase 4 will machine and it is what actually ruins material when it is wrong, so
 * it is worth being explicit about the two decisions that shape the whole file.
 *
 * ## 1. Every hole is stated in **cabinet space** and converted into part space
 *
 * A hinge is one thing at one height. It puts a cup in a door and two screws in a side, and those
 * are the same hinge — so it is described once, as a position in the cabinet ("22.5mm in from the
 * left edge of that door, 96mm up from its bottom, 37mm back from the front of the side"), and
 * each panel's own placement converts it into that panel's part space through `cabinetToPart`.
 *
 * The alternative — writing part-space coordinates directly — is the handedness trap this codebase
 * already has scar tissue for. A side panel's part +Y runs toward the front on one hand and toward
 * the back on the other, so a hard-coded `y = 37` puts the mounting plate 37mm from the front on
 * the left side and 37mm from the *back* on the right, and both panels are the right size and both
 * pass a test that counts holes. Deriving it from the placement is the same fix `resolveBanding`
 * and `bowedFrontProfile` already are, and it means a mirrored cabinet cannot come out identical.
 *
 * ## 2. A hinge cup is bored on the **B-face**, and that is not a mistake to fix
 *
 * A door's A-face is its show face — that follows from where the door sits, because `w = u × v` is
 * derived and not stored, so it cannot be chosen. The cup goes in the back. So it is face `B`,
 * `requiresFlip` is true for it, and the CAM layer is told plainly that the part turns over between
 * the front-style routing and the hinge boring. That is a real setup cost and a real chance to
 * machine the wrong side, which is exactly why the convention makes it explicit rather than
 * inferred (see docs/coordinate-convention.md).
 *
 * Nothing here throws. A door that hinges onto a side the corner radius has eaten, a rear runner
 * fixing that falls off the back of a shallow side — both are reported and the rest of the boring
 * still comes out, because a half-bored cabinet you can see is worth more than an exception.
 */

import { type Mm, mm, snapGeometric } from '../units.ts';
import { type Vec2, type Vec3, v2, v3 } from '../geom/vec.ts';
import { type Bounds3, type PanelPlacement, cabinetToPart, placedBounds } from '../geom/placement.ts';
import { profileExtent } from '../geom/profile.ts';
import type { PanelFeature } from '../model/feature.ts';
import {
  type DrawerRunnerSystem,
  cupCentreFromEdge,
  hingeCentres,
  hingeCountForHeight,
  runnerAboveFrontBottom,
} from '../model/hardware.ts';
import type { RuleContext } from './context.ts';
import { shelfPinRuns } from './shelfPins.ts';
import type { MaterialSlot, PartInstance } from './spec.ts';

/** Which end of the cabinet a part is at. Derived from where it sits, never passed in. */
type Hand = 'left' | 'right';

export interface CabinetBoring {
  /**
   * Features for each instance, index-aligned with the list handed in.
   *
   * A parallel array rather than features pushed onto the instances, so the boring pass cannot
   * accidentally change a part's size, banding or placement while it is in there. It only adds
   * machining.
   */
  readonly perInstance: readonly (readonly PanelFeature[])[];
  readonly warnings: readonly string[];
}

/** A part with the cabinet-space box it occupies worked out — see `placedBounds`. */
interface Placed {
  readonly index: number;
  readonly instance: PartInstance;
  readonly box: Bounds3;
}

const thicknessOf = (ctx: RuleContext, slot: MaterialSlot): Mm => {
  switch (slot) {
    case 'carcass':
      return ctx.t;
    case 'back':
      return ctx.tb;
    case 'door':
      return ctx.td;
    case 'skin':
      return ctx.ts;
  }
};

/**
 * A cabinet-space point, in the part space of one panel.
 *
 * Only x and y come back: the third coordinate is through the thickness, and a feature's depth is
 * measured from a named face rather than from a position. Snapped, because a placement conversion
 * is a dot product and a hole at 36.99999999999999 is a hole at 37.
 */
const partPoint = (p: PanelPlacement, point: Vec3): Vec2 => {
  const local = cabinetToPart(p, point);
  return v2(snapGeometric(local.x), snapGeometric(local.y));
};

/** The part-space step between two cabinet-space points — for a row of holes on a pitch. */
const partStep = (p: PanelPlacement, from: Vec3, to: Vec3): Vec2 => {
  const a = partPoint(p, from);
  const b = partPoint(p, to);
  return v2(snapGeometric(b.x - a.x), snapGeometric(b.y - a.y));
};

const place = (ctx: RuleContext, instance: PartInstance, index: number): Placed => {
  const { length, width } = profileExtent(instance.profile);
  return {
    index,
    instance,
    box: placedBounds(
      instance.placement,
      length,
      width,
      thicknessOf(ctx, instance.material),
    ),
  };
};

/**
 * Which end of the cabinet a part belongs to — **the end it is nearest**, not the half it sits in.
 *
 * The difference only shows up on a radiused cabinet, and there it decides real holes. A front-right
 * radius pulls the end panel inward: at a 450 radius on a 900 carcass it lands at x ≈ 444, so its
 * middle is a couple of millimetres the wrong side of centre and a half-of-the-cabinet test calls
 * the right-hand side panel a left-hand one. Measuring to the nearer end cannot do that, because a
 * side is always closer to its own end than to the other one however far the curve has eaten it.
 */
const handOf = (ctx: RuleContext, box: Bounds3): Hand =>
  box.min.x <= ctx.W - box.max.x ? 'left' : 'right';

/** The inside face of a side panel — the one that gets bored. */
const insideFaceX = (side: Placed, hand: Hand): Mm =>
  hand === 'left' ? side.box.max.x : side.box.min.x;

/**
 * How far a door's hinged edge may be from the side panel and still be hinging onto it.
 *
 * On an ordinary full-overlay cabinet the door's edge sits over the side panel and this is a
 * millimetre or two of reveal. It only ever bites where something is genuinely wrong: a corner
 * radius pushes the door zone well clear of the far side, so the inner door of a pair can end up
 * several hundred millimetres from any carcass — and boring a mounting plate there would put four
 * holes in a side panel for a hinge that has nothing to reach it.
 *
 * One system pitch: far enough to cover any reveal or overlay a shop would build to, nowhere near
 * far enough to swallow the case this exists to catch.
 */
const HINGE_PLATE_REACH: Mm = mm(32);

/**
 * Bore one cabinet's parts.
 *
 * Called from `buildCabinet` on the whole list of instances, for the same reason the door style is
 * resolved there: a hinge cup has to land on every door, and doors come out of `doors`,
 * `drawerFronts`, the tall cabinet's split banks and whatever emits a false front next. One pass
 * over the finished list cannot forget a caller; a builder that bores its own parts can.
 */
export const boreCabinet = (
  ctx: RuleContext,
  instances: readonly PartInstance[],
): CabinetBoring => {
  const perInstance: PanelFeature[][] = instances.map(() => []);
  const warnings: string[] = [];
  const add = (index: number, feature: PanelFeature) => perInstance[index]!.push(feature);
  const warn = (message: string) => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  const placed = instances.map((instance, index) => place(ctx, instance, index));
  const sides = placed.filter((p) => p.instance.role === 'side');
  const doors = placed.filter((p) => p.instance.role === 'door');
  const drawerFronts = placed
    .filter((p) => p.instance.role === 'drawer-front')
    .sort((a, b) => a.box.min.y - b.box.min.y);
  const adjustableShelves = placed.filter((p) => p.instance.role === 'shelf-adjustable');
  const fixedShelves = placed.filter((p) => p.instance.role === 'shelf-fixed');

  boreHinges(ctx, doors, sides, add, warn);
  boreRunners(ctx, drawerFronts, sides, add, warn);
  boreSystemHoles(ctx, sides, fixedShelves, adjustableShelves.length, add, warn);

  return { perInstance, warnings };
};

// ---------------------------------------------------------------------------------------
// Hinges
// ---------------------------------------------------------------------------------------

/**
 * Which end each door hinges on, keyed by its index in the part list.
 *
 * A pair is decided by comparing the doors **to each other** — the left-hand one of the two hinges
 * left — and *not* by comparing each one to the middle of the cabinet. That was the first version
 * and it was wrong on a radiused cabinet: the radius pushes the door zone to one end, so at a 350mm
 * radius on a 900 carcass both doors of a pair sit in the left half and both came out hinged left.
 * Two doors swinging the same way, and the right-hand one's mounting plates bored into the left side
 * panel — and it passed every test, because the count of holes and their diameters were all correct.
 *
 * Doors are grouped by their **vertical band** first, so a tall cabinet's upper and lower banks are
 * two separate pairs rather than one confused foursome.
 *
 * A band with one door in it has nothing in the geometry to read, so `doorSwing` says — and it means
 * the side the hinges are on, facing the cabinet.
 */
const hingeHands = (ctx: RuleContext, doors: readonly Placed[]): Map<number, Hand> => {
  const hands = new Map<number, Hand>();
  const bands = new Map<number, Placed[]>();

  for (const door of doors) {
    // Doors in one bank share a bottom edge exactly; rounding keeps arithmetic noise from
    // splitting a pair into two bands of one, which would silently fall back to `doorSwing`.
    const key = Math.round(door.box.min.y * 1e3);
    const band = bands.get(key);
    if (band) band.push(door);
    else bands.set(key, [door]);
  }

  for (const band of bands.values()) {
    if (band.length === 1) {
      hands.set(band[0]!.index, ctx.options.doorSwing ?? 'left');
      continue;
    }
    const sorted = [...band].sort((a, b) => a.box.min.x + a.box.max.x - (b.box.min.x + b.box.max.x));
    sorted.forEach((door, i) => {
      // Outermost pair hinges outward. Nothing produces more than two per band today; anything in
      // between takes the end it is nearer, so a third door could never come out unhinged.
      const hand: Hand =
        i === 0 ? 'left' : i === sorted.length - 1 ? 'right' : i * 2 < sorted.length ? 'left' : 'right';
      hands.set(door.index, hand);
    });
  }

  return hands;
};

const boreHinges = (
  ctx: RuleContext,
  doors: readonly Placed[],
  sides: readonly Placed[],
  add: (index: number, feature: PanelFeature) => void,
  warn: (message: string) => void,
): void => {
  if (doors.length === 0) return;
  const hinge = ctx.hardware.hinge;
  const inset = cupCentreFromEdge(hinge);
  const hands = hingeHands(ctx, doors);

  for (const door of doors) {
    const height = mm(door.box.max.y - door.box.min.y);
    // How far the door reaches across the cabinet — read off the placement rather than off the
    // profile, so it is the same figure whichever part-space axis happens to carry it.
    const across = mm(door.box.max.x - door.box.min.x);
    if (across <= 2 * inset) {
      warn(
        `"${door.instance.name}" is only ${Math.round(across)}mm across, which leaves nowhere for ` +
          `a ${hinge.cupDiameter}mm cup ${Math.round(inset)}mm in from the edge. Not bored.`,
      );
      continue;
    }

    const hand = hands.get(door.index) ?? 'left';
    const edgeX = hand === 'left' ? door.box.min.x : door.box.max.x;
    // Into the door from its hinged edge: +x on a left-hand hinge, −x on a right-hand one.
    const inward = hand === 'left' ? 1 : -1;
    const cupX = mm(edgeX + inward * inset);
    // The face of the door that looks at the cabinet — part z = 0, the B-face.
    const backZ = door.box.min.z;

    const count = Math.max(1, Math.round(ctx.options.hingeCount ?? hingeCountForHeight(hinge, height)));
    const centres = hingeCentres(hinge, height, count);
    const candidate = sides.find((s) => handOf(ctx, s.box) === hand);
    // The panel has to be somewhere the hinge can actually reach, not merely at the right end.
    const reach = candidate
      ? Math.min(Math.abs(edgeX - candidate.box.min.x), Math.abs(edgeX - candidate.box.max.x))
      : Infinity;
    const side = reach <= HINGE_PLATE_REACH ? candidate : undefined;

    if (!side) {
      warn(
        candidate
          ? `"${door.instance.name}" hinges ${Math.round(reach)}mm clear of the nearest side panel, ` +
              'so there is nothing there to screw a mounting plate to. On a cabinet with a rounded ' +
              'corner the doors are pushed off the curved end, which can leave the inner one of a ' +
              'pair with no carcass beside it — one door usually suits. The cups are bored, the ' +
              'plate holes are not.'
          : `"${door.instance.name}" hinges on the ${hand} but there is no ${hand} side panel to ` +
              'screw a mounting plate to — the cups are bored, the plate holes are not.',
      );
    }

    centres.forEach((centre, j) => {
      const cabY = mm(door.box.min.y + centre);
      const tag = `${door.index}-${j + 1}`;

      add(door.index, {
        id: `hinge-cup-${j + 1}`,
        kind: 'drill',
        purpose: 'hinge-cup',
        face: 'B',
        at: partPoint(door.instance.placement, v3(cupX, cabY, backZ)),
        diameter: hinge.cupDiameter,
        depth: hinge.cupDepth,
      });

      // The two dowels sit on a line parallel to the door edge, offset away from it, one either
      // side of the cup.
      const dowelX = mm(cupX + inward * hinge.dowelOffset);
      for (const [suffix, sign] of [
        ['a', -1],
        ['b', 1],
      ] as const) {
        add(door.index, {
          id: `hinge-dowel-${j + 1}${suffix}`,
          kind: 'drill',
          purpose: 'hinge-dowel',
          face: 'B',
          at: partPoint(
            door.instance.placement,
            v3(dowelX, mm(cabY + (sign * hinge.dowelSpacing) / 2), backZ),
          ),
          diameter: hinge.dowelDiameter,
          depth: hinge.dowelDepth,
        });
      }

      if (!side) return;
      const x = insideFaceX(side, hand);
      const z = mm(side.box.max.z - hinge.plateSetback);
      for (const [suffix, sign] of [
        ['lo', -1],
        ['hi', 1],
      ] as const) {
        add(side.index, {
          id: `hinge-plate-${tag}-${suffix}`,
          kind: 'drill',
          purpose: 'hinge-plate',
          face: 'A',
          at: partPoint(
            side.instance.placement,
            v3(x, mm(cabY + (sign * hinge.plateHoleSpacing) / 2), z),
          ),
          diameter: hinge.plateHoleDiameter,
          depth: hinge.plateHoleDepth,
        });
      }
    });
  }
};

// ---------------------------------------------------------------------------------------
// Drawer runners
// ---------------------------------------------------------------------------------------

/**
 * The runner's fixing points in both sides, and the front fixing screws in the drawer front.
 *
 * Both hang off **the bottom of the runner**, which is the datum Blum's front-installation sheet
 * uses and the only one that works: the runner is the thing screwed to the cabinet, so it is what
 * the drilling and the box can both be measured from without one going through the other. Its own
 * height comes from the bottom edge of the drawer front it carries — one number read once, so the
 * holes, the box and the front cannot drift apart.
 *
 * The runner's fixing holes sit `runnerFixingAboveRunnerBottom` up the rail from that line — Blum's
 * `min. 54*`. Both that and the runner's own height are flagged, and between them they are the
 * sharpest figures in the record.
 */
const boreRunners = (
  ctx: RuleContext,
  drawerFronts: readonly Placed[],
  sides: readonly Placed[],
  add: (index: number, feature: PanelFeature) => void,
  warn: (message: string) => void,
): void => {
  const runner = ctx.hardware.runner;
  if (runner === null || drawerFronts.length === 0) return;
  const system = runner.system;

  drawerFronts.forEach((front, i) => {
    /*
     * Up the rail from its own bottom line, which is itself set out from the bottom edge of the
     * drawer front. Two links, both flagged, and between them the sharpest figures in the record: a
     * runner bored 54mm out is a runner nowhere near where the box expects it.
     */
    const y = mm(
      front.box.min.y +
        runnerAboveFrontBottom(system, ctx.t) +
        system.runnerFixingAboveRunnerBottom,
    );
    boreFrontFixing(ctx, front, system, add);

    for (const side of sides) {
      const hand = handOf(ctx, side.box);
      const x = insideFaceX(side, hand);

      /*
       * Every position is measured back from the **front edge of the side panel**, which is the
       * datum Blum's cabinet-profile sheet uses, so there is no arithmetic between the sheet and
       * the drilling. Four of them on MERIVOBOX; the list is walked rather than a front/rear pair
       * being named, so a system with a different count needs nothing here.
       */
      const points = runner.fixingPositions
        .map((back, n) => [`${n + 1}`, mm(side.box.max.z - back), back] as const)
        .filter(([, z, back]) => {
          if (z >= side.box.min.z) return true;
          warn(
            `A ${runner.nominalLength}mm ${system.name} profile is screwed ${Math.round(back)}mm ` +
              `back from the front edge, which falls off the back of a ${Math.round(
                side.box.max.z - side.box.min.z,
              )}mm side. That fixing is not bored — check the runner against this carcass.`,
          );
          return false;
        });

      for (const [suffix, z] of points) {
        add(side.index, {
          id: `runner-${i + 1}-${suffix}`,
          kind: 'drill',
          purpose: 'drawer-runner',
          face: 'A',
          at: partPoint(side.instance.placement, v3(x, y, z)),
          diameter: system.fixingHoleDiameter,
          depth: system.fixingHoleDepth,
        });
      }
    }
  });
};

/**
 * The front fixing — where the bracket screws into the **back** of the drawer front.
 *
 * Two brackets, one at each end, two screws each. Blum gives the sideways position as `20.5 + FA`
 * from the edge of the front, where FA is the front overlay; stated here as 20.5 in from the **outer
 * face of the cabinet side**, which is the same place said without needing to know the reveal. How
 * far that then is from the front's own edge falls out of the placement conversion, so widening a
 * side reveal moves the front and leaves the screw where the bracket is.
 *
 * B-face, like a hinge cup, and for the same reason: it goes in the back of the front, and the front
 * turns over on the machine.
 */
const boreFrontFixing = (
  ctx: RuleContext,
  front: Placed,
  system: DrawerRunnerSystem,
  add: (index: number, feature: PanelFeature) => void,
): void => {
  // Measured from each outer face of the carcass, so the pair is symmetric on any width.
  const columns: [string, Mm][] = [
    ['l', mm(system.frontFixingFromCabinetSide)],
    ['r', mm(ctx.W - system.frontFixingFromCabinetSide)],
  ];
  const runnerY = mm(front.box.min.y + runnerAboveFrontBottom(system, ctx.t));
  const rows: [string, Mm][] = [
    ['1', mm(runnerY + system.frontFixingAboveRunner)],
    ['2', mm(runnerY + system.frontFixingAboveRunner + system.frontFixingRowSpacing)],
  ];
  // The face of the front that looks back into the cabinet — part z = 0, the B-face.
  const backZ = front.box.min.z;

  for (const [side, x] of columns) {
    for (const [row, y] of rows) {
      const at = partPoint(front.instance.placement, v3(x, y, backZ));
      // A bracket on a front too narrow or too short for it would land off the part. Dropped
      // rather than bored outside the board, and the catch-all test is what watches for it.
      const { length, width } = profileExtent(front.instance.profile);
      if (at.x < 0 || at.x > length || at.y < 0 || at.y > width) continue;
      add(front.index, {
        id: `front-fixing-${side}${row}`,
        kind: 'drill',
        purpose: 'drawer-front-fixing',
        face: 'B',
        at,
        diameter: system.frontFixingPilotDiameter,
        depth: system.frontFixingPilotDepth,
      });
    }
  }
};

// ---------------------------------------------------------------------------------------
// System holes
// ---------------------------------------------------------------------------------------

/**
 * Shelf-pin rows up both sides — two lines of System 32 holes, front and back.
 *
 * Bored only when the cabinet actually has adjustable shelves in it, and counted from the shelves
 * that were **built** rather than from `shelfCount`: a shelf the corner radius ate is not a shelf
 * that needs pins. A fixed shelf is housed and takes none.
 *
 * Where the holes fall up the panel is `rules/shelfPins.ts`, and both of the things it does are
 * corrections rather than refinements: the row keeps clear of the ends instead of running the full
 * height, and it is **centred** rather than indexed off the bottom edge, so a panel turned
 * end-for-end still lines up. The argument for centring — and why bottom-indexing quietly fails at
 * any height that is not a whole number of pitches, which 720 is not — is written out there.
 *
 * A fixed shelf splits the row rather than ending it, so a cabinet with one gets pins above and
 * below. Nothing produces a fixed shelf yet; reading the built parts rather than assuming none
 * means the day something does, this is already right.
 *
 * They are emitted as one `drill-line` per run rather than twenty-one drills, because that is what
 * the operation is — and because the step vector is derived from the placement, so the row runs up
 * the panel on both hands rather than up one and down the other.
 */
const boreSystemHoles = (
  ctx: RuleContext,
  sides: readonly Placed[],
  fixedShelves: readonly Placed[],
  shelfCount: number,
  add: (index: number, feature: PanelFeature) => void,
  warn: (message: string) => void,
): void => {
  if (shelfCount <= 0) return;
  const c = ctx.construction;
  const pitch = c.systemPitch;
  if (!pitch || pitch <= 0) return;
  const clearance = c.systemHoleEndClearance ?? mm(96);

  // In cabinet space, so the same list is right for both hands.
  const obstructions = fixedShelves.map((s) => ({ lo: s.box.min.y, hi: s.box.max.y }));

  for (const side of sides) {
    const hand = handOf(ctx, side.box);
    const x = insideFaceX(side, hand);
    const runs = shelfPinRuns(
      { lo: side.box.min.y, hi: side.box.max.y },
      obstructions,
      pitch,
      clearance,
    );
    if (runs.length === 0) {
      warn(
        `A ${Math.round(side.box.max.y - side.box.min.y)}mm side keeping ${Math.round(clearance)}mm ` +
          'clear of each end has no room for a shelf-pin hole — none are bored.',
      );
      continue;
    }

    const frontZ = mm(side.box.max.z - c.systemFrontSetback);
    const rearZ = mm(side.box.min.z + (c.systemBackSetback ?? c.systemFrontSetback));

    const rows: [string, Mm][] = [['front', frontZ]];
    if (rearZ < frontZ - pitch) {
      rows.push(['rear', rearZ]);
    } else {
      warn(
        `A ${Math.round(side.box.max.z - side.box.min.z)}mm side is too shallow for two rows of ` +
          'system holes at these setbacks — only the front row is bored.',
      );
    }

    for (const [suffix, z] of rows) {
      runs.forEach((run, i) => {
        const first = v3(x, run.first, z);
        const second = v3(x, mm(run.first + pitch), z);
        add(side.index, {
          // Numbered only when a fixed shelf has split the row, so an ordinary cabinet's feature
          // ids read exactly as they always have.
          id: runs.length === 1 ? `system-holes-${suffix}` : `system-holes-${suffix}-${i + 1}`,
          kind: 'drill-line',
          purpose: 'shelf-pin',
          face: 'A',
          start: partPoint(side.instance.placement, first),
          step: partStep(side.instance.placement, first, second),
          count: run.count,
          diameter: c.systemHoleDiameter ?? mm(5),
          depth: c.systemHoleDepth ?? mm(13),
        });
      });
    }
  }
};
