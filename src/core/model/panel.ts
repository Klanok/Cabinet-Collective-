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
  profileExtent,
  isRectangular,
} from '../geom/profile.ts';
import type { PanelPlacement } from '../geom/placement.ts';
import type { PanelFeature } from './feature.ts';
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
  | 'false-front'
  | 'lid'
  | 'kick'
  | 'filler'
  | 'end-panel';

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
  /** Shape in part space. */
  readonly profile: Profile2D;
  /** Where the panel sits in cabinet space. */
  readonly placement: PanelPlacement;
  /** Parametric machining intent. Read directly by CAM — never derived from the mesh. */
  readonly features: readonly PanelFeature[];
  readonly edgeBanding: EdgeBanding;
  readonly grain: GrainConstraint;
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

/** Length of each named edge. Only meaningful for rectangular parts. */
export const panelEdgeLengths = (p: Panel): Record<RectEdge, Mm> => {
  const { length, width } = panelExtent(p);
  return { L1: length, L2: length, W1: width, W2: width };
};

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
