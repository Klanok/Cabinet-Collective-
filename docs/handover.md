# Handover — start here

**Purpose:** feed this to a new Claude Code session as the founding context for continuing
work. It replaces the need to read the original session transcript.

Read alongside:
- `docs/coordinate-convention.md` — the three coordinate spaces. Fixed. Do not change casually.
- `docs/architecture.md` — module boundaries and where later phases attach.
- `README.md` — what the tool does and how to run it.

---

## 1. Where the project stands

**Phase 1 is complete and its gate has been passed.** The shop owner checked the generated
cutlist against how he would hand-write it for a real cabinet and confirmed it tracks with no
obvious errors.

Since then, two more pieces have shipped: **room plans** you draw with typed wall lengths, with
cabinets standing against named walls; and **nominal vs actual board thickness**, so a board can
be told what it really measures and parts are cut to that. Section 4 records how both work and
why; section 5 is what is actually left to do.

```
npm install
npm run dev       # the app
npm test          # 242 tests
npm run build
npm run report    # cutlist + costing for the sample kitchen, in the terminal
```

Everything is merged to `main`. `src/core` is pure TypeScript — no React, no Three.js — so the
model, rule engine, costing and cutlist all run and test in Node, which is why `npm run report`
prints a full cutlist with no browser involved.

**Where to start reading:** `docs/coordinate-convention.md` first — everything downstream assumes
it. Then `core/model/panel.ts` (the one representation of a part), `core/rules/spec.ts` and one
spec such as `core/rules/specs/baseCabinet.ts` to see how parts are declared, and
`core/rules/build.ts` for how a cabinet becomes panels. `docs/architecture.md` has the full map.

### What exists

| Area | State |
|---|---|
| Coordinate convention (world / cabinet / part, A-face) | Fixed and documented |
| Geometry engine — profile + extrude, ear-clipping | Straight-edged polygons only |
| Rule engine — specs as data over a construction method | base, wall, tall, drawer-bank, custom |
| Panel features (the Phase 4 CAM interface) | Types defined, barely populated |
| Door styles — shaker, V-groove, routed MDF | **Not started — see 5.3** |
| Costing — GST both contexts, install, delivery | Working, on placeholder pricing |
| Nominal vs actual board thickness | Working, off until you measure a board |
| Cutlist — grouped lines | Working, no CSV/PDF export yet |
| Shop standards + per-job settings | Working, persisted to browser |
| Saved cabinet types | Working |
| Viewport — R3F, orbit + WASD/QE, drag to move, walls | Working |
| Room — any shape, drawn in a 2D plan with typed lengths | Working |
| Cabinets placed against a named wall, at any angle | Working |
| Hardware / joinery rules (Blum) | **Not started — this is Phase 2, see 5.2** |
| Curved / radiused parts | **Not started — see 5.1** |
| Nesting, CAM, post-processor | Not started |

---

## 2. Decisions that must not be casually undone

These were reasoned about deliberately or corrected from real shop feedback. A new session
should treat them as settled unless the user says otherwise.

**One `Panel` record is the single source of truth for a part.** The rule engine produces it;
the viewport draws it; costing prices it; nesting and CAM will consume it. There is
deliberately no second representation, because two can disagree and one cannot. Panels are
always regenerated from the project, never stored in it.

**Panel features are parametric and attached to panels, never baked into geometry.** A hinge
cup is "35mm bore, 12.5mm deep, at (37, 96) on the A-face". Phase 4 must read machining
intent directly, not reverse-engineer it from a mesh.

**Edge banding is expressed directionally** — "band the edge facing the front", not "band
edge L2". Which named edge that resolves to differs between a left and a right side, so
handed parts come out correct without the spec knowing it describes a handed part.

**The viewport derives its matrices from the model's own transform functions** rather than
rebuilding them from angles. The render cannot drift from the geometry the cutlist and CAM
work from.

**A job takes a *copy* of the shop standards, never a reference.** Changing a standard next
year must not re-price or re-cut a job already quoted. A job is a record of what was agreed.

**GST is arithmetic, not a display toggle.** An unregistered entity cannot claim input
credits, so its cost base is GST-inclusive. Getting this backwards understates cost by ~9% of
materials.

**Migrations must never quietly change anyone's parts.** Both existing migrations carry old
values forward so a saved job cuts exactly as it did; adopting a new default is then a
deliberate edit. Schema is at **v5**; migrations run in sequence in `model/project.ts`. Shop
standards are versioned separately and are at **v2** — and they get a *real* migration rather
than a rejection, because refusing to load them silently replaces a shop's accumulated kick
heights, reveals and saved cabinet types with the shipped Australian defaults.

