/**
 * Drawing the room — editing walls as a chain rather than as loose lines.
 *
 * The room *stores* walls as start/end pairs, because that is what everything downstream wants
 * to read. But nobody describes a kitchen that way. You walk it: "4200 along the sink wall,
 * turn right, 1800, turn left, 2400…". So editing works on the walk — a start corner plus a
 * list of **runs**, each a length and a bearing — and the stored lines are rebuilt from it.
 *
 * That is what makes a typed length behave the way it should. Change the sink wall from 4200
 * to 4800 and every wall after it moves along with it, because it followed that wall in the
 * walk. Editing the stored lines directly would just leave a 600mm hole at the next corner.
 *
 * ## Staying closed
 *
 * A room you have finished drawing is a closed loop. Lengthening one wall of a closed loop
 * breaks it — unless some other wall running the same way gives up the same amount. That is
 * exactly what happens on paper: make the kitchen 600 longer and the wall opposite is 600
 * longer too. So after an edit to a plan that *was* closed, the first later wall running
 * parallel to the gap absorbs it, and the loop stays shut.
 *
 * When nothing can absorb it — an odd-angled wall, or a shape where no later wall runs the
 * right way — the plan is simply left open and `planGap` reports how far out it is. An open
 * plan is a normal state to be in halfway through drawing one; it is not an error, and it is
 * not something to paper over by moving a wall the user didn't touch.
 */

import { type Mm, mm } from '../units.ts';
import { type Vec2, v2 } from '../geom/vec.ts';
import {
  CORNER_TOLERANCE,
  type Room,
  type Wall,
  isClosedPlan,
  normaliseDeg,
  wallBearingDeg,
  wallLength,
} from '../model/room.ts';

/** One leg of the walk round the room. */
export interface WallRun {
  readonly id: string;
  readonly name: string;
  readonly length: Mm;
  /** Degrees from world +X turning toward +Z. Clockwise on a plan drawn X-right, Z-down. */
  readonly bearingDeg: number;
  readonly height: Mm;
  readonly thickness: Mm;
}

/** The walk itself: where it starts, and each leg in order. */
export interface Plan {
  readonly start: Vec2;
  readonly runs: readonly WallRun[];
}

/** Shortest wall worth having. Below this a "wall" is a rounding error with a name. */
export const MIN_WALL_LENGTH: Mm = mm(50);

/**
 * Unit vector for a bearing, with the four cardinals exact.
 *
 * Same reasoning as the yaw snapping in `geom/placement.ts`: letting cos(90°) come back as
 * 6.1e-17 puts that error into a corner position, and from there into every cabinet anchored
 * off it.
 */
const directionFor = (bearingDeg: number): Vec2 => {
  const b = normaliseDeg(bearingDeg);
  if (b === 0) return v2(1, 0);
  if (b === 90) return v2(0, 1);
  if (b === 180) return v2(-1, 0);
  if (b === 270) return v2(0, -1);
  const r = (b * Math.PI) / 180;
  return v2(Math.cos(r), Math.sin(r));
};

/** Kill float dust so a typed 4200 stays 4200 and corners compare equal. */
const tidy = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Read a room as the walk that would draw it. */
export const planOf = (room: Room): Plan => ({
  start: room.walls[0]?.start ?? v2(0, 0),
  runs: room.walls.map((w) => ({
    id: w.id,
    name: w.name,
    length: wallLength(w),
    bearingDeg: wallBearingDeg(w),
    height: w.height,
    thickness: w.thickness,
  })),
});

/** Walk the plan and lay the wall lines back down. */
export const roomFromPlan = (room: Room, plan: Plan): Room => {
  let cursor = plan.start;
  const walls: Wall[] = plan.runs.map((run) => {
    const d = directionFor(run.bearingDeg);
    const end = v2(tidy(cursor.x + d.x * run.length), tidy(cursor.y + d.y * run.length));
    const wall: Wall = {
      id: run.id,
      name: run.name,
      start: cursor,
      end,
      height: run.height,
      thickness: run.thickness,
    };
    cursor = end;
    return wall;
  });
  return { ...room, walls };
};

/** Where the walk finishes relative to where it started — zero when the plan is closed. */
export const planGap = (room: Room): Vec2 => {
  const walls = room.walls;
  if (walls.length === 0) return v2(0, 0);
  const first = walls[0]!.start;
  const last = walls[walls.length - 1]!.end;
  return v2(tidy(first.x - last.x), tidy(first.y - last.y));
};

/** The same, straight off a plan, without laying the wall lines down first. */
const gapOfPlan = (plan: Plan): Vec2 => {
  let x = 0;
  let z = 0;
  for (const run of plan.runs) {
    const d = directionFor(run.bearingDeg);
    x += d.x * run.length;
    z += d.y * run.length;
  }
  return v2(tidy(-x), tidy(-z));
};

