/**
 * Put a cushion's UVs into real fabric repeats.
 *
 * Pure, and in its own module so a test can reach it without standing up a WebGL renderer. The
 * wiring that hands it a geometry lives in `BanquetteCushions.tsx`; the arithmetic is here.
 *
 * ## What it is fixing
 *
 * Every cushion mesh is an `ExtrudeGeometry` — including the square seat, because drei's
 * `RoundedBox` is an extrude with a bevelled shape. Three's default UV generator for that geometry
 * emits **shape coordinates**, which in this model are millimetres, on the top faces and the side
 * walls alike. They are not normalised and never were.
 *
 * So dividing by the fabric's real repeat is not a correction factor — it is the unit conversion
 * the generator's output was always one step away from. It also puts cushions under the same rule
 * §5.8 sets for board decors (scaled in millimetres, not in UV units), so a seat and the doors
 * behind it show a weave at one consistent scale.
 *
 * Left alone, a 1190mm seat asks for roughly **5,800 repeats across one cushion**. Every screen
 * pixel then averages the whole swatch and the fabric renders as flat off-white —
 * indistinguishable from a texture that failed to load, which is exactly how it was reported.
 *
 * ## Why it is done to the geometry and not to the texture
 *
 * `useLoader` caches by URL and hands the **same** `Texture` to every mesh using that fabric, so
 * writing `repeat` on it made two banquettes in one colour fight over the weave scale, last one
 * rendered winning. `PanelMesh` bakes its UVs for this reason and never writes to the texture.
 */

import type { BufferGeometry } from 'three';

/**
 * Scale a geometry's UVs from millimetres into repeats of a fabric. Idempotent.
 *
 * **The guard is load-bearing, not defensive tidiness.** The square seat's caller is a layout
 * effect with no dependency array — deliberately, because it cannot know which prop drei rebuilds
 * its geometry on — so this runs after *every* render of a banquette. Without the marker it would
 * divide the UVs again each time and the weave would collapse toward nothing over a few frames.
 *
 * It is keyed on the repeat rather than on a bare boolean so that switching fabric to one with a
 * different repeat still rescales. The trade-off is honest and worth naming: a geometry scaled at
 * repeat A and then asked for repeat B is divided *again* rather than reset, because the original
 * millimetre UVs are gone. Nothing does that today — a changed fabric changes the ref identity and
 * R3F hands back a fresh geometry — and if something ever does, it wants the UVs rebuilt, not this
 * function made cleverer.
 */
export const applyFabricScale = (geometry: BufferGeometry, repeatMm: number): void => {
  const uv = geometry.attributes.uv;
  if (!uv || !Number.isFinite(repeatMm) || repeatMm <= 0) return;
  if (geometry.userData.fabricScaled === repeatMm) return;
  const a = uv.array as Float32Array;
  for (let i = 0; i < a.length; i++) a[i]! /= repeatMm;
  uv.needsUpdate = true;
  geometry.userData.fabricScaled = repeatMm;
};
