/**
 * Custom features, resolved onto the parts they were placed on.
 *
 * `model/partFeature.ts` holds what a user *says* — "a Ø50 hole in the left hand end, 250 up
 * from the bottom and 100 in from the front". This turns that into what the machine and the saw
 * need, and there are exactly three things it has to get right.
 *
 * ## 1. Named edges, resolved through each panel's own placement
 *
 * Never a raw part-space `x`. A side panel's part axes run opposite ways on the two hands, so a
 * stored `x = 100` is 100 from the front on one side and 100 from the **back** on the other —
 * the same hole, the same diameter, on a part of exactly the right size. `edgeFacing` and
 * `faceFacing` ask the placement which named edge or face a cabinet direction lands on, exactly
 * as `resolveBanding` does for banding and `cabinetToPart` does for a hinge. The same sentence
 * therefore comes out as a mirror image on the two hands, with nothing here knowing it is
 * describing a handed part.
 *
 * ## 2. A notch is the part's shape; a hole and a groove are machining
 *
 * This is the split that decides what the **nest** reserves, and it is made once, here, rather
 * than bolted on the first time somebody cuts a notch:
 *
 *   - a **notch** is cut into `Profile2D`, so the cutlist size, the banding length, the blank the
 *     nester reserves and the perimeter the router follows all see it. A notch off a whole edge
 *     makes the part smaller and the blank smaller with it.
 *   - a **hole** and a **groove** are `PanelFeature`s. They take nothing off the rectangle the
 *     part is cut from, so the blank is untouched — which is right: a saw still cuts the same
 *     rectangle and the hole is made afterwards.
 *
 * A corner notch is the honest edge case in that sentence and is worth stating rather than
 * hiding: it changes the *shape* but not the bounding box, because a panel saw still cuts the
 * whole rectangle and the bite comes out afterwards. That is §4.8's rule — *a nest is of blanks,
 * not of shapes* — applying to a part somebody notched rather than to one the engine curved.
 *
 * ## 3. Nothing throws
 *
 * A feature that will not fit, or that names a part this cabinet does not build, is **reported
 * and not applied**, and the rest of the cabinet still comes out. `build.ts` has said so since
 * §4.5 and a builder that quietly broke it took the whole app to a blank screen — and this is
 * the first place in the codebase where the numbers come **straight off a keyboard**, one
 * keystroke at a time, which is the condition that found that bug.
 */

import { type Mm, mm, snapGeometric } from '../units.ts';
import { type SignedAxis, type Vec2, axisVector, v2 } from '../geom/vec.ts';
import type { PanelPlacement } from '../geom/placement.ts';
import {
  type Polygon,
  type RectEdge,
  circleRing,
  isRectangular,
  profileBounds,
  profileExtent,
  translateProfile,
} from '../geom/profile.ts';
import type { PanelFeature } from '../model/feature.ts';
import {
  type CustomGroove,
  type CustomHole,
  type CustomNotch,
  type PartDatum,
  describeCustomFeature,
} from '../model/partFeature.ts';
import type { RuleContext } from './context.ts';
import {
  type CabinetSpec,
  type MaterialSlot,
  type PartInstance,
  edgeFacing,
  faceFacing,
  refusalOf,
} from './spec.ts';

/**
 * The cabinet-space direction each named side faces.
 *
 * The single translation from the shop's words to the model's axes. Everything else in this file
 * asks a placement, so this table is the only thing that has to know that "front" is `+Z`.
 */
const DATUM_AXIS: Record<PartDatum, SignedAxis> = {
  front: '+Z',
  back: '-Z',
  right: '+X',
  left: '-X',
  top: '+Y',
  bottom: '-Y',
};

/** Which named edges of this part a feature may be measured from. */
export const edgeDatumsOf = (placement: PanelPlacement): PartDatum[] =>
  (Object.keys(DATUM_AXIS) as PartDatum[]).filter(
    (d) => edgeFacing(placement, DATUM_AXIS[d]) !== null,
  );

