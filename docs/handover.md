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

Since then, three more pieces have shipped: **room plans** you draw with typed wall lengths,
with cabinets standing against named walls; **nominal vs actual board thickness**, so a board
can be told what it really measures and parts are cut to that; and **door styles**, the first
half of §5.3 — shaker and V-groove fronts as machining rather than geometry, saved to the shop
standards, priced. Section 4 records how each works and why; section 5 is what is actually left
to do.

```
npm install
npm run dev       # the app
npm test          # 276 tests
npm run build
npm run report    # cutlist + costing for the sample kitchen, in the terminal
npm run report -- shaker-57    # the same kitchen with routed fronts
```

Each session's work lands on `main` through a pull request, so `git log main` is the honest
answer to what has actually shipped — check it rather than trusting this paragraph, which is
exactly the kind of sentence that goes stale. `src/core` is pure TypeScript — no React, no Three.js — so the
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
| Panel features (the Phase 4 CAM interface) | Types defined; door styles now populate pocket and profiled-cut |
| Door styles — shaker, V-groove, routed MDF | **Model half done — toolpaths are Phase 4, see 5.3** |
| Tool profiles — a cutter's cross-section | Defined; a short shipped list, no editor |
| Costing — GST both contexts, install, delivery | Working, on placeholder pricing |
| Nominal vs actual board thickness | Working, off until you measure a board |
| Cutlist — grouped lines | Working, no CSV/PDF export yet |
| Shop standards + per-job settings | Working, persisted to browser |
| Saved cabinet types | Working |
| Viewport — R3F, orbit + WASD/QE, drag to move, walls | Working |
| Room — any shape, drawn in a 2D plan with typed lengths | Working |
| Cabinets placed against a named wall, at any angle | Working |
| CI — typecheck, tests, build, cutlist smoke run on every PR | Working, `.github/workflows/ci.yml` |
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

**Migrations must never quietly change anyone's parts.** Every migration carries old values
forward so a saved job cuts exactly as it did; adopting a new default is then a deliberate
edit. Schema is at **v6**; migrations run in sequence in `model/project.ts`. Shop standards are
versioned separately and are at **v3** — and they get a *real* migration rather than a
rejection, because refusing to load them silently replaces a shop's accumulated kick heights,
reveals, door styles and saved cabinet types with the shipped Australian defaults.

**A door style is machining, not geometry.** A shaker door is the *same rectangle* a plain slab
door is; what differs is what is cut into its face. So a style produces `PanelFeature[]` and
nothing else moves — same part, same size, same banding, same one line on the cutlist. It is
snapshotted into a job like the materials are, because it decides how a part is cut, and
resolved in `rules/build.ts` rather than in the part builders, because fronts are produced in
four places and a style wired into three of them is a kitchen with one plain door in it.

**The app asks its own questions — never `window.confirm`, `window.prompt` or a `<form>`
submit.** All three are **silently ignored** in a sandboxed frame that hasn't been granted
`allow-modals` / `allow-forms`: no dialog, no error, the call just returns as though the user had
cancelled. Every button built on one becomes a button that does nothing, which is the worst
failure available to a control that throws away a room somebody measured. `panels/ask.tsx` is the
replacement and keeps the same shape (`await ask.confirm(...)`, `null` on cancel), so reaching
for the native call is never worth it. This was found by running the built app inside a
sandboxed frame — which is worth doing before shipping a build anywhere it might be embedded.

**A cutter's cross-section is the cutter's business.** A flat-bottomed groove is a width and a
depth; a V-groove is not — its shape *is* the bit's shape. So `ToolProfile` carries the section
and `cutWidthAtDepth` derives the width, rather than a width sitting beside a named cutter free
to disagree with it.

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

**Since added:** a wall can be appended at **any angle**, not just a square corner — type the
turn, or take one of the presets. The model always allowed it (`setWallBearing` takes any
bearing); it was the drawing controls that only offered ±90° and straight on. An angled wall
usually leaves the plan open until the walls after it catch up, which `reclose` correctly
declines to paper over.

**Not done, and deliberately so:** wall openings (doors, windows), bulkheads, out-of-square
walls and scribes. Wall *height* is already per wall, so a bulkhead has somewhere to live when
it earns its keep. Walls are still drawn as single planes in 3D rather than solids — you can
see into the room from any side, which is worth more than thickness you can only see from
outside.

### 4.3 Routed door styles

Definition of Done was *"define a shaker style with a typed border width and recess depth, save
it to the shop standards, apply it to one cabinet so its doors and drawer fronts both carry it,
see the recess in 3D, and see it priced with its machining allowance on the quote."* Met, and
checked in the running app rather than only in tests.

**What shipped.** Settings → **Door styles**, in both scopes. Three shipped styles — Plain slab,
Shaker 57, V-groove 100 — and you can add your own. A style is a job default and overridable per
cabinet in the Inspector, exactly as materials are. `npm run report -- shaker-57` prints the
sample kitchen with routed fronts, which is the cheapest way to check the claim below.

