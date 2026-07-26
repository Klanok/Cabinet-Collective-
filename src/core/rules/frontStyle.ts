/**
 * Turning a door style into machining on one front.
 *
 * A pure function of the style and the front's size, deliberately kept out of the cabinet
 * specs: every front role calls the same function, and a function that takes four numbers and
 * returns features is trivially checkable against figures worked out by hand — which is the
 * verification standard everything else here is held to.
 *
 * Everything produced is in **part space** (X = length, Y = width, origin at the bottom-left
 * of the profile's bounding box) on the **A-face**, which for a front is the show face. See
 * docs/coordinate-convention.md.
 */

import { type Mm, mm } from '../units.ts';
import { v2 } from '../geom/vec.ts';
import type { PanelFeature } from '../model/feature.ts';
import type { Panel, PanelRole } from '../model/panel.ts';
import type { DoorStyle } from '../standards/doorStyles.ts';

/**
 * The parts a door style applies to.
 *
 * A shaker kitchen has shaker drawer fronts and usually shaker applied end panels too, so this
 * is not just doors. It is never a carcass part, and never a lid — a banquette seat is a
 * surface you sit on, not a front anybody looks at.
 *
 * Getting this list wrong is obvious on screen, but it is also the difference between quoting
 * eight routed fronts and twenty.
 */
export const STYLED_FRONT_ROLES: readonly PanelRole[] = [
  'door',
  'drawer-front',
  'false-front',
  'end-panel',
];

export const isStyledFrontRole = (role: PanelRole): boolean => STYLED_FRONT_ROLES.includes(role);

/**
 * The front as the machine sees it.
 *
 * `length` and `width` are part-space, because that is where features live. `upright` is the
 * one thing part space can't tell you on its own: a door's length runs *up* it, while a drawer
 * front's length runs *across* it, and a pattern of vertical grooves has to know which.
 */
export interface FrontShape {
  /** Part-space X extent. */
  readonly length: Mm;
  /** Part-space Y extent. */
  readonly width: Mm;
  readonly thickness: Mm;
  /** Which part-space axis stands vertical once the front is hung. */
  readonly upright: 'length' | 'width';
}

export interface StyledFront {
  readonly features: readonly PanelFeature[];
  /**
   * Why a front didn't get the style it was given, in plain terms. A front that falls back to
   * a slab must say so — silently shipping a plain door on a shaker kitchen is the failure
   * this exists to prevent.
   */
  readonly warnings: readonly string[];
}

const NOTHING: StyledFront = { features: [], warnings: [] };

const sizeLabel = (shape: FrontShape): string =>
  `${Math.round(shape.length)}×${Math.round(shape.width)}mm front`;

/**
 * Depth checks common to every style: a cut that isn't a cut, and a cut that goes through.
 * Returns a warning to fall back on, or null to carry on.
 */
const depthProblem = (depth: Mm, thickness: Mm, what: string): string | null => {
  if (depth <= 0) return `${what} is set to ${depth}mm deep, so nothing would be machined.`;
  if (depth >= thickness) {
    return (
      `${what} is ${depth}mm deep on ${thickness}mm board — that cuts straight through. ` +
      `Left as a plain slab.`
    );
  }
  return null;
};

/**
 * A shaker front: one rectangular pocket, inset from every edge by the border.
 *
 * The border is the same all round because that is what a one-piece shaker door is. A door
 * with a wider bottom rail is a five-piece door, which is a different construction and not
 * something to fake with an uneven pocket.
 */
const shakerFeatures = (style: DoorStyle, shape: FrontShape): StyledFront => {
  const b = style.borderWidth;
  if (b <= 0) {
    return { features: [], warnings: [`"${style.name}" has no border width, so it machines nothing.`] };
  }

  const depthWarning = depthProblem(style.recessDepth, shape.thickness, `"${style.name}"'s recess`);
  if (depthWarning) return { features: [], warnings: [depthWarning] };

  const centreLength = mm(shape.length - 2 * b);
  const centreWidth = mm(shape.width - 2 * b);
  const smallest = Math.min(centreLength, centreWidth);

  if (smallest < style.minimumCentre) {
    return {
      features: [],
      warnings: [
        `A ${b}mm border leaves ${Math.max(0, Math.round(smallest))}mm of centre on this ` +
          `${sizeLabel(shape)} — under the ${style.minimumCentre}mm minimum for "${style.name}". ` +
          `Cut as a plain slab.`,
      ],
    };
  }

  return {
    features: [
      {
        id: 'front-recess',
        kind: 'pocket',
        purpose: 'front-style',
        face: 'A',
        // Counter-clockwise, matching the profile outline convention.
        outline: [
          v2(b, b),
          v2(mm(shape.length - b), b),
          v2(mm(shape.length - b), mm(shape.width - b)),
          v2(b, mm(shape.width - b)),
        ],
        depth: style.recessDepth,
        cornerRadius: style.cornerRadius,
        toolId: style.pocketToolId,
      },
    ],
    warnings: [],
  };
};

