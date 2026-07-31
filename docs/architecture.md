# Module Boundaries — Phases 1 to 3

The eight-layer architecture describes the whole system. This document covers what is actually
built, and where the seams are that later phases attach to.

The governing rule: **`src/core` never imports React or Three.js.** Geometry, rules, costing
and the cutlist all run in Node, which is why `npm run report` can print a full cutlist with
no browser involved. The dependency arrow points one way — the viewport adapts the core, and
the core does not know the viewport exists.

## Layout

```
src/core/                        pure model layer
  units.ts                       Mm, Cents; no conversion layer exists by design
  geom/
    vec.ts                       Vec2/Vec3 and the signed-axis machinery
    arc.ts                       circular arcs on a boundary — bulge, and what it derives
    profile.ts                   2D profiles, rectangles, notches, curves, edge naming
    extrude.ts                   profile → mesh (ear clipping); the whole "3D kernel"
    placement.ts                 part → cabinet → world, and back
  model/
    feature.ts                   parametric machining intent (the Phase 4 interface);
                                 also the tool profile — a cutter's cross-section
    hardware.ts                  runner and hinge systems as data; box and boring arithmetic
    runUnit.ts                   what a benchtop and a ladder base share: how they are *owned*
    benchtop.ts                  a benchtop: supply, overhangs, ends, joins, cutouts
    kickBase.ts                  a ladder base: ribs to the floor, rails cut short
    forming.ts                   how a flat part bends after it is cut; developed length
    material.ts                  sheet goods, edge banding, grain, nominal vs actual thickness
    panel.ts                     Panel — the single source of truth for a part
    cabinet.ts                   a placed cabinet: driving dimensions and options
    construction.ts              how parts go together; no opinion on board thickness
    room.ts                      walls as a list of segments; outline, normals, inside-ness
    project.ts                   versioned schema + migration entry point
  rules/                         the parametric rule engine
    context.ts                   driving dimensions → derived quantities
    spec.ts                      PartRule / CabinetSpec vocabulary, directional banding
    parts.ts                     shared part builders (sides, bottom, doors, …)
    frontStyle.ts                door style + front size → machining features
    specs/                       one file per cabinet type
    registry.ts                  type → spec
    hardware.ts                  a cabinet's runner and hinge, resolved once into the context
    drawerBox.ts                 the two parts a Blum box contributes to the cutlist
    boring.ts                     the drilling — hinge, runner and System 32, in cabinet space
    runUnits.ts                  benchtop and ladder base → Panel[], in the unit's own space
    build.ts                     cabinet + project → Panel[]
  standards/
    standards.ts                 shop standards; snapshot into a job, and drift from it
    savedTypes.ts                reusable cabinet recipes (catalogue, not snapshotted)
    doorStyles.ts                door styles — parametric front recipes (snapshotted)
  costing/
    gst.ts                       10% GST, both registration contexts
    benchtopCost.ts              a bought-in top: m², cutouts, joins, edge, minimum
    costing.ts                   panels → cost breakdown
  nest/
    guillotine.ts                the packer: a tree of cuts, kerf, and the replay that proves it
    nest.ts                      panels + materials → sheets; grain, sheet size, offcuts, yield
  cutlist/
    cutlist.ts                   panels → grouped cutlist lines
    export.ts                    cutlist, hardware, drilling, the nest and the cut sequence as CSV
  hardware/bom.ts                panels + features → a priced hardware order, and a hole count
  library/                       AU seed data: materials, dimensional defaults, cutters, Blum
  project/
    factory.ts                   project/cabinet construction, sample kitchen
    layout.ts                    cross-cabinet checks (overlap, below floor, outside room)
    plan.ts                      editing walls as a walk: typed lengths, turns, closing
    wallPlacement.ts             cabinet ⇄ "which wall, how far along"; drag snapping
    runs.ts                      runs of touching bench-height cabinets, along any axis
    generate.ts                  run → benchtop / ladder base, and regenerating one

src/app/                         React; depends on core, never the reverse
  store/projectStore.ts          zustand: project + selection only, nothing derived
  viewport/
    transforms.ts                Three.js matrices derived from the core's own transforms
    PanelMesh.tsx                one panel; adapts core geometry, contains none
    FrontRelief.tsx              a routed front, drawn from the panel's own features
    Boring.tsx                   the drilling, drawn from the panel's own features
    RoomShell.tsx                floor polygon and wall planes
    Viewport3D.tsx               scene, camera, lighting; mm → metres happens once here
  plan/PlanView.tsx              the 2D plan: draw the room, lengths typed not dragged
  panels/                        cabinet list, inspector, cutlist, nest, hardware, tops, cost

scripts/report.ts                terminal cutlist + costing for the sample kitchen
docs/coordinate-convention.md    the three coordinate spaces — read this first
```