**A room is a list of wall segments walked in order, and always was.** `rectangularRoom` is
one constructor for that list, not the shape of the data — which is why drawing arbitrary
plans needed no schema change and no migration. Two conventions hold it together and should
not be casually flipped: a wall's stored line is its **inside face** (a cabinet against it
sits exactly on that line, which is why the sample kitchen has always sat at z = 0), and walls
run so the **room is on the left of the direction of travel**, which makes the inward normal
the left normal with no per-wall "which side is in?" flag to get wrong.

**The board decides how thick a board is — nothing else has an opinion.** A sheet carries a
nominal thickness (what it is called, ordered and invoiced as, what groups the cutlist) and an
actual one (what it measures). Every part is calculated from the actual figure, because that is
what a part has to fit between. A construction method describes how parts go together and has
no thickness field at all; it briefly had one, "the nominal it was built around", and that was
one place too many claiming to know a single fact.

**A cabinet's position is its placement — anchor and yaw — and nothing else.** "Against the
north wall, 600 from the corner" is computed from that every time it's shown, never stored
beside it. A stored wall id would be a second source of truth for position, and would go stale
the moment a wall was redrawn or deleted.

---

## 3. Shop-specific knowledge, corrected from real feedback

A new session will guess these wrong if it doesn't know them.

**Reveals are not symmetrical top and bottom.** A base cabinet door is normally **flush with
the bottom** of the carcass and carries its reveal only at the **top**, under the benchtop.
Defaults: `revealTop` 3, `revealBottom` 0, `revealSides` 1.5.

The fields are named for **where they physically are**, not "horizontal" and "vertical" —
those are read both ways in the trade (the direction the gap is measured in, or the direction
the gap line runs), and getting it backwards makes doors wrong on both axes. Same for gaps:
`gapBetweenDoors` (side by side) and `gapBetweenDrawers` (stacked).

**A carcass is a board spec, not a finish colour.** Nobody orders a carcass in a decor name —
they order white HMR particleboard. Default carcass and back are `hmr-white-16`. Decors are
for doors, panels, and any carcass genuinely on show.

**Benchtop follows runs of touching bench-height cabinets.** A tall cabinet breaks the run; so
does a gap left for a fridge or dishwasher; so does a change of height or of the wall being
backed onto. Logic lives in `core/project/benchtop.ts`, not in the viewport.

**AU dimensional defaults interlock:** 150 kick, 720 base carcass (870 to benchtop underside,
900 finished), 560 base depth, 300 wall depth, wall units hung at 1500 for a 600 splashback,
2070 tall carcass so its top lands level with the wall units at 2220.

**Pricing in `library/materials.au.ts` is indicative.** Decor names and sheet sizes are real;
the dollars are placeholders, flagged `indicativePricing` and surfaced on screen. The user's
real trade pricing has not been loaded yet.

---

## 4. What has been built since Phase 1, and why it is that way

Nothing here is outstanding work. It is the reasoning behind decisions that are now load-bearing,
kept because the *why* is the part that gets lost and then undone. Skip to section 5 for what is
actually left to do.

### 4.1 Nominal vs actual board thickness

> "Carcass board is generally entered into real world nesting as 16.3mm thick as that is the
> closest to reality."

A sheet now carries two thicknesses doing two different jobs. `thickness` is the **nominal** —
what the board is called, ordered and invoiced as, and what groups and sorts the cutlist.
`actualThickness` is what it **measures**, and it is what every part is calculated from.

**It ships off.** Every material says "it measures what it says", so a job cuts exactly as it
always did until somebody deliberately enters a figure — which is the only honest default,
because entering one moves every part in every cabinet made from that board. Settings →
Materials → *What the boards really measure* lists just the boards this job uses. Entering
16.3 on the sample kitchen takes a bottom panel from 868 to 867.4; the cutlist still says
16mm, because that is still what you order.

**The part that needed deciding, and how it went.** The thickness that drove part sizes used to
be `ConstructionMethod.carcassThickness`, while `SheetMaterial.thickness` drove the 3D render
and the cutlist. Two numbers for one fact, free to disagree — pick an 18mm board on the 16mm
method and the parts were cut for 16 and drawn at 18. Splitting nominal from actual forced the
issue, and the board won: **the sheet that will really be cut decides the arithmetic**, because
that is the thing a part has to fit between.

That left the construction method's three thickness fields sizing nothing. v4 kept them for one
more step as a nominal the method was "built around", checked against the board a cabinet
actually used, with mismatches reported in the Inspector.

