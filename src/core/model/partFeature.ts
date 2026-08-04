/**
 * Custom features — a cutout somebody adds to one named part of one cabinet, by hand.
 *
 * Asked for from the bench: *"I need to be able edit individual parts to add custom grooves and
 * cut outs to them — so say I add a drawer bank and want to do a cut out in the left hand end"*.
 * Three kinds, and they are three because they are three different things at the saw:
 *
 *   - a **hole** right through a panel — a waste pipe, a cable, a vent;
 *   - a **notch** off an edge or a corner — a skirting, a stud, a pipe running up a wall;
 *   - a **groove** in a face that does not go through — a dado, a rebate, a shadow line.
 *
 * ## The one thing that must not be got wrong: no raw part-space coordinates
 *
 * A side panel's part axes run **opposite ways on the left and the right hand**. "100 in from
 * the front edge" written as `x = 100` lands 100 from the front on one side and 100 from the
 * *back* on the other — the same hole, the same diameter, on a part of exactly the right size,
 * passing any test that counts holes. That is §4.6's mounting plate, §4.4's former thickness
 * axis and §4.9's mirrored arc for the fourth time in this codebase.
 *
 * So a custom feature is **stated from named edges of the cabinet** — *"250 up from the bottom,
 * 100 in from the front"* — and resolved through each panel's own placement in
 * `rules/customFeatures.ts`, exactly as hardware is stated in cabinet space and converted by
 * `cabinetToPart`. Two things fall out of that and both matter:
 *
 *   - a feature on the left side and the same feature on the right side are the same sentence,
 *     and come out as mirror images without anyone having to think about it;
 *   - the position **survives the cabinet being resized**, because it is measured from an edge
 *     that still exists rather than from an origin that moved. Make a base cabinet 60mm deeper
 *     and a hole 100 in from the front is still 100 in from the front.
 *
 * ## Which part, named so it survives an edit
 *
 * A feature names the **part rule** it lands on — `side-left`, `bottom`, `fronts` — because
 * `rules/build.ts` already ids a panel as `` `${cabinet.id}:${rule.key}:${i}` `` and those keys
 * are meaningful and stable. "The left hand end of that drawer bank" is `side-left`, and that
 * name survives resizing the cabinet, changing the board and adding a shelf. **A position in the
 * part list would not**: adding a shelf would quietly move somebody's cutout onto a different
 * part.
 */

import type { Mm } from '../units.ts';

/**
 * A side of a cabinet, named as you stand and look at it.
 *
 * The same six words name an **edge** of a part and a **face** of it, and which of the two a
 * word means depends on the part: on a side panel the front is an edge and the left is a face;
 * on a shelf the front is an edge and the top is a face. Nothing here has to know which —
 * `rules/customFeatures.ts` asks the panel's own placement, and a word that names a face where
 * an edge was wanted is reported rather than guessed at.
 */
export type PartDatum = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export const PART_DATUMS: readonly PartDatum[] = [
  'front',
  'back',
  'left',
  'right',
  'top',
  'bottom',
];

/** How a shop says it: "100 in from the front". */
export interface EdgeOffset {
  /** The edge it is measured from. */
  readonly from: PartDatum;
  /** How far in from that edge, into the part. */
  readonly at: Mm;
}

interface CustomFeatureBase {
  readonly id: string;
  /**
   * The part rule this lands on — `side-left`, `bottom`, `fronts`. See the note at the top of
   * this file for why it is the rule key and not a position in the part list.
   */
  readonly part: string;
  /**
   * Which one, where a rule makes several — the four fronts of a bank, a run of shelves.
   *
   * Unset means **every part that rule makes**, which is what you want for "a cable notch in
   * every shelf" and is the only sensible reading of a rule whose count is itself an option.
   * An index naming a part that is no longer built is reported, not silently dropped.
   */
  readonly index?: number;
  /** Free text for the person at the saw. Carried onto the cutlist beside the part. */
  readonly note?: string;
}

/**
 * A round hole right through the panel.
 *
 * Through, always: a blind round hole is a bore, and the machine already has one of those from
 * the hardware rules. This is the one somebody puts a waste pipe through.
 */
