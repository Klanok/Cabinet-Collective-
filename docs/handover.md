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

Since then, six more pieces have shipped: **room plans** you draw with typed wall lengths,
with cabinets standing against named walls; **nominal vs actual board thickness**, so a board
can be told what it really measures and parts are cut to that; **door styles**, the first half
of §5.3 — shaker and V-groove fronts as machining rather than geometry, saved to the shop
standards, priced; and **curved parts** (§5.1), which put real circular arcs in the model and
built radiused shelving and an enclosed radiused end on them; **a corner radius on an
ordinary carcass** (§4.5), which is the same family as that radiused end and keeps the cabinet's
size; and **Phase 2 — hardware and joinery rules** (§4.6): MERIVOBOX drawer boxes cut to the
runner, CLIP top hinge boring, runner and System 32 drilling, a hardware BOM on the quote, and
CSV export. Section 4 records how each works and why; section 5 is what is actually left to do.

```
npm install
npm run dev       # the app
npm test          # 481 tests
npm run build
npm run report    # cutlist, hardware BOM, drilling and costing for the sample kitchen
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
| Geometry engine — profile + extrude, ear-clipping | Straight edges **and circular arcs** |
| Rule engine — specs as data over a construction method | base, wall, tall, drawer-bank, custom, radius-end |
| Panel features (the Phase 4 CAM interface) | Types defined; door styles populate pocket and profiled-cut, **hardware rules populate the drilling** |
| Door styles — shaker, V-groove, routed MDF | **Model half done — toolpaths are Phase 4, see 5.3** |
| Tool profiles — a cutter's cross-section | Defined; a short shipped list, no editor |
| Costing — GST both contexts, install, delivery | Working, on placeholder pricing |
| Nominal vs actual board thickness | Working, off until you measure a board |
| Cutlist — grouped lines | Working, CSV export; no PDF |
| Shop standards + per-job settings | Working, persisted to browser |
| Saved cabinet types | Working |
| Viewport — R3F, orbit + WASD/QE, drag to move, walls | Working |
| Room — any shape, drawn in a 2D plan with typed lengths | Working |
| Cabinets placed against a named wall, at any angle | Working |
| CI — typecheck, tests, build, cutlist smoke run on every PR | Working, `.github/workflows/ci.yml` |
| Drawer boxes and runners — MERIVOBOX | Working, see 4.6 |
| Hinge, runner and System 32 drilling | Working, see 4.6 |
| Hardware BOM, priced onto the quote | Working, indicative Blum pricing |
| Cutlist / hardware / drilling CSV export | Working. **PDF not done — print from the browser** |
| Hettich, the second hardware brand | Not started — one more record in `library/`, see 5.2 |
| Curved / radiused parts — arcs, bowed shelves, radiused ends | Working, see 4.4 |
| A corner radius on a base, wall or tall cabinet | Working — bendy ply and formers, see 4.5 |
| The same corner routed from door board instead | **Not started — see 5.7, now unblocked** |
| Nesting a curved part | **Still bounding-box only — see 5.1** |
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
cup is "Ø35 bore, 13mm deep, at (96, 424.5) on the B-face". Phase 4 must read machining intent
directly, not reverse-engineer it from a mesh. As of §4.6 this is no longer a promise: the hardware
rules populate it in bulk and the drilling CSV is written straight off it.

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
edit. Schema is at **v9**; migrations run in sequence in `model/project.ts`. Shop standards are
versioned separately and are at **v5** — and they get a *real* migration rather than a
rejection, because refusing to load them silently replaces a shop's accumulated kick heights,
reveals, door styles and saved cabinet types with the shipped Australian defaults.

**v9 is the one exception, and it says so out loud.** No part that already existed moves — that
half of the rule is kept, and it is the half that protects a job on the saw. But a migrated job
gets *dearer*, because a drawer bank now cuts the boxes Phase 1 left out and the hinges and
runners now appear on the quote. A kitchen with ten hinges and three drawer sets in it was being
quoted as though the hardware were free, and leaving that under-quote in place to protect a number
would be the worse outcome by a wide margin. Both halves are asserted separately in
`tests/hardware.test.ts` so nobody has to wonder whether it was an accident.

**Hardware is stated in cabinet space and converted into part space through each panel's own
placement.** A hinge is one thing at one height: it puts a cup in a door and two screws in a side,
so it is described once — "22.5mm in from the left edge of that door, 96mm up, 37mm back from the
front of the side" — and `cabinetToPart` puts it where each panel needs it. Writing part-space
coordinates directly is the handedness trap this codebase already has scar tissue for: a side
panel's part +Y runs toward the front on one hand and toward the *back* on the other, so a
hard-coded `y = 37` puts the mounting plate 37mm from the back of the left side, at the right
diameter, in the right quantity, passing any test that counts holes. See §4.6.

**A runner system decides how big a drawer bottom is cut, so it is snapshotted into the job** —
the same class of fact as a board thickness or a shaker border, and a harder one. `LW − 51` is not
a convention somebody chose; it is what MERIVOBOX's profiles physically take out of the opening.
Change your standard runner next year and a kitchen already quoted must still cut to the runner it
was quoted for, or the boxes come back from the saw fitting nothing.

**A hinge cup is bored on the B-face, and that is not a mistake to fix.** A door's A-face is its
show face, which follows from where the door sits — `w = u × v` is derived, not chosen. So the cup
goes in the back, `requiresFlip` is true for it, and the model says plainly that the part turns
over between routing the front and boring the back. That is a real setup and a real chance to
machine the wrong side, which is exactly why the coordinate convention makes it explicit.

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

**An arc is one number on the vertex it leaves.** A boundary edge bows into a circle via a
**bulge**, `tan(θ/4)` — the DXF convention, and more importantly the *non-redundant* one. A
centre plus a radius plus two endpoints is four facts for three degrees of freedom; the
endpoints are already stored, so the bulge is the only thing missing and nothing can contradict
it. Positive means convex on a part outline. Everything dimensional measures the exact arc;
**flattening is for drawing only** and the CAM layer must not do it, because a curve has to
reach the machine as a real G2/G3 arc.

**A part's profile is always the flat, as-cut shape.** How it then bends is `Panel.forming`,
and nothing that decides a size may read it. A skin round a radius is cut to its **developed
length** — measured at the neutral axis, half a board thickness out — so the flat rectangle it
is cut from is longer than the curve is wide. Deriving the flat shape from a stored curve was
the alternative and is a rounding error away from a skin that is short, which you find out with
the glue on.

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

**A curved edge cannot go through the edgebander.** It is hand work, or it is a machine the
shop does not have. So a part that needs banding on an edge wants that edge kept **straight**,
even where a curve would look better and even where the curve costs a CNC nothing to cut — the
saw is not the constraint, the bander is. This is why a shelf at a radiused corner takes a
square notch (§4.5) while the top and bottom above and below it take the arc: their curved edge
disappears under the ply and is never banded. Expect this one to look like a shape that wants
improving to anyone who does not know why it is square.

The one curved banded edge in the model is the bowed shelf front on open radius shelving, which
is hand-banded and priced at true arc length rather than the chord (§4.4).

**Pricing in `library/materials.au.ts` is indicative.** Decor names and sheet sizes are real;
the dollars are placeholders, flagged `indicativePricing` and surfaced on screen. The user's
real trade pricing has not been loaded yet. The same is true of `library/blum.ts`.

**MERIVOBOX is the standard drawer runner** — the user's call, made when Phase 2 was scoped. It is
Blum's mid-range box system, between TANDEMBOX and LEGRABOX. The figures that matter, and they are
the *input* to a drawer box rather than something to derive:

```
nominal lengths        270, 300, 350, 400, 450, 500, 550, 600
M profile              91mm high; wooden back cut at 83mm from 16mm chipboard
drawer bottom          LW − 51 wide  ×  NL − 26 long, 16mm chipboard
minimum inner depth    LT min = NL + 3
runner fixing          37mm from the front edge, then 128mm behind it at NL ≤ 300
                       and 256mm behind it at NL 350–600