**Consequence worth knowing:** changing carcass thickness is done by choosing the board, not by
typing a number under Joinery. If any saved job used the 18mm method with 16mm boards (or the
reverse), its parts now follow the board.

**Then finished off (v5).** The user's call: the three construction thickness fields are gone
entirely. A construction method now has **no opinion about how thick a board is** — that is the
sheet's business, full stop, and there is exactly one place that knows it. The mismatch warning
went with them, since there is no longer an expectation to violate.

The two shipped methods differed *only* in those numbers, so they folded into one,
**`frameless-32` / "Frameless 32mm"**. Joinery now holds only what actually decides how parts
go together: back style, kick, top rails, reveals, gaps, shelf clearances, system holes.

`collapseThicknessFields` in `model/construction.ts` does the folding and is shared by both
migrations. It folds two methods together **only** when everything that affects a part is
identical — a shop that edited one method's kick height has two genuinely different methods and
keeps both, because dropping one would silently re-cut their cabinets. Every cabinet and both
`defaults.constructionId`s are repointed at whichever method survived, so nothing dangles.

Schema history for this piece: **v4** added `actualThickness` (migration writes it equal to
nominal, so nothing moves) and was bumped specifically so an **older build refuses** a measured
job rather than quietly cutting every part 0.6mm too big. **v5** removed the construction
thicknesses, which changed nothing dimensional because v4 had already stopped calculating from
them.

### 4.2 Drawing room walls

Definition of Done was *"trace an L-shaped kitchen with typed wall lengths, place cabinets
against two different walls, and see them correctly in 3D."* That was met and checked in the
running app, not only in tests.

**What you can do now.** A **Plan** tab sits next to **3D** above the viewport. In it you walk
the room the way you'd measure it: each wall runs on from the last, you say how far it turns
and type what it measures, and the final wall closes back to where you started. Change a
length and every wall after it moves with it. Click a wall to rename it — "sink wall",
"window wall" — and those names are what you pick from when placing a cabinet.

In the Inspector, **Where it stands** is now "Against: sink wall, 600 along, 0 gap behind"
rather than a raw X. Dragging a cabinet near a wall in 3D also parks it flush and square
against it, turned the right way round.

**How it was built, and what to keep:**

- `core/model/room.ts` — wall direction, inward normal, bearing, floor outline, area,
  inside-the-room test. No schema change: the room was always a list of wall segments.
- `core/project/plan.ts` — the editing model. Walls are *stored* as start/end pairs because
  that is what everything downstream reads, but *edited* as a walk (a start corner plus a list
  of length-and-bearing runs) because that is how a room is described. A closed plan that has
  a length changed re-closes itself by letting the first later wall running parallel to the
  gap absorb it — which is what happens on paper. When nothing can absorb it the plan is left
  open and the gap is reported, because half-drawn is a normal state, not an error.
- `core/project/wallPlacement.ts` — both directions of "which wall, how far along", plus drag
  snapping. Snapping tests the **middle** of the cabinet, not its anchor corner: the anchor is
  one corner of a box that may be turned any way, so its distance to a wall says very little.
- `core/project/benchtop.ts` — runs are now measured along their own axis rather than along X.
  Down the return leg of an L, touching cabinets share an X entirely, and the old code would
  have called them one cabinet in the same place.

**Not done, and deliberately so:** wall openings (doors, windows), bulkheads, out-of-square
walls and scribes. Wall *height* is already per wall, so a bulkhead has somewhere to live when
it earns its keep. Walls are still drawn as single planes in 3D rather than solids — you can
see into the room from any side, which is worth more than thickness you can only see from
outside.

---

## 5. Open items, in the order I'd do them

Three pieces of real work are outstanding, plus a tail of small things.

**If asked which to do next:** 5.3's first half is the cheapest item here with the most visible
payoff — a client picks a door style, and nothing else on this list changes what they see. 5.1
is the one with a deadline attached, in the sense that it gets materially more expensive once
the CAM layer exists. 5.2 is the largest, and the one the machine ultimately depends on.

### 5.1 Curved parts — the foundation is worth doing before Phase 4

The user's radius work is two things, and both need the same foundation:

1. **Open radius shelving** — flat parts with a curved edge, edged and done.
2. **Enclosed radiused end** — a skeleton of formers (flat parts with a curved edge) with
   bendy ply applied over them, then laminated.

A third method — **pocketing the back of a melamine panel leaving straight fixing sections** —
was explicitly deferred by the user as too complicated for now.