## The interfaces that matter

**`Panel`** (`model/panel.ts`) is the contract everything downstream shares. The rule engine
produces it; the viewport draws it; costing prices it; **the nester lays it on a sheet**; and Phase
4 will machine it. There is deliberately no second representation of a part — no separate costing
model, no separate CAM model, no separate nesting model — because two representations can disagree
and one cannot. The nester consumes `panelExtent`, which is the blank measured round the outside of
every arc, and that is the only thing about a part it needs to know.

**`PanelFeature`** (`model/feature.ts`) is the Phase 4 interface. Features are parametric and
attached to panels rather than baked into geometry, so CAM reads "Ø35 bore, 13mm deep, at
(96, 424.5) on the B-face" instead of trying to recover that intent from a mesh. Phase 1 emitted
almost none of these; **Phase 2's hardware rules fill them in**, and `cutlist/export.ts` writes a
drilling sheet straight off them with no geometry involved.

**`CabinetSpec`** (`rules/spec.ts`) is a list of part rules over a construction method. Adding
a cabinet type means adding a spec file and a registry line — never touching the geometry
engine, the viewport or costing. Base, wall and drawer-bank already share their carcass
builders, which is the test of whether the abstraction is real.

**`ConstructionMethod`** (`model/construction.ts`) holds the dimensional conventions as data.
Switching the back from applied to inset resizes every dependent part with no code change, and
so does changing the kick, the reveals or the shelf clearances.

What it does *not* decide is how thick the boards are — it has no field for it. That is the
sheet's business, and choosing an 18mm carcass means choosing an 18mm board. It briefly carried
a nominal thickness "the method is built around", checked against the sheet, but a second place
claiming to know one fact is what this codebase exists not to do, so it went. See below.

**`Room`** (`model/room.ts`) is a list of wall segments in the order you walk them, and always
was — `rectangularRoom` is one constructor for it, not the shape of the data. Drawing an
L-shaped kitchen therefore needed no schema change and no migration. Two conventions carry the
weight: a wall's stored line is its **inside face** (so a cabinet against it sits exactly on
that line), and walls run so the **room is on the left**, which makes the inward normal the
left normal with no per-wall "which side is in?" flag to get wrong.

## Decisions worth knowing about

**A benchtop and a ladder base are the one place a derived thing is stored, and it is deliberate.**
Everywhere else, a part is regenerated from its cabinet on every build and never written back —
that is what stops a saved job carrying stale geometry. A run unit is the exception and it earns it:
a panel is derived from a cabinet *every time* because nothing else decides it, and a benchtop
**stops** being derived the moment somebody sets a 40mm overhang on one end or puts the sink 300mm
off centre. The alternative was keying those overrides on a run identity — and a run identity
changes the moment a cabinet moves, so the overhang set last week would silently detach from the top
it was set on. `project/runs.ts` is therefore the **generator**, not the definition, and
`fromCabinetIds` is read by "regenerate" and by nothing else. The argument is written out in
`model/runUnit.ts`; if anything else starts reading that field, the ownership is a fiction.

**A part names its owner, not its cabinet.** `Panel.ownerId` and `ownerKind`, because a benchtop and
a plinth are cut from sheet stock exactly as a carcass part is and belong on the same list. A
parallel part record for run units was the alternative and is the thing this codebase exists not to
do — a costed part and a cut part have to be the same part. No migration was needed: panels are
derived and never stored.

**Some distinctions are not geometric, and the model has to let somebody state them.** A dishwasher
space and a fridge space are the same gap of the same width in the same place; the top runs over one
and not the other. No amount of cleverness in the run finder can tell them apart, so
`rules/specs/applianceSpace.ts` is a placed unit that produces zero parts and carries the answer —
and it carries the two answers separately, because "does the top run over it" and "does the plinth
run under it" are different questions with different answers for the same appliance.

**Edge banding is expressed directionally.** A spec says "band the edge facing the front of
the cabinet", not "band edge L2". Which named edge that resolves to depends on the panel's
placement and differs between a left and a right side — so handed parts come out right
without the spec having to know it is describing a handed part. This is `resolveBanding` in
`rules/spec.ts`, and the base-cabinet tests assert that the two sides land on opposite edges.

**The viewport derives its matrices from the model's transform functions** rather than
rebuilding them from angles and axes (`viewport/transforms.ts`). It maps the origin and three
unit vectors through `partToCabinet` / `cabinetToWorld` and reads off the basis. The render
therefore cannot drift from the geometry the cutlist and CAM layers work with.

**A cabinet's position is its placement, and nothing else.** "Against the north wall, 600 from
the corner" is *computed* from the anchor and yaw every time it is shown (`wallAnchorOf`), not
stored alongside them. So there is no wall reference to go stale when a wall is renamed,
redrawn or deleted, and a cabinet dragged onto a different wall reports the new one without
anything having to be kept in step. `placeAgainstWall` is the same conversion run backwards.