/** Which named faces this part has — the two the board's thickness runs between. */
export const faceDatumsOf = (placement: PanelPlacement): PartDatum[] =>
  (Object.keys(DATUM_AXIS) as PartDatum[]).filter(
    (d) => faceFacing(placement, DATUM_AXIS[d]) !== null,
  );

/** A resolved edge: which part-space axis it lies on, and which end of it. */
interface ResolvedEdge {
  readonly rect: RectEdge;
  readonly axis: 'x' | 'y';
  /** True for the far edge — `x = length` or `y = width`, where distances count backwards. */
  readonly far: boolean;
}

const EDGE_AXES: Record<RectEdge, ResolvedEdge> = {
  W1: { rect: 'W1', axis: 'x', far: false },
  W2: { rect: 'W2', axis: 'x', far: true },
  L1: { rect: 'L1', axis: 'y', far: false },
  L2: { rect: 'L2', axis: 'y', far: true },
};

const resolveEdge = (placement: PanelPlacement, datum: PartDatum): ResolvedEdge | null => {
  const edge = edgeFacing(placement, DATUM_AXIS[datum]);
  return edge ? EDGE_AXES[edge] : null;
};

/** Part-space extent along one axis. */
const extentAlong = (extent: { length: Mm; width: Mm }, axis: 'x' | 'y'): Mm =>
  axis === 'x' ? extent.length : extent.width;

/** A distance measured in from an edge, as a part-space coordinate on that edge's axis. */
const coordinateFrom = (edge: ResolvedEdge, at: Mm, span: Mm): Mm =>
  mm(edge.far ? span - at : at);

/**
 * A run of `length`, starting `at` in from `edge`, as a part-space `[lo, hi]` on that axis.
 *
 * Measured **into the part** from whichever edge was named, so "200 long, 50 in from the right"
 * runs from 50 to 250 in from the right — which is what somebody with a tape means, and the
 * reason the two ends are not simply `at` and `at + length`.
 */
const spanFrom = (edge: ResolvedEdge, at: Mm, length: Mm, span: Mm): [Mm, Mm] => {
  const start = coordinateFrom(edge, at, span);
  return edge.far ? [mm(start - length), start] : [start, mm(start + length)];
};

/** The board this part is cut from, as it really measures. */
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

/** What resolving one feature onto one part produced. Either a change, or a sentence. */
interface Resolution {
  readonly instance: PartInstance;
  readonly problem?: undefined;
}
interface Refusal {
  readonly problem: string;
  readonly instance?: undefined;
}

const refuse = (message: string): Refusal => ({ problem: message });

const withFeature = (instance: PartInstance, feature: PanelFeature, note: string): Resolution => ({
  instance: {
    ...instance,
    features: [...(instance.features ?? []), feature],
    note: appendNote(instance.note, note),
  },
});

/**
 * A custom feature always writes itself onto the part's cutlist note, whichever of the three it
 * is.
 *
 * Two reasons, and the second is the load-bearing one. It tells the person at the saw what is
 * different about this part — and it is what keeps the cutlist honest, because
 * `cutlist/buildCutlist` groups identical parts onto one line and **the note is part of the
 * key**. Without it, one notched side and one plain side of the same size would collapse into
 * "2 × Side L" and one of them would be cut wrong.
 */
const appendNote = (existing: string | undefined, addition: string): string =>
  existing ? `${existing}; ${addition}` : addition;

// ---------------------------------------------------------------------------------------
// The three kinds
// ---------------------------------------------------------------------------------------