**The claim, and it is the whole point:** *a shaker door is the same rectangle a plain slab door
is.* On the sample kitchen the two runs are identical — 63 parts, 29 lines, 717 × 447 doors,
57.8m of banding, same sheet cost. The only thing that moves is a routing line on the quote.
That is what "a style is machining, not geometry" buys, and it is worth re-checking after any
change here, because the failure mode is a door style that quietly becomes a second way of
describing a part.

**Decisions worth not undoing:**

- **The style resolves in `rules/build.ts`, not in the part builders.** Fronts come out of
  `doors`, `drawerFronts`, the tall cabinet's split banks, and whatever emits a false front
  next. One resolution point cannot forget a caller; four call sites can.
- **The upright axis is derived from the panel's own placement**, not passed in. A door's length
  runs up it (`u = +Y`), a drawer front's runs across it (`u = +X`), and that is already
  recorded. Reading it back is what keeps a vertical groove pattern vertical on both — see the
  V-groove tests, where the same style puts grooves on a different part-space axis for each.
- **Styles are snapshotted into the job**, unlike saved cabinet types. A saved type is a
  catalogue you pick from, so it stays in the standards and nowhere else. A style decides how a
  part is *machined*, which puts it in the same class as the materials: the job keeps its own
  copy, so editing your shaker border next year cannot re-machine a kitchen you already quoted.
- **The machining minutes live on the style, not in `LabourRates`.** How long a front takes is a
  property of the style — a shaker recess and a run of V-grooves are not the same job. The
  *rate* is the shop's. Routing is also deliberately kept out of the install estimate that
  mirrors shop hours: routing a door takes no longer to hang.
- **The minimum-centre fallback is per front, not per style.** A 140mm drawer front with a 57mm
  border has 26mm of centre, and machining it would be a rebate through the whole part. It comes
  out a plain slab, says so in the warnings, and is not charged machine time for work nobody
  did. A bank of identical fronts reports it once.
- **A `ProfiledCutFeature` carries a tool and no width.** That is on purpose — see section 2.

**Not done, and deliberately so:** five-piece doors (out of scope, and a decomposition rather
than a feature), moulded edges, and the actual toolpaths. See 5.3.

---

## 5. Open items, in the order I'd do them

Two and a half pieces of real work are outstanding, plus a tail of small things.

**If asked which to do next:** 5.1 is the one with a deadline attached, in the sense that it
gets materially more expensive once the CAM layer exists. 5.2 is the largest, and the one the
machine ultimately depends on. What is left of 5.3 is mostly Phase 4 work now.

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

Door styles touch this only lightly: a thicker or profiled front shifts hinge boring a little.
There is nothing to design for it ahead of time.

### 5.3 Door styles — what is left

The model half shipped; see 4.3 for what it does and why. What remains:

**Emitting the toolpaths — Phase 4, with the post-processor in Phase 5.** This is the bulk of
what's left, and it is CAM work rather than door work. The features are already there and
already carry a tool id: a `pocket` needs clearing to a floor with a straight bit and its
internal corners left at the stated radius, and a `profiled-cut` needs the named cutter run
along a path at a plunge depth. `library/tools.ts` is a short shipped list of bits and is the
seam the real tool library grows from — feeds, speeds, holder numbers all belong there.

**Moulded edges — ogee, bevel, bullnose.** The vocabulary is in place: `ToolProfile` already
has a `round` section alongside `straight` and `vee`, and `ProfiledCutFeature` already carries a
tool and a path. A moulded edge is that feature run around the part's own outline. What is
missing is only the style fields to describe it and a generator branch. Cheap, once somebody
wants one.

**Five-piece doors remain out of scope**, and should stay out until asked for directly. It is a
decomposition, not a feature: one door becomes five parts with their own grain, banding and
joinery. Nothing in the current design blocks it, and nothing in it should be built
speculatively.

**Smaller ones, if they come up:**

- A style is chosen per *cabinet*, not per front. A kitchen with shaker doors and slab drawer
  fronts needs a per-front override, which would go in `CabinetOptions` and be read in
  `machineFront`. Nobody has asked for it.
- The border is the same all four sides. A wider bottom rail is a five-piece door, so this is
  correct as it stands rather than a limitation to lift.
- The tool list is shipped rather than editable. Worth an editor when Phase 4 gives it more to
  hold than a name and a section.

### 5.4 Smaller things noted but not done

- **Cabinets snap to a wall but not to each other.** Dragging one within ~50mm of a neighbour
  should butt it against that neighbour's end, the way it already goes flush to a wall. Asked
  for from the bench: it is how a run actually gets laid out, and it removes the last reason to
  type an X. The snapping already in `project/wallPlacement.ts` is the place for it, and it
  should test the cabinet's *ends along its own run axis* rather than world X — the same lesson
  the benchtop run-finder had to learn.