load rating            40kg (a 70kg class exists and is not shipped)
```

`LW` is the clear width between the cabinet sides and `LT` the clear depth in front of the back
panel — both come out of the rule engine from the boards that will really be cut, which is the
whole reason drawer boxes waited for this phase.

**A runner is one of those lengths or it does not exist.** There is no rounding a 512mm cabinet
down to a 512mm runner. A length the system doesn't make, or one too long for the cabinet, is
reported and no boxes are cut — a box sized to a runner nobody can buy is worse than no box.

**Two hardware figures are shop settings rather than product facts** and are editable in Settings
→ Hardware: the hinge's drilling distance (5mm; Blum allows 3–7) and the cup setback from the end
of the door (96mm). Everything else on a system record is what the product *is*, and correcting one
is a code edit in `library/blum.ts` on purpose — getting it wrong re-cuts every drawer in every job.

**One MERIVOBOX figure has not been checked against the catalogue** and the app says so by name:
`boxFloorAboveFrontBottom`, shipped at 10mm. It decides where the runner's fixing holes get drilled
up the cabinet side, so it wants ten seconds with the planning sheet before anybody bores a
carcass. The `unconfirmedFigures` list is the same contract `indicativePricing` has for money, and
it is surfaced in the report, in the Hardware tab and in Settings rather than left in a comment.

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
is.* On the sample kitchen the two runs are identical — 69 parts, 31 lines, 717 × 447 doors,
57.8m of banding, same sheet cost, same hardware, same drilling. The only thing that moves is a
routing line on the quote. (It read 63 parts and 29 lines before §4.6 added the drawer boxes; the
identity itself is untouched, and `npm run report -- shaker-57` against `npm run report` is still
the cheapest way to check it.)
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

### 4.4 Curved parts

Definition of Done was *"a profile edge can be a circular arc, with area, perimeter, bounds and
banding all exact rather than approximated; edge banding on a curved edge charged at the arc;
the stored profile the flat as-cut shape with a separate descriptor for how it bends; and two
real parts — a radiused shelf and an enclosed radiused end — proving both halves."* Met.

**Why before Phase 4 rather than after.** The whole argument for doing this now was cost: arcs
touched the geometry layer and nothing else, where afterwards they would have touched CAM too,
and a curve has to reach the machine as a real G2/G3 arc. That held — `geom/`, `model/panel.ts`
and the shelf builders were the whole of it, and all 276 existing tests passed untouched at
every step.

**Two things were wrong before, not merely missing.** Banding on a curved edge was charged
across the chord, so a radiused shelf under-bought its own tape — on the reference 866mm shelf
bowed 40, by about 5mm. And a bowed part's bounding box was read off its vertices, which
under-reports the part: a shelf bowed 50 over 900 is 50mm deeper at its middle than at its
corners, and the middle is the figure that has to fit the sheet.

**Decisions worth not undoing:**

- **The bulge, not a centre and a radius.** See section 2. The short version is that a centre
  is redundant with the endpoints already stored, and a redundant centre a hundredth out is an
  arc that machines as a step.
- **`Vertex2 extends Vec2`.** A vertex without a bulge is a point, which is what it always was,
  so no straight polygon anywhere had to change. This is why the diff is as small as it is.
- **Flattening is named, is in one place, and is for drawing.** `flattenPolygonSegments` carries
  a true normal at each *segment end* rather than per point, because the join between an arc and
  a straight run is one position with two surface directions — which is what lets a radiused
  edge shade smoothly and still break crisply where the curve stops.
- **`profileEdgeLengths` measures the real boundary per side**, and reproduces the bounding box
  exactly for a rectangle *and* a notched rectangle, so nothing straight moved.
- **`bowedFrontProfile` takes the edge that bows with no default.** A shelf lies in with
  `v = −Z`, so its front is **L1**; a caller assuming L2 puts the radius against the wall, where
  it looks entirely correct in a test. Same handedness trap `resolveBanding` exists to avoid.
- **A former's thickness axis is derived from `u × v`**, so `'+X','+Z'` crosses to −Y and hangs
  every plate a board thickness below its own line. `'+Z','+X'` sits them on it. This was a real
  bug, caught by asserting occupancy rather than size — which is the section 7 standard earning
  its keep again.
- **Formers are cut to the finished radius less every layer of skin.** Cut to the finished
  radius they give a curve standing proud of the run's front face by the skin thickness — a step
  exactly where a hand lands.
- **Each skin layer has its own developed length**, longer than the one beneath it by exactly
  one board thickness round the turn. Cutting a stack of them the same is how the outer one ends
  up 4.7mm short on a 560 quarter.
- **The kick on a radiused end curves too.** A flat board across the front of a quarter round is
  a chord, with a triangle of daylight at each end.
- **Bendy ply is its own material slot** (schema **v7**), not a reuse of the door board. It is
  bought for a different reason, and it is the only board in a job whose thickness sets a
  *length* rather than a fit. An existing job never resolves the slot, so nothing re-priced.

**Where to look:** `geom/arc.ts` for the arc maths, with the derivations written out;
`model/forming.ts` for the bend and the developed length; `rules/specs/radiusEnd.ts` for the
assembly. `tests/curves.test.ts` and `tests/radiusParts.test.ts` carry the longhand reference
figures in their headers.

### 4.5 A corner radius on any cabinet

**The bendy-ply method. `5.7` is the same corner built the other way and is not done.**

**Asked for directly, after using the radiused end in the app.** Two things came back: a
curved skin that did not wrap (fixed — see below), and the unit shrinking whenever the radius
changed. The second is not a bug. `radiusEnd.ts` says the radius *is* the width and *is* the
depth, and `validate` rejects anything else as an ellipse, so a 200mm radius gives a
200 × 720 × 200 cabinet. That is what a quarter-round end **is**, and it stays.

What is wanted alongside it is different: an ordinary carcass that keeps its size, with **one
corner rounded**. Confirmed choice — the quarter-disc unit remains for full round ends, and
base, wall and tall cabinets gain a corner radius.

**The quarter-round unit is already a corner radius — the front-right one.** Read
`quarterDiscProfile` together with the former placement at `radiusEnd.ts:98`: the straight
edges land on the left face and the back, and the arc runs from (0, D) round to (W, 0), so the
corner actually missing is the **front-right**, at (W, D). A corner radius `r` on that corner
has its centre at (W − r, D − r); set r = W = D and the centre lands on the back-left corner
and the shape *is* the quarter disc. The two are one family. That is what makes the second
invariant worth writing rather than merely plausible, and it is why the corner choice is not
free.

**Where it lands.** All four carcass types share the builders in `rules/parts.ts`, so this is
shared-code work rather than one more spec.

**Most of the parts already exist.** Arcs are in the model and a curved edge already bands at
true arc length rather than the chord. Formers, developed-length skins and a curved kick are
all in `radiusEnd.ts` and want lifting into shared builders rather than reinventing — and they
must be *shared*, or the two will drift and only one will get the next fix.

#### The four decisions, settled with the shop

Answered directly by the shop owner. Do not re-open them without asking; a fresh session that
re-derives them will get a different answer.

- **Which corner.** Either **front** corner, named as you stand and look at the cabinet, and
  **stated explicitly** — `radiusCorner` has no default and `carcassRadius` does nothing on its
  own. A run ends left or right and you cannot get the other hand by turning a cabinet round,
  because that puts its back to the room; a back corner rounds into the wall where nobody sees
  it. This is the handedness trap the codebase already has scar tissue for: `bowedFrontProfile`
  takes its edge with no default precisely because a caller assuming wrong puts the radius
  against the wall and still passes a size assertion. Assert *occupancy*, not size — that is
  what caught the former thickness axis in 4.4.
- **Doors** keep clear of the 50mm fixing strip below. Usually there are none: **the common use
  for one of these is a decorative end**, not a cupboard, so setting a radius should default the
  cabinet to no doors and no shelves.
- **The end panel stays in**, set back behind the ply so the ply finishes flush, and loses the
  radius off its depth — full depth at radius 0, gone entirely at radius = depth. It goes on
  carrying the shelves, the top and the benchtop load. Deleting it and going to formers at every
  radius would throw away a good 460mm side panel to get a 100mm curve.
- **Shelves take a square notch** at that corner, not an arc — and **the reason is the
  edgebander, not the saw.** A curved edge cannot go through it. This will look like a shape
  that wants improving to anyone who does not know why it is square, so the reason travels with
  the decision. The top and bottom can still take the arc, because that edge disappears under
  the ply and never needs banding.

#### The 50mm fixing strip

The flat run of front face between the door edge and where the curve starts. It is there to
**fix the curved piece to**, so it exists whenever there is a curve, doors or no doors. It is
*not* a door clearance — reading it as one is wrong, and makes it vanish exactly when the
cabinet has no doors, which is the common case.

It belongs in the construction method beside `kickSetback` and `shelfSetback` rather than
hard-coded. A radius leaving less than 50mm of flat front should be reported rather than drawn
with a strip too small to fix to.

#### The wrap

One piece, no join: the fixing strip, round the quarter, then flat all the way down the end of
the cabinet to the back. An exposed end wants no joint line in it.

`CylindricalForming` **already does this and needs no extension** — `forming.ts:141` says
anything before `from` or past the end of the bend runs on flat along the tangent, and
`formPoint` clamps to the bend span to make it so. This is one bend with straight tails, not a
compound curve, so §5.1's prohibition does not bite. Cut length per layer:

```
  strip  +  (rᵢ + ts/2) · π/2  +  (D − r)