/**
 * A V-grooved front: a run of grooves across the face.
 *
 * The spacing is a *target*, not a spacing that is stepped off from one edge. Stepping off
 * leaves whatever is left over as a sliver at the far edge, which is exactly what you'd avoid
 * setting it out by hand — so the span is divided into whole bays as near the target as it
 * goes, and the grooves land on the division lines.
 *
 * How wide each groove opens is not set here. It is the cutter's business, derived from the
 * cutter and the plunge depth.
 */
const vGrooveFeatures = (style: DoorStyle, shape: FrontShape): StyledFront => {
  const depthWarning = depthProblem(style.grooveDepth, shape.thickness, `"${style.name}"'s grooves`);
  if (depthWarning) return { features: [], warnings: [depthWarning] };

  if (style.grooveSpacing <= 0) {
    return { features: [], warnings: [`"${style.name}" has no groove spacing, so it machines nothing.`] };
  }

  // Grooves run along the upright axis when the pattern is vertical. Which part-space axis
  // that is depends on how the front was laid out, which is what `upright` is for.
  const runsAlongX =
    style.grooveDirection === 'vertical' ? shape.upright === 'length' : shape.upright === 'width';
  // Grooves are spaced across the axis they don't run along.
  const span = runsAlongX ? shape.width : shape.length;
  const margin = style.grooveMargin;
  const available = span - 2 * margin;

  if (available < style.minimumCentre) {
    return {
      features: [],
      warnings: [
        `This ${sizeLabel(shape)} leaves ${Math.max(0, Math.round(available))}mm to groove — ` +
          `under the ${style.minimumCentre}mm minimum for "${style.name}". Cut as a plain slab.`,
      ],
    };
  }

  // Whole bays, as near the target spacing as the span divides.
  const bays = Math.max(1, Math.round(available / style.grooveSpacing));
  if (bays < 2) {
    return {
      features: [],
      warnings: [
        `${Math.round(available)}mm is under one ${style.grooveSpacing}mm bay, so "${style.name}" ` +
          `puts no groove on this ${sizeLabel(shape)}. Cut as a plain slab.`,
      ],
    };
  }

  const features: PanelFeature[] = [];
  for (let i = 1; i < bays; i++) {
    const at = mm(margin + (available * i) / bays);
    features.push({
      id: `front-groove-${i}`,
      kind: 'profiled-cut',
      purpose: 'front-style',
      face: 'A',
      path: runsAlongX
        ? [v2(mm(0), at), v2(shape.length, at)]
        : [v2(at, mm(0)), v2(at, shape.width)],
      toolId: style.grooveToolId,
      depth: style.grooveDepth,
    });
  }
  return { features, warnings: [] };
};

/**
 * Machine one front to a style.
 *
 * Returns the features *and* why it fell short, together, so the two can't disagree about
 * whether a front got its style.
 */
export const styleFront = (style: DoorStyle, shape: FrontShape): StyledFront => {
  if (shape.length <= 0 || shape.width <= 0) return NOTHING;
  switch (style.kind) {
    case 'slab':
      return NOTHING;
    case 'shaker':
      return shakerFeatures(style, shape);
    case 'v-groove':
      return vGrooveFeatures(style, shape);
  }
};

/** Just the machining, for callers that don't need to hear about the fallbacks. */
export const featuresForFront = (
  style: DoorStyle,
  shape: FrontShape,
): readonly PanelFeature[] => styleFront(style, shape).features;

/**
 * The fronts that actually came out routed.
 *
 * Counted from the features on the panel rather than from the style on the cabinet, because
 * those are not the same number: a narrow drawer front in a shaker kitchen falls back to a
 * plain slab, and it should not be charged machine time for work nobody did.
 */
export const machinedFronts = (panels: readonly Panel[]): readonly Panel[] =>
  panels.filter(
    (p) => isStyledFrontRole(p.role) && p.features.some((f) => f.purpose === 'front-style'),
  );