const resolveHole = (
  feature: CustomHole,
  instance: PartInstance,
  extent: { length: Mm; width: Mm },
): Resolution | Refusal => {
  if (feature.diameter <= 0) return refuse('a hole needs a diameter');
  const radius = mm(feature.diameter / 2);

  const placed: Partial<Record<'x' | 'y', Mm>> = {};
  for (const offset of feature.at) {
    const edge = resolveEdge(instance.placement, offset.from);
    if (!edge) return refuse(notAnEdge(offset.from, instance));
    if (placed[edge.axis] !== undefined) {
      return refuse(
        `both measurements are taken from the same direction across the part, so they do not ` +
          `say where along it the hole goes. Measure it from two edges at right angles.`,
      );
    }
    placed[edge.axis] = coordinateFrom(edge, offset.at, extentAlong(extent, edge.axis));
  }
  const { x, y } = placed;
  if (x === undefined || y === undefined) return refuse('a hole needs two measurements');

  /*
   * Checked against the part's **bounding box**, which is the honest limit rather than an
   * oversight. On a rectangle — which is every part anyone has put a hole in — the box is the
   * part. On a shaped one it is not, so a hole could in principle be placed in the corner a notch
   * already took. Testing a point against an arbitrary outline is a different piece of work, and
   * refusing every shaped part would refuse the radiused shelving as well.
   */
  if (x - radius < 0 || y - radius < 0 || x + radius > extent.length || y + radius > extent.width) {
    return refuse(
      `a Ø${round(feature.diameter)} hole there runs off the edge of a ` +
        `${round(extent.length)} × ${round(extent.width)} part`,
    );
  }

  return withFeature(
    instance,
    {
      id: feature.id,
      kind: 'cutout',
      purpose: 'custom',
      outline: circleRing(v2(snapGeometric(x), snapGeometric(y)), radius),
      cornerRadius: mm(0),
    },
    describeCustomFeature(feature),
  );
};

const resolveGroove = (
  feature: CustomGroove,
  instance: PartInstance,
  extent: { length: Mm; width: Mm },
  thickness: Mm,
): Resolution | Refusal => {
  if (feature.width <= 0 || feature.depth <= 0) {
    return refuse('a groove needs a width and a depth');
  }
  if (feature.depth >= thickness) {
    return refuse(
      `a ${round(feature.depth)}mm deep groove goes right through ${round(thickness)}mm board. ` +
        `Use a notch or a hole if it is meant to.`,
    );
  }

  const face = faceFacing(instance.placement, DATUM_AXIS[feature.face]);
  if (!face) {
    return refuse(
      `the ${feature.face} of "${instance.name}" is an edge of the board, not a face of it. ` +
        `This part's faces are its ${faceDatumsOf(instance.placement).join(' and ')}.`,
    );
  }

  const edge = resolveEdge(instance.placement, feature.edge);
  if (!edge) return refuse(notAnEdge(feature.edge, instance));

  // Across the groove: from the named edge to its near side, then to its centreline — which is
  // what a `GrooveFeature` carries, because a cutter follows the middle of the cut.
  const acrossSpan = extentAlong(extent, edge.axis);
  const [near, far] = spanFrom(edge, feature.offset, feature.width, acrossSpan);
  if (near < 0 || far > acrossSpan) {
    return refuse(
      `a ${round(feature.width)}mm groove ${round(feature.offset)}mm in from the ` +
        `${feature.edge} runs off a part only ${round(acrossSpan)}mm across`,
    );
  }
  const centre = mm((near + far) / 2);

  // Along the groove: the full width of the part unless a run was given.
  const alongAxis = edge.axis === 'x' ? 'y' : 'x';
  const alongSpan = extentAlong(extent, alongAxis);
  let from: Mm = mm(0);
  let to: Mm = alongSpan;
  if (feature.run) {
    const runEdge = resolveEdge(instance.placement, feature.run.from.from);
    if (!runEdge) return refuse(notAnEdge(feature.run.from.from, instance));
    if (runEdge.axis !== alongAxis) {
      return refuse(
        `a groove running parallel to the ${feature.edge} is measured along its length from the ` +
          `ends of the part, not from the ${feature.run.from.from}`,
      );
    }
    if (feature.run.length <= 0) return refuse('a groove needs a length');
    [from, to] = spanFrom(runEdge, feature.run.from.at, feature.run.length, alongSpan);
    if (from < 0 || to > alongSpan) {
      return refuse(
        `a ${round(feature.run.length)}mm groove ${round(feature.run.from.at)}mm from the ` +
          `${feature.run.from.from} runs off a part only ${round(alongSpan)}mm long`,
      );
    }
  }

  const point = (along: Mm): Vec2 =>
    edge.axis === 'x' ? v2(snapGeometric(centre), snapGeometric(along)) : v2(snapGeometric(along), snapGeometric(centre));

  return withFeature(
    instance,
    {
      id: feature.id,
      kind: 'groove',
      purpose: 'custom',
      face,
      path: [point(from), point(to)],
      width: feature.width,
      depth: feature.depth,
    },
    describeCustomFeature(feature),
  );
};

