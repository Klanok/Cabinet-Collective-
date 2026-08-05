/**
 * Panels — the single source of truth for a part.
 *
 * A `Panel` is what the rule engine emits, what the viewport draws, what costing prices,
 * what Phase 3 nests and what Phase 4 machines. There is deliberately no second, parallel
 * representation of a part anywhere: the whole point of one record is that a costed part and
 * a cut part can never disagree.
 */

import { type Mm, type Mm2, mm } from '../units.ts';
import {
  type Profile2D,
  type RectEdge,
  profileArea,
  profileEdgeLengths,
  profileExtent,
  isRectangular,
  reversePolygon,
} from '../geom/profile.ts';
import type { PanelPlacement } from '../geom/placement.ts';
import type { CutoutFeature, PanelFeature } from './feature.ts';
import type { Forming } from './forming.ts';
import type { EdgeBanding } from './material.ts';

export type PanelRole =
  | 'side'
  | 'bottom'
  | 'top'
  | 'stretcher'
  | 'shelf-fixed'
  | 'shelf-adjustable'
  | 'back'
  | 'divider'
  | 'door'
  | 'drawer-front'
  /**
   * The bottom of a drawer box, and its wooden back.
   *
   * Their own roles rather than a reuse of 'bottom' and 'back', because they are sized by the
   * **runner** and not by the carcass — a different rule set entirely — and because anything
   * downstream that groups by role (the viewport's colours, a BOM that counts boxes) has to be
   * able to tell a drawer bottom from a cabinet bottom.
   */
  | 'drawer-bottom'
  | 'drawer-back'
  | 'false-front'
  | 'lid'
  /**
   * The kick face — the board you see. Shared by the per-cabinet kick and the face applied to a
   * ladder base, because it is the same part doing the same job; what differs is what it is
   * screwed to, and that is the owner, not the role.
   */
  | 'kick'
  /** A ladder base's long members, running the length of the run. Cut short of the floor. */
  | 'kick-rail'
  /** A ladder base's cross-members. Full kick height — these are what the run stands on. */
  | 'kick-rib'
  /** A length of shop-made benchtop, between joins. */
  | 'benchtop'
  /** A benchtop's end panel, running down to the floor and mitred into the top. */
  | 'benchtop-waterfall'
  /** The strip standing up at the back of a benchtop, against the wall. */
  | 'benchtop-upstand'
  | 'filler'
  /** A deliberately independent sheet part: filler, scribe, loose end, backing or shelf. */
  | 'panel'
  | 'end-panel'
  /** A shaped rib in the skeleton of a curved assembly — flat, with one edge on a radius. */
  | 'former'
  /** Bendy ply wrapped over formers. Cut flat to its developed length, then bent. */
  | 'skin';

/** How the part's length axis must sit relative to sheet grain when nesting. */
export type GrainConstraint =
  | 'length-along-grain'
  | 'width-along-grain'
  | 'any'; // free to rotate — the usual case for solid-colour melamine

/**
 * What kind of thing a part belongs to.
 *
 * For most of this codebase's life the answer was always "a cabinet", and the field was called
 * `cabinetId`. A benchtop and a ladder base broke that: both span a *run* of cabinets and belong
 * to none of them, and both are cut from sheet stock exactly as a carcass part is. Giving them
 * their own parallel part record was the alternative and it is the thing this codebase exists not
 * to do — a costed part and a cut part have to be the same part.
 *
 * Nothing was migrated for this. Panels are derived on every build and never stored, so renaming
 * the field changes no saved file.
 */
export type PanelOwnerKind = 'cabinet' | 'benchtop' | 'kick-base';

