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
} from '../geom/profile.ts';
import type { PanelPlacement } from '../geom/placement.ts';
import type { PanelFeature } from './feature.ts';
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
  | 'kick'
  | 'filler'
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

export interface Panel {
  readonly id: string;
  readonly cabinetId: string;
  readonly role: PanelRole;
  /** Short human label for the cutlist — "Side L", "Shelf", "Drawer front 2". */
  readonly name: string;
  readonly materialId: string;
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
