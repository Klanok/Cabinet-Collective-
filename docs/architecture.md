# Module Boundaries — Phase 1

The eight-layer architecture describes the whole system. This document covers only what
Phase 1 actually builds, and where the seams are that later phases attach to.

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
    profile.ts                   2D profiles, rectangles and notches, edge naming
    extrude.ts                   profile → mesh (ear clipping); the whole "3D kernel"
    placement.ts                 part → cabinet → world, and back
  model/
    feature.ts                   parametric machining intent (the Phase 4 interface)
    material.ts                  sheet goods, edge banding, grain
    panel.ts                     Panel — the single source of truth for a part
    cabinet.ts                   a placed cabinet: driving dimensions and options
    construction.ts              construction methods as data (frameless 32mm)
    room.ts                      walls and ceiling height
    project.ts                   versioned schema + migration entry point
  rules/                         the parametric rule engine
    context.ts                   driving dimensions → derived quantities
    spec.ts                      PartRule / CabinetSpec vocabulary, directional banding
    parts.ts                     shared part builders (sides, bottom, doors, …)
    specs/                       one file per cabinet type
    registry.ts                  type → spec
    build.ts                     cabinet + project → Panel[]
  costing/
    gst.ts                       10% GST, both registration contexts
    costing.ts                   panels → cost breakdown
  cutlist/cutlist.ts             panels → grouped cutlist lines
  library/                       AU seed data: materials, dimensional defaults
  project/
    factory.ts                   project/cabinet construction, sample kitchen
    layout.ts                    cross-cabinet checks (overlap, below floor)

src/app/                         React; depends on core, never the reverse
  store/projectStore.ts          zustand: project + selection only, nothing derived
  viewport/
    transforms.ts                Three.js matrices derived from the core's own transforms
    PanelMesh.tsx                one panel; adapts core geometry, contains none
    Viewport3D.tsx               scene, camera, lighting; mm → metres happens once here
  panels/                        cabinet list, inspector, cutlist, cost

scripts/report.ts                terminal cutlist + costing for the sample kitchen
docs/coordinate-convention.md    the three coordinate spaces — read this first
```

## The interfaces that matter

**`Panel`** (`model/panel.ts`) is the contract everything downstream shares. The rule engine
produces it; the viewport draws it; costing prices it; Phase 3 will nest it and Phase 4 will
machine it. There is deliberately no second representation of a part — no separate costing
model, no separate CAM model — because two representations can disagree and one cannot.

**`PanelFeature`** (`model/feature.ts`) is the Phase 4 interface, defined now and populated
later. Features are parametric and attached to panels rather than baked into geometry, so CAM
reads "35mm bore, 12.5mm deep, at (37, 96) on the A-face" instead of trying to recover that
intent from a mesh. Phase 1 emits almost none of these; Phase 2's hardware rules fill them in.

**`CabinetSpec`** (`rules/spec.ts`) is a list of part rules over a construction method. Adding
a cabinet type means adding a spec file and a registry line — never touching the geometry
engine, the viewport or costing. Base, wall and drawer-bank already share their carcass
builders, which is the test of whether the abstraction is real.

**`ConstructionMethod`** (`model/construction.ts`) holds the dimensional conventions as data.
Changing the carcass from 16mm to 18mm resizes every dependent part with no code change; so
does switching the back from applied to inset. Both are covered by tests.

## Two decisions worth knowing about

**Edge banding is expressed directionally.** A spec says "band the edge facing the front of
the cabinet", not "band edge L2". Which named edge that resolves to depends on the panel's
placement and differs between a left and a right side — so handed parts come out right
without the spec having to know it is describing a handed part. This is `resolveBanding` in
`rules/spec.ts`, and the base-cabinet tests assert that the two sides land on opposite edges.

**The viewport derives its matrices from the model's transform functions** rather than
rebuilding them from angles and axes (`viewport/transforms.ts`). It maps the origin and three
unit vectors through `partToCabinet` / `cabinetToWorld` and reads off the basis. The render
therefore cannot drift from the geometry the cutlist and CAM layers work with.

## Where later phases attach

| Phase | Attaches to |
|---|---|
| 2 — hardware/joinery, BOM export | `PanelFeature[]` on each panel; a `HardwareRule` layer beside `rules/` keyed on panel role and construction method. `cutlist/` gains the CSV/PDF writers. |
| 3 — guillotine nesting | Consumes `Panel` + `SheetMaterial`. `costing.ts` swaps its yield estimate for a real sheet count — the `sheetWastageFactor` path is the seam. |
| 4 — CAM feature layer | Reads `PanelFeature[]` directly and emits a machine-independent operation list. Nothing upstream changes. |
| 5 — post-processor + simulation | Consumes the operation list only. One machine first. |

The pragmatic bridge worth checking before Phase 5: if the Mozaik machine your friend runs
accepts a DXF or CSV cutlist import, that gets real parts cut years before a custom
post-processor is trustworthy — and it turns Phase 3's output into a working end-to-end loop
rather than an intermediate step.