export interface Panel {
  readonly id: string;
  /** The cabinet, benchtop or ladder base this part is cut for. */
  readonly ownerId: string;
  readonly ownerKind: PanelOwnerKind;
  readonly role: PanelRole;
  /** Short human label for the cutlist — "Side L", "Shelf", "Drawer front 2". */
  readonly name: string;
  readonly materialId: string;
  /**
   * The decor applied over the A-face after machining, when the board is not the finish.
   *
   * **The one case is the finish laminate over a bendy-ply wrap**, and it is the §5.14 fault: the
   * laminate was charged in `costing.ts`, taken off the former radius in `radius.ts`, and drawn
   * nowhere — so a curved end rendered in cream bendy ply beside a walnut front. Reported from the
   * bench with a photograph.
   *
   * **It is deliberately not a second part.** §5.0 settled that the laminate is *a dimension, not a
   * part*: it is hand-applied and hand-trimmed after machining, so it has no blank, no nest and no
   * line on the cutlist, and inventing one would put a sheet nobody cuts into the cut plan. What was
   * missing was never a part — it was the fact that the finished face is not the face of the board.
   *
   * So `materialId` still says bendy ply, which is what you order, what the nest packs and what the
   * cutlist groups; this says what you see. Absent on nearly every part in every job.
   */
  readonly finishMaterialId?: string;
  /**
   * Shape in part space, **flat and as cut** — always. A part that gets bent afterwards is
   * stored at the size it is cut to, which for a skin round a radius is its developed length.
   * How it then bends is `forming`, and nothing dimensional reads that. See model/forming.ts.
   */
  readonly profile: Profile2D;
  /** Where the panel sits in cabinet space. */
  readonly placement: PanelPlacement;
  /** Parametric machining intent. Read directly by CAM — never derived from the mesh. */
  readonly features: readonly PanelFeature[];
  readonly edgeBanding: EdgeBanding;
  readonly grain: GrainConstraint;
  /**
   * How this part is bent after it is cut. Absent for every part that stays flat, which is
   * nearly all of them. Read by the viewport and by nothing that decides a dimension.
   */
  readonly forming?: Forming;
  /**
   * Human note carried through to the cutlist — "grain vertical", "handed pair".
   * Free text on purpose: it is for the person at the saw, not for a machine.
   */
  readonly note?: string;
}

/** Bounding-box size — what a saw list and a nester care about. */
export const panelExtent = (p: Panel): { length: Mm; width: Mm } => profileExtent(p.profile);

/**
 * The part's shape **for drawing**, with anything that goes right through it opened up.
 *
 * A cutout is a `PanelFeature` and stays one: it is machining intent, it is what CAM reads, and
 * baking it into the profile would be a second place claiming to know where the hole is. But a
 * hole you cannot see through is not a hole on screen — a cabinetmaker checking a waste cutout
 * is checking whether he can see the wall behind it — so the renderer asks for a profile with
 * the through features cut in, and gets one built on the spot.
 *
 * Named and separate for the same reason `flattenPolygonSegments` is: this is a derived,
 * drawing-only view of a part, and nothing dimensional may call it. The cutlist size, the blank
 * the nester reserves and the perimeter the router follows all read `profile`, which is
 * unchanged — a hole in the middle of a panel does not make the board it is cut from smaller.
 */
export const panelDrawingProfile = (p: Panel): Profile2D => {
  const through = p.features.filter(
    (f): f is CutoutFeature => f.kind === 'cutout' && f.outline.length >= 3,
  );
  if (through.length === 0) return p.profile;
  return {
    outline: p.profile.outline,
    // Wound the opposite way to the outline, which is what `Profile2D` means by a hole and what
    // lets the extruder bridge it into the cap.
    holes: [...p.profile.holes, ...through.map((f) => reversePolygon(f.outline))],
  };
};

/** True material area, holes removed. */
export const panelArea = (p: Panel): Mm2 => profileArea(p.profile);

/** Bounding-box area — the sheet real estate a rectangular nest actually consumes. */
export const panelFootprint = (p: Panel): Mm2 => {
  const { length, width } = panelExtent(p);
  return length * width;
};

export const panelIsRectangular = (p: Panel): boolean => isRectangular(p.profile);

/**
 * True length of each named side of the part.
 *
 * For a rectangle this is the bounding box, which is what it always was. For a part with a
 * radiused edge it is the length **around** the curve, which is more banding than the box
 * says — so a curved shelf now buys the tape it actually uses.
 */
export const panelEdgeLengths = (p: Panel): Record<RectEdge, Mm> => profileEdgeLengths(p.profile);

/** Total banded length, for costing and for edgebander time. */
export const bandedLength = (p: Panel): Mm => {
  const lengths = panelEdgeLengths(p);
  let total = 0;
  for (const edge of ['L1', 'L2', 'W1', 'W2'] as const) {
    if (p.edgeBanding[edge]) total += lengths[edge];
  }
  return mm(total);
};

/** Count of banded edges — a decent proxy for handling time in later costing work. */
export const bandedEdgeCount = (p: Panel): number =>
  (['L1', 'L2', 'W1', 'W2'] as const).filter((e) => p.edgeBanding[e]).length;
