# Coordinate Convention

**Status: fixed.** Everything downstream — geometry, nesting, CAM, post-processors — assumes
this document. Changing it later means touching every layer, so it is defined once, here, and
encoded in `src/core/geom/`.

All lengths are **millimetres**. There is no imperial fallback and no unit conversion layer
anywhere in the codebase (see `src/core/units.ts`).

There are exactly **three** coordinate spaces. Nothing else invents a fourth.

---

## 1. World space (the room)

Right-handed, **Y-up**. This matches Three.js' default so the viewport needs no conversion
layer between the model and what gets rendered.

| Axis | Direction |
|---|---|
| +X | horizontal, across the floor |
| +Y | **up**, measured from finished floor level (AFF) |
| +Z | horizontal, across the floor, completing the right-handed set |

- **Origin**: finished floor level, at the room's nominated origin corner. `y = 0` is always
  the finished floor, never the subfloor and never the underside of a kick.
- Wall positions, cabinet placements and elevations are all expressed here.

## 2. Cabinet space (local to one cabinet)

Right-handed, Y-up, and **axis-aligned with the cabinet itself**.

| Axis | Direction |
|---|---|
| +X | toward the cabinet's **right** |
| +Y | up |
| +Z | toward the **front** of the cabinet |

- **Origin**: the bottom-back-left corner of the **carcass**. Explicitly *not* including the
  kick, and *not* including doors or any applied front.
- The carcass therefore occupies `[0, W] × [0, H] × [0, D]`.
- **"Left" and "right" are always from the viewpoint of a person standing in front of the
  cabinet, facing it.** This is the single most common source of mirrored-part errors, so it
  is stated rather than assumed.
- A cabinet is placed into world space by an anchor point plus a **yaw** rotation about Y.
  Yaw `0` means the cabinet front faces world **+Z**.

## 3. Part space (one panel)

A panel is a flat 2D profile extruded along +Z. This is the space that **nesting and CAM
consume directly**, so it is defined in machine terms, not modelling terms.

| Axis | Direction |
|---|---|
| +X | panel **length** — and the default grain direction |
| +Y | panel **width** |
| +Z | through the thickness, from the B-face to the A-face |

- **Origin**: the bottom-left corner of the profile's bounding box, lying on the B-face.
- The panel occupies `z ∈ [0, t]` where `t` is material thickness.
- **B-face is `z = 0`. A-face is `z = t`.**

### Why the A-face matters

The **A-face is the part's reference face — the one lying upward in its nominal setup.**
Consequently:

- Part space +Z is the same direction as machine +Z. No flip in the post-processor.
- A face-side drilling operation of depth `d` starts at `z = t` and ends at `z = t - d`.
  Depths are always measured **down from the A-face**, never up from the B-face.
- A through-cut is `d ≥ t`.
- B-face work is **explicitly flagged as such** — the CAM layer must never silently emit it as
  though it were reachable from the A side in the same pass.

### What B-face work does *not* mean

It does **not** mean the part turns over, and the difference is worth stating because getting it
wrong overstates a job's setups badly. **The face being machined is the face that goes up.** A part
with work on one face only is laid that face up and machined in a single setup, whichever face it
happens to be — a plain door with hinge cups in its back and nothing on its show face never turns
over.

**A part turns over only when it is machined on both faces.** A shaker door — recessed on the show
face *and* bored in the back — is the ordinary example, and it is genuinely two setups. So
`requiresFlip` in `model/feature.ts` asks the question about a **part**, not about a feature. It
briefly did the latter, and reported a kitchen of plain doors as having sixty flips in it when it
had none.

Panels whose visible face matters (a melamine carcass side with one decorative face, a
routed door) record which physical face is the A-face, so this survives into nesting.

---

## Composing the spaces

A panel's placement inside a cabinet is **always axis-aligned** — cabinet parts do not sit at
arbitrary angles — so placement is stored as an origin plus two signed axes rather than a
full rotation matrix:

```ts
interface PanelPlacement {
  origin: Vec3;     // cabinet space; the image of the part-space origin
  u: SignedAxis;    // cabinet-space direction of part +X (length)
  v: SignedAxis;    // cabinet-space direction of part +Y (width)
}
```

The thickness direction is derived, never stored: `w = u × v`, the image of part +Z. Because
it is derived, **the A-face direction is a consequence of how `u` and `v` are chosen**, which
is what makes "which way does this panel face" a checkable property rather than a convention
someone has to remember.

The full chain is therefore:

```
part space --PanelPlacement--> cabinet space --anchor + yaw--> world space
```

Each step is invertible, which is what lets the CAM layer take a feature positioned in world
or cabinet terms and put it back into part space where the machine needs it.