```

Both flat tails are the same on every layer and only the arc differs, so the gap between layer
1 and layer 2 stays exactly `ts · π/2` — 4.712mm on 3mm ply — which is 4.4's rule surviving
intact.

#### Definition of done, testable

- A base cabinet 900 × 720 × 560 with a 200 radius still measures 900 × 720 × 560. The box does
  not shrink. This is the reported bug written as an assertion.
- Sheet area falls by the corner offcut only, not by the whole rectangle.
- **Radius 0 produces parts identical to today's cabinet** — the invariant that protects every
  existing job. **Written and passing**, `tests/cornerRadius.test.ts`.
- **Radius = width = depth reproduces the quarter-round unit**, which still exists. Half
  written and passing — it pins what `radiusEnd.ts` produces today, so the target moves loudly
  if that unit ever moves. The half saying a base cabinet at full radius comes out the same is
  written in full and **skipped**; the commit that makes it pass unskips it.
- Verified in the running app as well as in the suite, per section 7. A quarter circle and a
  box are hard to tell apart in a screenshot; check a constant radius numerically.

**That second invariant is a *geometry* identity, not a part-list identity.** Stated as the
latter it cannot hold, and someone will fudge one of the two units to make it pass: a base
cabinet at full radius still has a back and a bottom, and the quarter-round unit deliberately
has neither. What matches is the shape — skins at the same developed lengths, the bottom cut to
a former's quarter disc, the end panel and the doors gone.

Three things fall to zero of their own accord to make that true, and each is a settled decision
rather than a happy coincidence: the fixing strip has no flat front left to sit on (W − r = 0),
the wrap has no straight run back to the back (D − r = 0), and the end panel's depth reaches
zero. Make any one of them unconditional — a 50mm strip that is always present, say — and a
full-radius cabinet comes out as a quarter plus a tail, which is not the unit that exists.

#### What is done

**All five of them, and both invariants pass** — including the second half of invariant 2,
unskipped by the commit that made it pass. `radiusCorner` and `carcassRadius` are read by the
rule engine, offered in the Inspector for base, wall and tall, and verified in the running app
as well as in the suite.

1. Formers and skins are **shared builders in `rules/parts.ts`** — `cornerFormers`,
   `wrapLayers`, `wrapPart`, `formerHeights`. `radiusEnd.ts` now resolves its own geometry
   through `rules/radius.ts` and calls the same builders, so there is one description of a
   former and one of a wrap, not two.
2. `bottomPanel` and `topPanel` take the arc. The end panel stays in, sets back behind the ply
   and loses the radius off its depth.
3. The wrap is one flat–bend–flat part per layer, `strip + (rᵢ + ts/2)·π/2 + (D − r)` long.
4. Doors are laid out in the **door zone** and the pair check measures it — one shared
   `pairTooNarrowProblem`, not the same three lines in three specs. Shelves take the square
   notch, and the note says the edgebander is why.
5. The fixing strip is `ConstructionMethod.fixingStripWidth`, migrated in at project schema v8
   and standards v4.

**How the geometry hangs together**, since it is the part that will look arbitrary otherwise.
`rules/radius.ts` resolves the corner once: the substrate arc is radius `r − skin` and the
finished arc is `r`, both centred on `(W − r, D − r)`, so the wrap is the same thickness the
whole way round. Everything is written for a **front-right** corner and mirrored, so the two
hands cannot drift apart. Plan rings are wound clockwise in (x, z) because a horizontal
panel's placement reflects into part space, and that reflection turns them counter-clockwise —
the winding every profile here uses.

**Three parts go when the radius has eaten them, by one rule applied three times**: the end
panel when its depth reaches zero, the back when the curve runs past its front face, the far
side when the curve springs from inside its front edge. Nothing is special-cased at the limit,
which is what lets a base cabinet at radius = width = depth collapse into the quarter-round
unit of its own accord — every straight run in the plan ring reaches zero length and what is
left is `quarterDiscProfile`'s three vertices.

**What a radiused cabinet costs in board**: the bottom keeps its rectangle and loses the corner
offcut plus the two thin slivers the ply set-back costs — worked longhand in
`tests/cornerRadiusParts.test.ts`. 2% of the panel, not the 96% the shrinking bug was losing.

#### The crash found from the bench, and the two things it taught

**A radius smaller than the ply that wraps it took the whole app to a blank screen.** Two layers
of 3mm leave nothing of a 5mm radius, and `cylindricalForming` rightly refuses a radius that
isn't positive — but a **number field fires on every keystroke**, so typing "200" resolves a 2mm
radius first and threw on the first digit. The suite was green and the app was unusable: every
test typed a finished number, and nobody types a finished number.

Two separate faults, and both are worth carrying forward because neither is about radii.

- **The rule engine must never throw.** `build.ts` already said so — "surfaced rather than
  thrown: a half-valid cabinet still needs to be visible in the viewport so the user can see what
  to fix" — and a builder quietly broke it. An impossible radius now resolves to `null`, the
  cabinet draws square, and a warning says why. The check and the arithmetic are one exported
  function, `substrateRadius`, so the warning and the builder cannot disagree about the boundary.
- **A crash was unrecoverable, which is what made it serious.** The job saves as you edit, so the
  value that crashed the build was *already saved* by the time the screen went white, and every
  reload loaded it back and blanked again. The only way out was the browser's developer console.
  `app/ErrorScreen.tsx` is now the backstop: it names the error, offers to save the broken job to
  a file — that file is what makes a bug reproducible — and offers to clear it. **It is a
  backstop, not a licence to throw.**

The testing lesson generalises the one in 5.1. That one was *measure the thing itself, not its
vertices*. This one is **feed it what a person actually types, not what they mean to type** —
`tests/cornerRadiusParts.test.ts` now walks 1, 2, 5, 6, 7, 20, 200, 2000 through both hands and
all three types, and asserts the boundary moves with the board rather than sitting at a
hard-coded 6.

**Where to look:** `rules/radius.ts` for the plan geometry and the two rings, with the winding
and the mirroring reasoned out; `rules/parts.ts` for the shared builders — `cornerFormers`,
`wrapLayers`, `wrapPart`, `cornerPlate`; `rules/specs/radiusEnd.ts` for how the enclosed unit
resolves itself through the same description. `tests/cornerRadius.test.ts` is the contract, and
`tests/cornerRadiusParts.test.ts` carries the longhand reference figures in its header.

### 4.6 Hardware and joinery rules — Phase 2, Blum first

Definition of done was stated as assertions before anything was written, per §6, and all of them
pass. The short version of the phase: **a drawer box is cut to the runner, not to the cabinet**, and
**every hole is described once in cabinet space** so the two hands cannot drift apart.

**What shipped.** MERIVOBOX drawer boxes on every drawer bank, with the nominal length chosen from
the cabinet's real inner depth. Hinge cups and dowels in the back of every door, mounting plates in
the side the door hinges on, runner fixings in both sides at each box floor, and System 32 shelf-pin
rows where a cabinet has adjustable shelves. A hardware BOM counted from the panels and priced onto
the quote as its own line. Cutlist, hardware and drilling CSV export. `npm run report` prints all of
it, which is the cheapest way to check any claim below.

**The sample kitchen, before and after.** 63 parts became 69 — the six extra are a bottom and a back
for each of D1's three drawers, and not one of the original 63 moved by a millimetre. On top of
those: 3 MERIVOBOX sets at NL 500, 20 hinges, 20 plates, 28 shelf pins, and 448 holes of which 60
are on the back face. Hardware adds $331.04 ex GST at the indicative rates, on a job that was
quoting the hardware at nothing.

#### Decisions worth not undoing

- **Sizes resolve into `RuleContext`; boring runs as a pass over the finished part list.** Two
  different problems with two different shapes. A drawer bottom needs one number the cabinet knows
  (the opening) and several the runner knows, so `ctx.hardware` is resolved once in `buildContext`
  exactly as `ctx.radius` is, and `rules/drawerBox.ts` is an ordinary builder. A **hinge** is not
  like that: it is a cup in a door and two screws in a side, so nothing can bore it until every
  builder has run. `rules/boring.ts` therefore runs once over the whole list in `build.ts` — the same
  argument that put the door style there, and for the same reason: fronts and sides each come out of
  several places, and one resolution point cannot forget a caller.
- **Every hole is stated in cabinet space.** See §2. This is the load-bearing decision of the phase
  and the tests assert the *coordinates*, not the counts: Door L's cups land at part y = 424.5 and
  Door R's at 22.5, and the plates come out at part y = 507 on the left side and 37 on the right.
  Those are the same 37mm from the front edge, and a hard-coded number could not produce both.
- **A cup is on the B-face and needs a flip.** See §2.
- **`machineFront`'s guard had to change from "has features" to "has a front-style feature".** It
  used to mean "already machined deliberately". Once a door carries hinge cups, the loose test reads
  a bored door as an already-styled one and quietly ships a plain slab on a shaker kitchen — §4.3's
  failure arriving by the back door. The door-style tests now ask about `purpose === 'front-style'`
  rather than about feature counts, which is the question they always meant.
- **Hardware is counted from the panels, never from the options.** A door too narrow to take a cup
  is not charged a hinge; a bank whose depth no runner fits does not order three runner sets. Same
  reasoning as `machinedFronts`, and it is what makes the BOM and the drilling sheet agree.
- **A drawer bottom and a wooden back are the whole cutlist contribution of a Blum box.** The sides
  are steel and are bought, so they are a BOM line. A shop cutting its own timber sides is building a
  different drawer and would be a different builder.
- **Dowels have their own `FeaturePurpose`.** They take a different bit, so CAM groups them
  separately — and counting hinges means counting *cups*, which a shared purpose would make three
  times too many.
- **A row of system holes stays one `drill-line`.** That is what the operation is. Expanding it into
  twenty-one drills happens in exactly one place, the drilling CSV, because a person at a borer wants
  positions and a machine wants the pitch.
- **System-hole diameter, depth and both setbacks live on the `ConstructionMethod`**, beside the
  pitch that was already there. Ø5 at 13mm deep is what a frameless 32mm carcass is bored to whoever
  made the hinge. A hardware system that genuinely wants something else says so on its own record,
  and the runner does.
- **Hardware cost is rounded once, at the end.** Unlike a sheet, a hinge is not a separately priced
  item on the quote, so there is nothing to round in between — and rounding per cabinet left the
  costed hardware a cent off the BOM total for no reason anybody could explain.

#### Something worth telling the shop

**The plate screws do not land on the System 32 grid at a 96mm cup setback.** They come out at 80 and
112, and the grid is at multiples of 32. A **112mm setback** would put both on it, and then *one*
line-boring pass covers the shelf pins and the hinge plates together instead of two operations on
every side panel in the job. That is a shop decision about a number, not a fault, so it is not a
warning — Settings → Hardware computes it and says which setback would do it
(`platesOnSystemGrid` / `cupSetbackForSystemGrid`).

#### What is not done, deliberately

- **Drawer-front fixing-bracket boring.** The bracket positions were not confirmable, and inventing
  hole positions in a drilling sheet is worse than leaving them out. Everything else about the front
  is there.
- **PDF export.** CSV opens in Excel, imports into a nester and pastes into an email; printing one
  from the browser gets a perfectly good PDF when somebody wants paper.
- **Drawers inside a base cabinet.** `doorCount` and `drawerCount` are separate and only the
  drawer-bank spec reads the second, so a drawer over a door is not modelled. It is a spec change,
  not a hardware one.
- **Shelf-pin rows run the full height of the side** — 21 holes on a 720 carcass, which is what a
  line borer produces and what makes a shelf adjustable. On a CNC that is a lot of holes for one
  shelf; a *range* would be a construction-method field, and nobody has asked.
- **Hettich.** One more record in `library/` and a second entry in the runner and hinge lists. The
  model was built so that is all it is; whether that is true is the test of this phase.
- **Hardware fitting time is not costed.** `minutesPerPanel` picks up the new box parts and
  `minutesPerCabinet` covers assembly, but hanging a door and fitting a runner are not their own
  allowances. Worth a `LabourRates` field when there is a real figure for it.

**Where to look:** `model/hardware.ts` for the vocabulary and the pure arithmetic;
`library/blum.ts` for the shipped MERIVOBOX and CLIP top records, with the source of every figure
written out; `rules/hardware.ts` for how a cabinet resolves its runner; `rules/drawerBox.ts` for the
two box parts; `rules/boring.ts` for the drilling, with the cabinet-space argument reasoned out;
`hardware/bom.ts` for the order and the drilling summary; `cutlist/export.ts` for the CSVs.
`tests/hardware.test.ts` and `tests/boring.test.ts` carry the longhand reference figures in their
headers.

---

## 5. Open items, in the order I'd do them

**5.2 has shipped — see 4.6.** What is left of it is Hettich and a handful of gaps, listed below.

**If asked which to do next: 5.5, the benchtop.** It is the largest thing left, it is already
producing *wrong* tops rather than merely incomplete ones (a dishwasher breaks a run and should not),
and 5.6 wants the same answer to "what owns a thing that spans a run?" — so doing them together is
cheaper than doing either alone. Phase 3, nesting, is the other honest answer: it is the next
numbered phase and `panelFootprint` is the seam.

**5.7 is technically unblocked and should still wait.** The shared builders it wanted exist, but
it inherits the three judgement calls listed in 5.0 — and none of those has been checked against
a real job yet, so starting it now risks building the same mistake in two places. It also still
needs an answer to whether the routed piece is kerfed to bend or machined from something thicker;
a developed length only means something if the piece actually bends.

What is left of 5.3 is mostly Phase 4 work. 5.1 and 5.0 are both small tails.

### 5.0 A corner radius — what is left after 4.5

The feature is built and merged; see **4.5** for what it does and why it is that way. What
remains are gaps rather than missing work, and none of them blocks anything.

- **Nesting reads a radiused corner as its bounding box**, the same as every other curve. 5.1's
  known gap and Phase 3's problem.
- **The plan view draws a cabinet's footprint as a rectangle**, so a radiused corner reads
  square there. Cosmetic, and the same limitation `panelFootprint` has.
- **A benchtop over a radiused base cabinet is still a rectangle.** The cabinet's box does not
  shrink, so the top is the right size — but its corner is square over a round cabinet.
  Belongs with 5.5, where a benchtop becomes its own unit rather than something derived.
- **Bendy ply is sold barrel or column form** and the model still doesn't record which; the
  wrap's note tells whoever cuts it to check the sheet. Same `SheetMaterial` field 5.1 wants.
- **Deferred, confirmed as much later:** a shelf cannot sensibly carry a bowed front *and* a
  rounded corner — two curves arguing over one edge. The app now says pick one.

**Three decisions in 4.5 were mine rather than the shop's**, made because there was nobody to
ask mid-build. All three are cheap to change now and awkward later, and none has been checked
against a real job: the **fixing strip is rebated** rather than lapped, the **curved kick turns
`r + doorThickness − kickSetback`** so its flat run lands where a square cabinet's does, and at
**radius = width = depth the back and the far side go** — which contradicts a line 4.5 used to
carry, and is explained there.

### 5.1 Curved parts — what is left after 4.4

The foundation and both deliverables shipped; see 4.4 for what they do and why. What remains:

**Two rendering bugs found by using the app, both since fixed, and both worth knowing about
because the failure mode repeats.** Curved parts drew dead flat, and then drew torn into
wedges. In each case the model was correct throughout — the cutlist never lied — and the
suite passed, so only looking at the thing caught it.

- **`isRectangular` compared raw vertices to snapped bounds with `===`.** `profileBounds` snaps
  deliberately; a skin's developed length is r·π/2 = 872.5773595345651, which snaps to a
  different number, so a plain rectangle was judged non-rectangular and `formedMesh` took its
  flat fallback. `nearlyEqual` existed for exactly this and this was the one place reaching past
  it. Every test had typed the length as a rounded literal that survives the snap.
- **Ear clipping joined stations at opposite ends of the part.** `formedMesh` subdivided the
  outline and reused the general extruder, whose cap triangulation may connect any two ring
  vertices. Flat that is correct; bent, a triangle spanning the quarter becomes a chord through
  the curve. A formed part now builds its own slab so every triangle stays inside one station
  gap.

The lesson both times: **a test that checks vertices, counts or extents will pass on a surface
that is wrong**, because the vertices were never what broke. Measure the thing itself — triangle
centroids against the true radius — and derive test dimensions the way the code does rather than
typing a rounded literal.

- **Nesting doesn't understand a curve.** `panelFootprint` is the bounding box, so a radiused
  shelf reserves the rectangle it fits inside and the offcut between the curve and the corner
  is invisible. That is correct for a saw and wasteful for a router, and it is Phase 3's
  problem rather than something to pre-solve — the arc is in the model now, so a nester can
  read it when there is one.
- **The pocketed melamine panel** — pocketing the back of a panel leaving straight fixing
  sections — is still deferred, and was deferred by the user as too complicated for now. The
  ground is prepared: it is a flat part plus a groove pattern the feature system already holds,
  and `forming` already describes what it becomes.
- **Bendy ply is sold barrel or column form** — it bends across the sheet or along it — and the
  model doesn't record which. The parts carry a note telling whoever cuts them to check the
  sheet. Recording it properly is a `SheetMaterial` field, and it is *not* `GrainDirection`:
  that constrains nesting rotation for appearance, and this constrains which way the board will
  physically go round a corner. Worth doing when a real bendy ply order is loaded.
- **A radiused end has no spine.** The formers fix back into the end of the last carcass in the
  run, which is how one usually goes together. A shop that wants a vertical spine has a part to
  add to the spec, not a rethink.
- **Compound curves are not modelled** and should stay that way. `CylindricalForming` is one
  radius about one axis, which is what bendy ply over formers makes. A dome is a different
  trade.

### 5.2 Hardware and joinery rules — what is left after 4.6

**Phase 2 is built and merged; see 4.6 for what it does and why.** MERIVOBOX is the standard drawer
runner and CLIP top BLUMOTION the standard hinge. What remains:

- **Hettich, the second brand.** One more `DrawerRunnerSystem` and one more `HingeSystem` in
  `library/`, and they appear in the pickers. Whether that really is all it takes is the test of
  whether 4.6's data model is honest, so it is worth doing next time a job actually wants Hettich
  rather than speculatively.
- **The one unconfirmed MERIVOBOX figure**, `boxFloorAboveFrontBottom` — see §3. Ten seconds with
  the planning sheet closes it, and the app is already saying so by name.
- **`dowelOffset` on the hinge**, 9.5mm, same treatment. The 45mm spacing is the catalogue figure;
  the offset wants a real hinge and a rule.
- **Drawer-front fixing-bracket boring**, deliberately not invented — see 4.6.
- **PDF export.** CSV is done. Print from the browser meanwhile.
- **Hardware fitting time on the quote.** A `LabourRates` field when there is a figure for it.
- **Load class.** Only the 40kg MERIVOBOX is shipped; the 70kg exists and is another entry, but
  choosing between them properly means knowing what goes in the drawer, which the model doesn't.
- **Door styles touch this only lightly**, as predicted: a thicker front shifts nothing here,
  because the cup depth is measured into the board from its own face. Nothing to design for.

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
  corner cabinet type and no check that the two runs don't foul each other's doors. This was waiting
  on the hardware rules, which now exist — `doorSwing` is read by the boring pass, so the information
  needed to work out whether two doors foul each other is in the model. Still nobody's asked.
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

### 5.7 The routed corner — the second way the shop builds a radius

**4.5 is done, so this is unblocked.** It is the same corner by a different method, and the
shared builders it wanted — `rules/radius.ts` for the plan geometry, `cornerFormers` and
`wrapPart` in `rules/parts.ts` — now exist. What changes is the curved piece and its material
slot; the corner, the strip, the wrap to the back and the square-notched shelf do not.

The shop builds a radiused corner two ways, and which one is in use changes what is on the
cutlist:

- **Bendy ply and laminate** — formers and skins, which is what `radiusEnd.ts` already models
  and what 4.5 built. The laminate has to carry round onto the return, so **the ply runs over
  the 50mm fixing strip** and dies under the door edge.
- **Routed** — the curved piece is a **decorative MDF board, the same board the doors are cut
  from** (Polytec woodmatt or similar). Here the 50mm strip is left as a fixing strip, **edge
  banded**, and that band is the finished edge. Nothing laps over it.

So the only thing that changes between the two is what covers the strip — laminated, or banded.
The corner, the strip, the wrap to the back and the square-notched shelf are all the same
either way, which is why 4.5 was settled without needing this.

**The useful consequence:** the routed piece takes the **`door` material slot**, not `skin`. It
is the same board as the fronts, bought for the same reason. So this needs no new material slot
and no schema change — which is the opposite of bendy ply, which earned its own slot in v7
(§4.4) precisely because it is a different sheet bought for a different reason.

**Unknown, and worth asking before building:** whether the routed piece is kerfed to bend, or
machined from something thicker, or something else again. That decides the parts, and it is not
worth guessing — the developed length only means something if the piece actually bends.

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

Three things get asserted separately and all of them matter:
- **part size** — what goes on the cutlist
- **the cabinet-space box each panel occupies** — a left side carrying a right side's
  placement is the same size and completely wrong
- **where each feature lands, in part-space coordinates** — added in §4.6. A mounting plate
  measured from the wrong edge of a side panel is the same number of holes at the same diameter, so
  a test that counts them passes. `drillingStaysOnThePart` in `tests/helpers.ts` is the catch-all
  version of this and runs over every cabinet type at two widths and both hands.

Keep that standard. It is what made the errors found from the bench cheap to fix.
