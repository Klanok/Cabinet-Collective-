/**
 * Door styles — what a front looks like, as a recipe rather than a drawing.
 *
 * A style is **parametric on purpose**: "57mm border, 6mm recess, 3mm internal corners",
 * applied to whatever size front the rule engine produces. A style saved as the shape of one
 * particular door would be worth nothing, because every front on a job is a different size.
 *
 * ## What a styled front is, and what it is not
 *
 * A shaker door is the *same rectangle* a plain slab door already is. What differs is
 * machining on its show face. So a style adds **features to a panel** and changes nothing
 * else: the door stays one `Panel`, the cutlist part count does not move, the edges are banded
 * exactly as they were, and the rule engine's sizing is untouched.
 *
 * This is deliberately the **one-piece** method — a single MDF slab with the look machined
 * into its face, then wrapped or sprayed. Five-piece construction (real rails, stiles and a
 * centre panel) is a decomposition, not a feature: it turns one door into five cutlist parts
 * with their own grain, banding and joinery, and it is a different piece of work.
 *
 * ## Where a style lives
 *
 * Two places, for two different reasons.
 *
 * In the **shop standards**, because the value of working out a shaker profile is that it
 * outlasts the job you first worked it out on — the same reason saved cabinet types live
 * there.
 *
 * And copied into the **job**, because a style decides how a part is machined. If a job held
 * only a reference, editing your shaker border next year would re-machine and re-price a
 * kitchen you already quoted. Materials are snapshotted for exactly this reason and a style is
 * the same kind of fact.
 */

import { type Mm, mm } from '../units.ts';

/**
 * Which recipe a style follows. The fields below are all present on every style; the kind
 * decides which of them are read — the same approach `CabinetOptions` takes, and for the same
 * reason: adding a third kind shouldn't ripple through the store or the UI.
 */
export type DoorStyleKind = 'slab' | 'shaker' | 'v-groove';

/** Which way a groove pattern runs once the front is hung. */
export type GrooveDirection = 'vertical' | 'horizontal';

export interface DoorStyle {
  readonly id: string;
  /** What you'd call it to a client — "Shaker 57", "V-groove 100". */
  readonly name: string;
  readonly kind: DoorStyleKind;

  /** Shaker: width of the border framing the recess, the same on all four edges. */
  readonly borderWidth: Mm;
  /** Shaker: how far the centre is machined below the show face. */
  readonly recessDepth: Mm;
  /** Shaker: radius left in the recess's internal corners. Zero lets the cutter govern. */
  readonly cornerRadius: Mm;
  /** Shaker: the bit the recess is cleared with. */
  readonly pocketToolId: string;

  /** V-groove: target centre-to-centre spacing. Divided evenly so the edges come out equal. */
  readonly grooveSpacing: Mm;
  /** V-groove: plunge depth. How wide the groove opens follows from the cutter, not from here. */
  readonly grooveDepth: Mm;
  /** V-groove: the cutter, whose section *is* the shape of the groove. */
  readonly grooveToolId: string;
  readonly grooveDirection: GrooveDirection;
  /** V-groove: plain margin left ungrooved at each edge. */
  readonly grooveMargin: Mm;

  /**
   * The smallest clear centre worth machining.
   *
   * One style has to cope with fronts of wildly different proportions: a 717mm door and a
   * 140mm drawer front take the same border, and on the drawer front that can leave no centre
   * at all. Below this figure the front comes out a plain slab and says so, rather than being
   * machined into a rebate through the whole part.
   */
  readonly minimumCentre: Mm;

  /**
   * Machine time this style adds per front, in minutes, charged at the shop rate.
   *
   * It lives on the style rather than in `LabourRates` because how long a front takes is a
   * property of the style — a shaker recess and a run of V-grooves are not the same job. The
   * rate is the shop's; the minutes are the style's.
   */
  readonly machiningMinutesPerFront: number;

  readonly note?: string;
}

/**
 * A plain slab. Machines nothing, costs nothing extra, and is what every existing job gets —
 * which is what lets door styles arrive without moving a single part.
 */
