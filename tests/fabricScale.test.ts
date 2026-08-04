/**
 * The banquette cushion that draws in flat colour — reported twice, from two different causes.
 *
 * ## What is actually being tested here, and what is not
 *
 * The **arithmetic** is here. The **wiring** — which object the scaling is attached to — is what
 * was broken the second time, and it cannot be tested in this suite: there is no R3F renderer and
 * no DOM. That half is verified by driving the running app, per §7. Saying so is the point; a test
 * file that looked like it covered this would be worse than one that admits it does not.
 *
 * ## The first bug (fixed earlier, §5.4b)
 *
 * The cushion renderer set `map.repeat` on the texture `useLoader` hands back, and that object is
 * shared and cached — so two banquettes in one fabric fought over the weave scale. The fix was to
 * bake UVs into the geometry and never write to the texture, which is what this function does.
 *
 * ## The second bug (this change)
 *
 * The scaling ran from a ref on the `<mesh>`. A mesh ref fires when the mesh is created, and the
 * mesh **outlives its geometry**: `<extrudeGeometry args={…}>` is a child, and changing any of
 * those args makes R3F build a new geometry and attach it to the same mesh. The ref never fires
 * again, so the replacement kept raw millimetre UVs — about 5,800 repeats across one cushion,
 * which averages to flat colour on screen.
 *
 * Hence the reported symptom: *"draws in flat colour until the cabinet is removed and re-added"*,
 * because removing and re-adding is the one thing that remounts the mesh.
 *
 * ## Why the idempotence guard is now load-bearing
 *
 * Four of the five cushions hang the scaling off the geometry, which fires exactly once per
 * geometry. The square seat cannot — drei's `RoundedBox` builds its geometry internally, so there
 * is no element to attach to — and uses a layout effect with **no dependency array**, which runs
 * after every render. Without the guard the UVs would be divided again on every frame and the
 * weave would collapse to nothing. That is the assertion this file exists for.
 */

import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry } from 'three';
import { applyFabricScale } from '../src/app/viewport/fabricScale.ts';

/** A stand-in for an extrude's UVs: shape coordinates, in millimetres, exactly as three emits. */
const geometryWithMillimetreUvs = (...uvs: number[]): BufferGeometry => {
  const g = new BufferGeometry();
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  return g;
};

const uvsOf = (g: BufferGeometry): number[] => Array.from(g.attributes.uv!.array as Float32Array);

/**
 * Compare UVs allowing for `Float32Array` precision.
 *
 * `1190 / 250` is exactly 4.76 in double precision and 4.760000228881836 once stored in a
 * `Float32Array`, which is what a real UV attribute is. §5.1 recorded this exact trap the other way
 * round — a test that types a rounded literal passes on maths the code never does — so the figures
 * below stay written as the shop would read them and the comparison carries the tolerance instead.
 */
const expectUvs = (g: BufferGeometry, expected: number[]): void => {
  const actual = uvsOf(g);
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 5));
};

describe('scaling a cushion into real fabric repeats', () => {
  /**
   * The reference figure, worked longhand. Warwick Caulfield's repeat is 250mm, so a point 1190mm
   * along a seat — the cushion on a 1200 banquette at the shipped 5mm inset — is 4.76 repeats out.
   *
   *   1190 / 250 = 4.76
   *
   * Left unscaled that same point reads as 1190 repeats, and the seat as a whole asks for ~5,800
   * of them across its faces. That is the difference between a visible weave and flat colour.
   */
  it('divides millimetres by the fabric repeat', () => {
    const g = geometryWithMillimetreUvs(0, 0, 1190, 500);
    applyFabricScale(g, 250);
    expectUvs(g, [0, 0, 4.76, 2]);
  });

  /**
   * **The guard the square seat depends on.** Its layout effect has no dependency array and runs
   * after every render, so this being idempotent is what stops the weave shrinking by the square
   * on every frame. Remove the marker in `applyFabricScale` and this fails.
   */
  it('is idempotent — a hundred calls leave the same UVs as one', () => {
    const once = geometryWithMillimetreUvs(0, 0, 1190, 500);
    applyFabricScale(once, 250);
    const many = geometryWithMillimetreUvs(0, 0, 1190, 500);
    for (let i = 0; i < 100; i++) applyFabricScale(many, 250);
    expect(uvsOf(many)).toEqual(uvsOf(once));
  });

  /**
   * A **replacement** geometry is a different object with no marker on it, so it scales. This is
   * the case the old mesh-ref wiring silently skipped: same mesh, same fabric, new geometry.
   */
  it('scales a geometry that replaced an already-scaled one', () => {
    const first = geometryWithMillimetreUvs(0, 0, 1190, 500);
    applyFabricScale(first, 250);
    // The back cushion's height changed, so R3F built a new geometry under the same mesh.
    const replacement = geometryWithMillimetreUvs(0, 0, 1190, 500);
    applyFabricScale(replacement, 250);
    expectUvs(replacement, [0, 0, 4.76, 2]);
  });

  /** Two cushions in one fabric each own their UVs, which is the §5.4b bug stated as an assertion. */
  it('does not let two cushions in one fabric affect each other', () => {
    const seat = geometryWithMillimetreUvs(0, 0, 1190, 500);
    const back = geometryWithMillimetreUvs(0, 0, 400, 80);
    applyFabricScale(seat, 250);
    applyFabricScale(back, 250);
    expectUvs(seat, [0, 0, 4.76, 2]);
    expectUvs(back, [0, 0, 1.6, 0.32]);
  });

  /**
   * A repeat that is missing, zero or negative leaves the UVs alone rather than producing
   * `Infinity` or `NaN` and a cushion that renders as nothing at all. Same instinct as the labour
   * rate check in costing: a bad figure must not silently poison arithmetic downstream of it.
   */
  it('leaves the UVs alone rather than dividing by a repeat it cannot use', () => {
    for (const bad of [0, -250, Number.NaN, Number.POSITIVE_INFINITY]) {
      const g = geometryWithMillimetreUvs(0, 0, 1190, 500);
      applyFabricScale(g, bad);
      expectUvs(g, [0, 0, 1190, 500]);
    }
  });

  /** A geometry with no UVs at all is left alone rather than throwing into the render loop. */
  it('survives a geometry with no UV attribute', () => {
    const g = new BufferGeometry();
    expect(() => applyFabricScale(g, 250)).not.toThrow();
  });
});