**A board has two thicknesses and they do different jobs.** `SheetMaterial.thickness` is the
**nominal** — what the board is called, ordered and invoiced as, and what groups and sorts the
cutlist. `actualThickness` is what it **measures**: nominal 16mm melamine runs about 16.3, and
a bottom panel cut at `W − 2×16` is 0.6mm too wide to go between the sides. Everything
dimensional reads it through `actualThicknessOf`, which falls back to nominal, so a board that
has never been measured behaves exactly as it always did.

This is why the rule engine takes `t`, `tb` and `td` from the resolved *materials*
(`thicknessesFor` in `rules/context.ts`) rather than from the construction method. There used
to be two numbers for one fact — the method's and the sheet's — free to disagree, and picking
an 18mm board on a 16mm method cut the parts for 16 and drew them at 18. Now there is one, and
the mismatch is reported rather than silently resolved.

**A door style is machining, not geometry.** A shaker door is the *same rectangle* a plain slab
door is; what differs is what is cut into its face. So `DoorStyle`
(`standards/doorStyles.ts`) produces `PanelFeature[]` and nothing else moves: the door stays
one `Panel`, the cutlist part count is unchanged, the banding rule still bands all four edges,
and the rule engine's sizing is untouched. Five-piece construction — real rails, stiles and a
centre panel — is deliberately *not* this: it is a decomposition into five parts with their own
grain, banding and joinery, and it is a different piece of work.

Two consequences worth knowing:

- **The style is resolved in `build.ts`, not in the part builders.** Fronts are produced in
  several places (`doors`, `drawerFronts`, the tall cabinet's split banks, and whatever emits a
  false front next); a style wired into three of them is a kitchen with one plain door in it.
- **The upright axis is derived from the panel's own placement.** A door's length runs up it
  and a drawer front's runs across it, and that is already recorded in the placement's `u`.
  Reading it back is what keeps a vertical groove pattern vertical on both.

**An arc is stored as the one number that isn't already there.** A boundary edge may bow into
a circle, carried as a **bulge** — `tan(θ/4)` — on the vertex it leaves (`geom/arc.ts`). That is
the DXF LWPOLYLINE convention, so a DXF export writes it unchanged, but the reason to prefer it
is the same rule as everywhere else here: a centre plus a radius plus two endpoints is four
facts describing three degrees of freedom, and four facts can disagree. The endpoints are
already in the vertex ring, so the bulge adds what is genuinely missing and nothing can
contradict it. Centre, radius and sweep are derived on demand, the way `placementNormal`
derives `w` from `u` and `v`.

`Vertex2 extends Vec2`, so every straight polygon written before curves existed is still one.
Everything dimensional — area, perimeter, bounds, per-side banding length — measures the exact
arc. **Flattening happens only for drawing**, in `flattenPolygonSegments`, and the CAM layer
must not call it: a curve reaches the machine as a real G2/G3 arc, not as a polyline that has
forgotten it was a circle.

**A part's profile is the flat, as-cut shape; how it bends is separate.** Until curves arrived,
every part was the same shape on the sheet as in the room, so one profile could honestly be
both. A bendy-ply skin isn't: it is a rectangle on the sheet and a curve in the cabinet, and the
rectangle is longer. So `Panel.profile` stays the flat shape and `Panel.forming`
(`model/forming.ts`) says how it bends — read by the viewport and by nothing that decides a
dimension. Storing the curve and deriving the flat shape was the alternative, and the flat one
is the one being cut, so it is the one that has to be exact.

**A drawer box is cut to the runner, not to the cabinet.** `LW − 51` and `NL − 26` are not
conventions somebody chose; they are what a MERIVOBOX's profiles and runners physically take out of
the opening. So the numbers live on a `DrawerRunnerSystem` record (`model/hardware.ts`), the job
carries its own copy of the library the way it carries its materials and its door styles, and
`rules/drawerBox.ts` does the arithmetic once. The only figure that comes from the *cabinet* is the
clear opening between the sides — and that comes from the boards that will really be cut, so a
16.3mm carcass gives a bottom 0.6mm narrower. The deduction belongs to the runner and the opening
belongs to the board.

**Hardware is stated in cabinet space and converted into part space through each panel's own
placement.** A hinge is one thing at one height: a cup in a door and two screws in a side. So it is
described once — "22.5mm in from the left edge of that door, 96mm up from its bottom, 37mm back from
the front of the side" — and `cabinetToPart` puts it where each panel needs it. Writing part-space
coordinates directly is the handedness trap `resolveBanding` and `bowedFrontProfile` already exist to
avoid: a side panel's part +Y runs toward the front on one hand and toward the *back* on the other,
so a hard-coded `y = 37` puts the plate 37mm from the back of the left side, at the right diameter,
in the right quantity, and passes any test that counts holes.