const resolveNotch = (
  feature: CustomNotch,
  instance: PartInstance,
  extent: { length: Mm; width: Mm },
): Resolution | Refusal => {
  if (feature.depth <= 0 || feature.length <= 0) {
    return refuse('a notch needs a depth and a length');
  }
  if (!isRectangular(instance.profile)) {
    return refuse(
      `"${instance.name}" is already a shaped part — a curved or notched profile — and cutting ` +
        `another notch into one is not worked out yet. A hole or a groove still works on it.`,
    );
  }

  const edge = resolveEdge(instance.placement, feature.edge);
  if (!edge) return refuse(notAnEdge(feature.edge, instance));
  const fromEdge = resolveEdge(instance.placement, feature.from.from);
  if (!fromEdge) return refuse(notAnEdge(feature.from.from, instance));

  const alongAxis = edge.axis === 'x' ? 'y' : 'x';
  if (fromEdge.axis !== alongAxis) {
    return refuse(
      `a notch off the ${feature.edge} runs along that edge, so where it starts is measured from ` +
        `an edge at right angles to it — not from the ${feature.from.from}`,
    );
  }

  const across = extentAlong(extent, edge.axis);
  const along = extentAlong(extent, alongAxis);
  if (feature.depth >= across) {
    return refuse(
      `a ${round(feature.depth)}mm notch off the ${feature.edge} would take the whole ` +
        `${round(across)}mm of the part`,
    );
  }
  const [lo, hi] = spanFrom(fromEdge, feature.from.at, feature.length, along);
  if (lo < -GEOMETRY_SLOP || hi > along + GEOMETRY_SLOP) {
    return refuse(
      `a ${round(feature.length)}mm notch ${round(feature.from.at)}mm from the ` +
        `${feature.from.from} runs off a part only ${round(along)}mm long`,
    );
  }

  const outline = notchedOutline(extent, edge, [clamp(lo, 0, along), clamp(hi, 0, along)], feature.depth);
  return {
    instance: normalise({
      ...instance,
      profile: { outline, holes: instance.profile.holes },
      note: appendNote(instance.note, describeCustomFeature(feature)),
    }),
  };
};

/** Rounding slack for a notch that is meant to reach a corner exactly. */
const GEOMETRY_SLOP = 1e-6;

const clamp = (n: number, lo: number, hi: number): Mm => mm(Math.min(hi, Math.max(lo, n)));

/**
 * The rectangle's boundary with a bite taken out of one named edge.
 *
 * Walked counter-clockwise from the origin corner, inserting the notch's four points into
 * whichever side carries it. One routine rather than sixteen cases: a corner notch, a bite out
 * of the middle of an edge and a step off a whole edge are the same construction with different
 * numbers, and the duplicate points that fall out when the notch reaches a corner are removed
 * afterwards rather than branched around.
 */
