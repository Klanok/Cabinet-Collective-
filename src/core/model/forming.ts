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
import { type MeshData, extrudeProfile } from '../geom/extrude.ts';
import { type Profile2D, isRectangular, profileExtent } from '../geom/profile.ts';

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

/**
 * How much a flat chord may stray from the true bend when a formed part is drawn. Rendering
 * only — the part is cut flat, so nothing dimensional is approximated here.
 */
export const FORM_TOLERANCE: Mm = mm(0.1);

/**
 * How the local frame turns at bend angle `phi`: the part's own +along direction rotates to
 * `(cos φ, −sin φ)` in the (along, through) plane, and +through rotates to `(sin φ, cos φ)`.
 *
 * Exported shape of the same fact `formPoint` uses, applied to directions rather than
 * positions — which is what a normal is. Rotating normals rather than recomputing them from
 * the bent triangles is what keeps a curve smoothly shaded instead of faceted.
 */
const rotateNormal = (na: number, nb: number, nz: number, phi: number) => {
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  return { a: na * cos + nz * sin, b: nb, n: -na * sin + nz * cos };
};

/**
 * The flat slab a formed part starts as: a rectangle carrying `stations` down its length,
 * triangulated as a **strip** that follows them.
 *
 * Subdividing the outline is not enough, and assuming it was is what put fins and a woven
 * cross-hatch on every radiused end. The general extruder triangulates a cap by ear clipping,
 * which is free to join any two vertices of the ring it likes — handed a long rectangle with
 * fifty collinear stations down each side, it cheerfully returns triangles spanning half the
 * length. Flat, that is a perfectly correct triangulation and looks like nothing at all.
 *
 * Bending is what exposes it. `formPoint` moves vertices, not the triangles between them, so a
 * triangle reaching from station 3 to station 47 becomes a chord cutting clean through the
 * curve — the surface tears into flat wedges and the skeleton beneath shows through them.
 *
 * So a formed part cannot reuse the ordinary extruder's cap: the stations have to bind the
 * triangulation, and every triangle has to stay inside one station gap. The walls are built
 * here for the same reason. Nothing dimensional is decided in this function — it is a drawing
 * of a part whose size was fixed, flat, long before it got here.
 */