/** How far the plan is from closing, as a single distance. */
export const planGapLength = (room: Room): Mm => {
  const g = planGap(room);
  return mm(Math.hypot(g.x, g.y));
};

/**
 * Put the loop back together after an edit, by letting one later wall give up or take on the
 * difference.
 *
 * Only a wall running parallel to the gap can absorb it — anything else would have to change
 * direction as well as length, which is a different wall, not the same one made longer.
 * Returns the plan unchanged when no wall qualifies.
 */
const reclose = (plan: Plan, editedIndex: number): Plan => {
  const gap = gapOfPlan(plan);
  if (Math.hypot(gap.x, gap.y) <= CORNER_TOLERANCE) return plan;

  // Later walls first — the change should ripple forward from the edit, not backward into
  // walls the user drew before it. Then wrap, so editing the last wall can still be absorbed.
  const order = [
    ...plan.runs.map((_, i) => i).filter((i) => i > editedIndex),
    ...plan.runs.map((_, i) => i).filter((i) => i < editedIndex),
  ];

  for (const i of order) {
    const run = plan.runs[i]!;
    const d = directionFor(run.bearingDeg);
    const along = gap.x * d.x + gap.y * d.y;
    // Is the gap purely along this wall's own direction?
    const perpendicular = Math.hypot(gap.x - d.x * along, gap.y - d.y * along);
    if (perpendicular > CORNER_TOLERANCE) continue;

    const length = mm(tidy(run.length + along));
    if (length < MIN_WALL_LENGTH) continue;

    const runs = plan.runs.map((r, j) => (j === i ? { ...r, length } : r));
    return { ...plan, runs };
  }

  return plan;
};

/**
 * Apply a change to one run, reflowing the walls after it and re-closing the loop if the plan
 * was closed before the edit.
 */
const editRun = (room: Room, wallId: string, change: (run: WallRun) => WallRun): Room => {
  const plan = planOf(room);
  const index = plan.runs.findIndex((r) => r.id === wallId);
  if (index < 0) return room;

  const edited: Plan = {
    ...plan,
    runs: plan.runs.map((r, i) => (i === index ? change(r) : r)),
  };
  const wasClosed = isClosedPlan(room);
  return roomFromPlan(room, wasClosed ? reclose(edited, index) : edited);
};

export const setWallLength = (room: Room, wallId: string, length: Mm): Room =>
  editRun(room, wallId, (run) => ({ ...run, length: mm(Math.max(MIN_WALL_LENGTH, length)) }));

/**
 * Turn a wall to a new bearing. Everything after it swings round with it, because the walk
 * continues from wherever this wall now ends.
 */
export const setWallBearing = (room: Room, wallId: string, bearingDeg: number): Room =>
  editRun(room, wallId, (run) => ({ ...run, bearingDeg: normaliseDeg(bearingDeg) }));

export const setWallName = (room: Room, wallId: string, name: string): Room => ({
  ...room,
  walls: room.walls.map((w) => (w.id === wallId ? { ...w, name } : w)),
});

export const setWallThickness = (room: Room, wallId: string, thickness: Mm): Room => ({
  ...room,
  walls: room.walls.map((w) => (w.id === wallId ? { ...w, thickness } : w)),
});

/** Wall height is per wall so a bulkhead or a low return can differ from the ceiling. */
export const setWallHeight = (room: Room, wallId: string, height: Mm): Room => ({
  ...room,
  walls: room.walls.map((w) => (w.id === wallId ? { ...w, height } : w)),
});

/** An id that can't collide with a wall already in this room. */
const nextWallId = (room: Room): string => {
  const used = new Set(room.walls.map((w) => w.id));
  for (let n = room.walls.length + 1; ; n++) {
    const id = `${room.id}-w-${n}`;
    if (!used.has(id)) return id;
  }
};

const nextWallName = (room: Room): string => {
  const used = new Set(room.walls.map((w) => w.name));
  for (let n = room.walls.length + 1; ; n++) {
    const name = `Wall ${n}`;
    if (!used.has(name)) return name;
  }
};

export interface AppendWallArgs {
  readonly length: Mm;
  /**
   * How far to turn from the previous wall before setting off, in degrees. Positive turns
   * clockwise on the plan — the way you go round a normal rectangular room. Defaults to 90.
   */
  readonly turnDeg?: number;
  readonly name?: string;
  readonly thickness?: Mm;
  readonly height?: Mm;
}