**The foundation:**
- **Arc segments in profiles.** Today `Polygon` is a list of straight-line vertices; there is
  no such thing as a curve in the model. Doing this before the CAM layer exists touches
  ~3 files; afterwards it also touches CAM, and a curve must reach the machine as a real arc
  (G2/G3), not as a polyline that leaves faceted edges.
- **True perimeter.** A curved edge is longer than the chord across it, so edge banding on a
  radiused shelf is currently under-costed.
- **Developed length.** Bendy ply and laminate must be cut to the length *around* the curve.

**The architectural point:** a panel's stored profile should be the **flat, as-cut** shape,
because that is what the cutlist, nesting and machine need, with a separate descriptor for how
it forms into a curve for the 3D view. Today "what to cut" and "what it looks like in place"
are the same thing; bendy ply breaks that. Getting this right also sets up the deferred
pocketing method, which is the same idea plus a groove pattern the feature system can already
hold.

### 5.2 Phase 2 — hardware and joinery rules

Per the original architecture: Blum first, Hettich second. This is on the critical path to
trustworthy CAM output, and drilling accuracy is what actually stops material being ruined.
Also in Phase 2: full cutlist/BOM export (CSV/PDF).

Drawer **boxes** were deliberately left out of Phase 1 — their sizes are dictated by runner
specs (Legrabox/Tandembox nominal lengths, side thicknesses, clearances), and guessing them
ahead of the hardware rules is how material gets wasted.

### 5.3 Routed door styles and a door library

Raised by the user and **not started.** His words: *"the ability to create custom routed doors
from MDF panels, shaker, v groove etc… I should have a door library that I can create custom
routs and save them and then save and select the door type."* He rightly calls it a core
component — the door is the part of a kitchen a client actually chooses.

**The thing to understand before starting: this is not a geometry problem.** A shaker door is
the *same rectangle* a plain slab door already is. What differs is machining on its A-face. So
it belongs in the **feature system** (`model/feature.ts`), not in profiles or extrusion, and it
has **no dependency on the curved-part work in §5.1** — that is curvature in a part's *outline*,
this is a cut in its *face*. The two can be done in either order.

**Scope: one-piece, settled by the user.** A single MDF slab with the shaker or V-groove look
machined into its face, then wrapped or sprayed — the usual AU poly/MDF method. Five-piece
construction (real rails, stiles and a centre panel) is **out of scope** and should not be
built speculatively; it is a decomposition rather than a feature, turning one door into five
cutlist parts with their own grain, banding and joinery, and it is a different piece of work.

That decision keeps this small, and it is worth being explicit about what it means:

- The door stays **one `Panel`**. Same rectangle, same `rectProfile(height, width)`, same
  placement, same material.
- The **cutlist part count does not change**. A shaker door is one line, exactly as a slab door
  is. What changes is that the line now carries a style, and the panel carries features.
- **Edge banding is untouched.** The routing is on the face; the edges are what they always
  were, so `bandedDirections: BAND_ALL` still holds.
- Nothing in the **rule engine's sizing** moves. A door is still width and height less reveals.
- So the entire model addition is: features on the panel, a `DoorStyle` to generate them from,
  and somewhere to keep the styles.

**The one real gap in the model.** `PanelFeature` today covers drill, drill-line, groove,
rebate and cutout. A `GrooveFeature` is a **flat-bottomed cut of constant width**, which is
enough for a shaker border done as a groove but not for the rest:

- A **shaker centre recess** is a large rectangular *pocket*, not a groove. No pocket feature
  exists.
- A **V-groove** is not flat-bottomed. Its shape comes from the cutter, not from a width and a
  depth.
- Any **moulded edge** (ogee, bevel, bullnose) is likewise the cutter's cross-section.

So the missing piece is a **tool profile** — a named cutter cross-section — plus a pocket
feature. Both belong beside `PanelFeature`, and both are exactly the kind of thing Phase 4 must
read as intent rather than reverse-engineer out of a mesh. Note this is a *third* kind of curve,
distinct from both §5.1's curve-in-plan and a part outline: it is a curve in **section**.

**The library maps onto a pattern that already exists.** A `DoorStyle` should live in the shop
standards next to `savedTypes`, for the same reason those do — the value is that it outlasts the
job you first worked it out on. Selectable as a job default and overridable per cabinet, the way
materials already are.

It must be **parametric, not a drawing**: "border 57mm, recess 6mm deep, 3mm internal corner
radius, V-groove every 100mm" applied to whatever door size the rule engine produces. A saved
style that only fits the door it was drawn on is worth nothing, since every door on a job is a
different size.

**Where it sits in the phases — split it, because the halves have very different costs:**