Two consequences of that, both structural:

- **Sizes resolve into `RuleContext`; boring runs as a pass over the finished part list.** A drawer
  bottom needs one number the cabinet knows and several the runner knows, so `ctx.hardware` is
  resolved once in `buildContext` exactly as `ctx.radius` is. A hinge cannot be bored until every
  builder has run, because it touches two panels — so `rules/boring.ts` runs once over the whole list
  in `build.ts`. Same argument that put the door style there.
- **A hinge cup is on the B-face.** A door's A-face is its show face, which follows from where the
  door sits, since `w = u × v` is derived. So the cup goes in the back, `requiresFlip` is true, and
  the part turns over between the front routing and the boring — a real setup, stated in the data
  rather than inferred by a post-processor.

**A cutter's cross-section is the cutter's business.** A flat-bottomed groove is describable as
a width and a depth; a V-groove is not — its shape *is* the bit's shape, and how wide it comes
out follows from the bit and the plunge. So `ToolProfile` carries the section and
`cutWidthAtDepth` derives the width, rather than a width being stored beside a named cutter
where the two could disagree. Note this is a third distinct kind of curve: §5.1's radius work is
a curve in *plan*, a part outline is a curve in *outline*, and this is a curve in **section**. All three now exist: §5.1's radius work landed as a curve in
plan and in outline (`geom/arc.ts`), this is the one in section, and they stay separate
because they answer different questions.

## Where later phases attach

| Phase | Attaches to |
|---|---|
| 2 — hardware/joinery, BOM export | **Done.** `PanelFeature[]` on each panel, filled by `rules/boring.ts` keyed on panel role; sizes resolved into `RuleContext` by `rules/hardware.ts`. `cutlist/export.ts` has the CSV writers; PDF is not done. Hettich is the remaining brand. |
| 3 — guillotine nesting | **Done.** `nest/` consumes `Panel` + `SheetMaterial` and produces sheets, placements, an ordered cut sequence and offcuts. `costing.ts` charges whole sheets off the count; `sheetWastageFactor` is gone at schema v11. True-shape nesting for a router is a second nester, not an extension of this one. |
| 4 — CAM feature layer | Reads `PanelFeature[]` directly and emits a machine-independent operation list. Nothing upstream changes. Door styles are already emitting `pocket` and `profiled-cut` features with a tool id on them; turning those into toolpaths is this phase's work, and `library/tools.ts` is the seam the real tool library grows from. |
| 5 — post-processor + simulation | Consumes the operation list only. One machine first. |

The pragmatic bridge worth checking before Phase 5, and now before Phase 4: if the Mozaik machine
your friend runs accepts a DXF or CSV cutlist import, that gets real parts cut years before a
custom post-processor is trustworthy. Phase 3's nest and cut-sequence CSVs are that output — the
loop is one import away from closing at the saw, which would make Phase 4 an improvement rather
than a prerequisite.

## Nesting, and why it is its own layer

**`nest/guillotine.ts` knows about rectangles and nothing else** — no panels, no materials, no
project. What a part is, whether it may be turned and which sheet it goes on are `nest/nest.ts`'s
questions. That split is what lets the packer be tested against hand-built cases with figures
somebody can check in their head, which is not possible against a kitchen.

**Every cut runs edge to edge, and the structure enforces it rather than a checker.** A guillotine
cut is what a panel saw physically does, so a nest that is not guillotine-cuttable is not a nest
this shop can cut. The packer therefore builds a **tree of cuts** rather than the usual list of free
rectangles: placing a part *is* cutting a piece in two, so the cut sequence falls out of the packing
with nothing to derive and nothing to get out of step. The usual list is faster and cannot say how
the parts come off the sheet, which is the whole deliverable at the saw.

`replayCuts` is the proof and is deliberately ignorant of the tree — it takes the sheet, the cuts
and the kerf, puts the sheet on the bench and follows the instructions. What is left has to be
exactly the parts plus the offcuts.

**A nest is of blanks, not of shapes.** A radiused shelf does not come off a sheet as a curve: a
rectangle comes off the sheet and the curve is cut from the rectangle. So `panelExtent` is the right
input and the bounding box is not an approximation here — it is the part. A router *can* cut a shape
out of the middle of a sheet, and nesting for one is a second nester with a different validity rule
and no cut sequence at all, not a better version of this one.

**Kerf and edge trim are shop settings, not material ones.** A sheet size and a price belong to the
board; what your blade takes out belongs to your saw. Same split as the hinge drilling distance
living on the construction method rather than on the hinge. Kerf ships at 3.2mm rather than at zero,
which breaks this codebase's usual "ships off until measured" rule for one reason: zero is not a
conservative default for a blade, it is a claim that the saw removes no material.
