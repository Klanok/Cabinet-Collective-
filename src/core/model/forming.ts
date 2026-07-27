/**
 * How a flat part bends after it is cut.
 *
 * Every part in this model until now has been the same shape on the sheet as it is in the
 * cabinet, so one profile could honestly be both. Bendy ply breaks that. A skin wrapping a
 * radiused end is a **rectangle** on the sheet and a **curve** in the room, and the two are
 * not the same measurement — the rectangle is longer than the curve is wide.
 *
 * So the split is stated explicitly and in one direction:
 *
 * > `Panel.profile` is always the **flat, as-cut** shape — what the saw cuts, what the nester
 * > packs, what the machine runs. `Panel.forming` is a separate descriptor saying how that
 * > flat part is bent afterwards, and is read only by things that draw it.
 *
 * Nothing dimensional may read `forming`. If a cutlist ever needs it, the developed length has
 * been left out of the profile, which is the bug this arrangement exists to prevent.
 *
 * The alternative — storing the curved shape and deriving the flat one — was rejected for the
 * usual reason: the flat shape is the one that has to be exactly right, because it is the one
 * being cut. Deriving it every time from a curve is a rounding error away from a skin that is
 * 2mm short at the end of a 470mm wrap, and you find that out with the glue on.
 */

import { type Mm, mm } from '../units.ts';

/**
 * A part bent to a single radius about one axis — a cylinder, which is what bendy ply over
 * formers actually is. Compound curves are not this and are not modelled.
 *
 * Deliberately **not** stored here: where the bend ends. That is `from` plus the developed
 * length, and the developed length is fixed by the radius, the sweep and the board — so
 * storing it too would be a fourth fact free to disagree with the other three, in a model
 * whose whole argument is that it doesn't do that. `formedSpan` derives it.
 */
export interface CylindricalForming {
  readonly kind: 'cylindrical';
  /** The part-space axis that runs **around** the curve. The other stays dead straight. */
  readonly axis: 'x' | 'y';
  /**
   * Radius of the **B-face** — the inside of the bend, the face that lies against the
   * formers. Naming which face it is measured to matters: over a 3mm skin the inner and
   * outer radii differ by 3mm, and a former cut to the wrong one is a former that rocks.
   */
  readonly innerRadius: Mm;
  /**
   * Included angle of the bend, radians, and always positive. A quarter round is π/2.
   *
   * There is no signed version of this because there is nothing for a sign to mean: the
   * B-face is the inside of the bend by definition, so the part can only curve one way
   * relative to itself. Which way it faces *in the cabinet* is the placement's business —
   * `u` and `v` already mirror a part, and that is the one place handedness lives.
   */
  readonly sweep: number;
  /** Distance along `axis` at which the bend starts. Before it, the part stays flat. */
  readonly from: Mm;
  /**
   * Where through the thickness the material neither stretches nor compresses, as a fraction
   * of thickness from the inside face.
   *
   * 0.5 — the middle — is the standard assumption for laminating a thin skin, and it is what
   * decides how long to cut it: measure round the inside face and the skin comes up short,
   * measure round the outside and it runs long. On 3mm ply at a 300mm radius the difference
   * between those two is nearly 5mm over a quarter round, which is a visible gap.
   */
  readonly kFactor: number;
}

export type Forming = CylindricalForming;

/** Sensible for laminating a thin skin, and the value to change if a shop measures otherwise. */
export const DEFAULT_K_FACTOR = 0.5;

/**
 * The radius at which the material neither stretches nor compresses — what the developed
 * length is actually measured around.
 */
export const neutralRadius = (f: Forming, thickness: Mm): Mm =>
  mm(f.innerRadius + f.kFactor * thickness);

/**
 * How long the part has to be cut, measured **around** the curve.
 *
 * This is the number the whole descriptor exists for. A skin wrapping a 300mm radius through
 * 90° is not 300mm of anything — it is 471mm round the inside face, 476mm round the outside,
 * and 473.6mm at the neutral axis of a 3mm board, which is the one to cut to.
 */
export const developedLength = (f: Forming, thickness: Mm): Mm =>
  mm(neutralRadius(f, thickness) * Math.abs(f.sweep));

/** Where the bend starts and finishes along its axis, once the developed length is known. */
export const formedSpan = (f: Forming, thickness: Mm): { from: Mm; to: Mm } => ({
  from: f.from,
  to: mm(f.from + developedLength(f, thickness)),
});

/**
 * A cylindrical forming for a bend of `sweep` at `innerRadius`, starting `from` along `axis`.
 */
export const cylindricalForming = (
  axis: 'x' | 'y',
  innerRadius: Mm,
  sweep: number,
  from: Mm = mm(0),
  kFactor: number = DEFAULT_K_FACTOR,
): CylindricalForming => {
  if (innerRadius <= 0) throw new Error('cylindricalForming: radius must be positive');
  if (sweep <= 0) {
    throw new Error(
      'cylindricalForming: sweep must be positive — the B-face is the inside of the bend, ' +
        'and which way the part faces is the placement’s job',
    );
  }
  return { kind: 'cylindrical', axis, innerRadius, sweep, from, kFactor };
};

/**
 * Where a point on the flat part ends up once the part is bent — part space in, part space
 * out. **For drawing only.** Nothing that decides a size may call this.
 *
 * The geometry, so it can be checked rather than trusted. Write `s` for the distance along
 * the bend axis and `n` for the distance through the thickness (part-space `z`, running
 * B-face to A-face). The B-face is the inside of the bend, so the cylinder's centre sits a
 * radius *behind* it, at `n = −innerRadius`. A point at thickness `n` is then at radius
 * `innerRadius + n` from that centre, and the neutral surface — the one that keeps its
 * length — is at `rn`, which is what converts distance along into angle:
 *
 * ```
 *   φ = (s − from) / rn                  angle turned through
 *   s' = from + (innerRadius + n)·sin φ
 *   n' = −innerRadius + (innerRadius + n)·cos φ
 * ```
 *
 * Two checks worth doing by eye. At `φ = 0` this gives `s' = from` and `n' = n`, so the part
 * starts exactly where the flat one did. And the B-face (`n = 0`) traces a circle of radius
 * `innerRadius`, which is what it has to do to sit down on the formers.
 *
 * The co-ordinate *across* the bend is carried straight through untouched — a cylinder is
 * dead straight in that direction, which is exactly why bendy ply can make one and not a
 * dome. Anything before `from`, or past the end of the bend, runs on flat along the tangent,
 * so a skin can carry flat fixing tabs at either end and they render flat.
 */
export const formPoint = (
  f: Forming,
  thickness: Mm,
  point: { x: Mm; y: Mm; z: Mm },
): { x: Mm; y: Mm; z: Mm } => {
  const along = f.axis === 'x' ? point.x : point.y;
  const across = f.axis === 'x' ? point.y : point.x;
  const { from, to } = formedSpan(f, thickness);

  const rn = neutralRadius(f, thickness);
  const bent = Math.min(Math.max(along, from), to);
  const phi = (bent - from) / rn;
  const r = f.innerRadius + point.z;

  const cos = Math.cos(phi);
  const sin = Math.sin(phi);

  // Everything past the ends of the bend continues along the tangent there, which for a
  // curve turning this way is (cos φ, −sin φ).
  const overrun = along - bent;
  const s = from + r * sin + overrun * cos;
  const n = -f.innerRadius + r * cos - overrun * sin;

  return f.axis === 'x'
    ? { x: mm(s), y: mm(across), z: mm(n) }
    : { x: mm(across), y: mm(s), z: mm(n) };
};