const notchedOutline = (
  extent: { length: Mm; width: Mm },
  edge: ResolvedEdge,
  [lo, hi]: [Mm, Mm],
  depth: Mm,
): Polygon => {
  const l = extent.length;
  const w = extent.width;
  const corners: Vec2[] = [v2(0, 0), v2(l, 0), v2(l, w), v2(0, w)];
  // Each side of the ring, in travel order, named by the edge it is.
  const sides: RectEdge[] = ['L1', 'W2', 'L2', 'W1'];

  const inserts: Record<RectEdge, Vec2[]> = {
    // Travelling +x along y = 0; the notch cuts into +y.
    L1: [v2(lo, 0), v2(lo, depth), v2(hi, depth), v2(hi, 0)],
    // Travelling +y up x = length; the notch cuts into −x.
    W2: [v2(l, lo), v2(l - depth, lo), v2(l - depth, hi), v2(l, hi)],
    // Travelling −x along y = width, so the run is walked from its far end.
    L2: [v2(hi, w), v2(hi, w - depth), v2(lo, w - depth), v2(lo, w)],
    // Travelling −y down x = 0, likewise.
    W1: [v2(0, hi), v2(depth, hi), v2(depth, lo), v2(0, lo)],
  };

  const ring: Vec2[] = [];
  sides.forEach((side, i) => {
    ring.push(corners[i]!);
    if (side === edge.rect) ring.push(...inserts[side]!);
  });
  return tidyRing(ring);
};

/**
 * Drop repeated and collinear vertices.
 *
 * Both happen by construction above: a notch that reaches a corner lands on top of it, and a
 * notch off a whole edge leaves the two remaining corners of a smaller rectangle with a
 * redundant point between them. Cleaning up matters beyond tidiness — a part left with six
 * collinear vertices is not `isRectangular`, and would then refuse a second notch and take the
 * non-rectangular path in the renderer for a shape that is a plain rectangle.
 */
const tidyRing = (points: readonly Vec2[]): Polygon => {
  const same = (a: Vec2, b: Vec2): boolean =>
    Math.abs(a.x - b.x) < GEOMETRY_SLOP && Math.abs(a.y - b.y) < GEOMETRY_SLOP;

  const deduped: Vec2[] = [];
  for (const p of points) {
    if (deduped.length > 0 && same(deduped[deduped.length - 1]!, p)) continue;
    deduped.push(p);
  }
  while (deduped.length > 1 && same(deduped[0]!, deduped[deduped.length - 1]!)) deduped.pop();

  const kept: Vec2[] = [];
  for (let i = 0; i < deduped.length; i++) {
    const prev = deduped[(i - 1 + deduped.length) % deduped.length]!;
    const here = deduped[i]!;
    const next = deduped[(i + 1) % deduped.length]!;
    const cross =
      (here.x - prev.x) * (next.y - here.y) - (here.y - prev.y) * (next.x - here.x);
    if (Math.abs(cross) < GEOMETRY_SLOP) continue;
    kept.push(v2(snapGeometric(here.x), snapGeometric(here.y)));
  }
  return kept.length >= 3 ? kept : deduped.map((p) => v2(p.x, p.y));
};

/**
 * Put a part back on its own origin, moving its placement by exactly as much.
 *
 * Part space starts at the bottom-left of the profile's bounding box, and the nest, the cutlist
 * and CAM all rely on it: a profile starting at `x = 60` would be laid on the sheet 60mm inside
 * the blank the nester reserved. So when a notch off the low edge leaves the material starting
 * short of the origin, the profile is slid back and the placement's origin is slid the *same
 * distance in the cabinet*, which leaves the part exactly where it physically is while making it
 * a part again. Getting only half of this right moves the board.
 */