/**
 * Carry the walk on from where it currently ends.
 *
 * Appending to a plan that was already closed re-opens it: the new wall sets off from the
 * corner the loop came back to. That is the honest result — you have added a wall the shape
 * doesn't account for yet, and closing it again is a deliberate next step.
 */
export const appendWall = (room: Room, args: AppendWallArgs): Room => {
  const plan = planOf(room);
  const previous = plan.runs[plan.runs.length - 1];
  const bearingDeg = normaliseDeg((previous?.bearingDeg ?? 0) + (args.turnDeg ?? 90));
  const run: WallRun = {
    id: nextWallId(room),
    name: args.name ?? nextWallName(room),
    length: mm(Math.max(MIN_WALL_LENGTH, args.length)),
    bearingDeg,
    height: args.height ?? previous?.height ?? room.ceilingHeight,
    thickness: args.thickness ?? previous?.thickness ?? mm(90),
  };
  return roomFromPlan(room, { ...plan, runs: [...plan.runs, run] });
};

/**
 * Start a fresh plan from one wall, throwing the old one away.
 *
 * Deliberately explicit rather than something the app does for you — a redraw discards a room
 * somebody measured.
 */
export const startPlan = (room: Room, args: { length: Mm; bearingDeg?: number; name?: string; thickness?: Mm }): Room => {
  const first = room.walls[0];
  const run: WallRun = {
    id: `${room.id}-w-1`,
    name: args.name ?? 'Wall 1',
    length: mm(Math.max(MIN_WALL_LENGTH, args.length)),
    bearingDeg: normaliseDeg(args.bearingDeg ?? 0),
    height: first?.height ?? room.ceilingHeight,
    thickness: args.thickness ?? first?.thickness ?? mm(90),
  };
  return roomFromPlan(room, { start: v2(0, 0), runs: [run] });
};

/**
 * Shut the loop with one last wall from where the walk ended back to where it began.
 *
 * Its length and bearing are whatever that closing run happens to be — this is the one wall
 * you don't get to type, because the other walls have already decided it.
 */
export const closePlan = (room: Room): Room => {
  if (room.walls.length === 0 || isClosedPlan(room)) return room;
  const gap = planGap(room);
  const length = Math.hypot(gap.x, gap.y);
  if (length < MIN_WALL_LENGTH) return room;

  const bearingDeg = normaliseDeg((Math.atan2(gap.y, gap.x) * 180) / Math.PI);
  const previous = room.walls[room.walls.length - 1]!;
  const plan = planOf(room);
  return roomFromPlan(room, {
    ...plan,
    runs: [
      ...plan.runs,
      {
        id: nextWallId(room),
        name: nextWallName(room),
        length: mm(tidy(length)),
        bearingDeg,
        height: previous.height,
        thickness: previous.thickness,
      },
    ],
  });
};

/**
 * Break a wall into two, so a corner can be introduced part-way along one.
 *
 * This is how a rectangle becomes an L without redrawing it: split the wall where the return
 * goes, then turn the second half. The two halves together still run exactly where the one
 * wall did, so nothing else in the plan moves.
 */
export const splitWall = (room: Room, wallId: string, atLength?: Mm): Room => {
  const plan = planOf(room);
  const index = plan.runs.findIndex((r) => r.id === wallId);
  if (index < 0) return room;
  const run = plan.runs[index]!;

  const first = mm(Math.round(atLength ?? run.length / 2));
  const second = mm(tidy(run.length - first));
  if (first < MIN_WALL_LENGTH || second < MIN_WALL_LENGTH) return room;

  const added: WallRun = {
    ...run,
    id: nextWallId(room),
    name: nextWallName(room),
    length: second,
  };
  const runs = [
    ...plan.runs.slice(0, index),
    { ...run, length: first },
    added,
    ...plan.runs.slice(index + 1),
  ];
  return roomFromPlan(room, { ...plan, runs });
};

/**
 * Take a wall out and let the walk close over the hole.
 *
 * Removing the first wall moves the start corner to where that wall ended, so the rest of the
 * room stays exactly where it was rather than sliding back to the origin.
 */
export const removeWall = (room: Room, wallId: string): Room => {
  const plan = planOf(room);
  const index = plan.runs.findIndex((r) => r.id === wallId);
  if (index < 0 || plan.runs.length <= 1) return room;

  const wasClosed = isClosedPlan(room);
  const start = index === 0 ? room.walls[0]!.end : plan.start;
  const remaining: Plan = { start, runs: plan.runs.filter((_, i) => i !== index) };
  // The wall after the hole now stands where the removed one started, so reclose from there.
  return roomFromPlan(room, wasClosed ? reclose(remaining, Math.max(0, index - 1)) : remaining);
};