export interface CustomHole extends CustomFeatureBase {
  readonly kind: 'hole';
  /**
   * The centre, measured in from two named edges.
   *
   * Two, because a point needs two, and they have to be edges at right angles to each other —
   * "100 from the front and 250 from the back" says nothing about where along the part it is.
   * That is checked when it is resolved rather than encoded in the type, so the sentence a user
   * gets is about their cabinet rather than about a type error.
   */
  readonly at: readonly [EdgeOffset, EdgeOffset];
  readonly diameter: Mm;
}

/**
 * A rectangular bite out of an edge, right through the board.
 *
 * **This one changes the part's own shape**, which is what makes it different in kind from the
 * other two: it is cut into the profile rather than carried as machining, so the cutlist, the
 * banding, the nest and the perimeter the router follows all see it. A notch that takes a full
 * edge makes the part smaller, and the blank the nester reserves gets smaller with it.
 */
export interface CustomNotch extends CustomFeatureBase {
  readonly kind: 'notch';
  /** The edge the bite is taken out of. */
  readonly edge: PartDatum;
  /** How far in from that edge it reaches. */
  readonly depth: Mm;
  /** How far it runs along that edge. */
  readonly length: Mm;
  /**
   * Where it starts, measured from an edge at right angles to `edge`.
   *
   * Zero puts it hard in the corner, which is the commonest notch of the lot — a scribe round a
   * skirting. Anything else is a bite out of the middle of an edge.
   */
  readonly from: EdgeOffset;
}

/**
 * A flat-bottomed groove of a stated width and depth, cut into one face and not through it.
 *
 * A **rebate is the same feature with the offset at zero** — a groove that happens to reach the
 * edge — and it is deliberately not a separate kind. Two kinds would be two things to keep in
 * step for a difference the cutter cannot see: the tool runs the same path either way, and
 * whether the near wall is left standing is a consequence of where it runs, not a different
 * operation. (It is also what gets it machined: CAM cuts a groove and reports a `RebateFeature`
 * as not worked out yet — see §4.9.)
 */
export interface CustomGroove extends CustomFeatureBase {
  readonly kind: 'groove';
  /** Which face it is cut into, named as you stand and look at the cabinet. */
  readonly face: PartDatum;
  /** The edge it runs parallel to. */
  readonly edge: PartDatum;
  /** From that edge to the **near side** of the groove — the figure a fence is set to. */
  readonly offset: Mm;
  readonly width: Mm;
  /** Measured into the board from `face`. A groove that reaches the far side is refused. */
  readonly depth: Mm;
  /** Where it starts and stops. Unset runs the full way across the part, which is the usual. */
  readonly run?: {
    readonly from: EdgeOffset;
    readonly length: Mm;
  };
}

export type CustomFeature = CustomHole | CustomNotch | CustomGroove;

export type CustomFeatureKind = CustomFeature['kind'];

export const CUSTOM_FEATURE_LABELS: Record<CustomFeatureKind, string> = {
  hole: 'Hole through',
  notch: 'Notch off an edge',
  groove: 'Groove or rebate',
};

/** What a feature reads as on the cutlist and in the parts list — short, and in shop words. */
export const describeCustomFeature = (f: CustomFeature): string => {
  const round = (n: number): string => String(Math.round(n * 10) / 10);
  switch (f.kind) {
    case 'hole':
      return (
        `Ø${round(f.diameter)} hole, ${round(f.at[0].at)} from the ${f.at[0].from} and ` +
        `${round(f.at[1].at)} from the ${f.at[1].from}`
      );
    case 'notch':
      return (
        `notch ${round(f.length)} × ${round(f.depth)} off the ${f.edge}, ` +
        `${round(f.from.at)} from the ${f.from.from}`
      );
    case 'groove':
      return (
        `${round(f.width)} × ${round(f.depth)} groove in the ${f.face} face, ` +
        `${round(f.offset)} from the ${f.edge}`
      );
  }
};

let counter = 0;

/** A new feature id. Prefixed so it is recognisable in a panel's feature list and in G-code. */
export const nextCustomFeatureId = (): string =>
  `cf-${Date.now().toString(36)}-${(++counter).toString(36)}`;

/** Reset id generation, so tests get stable ids. */
export const resetCustomFeatureIds = (): void => {
  counter = 0;
};