const normalise = (instance: PartInstance): PartInstance => {
  const bounds = profileBounds(instance.profile);
  if (bounds.minX === 0 && bounds.minY === 0) return instance;
  const u = axisVector(instance.placement.u);
  const v = axisVector(instance.placement.v);
  const { minX, minY } = bounds;
  return {
    ...instance,
    profile: translateProfile(instance.profile, mm(-minX), mm(-minY)),
    placement: {
      ...instance.placement,
      origin: {
        x: mm(instance.placement.origin.x + u.x * minX + v.x * minY),
        y: mm(instance.placement.origin.y + u.y * minX + v.y * minY),
        z: mm(instance.placement.origin.z + u.z * minX + v.z * minY),
      },
    },
  };
};

const round = (n: number): string => String(Math.round(n * 10) / 10);

const notAnEdge = (datum: PartDatum, instance: PartInstance): string =>
  `the ${datum} of "${instance.name}" is a face of the board, not an edge of it. Measure from ` +
  `its ${edgeDatumsOf(instance.placement).join(', ')}.`;

// ---------------------------------------------------------------------------------------
// The pass over a cabinet's parts
// ---------------------------------------------------------------------------------------

/** One produced part, with the rule key and position that name it. */
export interface KeyedInstance {
  readonly instance: PartInstance;
  readonly key: string;
  readonly index: number;
}

export interface CustomFeatureResult {
  readonly instances: readonly PartInstance[];
  readonly warnings: readonly string[];
}

/**
 * Apply a cabinet's custom features to the parts it produced.
 *
 * Runs **before** the boring pass and the door style, and the order is not arbitrary: a notch
 * changes the part's size and where it sits, so anything measured off the finished part — a
 * runner fixing set back from the front edge of a side, a shaker border sized to the front — has
 * to see the notched part rather than the one before it.
 */
export const applyCustomFeatures = (
  ctx: RuleContext,
  spec: CabinetSpec,
  produced: readonly KeyedInstance[],
): CustomFeatureResult => {
  const features = ctx.cabinet.customFeatures ?? [];
  if (features.length === 0) {
    return { instances: produced.map((p) => p.instance), warnings: [] };
  }

  /*
   * Whether this type can carry one at all is the spec's own answer (§4.15), in the spec's own
   * words. The alternative is a list of type ids kept here, which is precisely the second
   * opinion about what a spec builds that `capabilities` exists to abolish.
   */
  const refusal = refusalOf(spec.capabilities.customFeatures);
  if (refusal !== null) {
    return {
      instances: produced.map((p) => p.instance),
      warnings: [
        `${features.length} custom cutout${features.length === 1 ? '' : 's'} on this cabinet ` +
          `${features.length === 1 ? 'is' : 'are'} not applied. ${refusal}`,
      ],
    };
  }

  const instances = produced.map((p) => p.instance);
  const warnings: string[] = [];
  const keys = [...new Set(produced.map((p) => p.key))];

  for (const feature of features) {
    const targets = produced
      .map((p, i) => ({ ...p, at: i }))
      .filter((p) => p.key === feature.part && (feature.index === undefined || p.index === feature.index));

    if (targets.length === 0) {
      warnings.push(
        `${sentenceCase(describeCustomFeature(feature))} was put on "${feature.part}"` +
          (feature.index === undefined ? '' : ` no. ${feature.index + 1}`) +
          `, which this cabinet does not build. It cuts: ${keys.join(', ')}. Not applied.`,
      );
      continue;
    }

    for (const target of targets) {
      const instance = instances[target.at]!;
      const extent = profileExtent(instance.profile);
      const thickness = thicknessOf(ctx, instance.material);
      const result =
        feature.kind === 'hole'
          ? resolveHole(feature, instance, extent)
          : feature.kind === 'groove'
            ? resolveGroove(feature, instance, extent, thickness)
            : resolveNotch(feature, instance, extent);

      if (result.problem !== undefined) {
        warnings.push(
          `${sentenceCase(describeCustomFeature(feature))} on "${instance.name}": ` +
            `${result.problem} Not applied.`,
        );
        continue;
      }
      instances[target.at] = result.instance;
    }
  }

  return { instances, warnings };
};

const sentenceCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