export const PLAIN_SLAB_STYLE: DoorStyle = {
  id: 'slab',
  name: 'Plain slab',
  kind: 'slab',
  borderWidth: mm(0),
  recessDepth: mm(0),
  cornerRadius: mm(0),
  pocketToolId: 'straight-12',
  grooveSpacing: mm(0),
  grooveDepth: mm(0),
  grooveToolId: 'vee-90',
  grooveDirection: 'vertical',
  grooveMargin: mm(0),
  minimumCentre: mm(0),
  machiningMinutesPerFront: 0,
};

/**
 * The shipped starting points.
 *
 * 57mm is the border a shaker door is normally worked to here — near enough to a real 60mm
 * rail once the reveal is off it, and wide enough that a handle screws into solid material.
 */
export const DEFAULT_DOOR_STYLES: readonly DoorStyle[] = [
  PLAIN_SLAB_STYLE,
  {
    id: 'shaker-57',
    name: 'Shaker 57',
    kind: 'shaker',
    borderWidth: mm(57),
    recessDepth: mm(6),
    cornerRadius: mm(3),
    pocketToolId: 'straight-12',
    grooveSpacing: mm(100),
    grooveDepth: mm(0),
    grooveToolId: 'vee-90',
    grooveDirection: 'vertical',
    grooveMargin: mm(0),
    minimumCentre: mm(80),
    machiningMinutesPerFront: 6,
    note: 'One-piece MDF, routed and wrapped',
  },
  {
    id: 'v-groove-100',
    name: 'V-groove 100',
    kind: 'v-groove',
    borderWidth: mm(0),
    recessDepth: mm(0),
    cornerRadius: mm(0),
    pocketToolId: 'straight-12',
    grooveSpacing: mm(100),
    grooveDepth: mm(4),
    grooveToolId: 'vee-90',
    grooveDirection: 'vertical',
    grooveMargin: mm(0),
    minimumCentre: mm(120),
    machiningMinutesPerFront: 8,
    note: 'One-piece MDF, routed and wrapped',
  },
];

let counter = 0;
export const nextDoorStyleId = (): string =>
  `style-${Date.now().toString(36)}-${(++counter).toString(36)}`;

/** Reset id generation, so tests get stable ids. */
export const resetDoorStyleIds = (): void => {
  counter = 0;
};

/**
 * The style a front is machined to, given the job's default and any per-cabinet override.
 *
 * Falls back to a plain slab rather than throwing. A style that has been deleted out from
 * under a cabinet should leave you with an unmachined door you can see and fix, not a job that
 * won't open.
 */
export const resolveDoorStyle = (
  styles: readonly DoorStyle[],
  cabinetStyleId: string | undefined,
  defaultStyleId: string | undefined,
): DoorStyle =>
  styles.find((s) => s.id === (cabinetStyleId ?? defaultStyleId)) ??
  styles.find((s) => s.id === PLAIN_SLAB_STYLE.id) ??
  PLAIN_SLAB_STYLE;

export const findDoorStyle = (styles: readonly DoorStyle[], id: string): DoorStyle | null =>
  styles.find((s) => s.id === id) ?? null;

/** Saving over a style of the same name replaces it, so the list can't fill with near-copies. */
export const upsertDoorStyle = (
  styles: readonly DoorStyle[],
  style: DoorStyle,
): DoorStyle[] => {
  const others = styles.filter(
    (s) => s.id !== style.id && s.name.trim().toLowerCase() !== style.name.trim().toLowerCase(),
  );
  return [...others, style].sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Remove a style. The plain slab can't be removed — it is the fallback every front lands on
 * when nothing else is chosen, so deleting it would leave nothing to fall back to.
 */
export const removeDoorStyle = (styles: readonly DoorStyle[], id: string): DoorStyle[] =>
  id === PLAIN_SLAB_STYLE.id ? [...styles] : styles.filter((s) => s.id !== id);

/** A new style to start editing from, based on the kind you asked for. */
export const newDoorStyle = (kind: DoorStyleKind, name: string): DoorStyle => {
  const template = DEFAULT_DOOR_STYLES.find((s) => s.kind === kind) ?? PLAIN_SLAB_STYLE;
  return { ...template, id: nextDoorStyleId(), name, note: undefined };
};