| Half | Phase | Why |
|---|---|---|
| `DoorStyle` model, library, per-cabinet selection, 3D preview, costing allowance | **Do early** — it is cheap and it is the most customer-facing thing in the tool | Needs no CAM. A client picking a door style and seeing it is worth more now than machining it is. |
| Emitting the actual toolpaths | **Phase 4 (CAM)**, with the post-processor in Phase 5 | A profiled cut has to reach the machine as the right tool on the right path. |

It touches **Phase 2** only lightly — a thicker or profiled front shifts hinge boring a little.
It touches **costing** immediately, though: a routed door is real machine time, so `LabourRates`
wants a per-door-style machining allowance. Do that with the model half, or the first shaker
kitchen quotes as if the doors were plain slabs.

**It applies to every front, not just doors.** A shaker kitchen has shaker *drawer fronts*, and
usually shaker applied end panels too. The roles that take a style are `door`, `drawer-front`,
`false-front` and `end-panel` — not `lid`, and never a carcass part. Getting this wrong is
obvious on screen but it is also the difference between quoting 8 routed fronts and 20.

A door style also has to cope with fronts of wildly different proportions from one style: a
720-tall door and a 140-tall drawer front take the same border, and on the drawer front that
can leave no centre panel at all. The style needs a **minimum centre size** below which it
falls back to a plain slab (or warns), or narrow drawer fronts will come out as a rebate
through the whole part.

**Shape of the work, in order:**

1. `PocketFeature` and a `ToolProfile` beside `PanelFeature` — the only genuinely new model
   pieces. Straight-sided pockets first; V-groove and moulded edges once a tool profile exists.
2. `DoorStyle` in `core/standards/`, alongside `savedTypes.ts` and following its shape: a named
   parametric recipe, an id, and the same "lives in standards, copied into a job" rule.
3. A pure function `featuresForFront(style, width, height, thickness) → PanelFeature[]`. Keep it
   out of the specs: every front role calls the same function, and it is trivially testable
   against hand-calculated numbers the way everything else here is.
4. Wire it in `rules/parts.ts` where fronts are built, driven by a job default plus a
   per-cabinet override, exactly as materials are.
5. 3D preview. The features are parametric, so the viewport derives the recess from them rather
   than being told about door styles — same principle as everywhere else.
6. Costing allowance per style.

**Suggested Definition of Done for the first half:** *"define a shaker style with a typed border
width and recess depth, save it to the shop standards, apply it to one cabinet so its doors and
drawer fronts both carry it, see the recess in 3D, and see it priced with its machining
allowance on the quote."*

### 5.4 Smaller things noted but not done

- Cabinets can be dragged but not rotated with the mouse; yaw is typed, or set by snapping to
  a wall.
- The custom cabinet excludes itself from benchtop runs — a banquette shouldn't get one, but
  a bench-height custom carcass arguably should. Needs a rule, or a per-cabinet flag.
- Nesting still estimates sheets from area × a yield allowance. Phase 3 replaces it.
- A corner where two runs meet at 90° leaves whatever gap the cabinet sizes leave; there is no
  corner cabinet type and no check that the two runs don't foul each other's doors. Worth a
  look once the hardware rules exist, since door swing is what actually decides it.
- Benchtops still render as one slab per run. Two runs meeting in a corner draw as two slabs
  butted together rather than one mitred top, which is fine to look at and wrong to cut from —
  it matters when benchtops start being costed.

---

---

## 6. How to work on this

From the original architecture doc, and it held up:

- **One phase per session.** Feed this document as background, then give a scoped instruction
  with a testable Definition of Done. The first session drifted — Phase 1 shipped, then a long
  tail of additions accumulated without a scope boundary. The additions were driven by real
  use and were worth having, but the session got long and the next phase never started.
- **Use `xhigh` effort** for rule-engine, data-model and post-processor work; `medium` for
  routine UI wiring; `low` for boilerplate.
- **State the Definition of Done before starting**, not as prose. Opus verifies its own work
  against a concrete target far better than against a description.
- **The user is a cabinetmaker, not a developer.** Explain in plain terms, avoid jargon, and
  give complete step-by-step instructions for anything involving the terminal or GitHub. He
  runs it on Windows, from a downloaded ZIP.

## 7. Verification standard

Tests are hand-calculated, not snapshots. The reference figures are written out longhand in
each test file's header so they can be checked by eye against real practice.

Two things get asserted separately and both matter:
- **part size** — what goes on the cutlist
- **the cabinet-space box each panel occupies** — a left side carrying a right side's
  placement is the same size and completely wrong

Keep that standard. It is what made the errors found from the bench cheap to fix.