const slabMesh = (
  stations: readonly number[],
  across: Mm,
  thickness: Mm,
  axis: 'x' | 'y',
): MeshData => {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const n = stations.length;

  // (along, across, through) is the natural frame for a bend; the part's own axes are whichever
  // way round `axis` says. Everything below is written in the former and mapped here once.
  const put = (a: number, b: number, z: number, na: number, nb: number, nz: number) => {
    if (axis === 'x') {
      positions.push(a, b, z);
      normals.push(na, nb, nz);
    } else {
      positions.push(b, a, z);
      normals.push(nb, na, nz);
    }
    // Keep the unformed coordinates: the decor bends with the board instead of projecting
    // through the finished curve.
    uvs.push(axis === 'x' ? a : b, axis === 'x' ? b : a);
  };

  // The two big faces, each a ladder of quads between consecutive stations.
  for (const face of [
    { z: thickness, nz: 1, front: true },
    { z: 0, nz: -1, front: false },
  ]) {
    const base = positions.length / 3;
    for (const a of stations) put(a, 0, face.z, 0, 0, face.nz);
    for (const a of stations) put(a, across, face.z, 0, 0, face.nz);
    for (let i = 0; i < n - 1; i++) {
      const p0 = base + i;
      const p1 = base + i + 1;
      const q0 = base + n + i;
      const q1 = base + n + i + 1;
      if (face.front) indices.push(p0, p1, q1, p0, q1, q0);
      else indices.push(p0, q1, p1, p0, q0, q1);
    }
  }

  /** One flat quad, corners given counter-clockwise as seen from outside. */
  const quad = (
    corners: readonly (readonly [number, number, number])[],
    na: number,
    nb: number,
    nz: number,
  ) => {
    const base = positions.length / 3;
    for (const [a, b, z] of corners) put(a, b, z, na, nb, nz);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  // The long edges follow the stations too, or they would cut the same chords the faces did.
  for (let i = 0; i < n - 1; i++) {
    const a0 = stations[i]!;
    const a1 = stations[i + 1]!;
    quad(
      [
        [a0, 0, 0],
        [a1, 0, 0],
        [a1, 0, thickness],
        [a0, 0, thickness],
      ],
      0,
      -1,
      0,
    );
    quad(
      [
        [a0, across, 0],
        [a0, across, thickness],
        [a1, across, thickness],
        [a1, across, 0],
      ],
      0,
      1,
      0,
    );
  }

  // The two cut ends stay square — nothing bends across them.
  const last = stations[n - 1]!;
  quad(
    [
      [0, 0, 0],
      [0, 0, thickness],
      [0, across, thickness],
      [0, across, 0],
    ],
    -1,
    0,
    0,
  );
  quad(
    [
      [last, 0, 0],
      [last, across, 0],
      [last, across, thickness],
      [last, 0, thickness],
    ],
    1,
    0,
    0,
  );

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
};

/**
 * A formed part's mesh: the flat part, cut into enough pieces along the bend to look round,
 * then bent.
 *
 * The subdivision has to happen *before* extruding. A skin is a rectangle, so its flat mesh
 * is two triangles, and bending four corners gives a flat parallelogram leaning over — the
 * curve simply isn't there to bend. Adding stations along the bend axis first and then
 * reusing the ordinary extruder is both less code than building a shell by hand and less
 * to get wrong, since the extruder is already the tested one.
 *
 * Falls back to the flat mesh for a profile that isn't rectangular. Nothing produces one
 * today — a skin is always a rectangle — and quietly bending a shaped part about an axis it
 * was never designed around would look plausible and be wrong.
 */
export const formedMesh = (
  profile: Profile2D,
  thickness: Mm,
  f: Forming,
  tolerance: Mm = FORM_TOLERANCE,
): MeshData => {
  if (!isRectangular(profile)) return extrudeProfile(profile, thickness);

  const { length, width } = profileExtent(profile);
  const alongLength = f.axis === 'x' ? length : width;
  const acrossLength = f.axis === 'x' ? width : length;

  const rn = neutralRadius(f, thickness);
  const maxStep =
    rn <= tolerance ? f.sweep : 2 * Math.acos(Math.max(-1, 1 - tolerance / rn));
  const steps = Math.max(2, Math.ceil(f.sweep / Math.max(maxStep, 1e-6)));

  const stations = Array.from({ length: steps + 1 }, (_, i) => (alongLength * i) / steps);
  const flat = slabMesh(stations, acrossLength, thickness, f.axis);

  const positions = new Float32Array(flat.positions.length);
  const normals = new Float32Array(flat.normals.length);
  const { from, to } = formedSpan(f, thickness);

  for (let i = 0; i < flat.positions.length; i += 3) {
    const p = {
      x: mm(flat.positions[i]!),
      y: mm(flat.positions[i + 1]!),
      z: mm(flat.positions[i + 2]!),
    };
    const bent = formPoint(f, thickness, p);
    positions[i] = bent.x;
    positions[i + 1] = bent.y;
    positions[i + 2] = bent.z;

    const along = f.axis === 'x' ? p.x : p.y;
    const phi = (Math.min(Math.max(along, from), to) - from) / rn;
    const na = f.axis === 'x' ? flat.normals[i]! : flat.normals[i + 1]!;
    const nb = f.axis === 'x' ? flat.normals[i + 1]! : flat.normals[i]!;
    const turned = rotateNormal(na, nb, flat.normals[i + 2]!, phi);
    normals[i] = f.axis === 'x' ? turned.a : turned.b;
    normals[i + 1] = f.axis === 'x' ? turned.b : turned.a;
    normals[i + 2] = turned.n;
  }

  return { positions, normals, uvs: flat.uvs, indices: flat.indices };
};