- **Changing the front material doesn't change the colour on screen.** `PanelMesh` colours a
  part by its *role*, so every door renders the same off-white whatever decor is chosen.
  `SheetMaterial` has a decor name but no colour to render, so the fix is a hex on the material
  and a viewport that prefers it over the role colour. Worth doing — it is most of what makes
  the 3D view worth showing a client, and a routed door style barely reads on white.
- Cabinets can be dragged but not rotated with the mouse; yaw is typed, or set by snapping to
  a wall.
- The custom cabinet excludes itself from benchtop runs — a banquette shouldn't get one, but
  a bench-height custom carcass arguably should. Needs a rule, or a per-cabinet flag.
- Nesting still estimates sheets from area × a yield allowance. Phase 3 replaces it.
- A corner where two runs meet at 90° leaves whatever gap the cabinet sizes leave; there is no
  corner cabinet type and no check that the two runs don't foul each other's doors. Worth a
  look once the hardware rules exist, since door swing is what actually decides it.
### 5.5 Benchtops should be their own unit, not something derived from the cabinets

**Raised from the bench, and agreed.** Today `project/benchtop.ts` finds runs of touching
bench-height cabinets and the viewport draws a slab over each. That was the right amount of
work for making the 3D view read, and it is the wrong model for anything past that.

**It is already producing wrong tops, not just incomplete ones.** A gap between cabinets breaks
the run — which is correct for a fridge and wrong for a dishwasher: the top runs straight over
an integrated dishwasher, and over a bin unit, and over most under-bench appliances. There is no
way to tell those apart from cabinet geometry alone, because the difference isn't geometric.

**What a benchtop has that no cabinet can imply:** front and end overhangs, a breakfast-bar
overhang on one side only, waterfall ends, mitred corners, where the joins go (decided by slab
size and by what is least visible, not by where cabinets happen to meet), sink and hob cutouts,
tap holes, drainer grooves, upstands, and a material that may differ along the same run.

**And it is usually a different transaction.** Stone is templated on site *after* the cabinets
are installed and bought in per square metre with cutouts and edge profiling charged separately
and a minimum. That is a purchase-order line, not a part the rule engine cuts from a sheet. A
shop-made top — laminated MDF, timber — *is* a cut part. The model needs to hold both, and which
one it is should be a property of the top.

**Recommendation: make it a first-class object, generated once and then owned.**
`Project.benchtops` beside `Project.cabinets`, with a "generate from this run" action that reads
the current run-finder and produces an editable top. Overhangs, joins and cutouts are then
edited on the benchtop itself.

This deliberately breaks the rule in section 2 that derived things are never stored — and it
should. A panel is derived from a cabinet every time because nothing else decides it. A benchtop
*stops* being derived the moment somebody sets a 40mm overhang on one end, and pretending
otherwise would mean keying overrides on a run identity that changes the moment a cabinet moves.
Keep the run-finder as the **generator**, not as the definition; if it records which cabinets it
came from, that is for a "regenerate" button and nothing else should read it.

Costing follows once it exists: per m² for the material, plus cutouts, plus edge treatment.

### 5.6 A separate ladder kick

**Asked for from the bench. No deadline attached — it just needs to be on the list.**

A ladder base rather than the per-cabinet kick panel that exists now: a frame standing on the
floor that a run of cabinets sits on, with the kick face applied to the front of it.

As specified:

- **Ribs run to the floor** — the cross-members are the full kick height, and they are what the
  whole thing stands and gets levelled on.
- **Front and back rails are 10mm short**, so they hang clear of the floor and the frame beds
  down on the ribs alone. On a floor that is never flat, that is the difference between packing
  three ribs and fighting a rail that rocks.
- **The face is cut 10mm higher than the ribs**, left long to be planed in on site. My reading
  is that the extra sits at the **floor** end as a scribe allowance — worth confirming before
  anyone builds it, since cutting it at the wrong end is a whole run of kick faces.

**Note it is a run-level object, the same shape of problem as 5.5.** A ladder base runs under
several cabinets; it is not a part of any one of them. `CabinetOptions.hasKick` already exists
and is already documented as "false for a run on a continuous plinth" — so the per-cabinet
switch is in place and what's missing is the thing it defers to. Worth doing after 5.5, or
alongside it, because both want the same answer to "what owns a thing that spans a run?"

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

They run on every pull request — `.github/workflows/ci.yml` does typecheck, tests, build, and a
terminal cutlist for the sample kitchen in both a plain and a routed door style. That last step
exists because `src/core` runs in Node, so the whole model can be exercised end to end without a
browser, which catches a break that typechecks and has no unit test aimed at it. The four checks
run independently rather than stopping at the first failure, so one push reports everything that
is wrong.

Two things get asserted separately and both matter:
- **part size** — what goes on the cutlist
- **the cabinet-space box each panel occupies** — a left side carrying a right side's
  placement is the same size and completely wrong

Keep that standard. It is what made the errors found from the bench cheap to fix.
