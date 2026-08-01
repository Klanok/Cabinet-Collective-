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
CSV export; and **benchtops and ladder bases** (§4.7), the two things that span a run of cabinets
and belong to none of them, which is also where the appliance space arrived — a dishwasher takes a
top over it and a fridge does not, and nothing geometric tells them apart.

**Phases 3, 4 and 5 have since shipped.** §4.8 is **guillotine nesting**: the job is laid out on
real sheets, the cut sequence comes out of the packing rather than being derived from it, and the
quote charges **whole sheets** off the count instead of fractional ones off an assumed yield — the
second migration in this file that deliberately re-prices a saved job, and it says so out loud.
§4.9 is **CAM and a post-processor**: an ordered, machine-independent operation list, and G-code for
a named machine — one `.nc` per nested sheet.

**One thing from §4.9 must not get lost.** The G-code has **never been run on a machine** and its
*dialect* is unverified — the geometry is asserted and can be trusted, but whether this controller
wants `G81`, and where its Z zero is, cannot be known from here. Every program says so in its own
header. Getting one `.nc` file off the machine to compare against is ten minutes' work and is worth
more than any other open item in this document.

Section 4 records how each works and why; section 5 is what is actually left to do.

```
npm install
npm run dev       # the app
npm test          # 625 tests
npm run build
npm run report    # cutlist, hardware BOM, drilling, nest, G-code and costing for the sample kitchen
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
| Sheet cost | **Whole sheets, counted off a real nest.** The yield allowance is gone — see 4.8 |
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
| Guillotine nesting — sheets, cut sequence, offcuts | **Working, see 4.8.** Nest tab, two CSVs |
| CAM — panels + nest → machine-independent operations | **Working, see 4.9** |
| G-code — a post-processor per machine, `.nc` per sheet | **Working, see 4.9. Dialect UNVERIFIED — simulate first** |
| Nesting a curved part | **Nested as its blank, which is right for a saw — see 4.8** |
| True-shape nesting for a router | Not started — a different cutting model, see 5.8 |
| The drill bank — a System 32 row in one hit | Off until its codes are read off the machine |
| Simulation / backplot | Not started, and it is the gate before anything runs |

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
edit. Schema is at **v11**; migrations run in sequence in `model/project.ts`. Shop standards are
versioned separately and are at **v7** — and they get a *real* migration rather than a
rejection, because refusing to load them silently replaces a shop's accumulated kick heights,
reveals, door styles and saved cabinet types with the shipped Australian defaults.

**v9 and v11 are the two exceptions, and both say so out loud.** They are the same argument twice:
no part that already existed moves, and the job gets dearer because it was being quoted for less
than it takes to build. v9 added the hardware a kitchen always had; v11 charges the board a
kitchen always took. Both halves of each are asserted separately — `tests/hardware.test.ts` and
`tests/nesting.test.ts` — so nobody has to wonder whether a re-price was an accident.

**v9, in detail.** No part that already existed moves — that
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
goes in the back, and the model records that rather than letting a post-processor guess.

**What it does not mean is a flip.** The face being machined is the face that goes up on the bed, so
a plain door with cups in its back and nothing on its show face is bored back-up in *one* setup.
`requiresFlip` therefore asks about a **part** — true only when it is machined on both faces, which
a shaker door recessed on the front and bored on the back genuinely is. It briefly asked about a
*feature* instead, and reported the plain-slab sample kitchen as having 72 flips in it when it has
none. Caught from the bench: *"none of the holes should require the part to be turned over."*

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

**Board is bought by the sheet, so the quote charges whole sheets.** It used to charge part area
divided by an assumed yield, which had two faults and only one of them was that it was a guess: it
billed **fractional sheets** — 3.23 of them on a sample kitchen whose own materials table said four
— and it applied one allowance to every material and every part size. Nobody sells a third of a
sheet. The nest counts them, the count is what is charged, and what is left over is reported as
offcut rather than quietly deducted from the price of board that was bought. A smaller part is not
a cheaper part; it is a part with more offcut beside it, and the offcut is on the rack either way.

**A nest is of blanks, not of shapes, and for a saw that is correct rather than a shortcut.** A
guillotine cut runs edge to edge, so a radiused shelf does not come off the sheet as a curve — a
rectangle comes off the sheet and the curve is cut from the rectangle afterwards. The blank is
therefore what the sheet has to hold, which is `panelExtent`, measured round the *outside* of every
arc. §5.1 read this as a gap waiting for true-shape nesting; it is a gap for a **router**, and a
router nest is a different cutting model rather than a better version of this one.

**The cut sequence falls out of the packing; it is never derived from it.** Placing a part *is*
cutting a piece in two, so the packer builds a tree of cuts rather than the usual list of free
rectangles. That costs some speed and buys the thing the shop actually needs — an ordered list of
cuts that is guillotine-valid by construction rather than by a checker bolted on afterwards.
`replayCuts` puts the sheet back on the bench, follows the instructions knowing nothing about the
tree, and reports what comes off. Move one cut 5mm and it finds six problems.

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

**Everything vertical about a box is measured from the bottom of the runner.** That is Blum's own
datum on the front-installation sheet, and it is the only one that works — the runner is what is
screwed to the cabinet, so it is the one plane the drilling and the box can both be measured from
without one going through the other. Confirmed with the shop off that sheet:

```
bottom of runner  →  underside of the drawer bottom     20
bottom of runner  →  front fixing screw centre          33.5   (+1 if the cabinet profile is
                                                                fitted before the carcass is
                                                                assembled — Blum's `*` footnote)
first screw       →  second screw                       32     (vertical, off the drawing)
bottom of runner  →  the runner's own fixing screws     54     (Blum's `min. 54*`)
outer face of the cabinet side  →  screw centre         20.5
```

That last one is Blum's **`20.5 + FA`**, where FA is the front overlay. The model states it from the
cabinet instead, because that is the datum that does not need to know what the reveal is: how far
the screw then is from the front's own edge falls out of the front's placement, so a shop that
widens its side reveal moves the front and leaves the screw where the bracket is. FA never has to
become a field.

The check that says the chain has been read off the right datum: the screw lands 2.5mm *below* the
top face of a 16mm bottom, which is where a front fixing bracket sits — level with the bottom of
the box.

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

**One MERIVOBOX figure is still unchecked**, and the app names it in the report, the Hardware tab
and Settings. The `unconfirmedFigures` list is the same contract `indicativePricing`
has for money — a figure nobody knows is unchecked is a figure that gets trusted.

- **`runnerAboveCabinetFloor`, 0mm.** How high the bottom of the runner has to sit above the cabinet
  floor. **This field is the second version of itself, and the first one was wrong in an instructive
  way.** It shipped as `runnerAboveFrontBottom`, a single 16mm covering the whole distance from the
  bottom edge of a drawer front up to the runner — and the shop's correction was that there are
  *two* numbers in there and only one of them belongs to the runner:

  > "I don't think there is a standard default but I think it should be bottom thickness + height of
  > runner install (as when using push to open runners you may need extra install height)"

  So the distance is now derived: the **cabinet bottom's real board thickness**, which the rule
  engine already knows and measures rather than nominates, plus the runner's own install height. A
  shop moving to 18mm board no longer has to re-type a hardware figure to suit. The install height
  ships at zero for the ordinary screw-fixed runner, which rests on the base; a **push-to-open**
  runner needs clearance under it to travel and is not zero, and there is no standard figure — which
  is exactly why it is a field and why it stays on the unchecked list.
**Confirmed and off the list:** the 32mm between the two front fixing screws is vertical, from the
INSERTA/EXPANDO drawing showing the two Ø10 bores one directly above the other; **`dowelOffset` at
9.5mm**, off the INSERTA knock-in drilling pattern, which also confirms Ø8 +0.1 dowels at 45mm
centres and a Ø35 +0.2/0 cup at 13mm minimum depth; and
`runnerFixingAboveRunnerBottom` at 54mm, which is Blum's `min. 54*` — the shop's reading, confirmed
when asked twice; and the **128/256 table**, which is the *distribution of the runner's fixings* —
a short runner is drilled differently from a long one, which is why the figure steps rather than
scaling. That one had been doubted because Blum heads the table "Drilling distances – base" and the
same page calls the drawer bottom panel the "base"; the shop settled it, and it agrees with the
other evidence, that both figures are whole multiples of the 32mm pitch and a loose drawer bottom
has no reason to be on the system grid.

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
is.* On the sample kitchen the two runs are identical — 87 parts, 37 lines, 717 × 447 doors,
60.5m of banding, same sheet cost, same hardware, same drilling. The only thing that moves is a
routing line on the quote. (The part count has walked up as the sample kitchen has grown — 63 in
Phase 1, 69 once §4.6 added the drawer boxes, 87 once §4.7 added a dishwasher, an end base and two
ladder bases. The *identity* is untouched by all of it, and `npm run report -- shaker-57` against
`npm run report` is still the cheapest way to check it.)
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
the side the door hinges on, runner fixings in both sides on each runner's bottom line, front fixing
pilots in the back of every drawer front, and System 32 shelf-pin rows where a cabinet has
adjustable shelves. A hardware BOM counted from the panels and priced onto
the quote as its own line. Cutlist, hardware and drilling CSV export. `npm run report` prints all of
it, which is the cheapest way to check any claim below.

**The sample kitchen, before and after.** *(Figures as they stood at §4.6. The sample has since
grown a dishwasher space, an end base and two ladder bases — see §4.7 — so the current report reads
87 parts and 554 holes. The reasoning below is unaffected.)* 63 parts became 69 — the six extra are a bottom and a back
for each of D1's three drawers, and not one of the original 63 moved by a millimetre. On top of
those: 3 MERIVOBOX sets at NL 500, 20 hinges, 20 plates, 28 shelf pins, and 460 holes across 26
parts, 72 of them in the back face. **None of those 26 parts turns over** — each is machined on one
face only, so each is a single setup. Put the same kitchen on a shaker style and 13 do, because a
routed front is worked on both faces. Hardware adds $331.04 ex GST at the indicative rates, on a job that was
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
- **The vertical chain hangs off the bottom of the runner.** See §3 for the figures. There used to be
  a single `boxFloorAboveFrontBottom` here doing two jobs and getting both approximately right; the
  shop supplied Blum's front-installation sheet and it is gone, replaced by the chain it stood in
  for. The one link the sheet does not state is named for exactly what it is and flagged.
- **FA never becomes a field.** Blum writes the front fixing's sideways position as `20.5 + FA`, from
  the edge of the front. The model states the same place as 20.5 in from the outer face of the
  cabinet side, so how far it is from the front's own edge falls out of the placement — which means a
  shop that widens its side reveal moves the front and leaves the screw where the bracket is. There
  is a test for exactly that.
- **A cup is on the B-face, which is not the same as needing a flip.** See §2 — the face being
  machined is the face that goes up, and only a part worked on *both* faces turns over.
- **`machineFront`'s guard had to change from "has features" to "has a front-style feature".** It
  used to mean "already machined deliberately". Once a door carries hinge cups, the loose test reads
  a bored door as an already-styled one and quietly ships a plain slab on a shaker kitchen — §4.3's
  failure arriving by the back door. The door-style tests now ask about `purpose === 'front-style'`
  rather than about feature counts, which is the question they always meant.
- **A pair of doors is handed by comparing the two doors to each other**, not by comparing each one
  to the middle of the cabinet, and **a side panel's hand is the end it is nearest**, not the half it
  sits in. Both were wrong first time and both only showed on a radiused cabinet — see below.
- **A mounting plate has to be within reach of the door it serves.** One system pitch. On an
  ordinary cabinet the door's edge sits over the side panel and this never bites; on a radiused one
  the curve pushes the door zone clear of the far side, and without the check four holes get bored
  for a hinge that cannot reach them.
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

#### Two bugs found by reviewing the phase before merging it, both in the same family

Neither was caught by the suite, and the reason is the same both times: **the count of holes and
their diameters were all correct.** Only the coordinate showed it. This is the third time this
codebase has learned that lesson (§4.4's former thickness axis, §5.1's flat curves) and it is why
§7 now lists feature positions as a thing that gets asserted separately.

- **Both doors of a pair hinged the same way on a radiused cabinet.** A corner radius pushes the
  door zone to one end, so at a 350mm radius on a 900 carcass both doors sit in the left half — and
  the hand was decided by comparing each door to the middle of the cabinet. Two doors swinging the
  same way, and the right-hand one's plates bored into the left side panel. Fixed by handing a pair
  **relative to each other**, after grouping by vertical band so a tall cabinet's split banks stay
  two separate pairs.
- **A plate could be bored hundreds of millimetres from its door.** Same cause, second effect: the
  inner door of a pair on a radiused cabinet has no carcass beside it at all, because the curve is
  there instead. It now reports that and bores the cups but not the plates — one door usually suits
  a radiused cabinet, which is what the warning says.

The related near-miss, fixed at the same time: a side panel's hand was "which half of the cabinet is
its middle in", and a front-right radius pulls the end panel inward far enough that at some radii it
would have been called a left-hand side. It is now "the end it is nearest", which cannot go wrong
however far the curve eats.

#### Something worth telling the shop

**The plate screws do not land on the System 32 grid at a 96mm cup setback.** They come out at 80 and
112, and the grid is at multiples of 32. A **112mm setback** would put both on it, and then *one*
line-boring pass covers the shelf pins and the hinge plates together instead of two operations on
every side panel in the job. That is a shop decision about a number, not a fault, so it is not a
warning — Settings → Hardware computes it and says which setback would do it
(`platesOnSystemGrid` / `cupSetbackForSystemGrid`).

#### What is not done, deliberately

- **The EXPANDO front fixing.** The screw-on variant is modelled; EXPANDO uses a Ø8 dowel on the
  same pattern and is the other column of the same Blum sheet. One more pair of fields.
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

### 4.7 Benchtops and ladder bases — the things that span a run

Definition of done was stated as assertions before anything was written, per §6, and all of them
pass. The whole of this section turns on one question, which §5.5 and §5.6 both asked and which is
now answered: **what owns a thing that spans a run of cabinets?**

The answer is a **run unit** — a first-class object on the project, generated from a run once and
owned from then on. `Project.benchtops` and `Project.kickBases` sit beside `Project.cabinets`.

**This deliberately breaks the rule in §2 that derived things are never stored, and it should.** A
panel is derived from a cabinet every time because nothing else decides it. A benchtop *stops* being
derived the moment somebody sets a 40mm overhang on one end, mitres a corner or puts the sink 300mm
off centre — none of which follows from the cabinets. The alternative was keying those overrides on
a run identity, and a run identity changes the moment a cabinet moves, so the overhang set last week
would silently detach from the top it was set on. The run finder is the **generator**;
`fromCabinetIds` is a record of where a unit came from, read by "regenerate" and by nothing else.

**The dishwasher, which is what made §5.5 urgent.** A gap between two cabinets used to break the run
— correct for a fridge, wrong for a dishwasher, and *the difference is not geometric*. Two gaps of
identical width in identical places. So there is now an **appliance space**: a placed, named,
measurable unit that produces **zero parts** and carries the answer. It answers two questions
separately, because they are two questions:

- `carriesBenchtop` — does the top run over it? True for a dishwasher, false for a fridge.
- `standsOnKick` — does the plinth run under it? **False by default, including for a dishwasher**,
  because a dishwasher stands on the floor.

The sample kitchen has one in it, and it is the demonstration: **one 4200mm top over the dishwasher,
two plinths either side of it.** One run finder, two answers, from the one gap.

**Two supplies, one object.** `Benchtop.supply` comes off the chosen material and is the difference
between a top that produces parts and a top that produces a purchase order:

- **shop-made** — laminated MDF, timber. A cut part. Sections, waterfall ends and the upstand go on
  the cutlist, sink and hob cutouts are `cutout` features, and it is priced as sheet and banding
  like everything else.
- **bought-in** — stone, postformed laminate. Templated on site *after* the cabinets are installed
  and charged per square metre by somebody else. It produces **no parts at all**, and that zero is
  the point rather than an omission: inventing a part so the cutlist looked complete would put a 3m
  slab of engineered stone on a sheet order.

A stone quote is **not** area × rate, and costing it that way is a real under-quote. It is area,
plus a charge per cutout by what the cutout is *for*, plus a charge per join, plus edge profiling by
the metre, all against a **minimum** — and on anything small the minimum is simply the price. A
900mm vanity top costed as area × rate comes out at about a third of the real number.

**The ladder base, as specified from the bench.** Three facts, and each is a working decision:

- **The ribs run to the floor.** Full kick height — they are what the run stands and gets levelled
  on, and everything else hangs off them.
- **The rails are cut 10mm short**, so they hang clear of the floor and the frame beds down on the
  ribs alone. On a floor that is never flat, that is the difference between packing three ribs and
  fighting a rail that rocks.
- **The face is cut 10mm over-height**, left long to be planed in on site.

**One figure there is a reading, not a fact**, and it is flagged as such by name in the terminal
report and on screen: `ladderFaceScribeEnd`. Which *end* the extra sits at ships as the floor, as a
scribe allowance, and cutting it at the wrong end is a whole run of kick faces. The four ladder
numbers live on the **construction method**, beside the kick height, because they are conventions a
shop builds to.

Generating a ladder base **switches `hasKick` off on every cabinet over it**, and it has to:
`CabinetOptions.hasKick` has always been documented as "false for a run on a continuous plinth", and
leaving both on screws a kick panel to the front of a kick face. It comes back as data to apply
rather than happening out of sight.

**Two supporting changes worth knowing about.**

`Panel.cabinetId` became `Panel.ownerId` plus `ownerKind`. A benchtop and a plinth are cut from
sheet stock exactly as a carcass part is, so they are `Panel` records on the same list — a parallel
part record is the thing this codebase exists not to do. No migration: panels are derived and never
stored, so renaming the field changed no saved file.

Assembly time is now charged per **thing that got assembled** rather than per row in the cabinet
list. An appliance space produces no parts and takes no assembly; a ladder base very much does and
is not in the cabinet list at all.

**Schema v10 and standards v6. Nothing that already existed moves.** Unlike v9 — which deliberately
re-priced a saved job upward by the hardware it always had — this one changes nothing at all: a v9
job comes forward with **no benchtops and no ladder bases**, so there is nothing new to cut and
nothing new to charge, and the test asserts the total to the cent. Generating a top for every run on
the way through was considered and rejected: a benchtop's *material* is the whole question, and
guessing stone would add thousands to a quote the user has already sent.

**The 3D view keeps drawing a top over an un-generated run, as a ghost.** Before this, the viewport
worked out a solid slab for every run on the fly — a slab that was never on the cutlist, never on
the quote and never in the job file, and looked exactly like a benchtop the job had. It is still
drawn, because seeing the space is useful, and it is drawn transparent so nobody can mistake it for
something specified.

**Where to look:** `model/runUnit.ts` for the ownership argument; `model/benchtop.ts` and
`model/kickBase.ts` for the two objects; `project/runs.ts` for the run finder, now parameterised by
purpose; `project/generate.ts` for generate and regenerate; `rules/runUnits.ts` for the part
builders, with each part's unit-space volume documented; `costing/benchtopCost.ts` for the
fabricator's charges; `rules/specs/applianceSpace.ts` for the gap that is not geometric.
`tests/runUnits.test.ts` is the contract and carries the longhand charge arithmetic in its header.

### 4.10 Applied end panels

> "I also need applied end panels asap — that's a huge miss"

It was. A kitchen drawn in this app ended a run in carcass melamine. The odd part is how much of
it was already in place and waiting: `'end-panel'` had been in `PanelRole` since Phase 1,
`STYLED_FRONT_ROLES` already listed it so a shaker kitchen would get shaker ends, and
`machineFront`'s comment named it as the thing coming next. The only missing piece was a builder.

**Which end is asked for, never derived.** `CabinetOptions.appliedEnds` is a list of named ends,
with no default, for the same reason `radiusCorner` has none: nothing in the model can work out
which end of a run is open, because a cabinet does not know its neighbours. And a panel on the
wrong side is the worst kind of wrong — right size, right banding, right cutlist line, and a
remake. Two tick boxes in the inspector; no cleverness behind them.

**Applied means applied.** The panel goes *outboard* of the carcass — x ∈ [−t, 0] on the left,
[W, W + t] on the right — and the cabinet's width does not change. The side underneath is the same
side it always was. A test asserts every other part of the cabinet is byte-identical with and
without the option, because applying a panel is not a change to the cabinet; the day that fails,
some builder has started reading `appliedEnds` and quietly re-cut a kitchen.

**Its front edge comes off the door face, not the carcass.** The whole job of this panel is to
finish in the plane the fronts finish in, so it reads `finishedFrontZ` — 580 on a 560 carcass with
18mm doors and the 2mm standoff, which is the number the shop gave. The same plane a radiused
corner has to land in. One resolution point, so the two cannot drift apart by 2mm.

**How far it drops is the cabinet's own anchor height, not the method's kick height.** This was
wrong first time round and the unit tests did not catch it — a browser check on the sample kitchen
did. That kitchen stands on a ladder base, which switches `hasKick` off on every member *without
moving them*: the plinth is built to fill the gap that is already there. Reading the drop off
`kickHeight` gave those cabinets a 720mm panel with the end of the plinth left open beside it. A
plinth owns its height and `model/kickBase.ts` says so explicitly. The one figure that is right
whatever is underneath — own kick, run plinth, or nothing at all — is how far the carcass bottom
sits off the floor, which is the cabinet's anchor. Taking that gets all three right without
knowing which it is, and it deleted a warning rather than adding one.

**The back edge is cut long and never banded.** 20mm past the carcass, to be planed into the wall.
Banding an edge that is about to be planed off is tape thrown away, and worse, it tells whoever
fits it that the edge is finished. The 20mm is a guess and says so, on the unconfirmed list beside
the ladder figures — which, while we were there, turned out never to have been shown on screen at
all. Both are now under **Not yet checked at the bench** in the joinery settings.

**Where to look:** `rules/parts.ts` for `appliedEndPanels` and `appliedEndProblems`;
`model/cabinet.ts` for the option and `hasAppliedEnd`; `model/construction.ts` for the three shop
conventions and `withAppliedEnds`; `tests/appliedEnds.test.ts` for the contract, with the reference
panel worked longhand in its header and a note on what each group of assertions is really guarding.

### 4.11 Shelf-pin rows — clear of the ends, and centred

Two corrections to one row of holes, both reported from the bench, and the second is the one worth
reading.

> "adjustable shelf holes should not go full height in the end panel, it should have a setting that
> sets how far off the top, bottom and fixed shelves. we also need to ensure that they are always
> equidistant so you can't end up with a flipped back and the holes offset."

**It ran through the ends.** From one pitch above the bottom edge to one pitch short of the top:
holes in the zone where the bottom panel is housed, more in the zone the rails occupy, none of them
usable by a shelf and all of them exactly where a dowel or a confirmat wants to be.
`systemHoleEndClearance` — 96mm, three pitches — is how far the first and last keep clear.

**It was indexed off the bottom edge, so a flipped panel did not line up.** This is the subtle one.
System 32 says bore at multiples of the pitch from the bottom edge, and that *is* interchangeable —
but only when the panel height is itself a whole number of pitches. Turning a panel end-for-end
puts a hole that was at `y` at `H − y`. A 720mm side is 22.5 pitches, so the old row's top hole at
672 landed at 48 on the flip: every hole out by half a pitch, on a part that is otherwise identical
either way up. Two sides cut from one programme, one of them rotated, and the shelf rocks.

So the run is **centred in its clear span**: the gap at the bottom equals the gap at the top by
construction, at any height. The holes are still on the pitch — a line borer sets one offset and
steps — they simply no longer start at a whole multiple of it. The centring is exact and
deliberately not rounded to a tidy number, because rounding is the one thing that would put the
asymmetry back, silently, at some heights only.

**A fixed shelf splits the run rather than ending it**, so a cabinet with one gets pins above and
below. Nothing produces a `shelf-fixed` part yet; the borer reads the built parts rather than
assuming none, so the day something does, this is already right. Note what it means for symmetry: a
panel with an *off-centre* fixed shelf comes out asymmetric, and that is correct — the housing for
that shelf is off-centre too, so the panel was never flippable. Symmetry is preserved exactly where
it exists.

**This migration moves holes and says so.** Project v15 and standards v11 fill in the 96mm; every
saved job's rows get shorter at both ends and the remaining holes move. It is the second migration
that cannot claim to change nothing — `withFrontStandoff` was the first. No part changes size and no
part moves: a side panel is the same rectangle in the same place with a different set of Ø5 holes
in it, and a cutlist comparison against a fresh job asserts exactly that. Migrating to a zero
clearance would not have preserved the old positions either, because a zero clearance is centred
too — so there was nothing to preserve them for.

**Where to look:** `rules/shelfPins.ts` is the whole thing, pure and with the argument for centring
written out; `rules/boring.ts` for how a side panel's span and its fixed shelves are handed to it;
`tests/shelfPins.test.ts` tests the arithmetic directly — including a sweep of every height from 300
to 2400, because equidistance is a property rather than a number and the heights where it fails are
the ones nobody types into a test.

### 4.12 The cabinet profile is fixed at four points

> "two holes for the cabinet side is wrong it should be 4"

The runner's fixing data was a single spacing per length band — 128 or 256 — applied as "this far
behind the front fixing", giving two holes per runner per side. Both halves were wrong.

**The figures came off the wrong table.** 128 and 256 describe the drawer bottom. They were adopted
for the cabinet side because both are whole multiples of 32, and a runner landing on the same grid
as everything else in a frameless carcass is a tidy story. It was a story. The multiple-of-32
argument was written into the code as if it were a source, and it read as one — which is the part
worth remembering: **a figure that is plausible is not a figure that has been read.**

**The record now holds positions, not spacings.** Every figure on Blum's "Cabinet profile fixing
positions" sheet is dimensioned back from the front edge of the side panel, so `fixingPositions`
is too, and there is no arithmetic between the sheet and the drilling for anyone to get wrong.
Cabinet profile 450, 40 kg — the class shipped here:

```
  front         37 and 69, at every length
  NL 270–350    rear screws at 160 and 192
  NL 400–600    rear screws at 224 and 256
```

Which rear pair belongs to which band is settled by the extension lines on the sheet: 160 and 192
run up into the NL 270–350 diagram's rear bracket, 224 and 256 into the NL 400–600 one's.

**These are the system-screw positions, and that is the second thing the sheet was quietly saying.**
Rows A and B on each diagram are two fixing options — chipboard screws and system screws — which is
why the front bracket carries a chain of three dimensions rather than two. I read across both
patterns at once and reported the front pair as ambiguous; it was not ambiguous, it was two answers
to two different questions. From the shop: *"the confusion is coming from chipboard screws or system
screws... I want to default to system screws so 37 + 32 as standard."* Every pair is 32 apart, front
and rear, which is what fixing with system screws means. The 18 belongs to the chipboard option and
is not modelled — the same treatment INSERTA and EXPANDO T already get.

That is worth sitting with, because it is the **same error as the 128/256 in a different coat**.
Both times a figure was read out of a document that held more than one answer, and both times the
missing question was "which of these am I looking at?"

**The same sheet exists for TIP-ON BLUMOTION and carries identical figures.** Where the profile is
screwed to the side does not change between push-to-open and the ordinary runner, so one table
covers both. Worth recording rather than rediscovering.

**Project v16 and standards v12 move drilling and cannot pretend otherwise.** A saved job carries
its own copy of the hardware library, so the old shape is on disk. The shipped system is given the
sheet's positions — the one case where a migration *should* overwrite, because carrying the old
figures forward faithfully would be preserving an error the shop has already caught. A runner system
a shop added themselves keeps exactly what it had, restated as two positions; we have no sheet for
their runner and no business handing it Blum's pattern. No part changes size and no part moves, and
a cutlist comparison asserts it.

**Where to look:** `model/hardware.ts` for `RunnerFixingPositions`, `runnerFixingPositions` and
`withProfileFixingPositions`; `library/blum.ts` for the sheet figures with their provenance;
`rules/boring.ts` walks the list rather than naming a front and a rear, so a system with a different
count needs nothing there.
### 4.8 Guillotine nesting — Phase 3

Definition of done was stated as ten assertions before anything was written, per §6, and all of them
pass. The short version: **every cut runs edge to edge, because that is what a panel saw does**, and
**the cut sequence falls out of the packing rather than being derived from it**.

**What shipped.** Every part in a job laid onto real sheets, per material, with the sheet size
chosen by what the job costs. A **Nest** tab drawing each sheet, coloured by which cabinet a part
belongs to. Two CSVs — the layout, and the cut sequence to work from at the saw. A NEST section in
`npm run report`. Offcuts reported above the shop's own smallest-useful figure. And the quote's
sheet cost is now whole sheets off the count instead of fractional ones off an assumed yield.

**The sample kitchen.** 87 parts onto 5 sheets: four of white HMR 16mm at 95/93/80/6% and one of
Classic White 18mm door board at 75%. Sheet goods went from **$593.93 to $720.00**, and the whole
job from $7,449.31 to $7,636.52 — 2.5% on a job that was being quoted a third of a sheet short.

#### Decisions worth not undoing

- **The packer builds a tree of cuts, not a list of free rectangles.** The list is the usual way to
  write this and it is faster, but it cannot say how the parts come off the sheet — and "how it
  comes off" is the entire deliverable at the saw. Placing a part *is* cutting a piece in two, so
  the sequence is produced rather than reconstructed, and nothing can get out of step with it.
- **`replayCuts` is the proof, and it is deliberately ignorant.** It knows the sheet, the cuts and
  the kerf, and nothing about the tree. It puts the sheet on the bench and follows the list; a cut
  that names a piece not there, or lands outside it, or fails to span it, has nowhere to be made.
  What is left at the end has to be exactly the parts plus the offcuts. Corrupting one cut by 5mm
  produces six complaints; swapping two produces nine; pretending the kerf is zero produces
  twenty-nine. **That is what makes this checkable rather than plausible**, and it is the §7 lesson
  for the fourth time — a nest with a part 8mm out looks exactly as convincing as a correct one.
- **Kerf does not ship at zero.** Every other figure in this codebase that changes a saved job ships
  off until somebody enters it — `actualThickness`, `sheetEdgeTrim`. Kerf cannot, because zero is
  not a conservative default here, it is a *claim*: that the saw removes no material. Two 600mm
  parts fit across a 1200mm sheet at zero kerf and do not at 3.2. It ships at 3.2, a thin-kerf panel
  saw blade; a router nest wants the cutter diameter.
- **Kerf and edge trim are the shop's, not the board's.** A sheet size and a price belong to the
  material; what your blade takes out belongs to your saw. Same split as the hinge drilling distance
  living on the construction method rather than on the hinge.
- **Grain is a lookup, not a boolean.** "May this part rotate?" is the wrong question, because two
  of the six cases *require* rotation — a part whose grain runs across it, on a board whose grain
  runs along, has to be turned. A nester that only knows how to decline rotation lays those the
  wrong way round and passes every test that checks the part fits. `orientationsFor` takes both
  records and returns the ways round that are legal, which may be one, and which one it is matters.
- **One sheet size per material, chosen by cost.** Every size the material comes in is nested in
  full and the cheapest wins; a size that cannot hold every part loses to one that can, however
  cheap it is per square metre. A sheet size is what goes on the supplier order, and a nest mixing
  3600×1800 and 2400×1200 across one material is an order whose first line is "work out which of
  these is which". See §5.8 — there is a real cost to this and it is written down.
- **Eighteen strategies are run and the best kept.** A nest is a search, and no single heuristic
  wins on every job — that is the state of the art, not a gap here. The packer is cheap enough to
  run eighteen times on a kitchen, and picking one in advance costs sheets to save microseconds.
  The comparison is fewest unplaced, then fewest sheets, then **biggest single offcut** — between
  two nests that buy the same board, the one that leaves its waste in one piece is worth more,
  because that piece goes on the rack and gets used. Every comparison is strict and the strategy
  order is fixed, so the same job nests the same way every time it is opened.
- **The quote carries the nest it was costed from.** `CostBreakdown.nest`, read by the report and by
  the Nest tab. Nesting the job twice and comparing the numbers is the kind of thing that agrees
  until the day it doesn't.
- **A part too big for any sheet is charged one, as a floor.** It cannot be cut as drawn, so there
  is no honest figure — but a zero would quietly take the part off the quote. It is warned about by
  name, it is on the nest CSV marked `NOT NESTED`, and the warning says the figure is a floor.
- **Costing no longer asks whether a part fits.** It used to, with `smallestSheetFitting`; the nest
  answers it now. Two places testing the same thing is two places that can disagree.
- **A part's share of the board is a share, not a price.** Which part pushed a job onto its fifth
  sheet is not a question with an answer. The shares are apportioned by blank area with the rounding
  remainder **carried** rather than dropped, so the parts column sums to the material's cost
  exactly — a table a few cents off the quote is the sort of thing that costs an afternoon and
  cannot be defended when somebody finds it.

#### What this found, which is worth knowing

**Measuring a board no longer changes what a job costs.** Two tests used to assert the opposite, and
they were right at the time: when sheet cost was a continuous function of area, 0.6mm off every
carcass part moved the money. Under whole sheets it does not, unless it happens to tip a part onto
or off one. Both tests were rewritten to assert the truer thing — the parts move, the sheet order
does not — because the tempting reading of a nest is that a smaller part is a cheaper part, and it
is not.

#### What is not done, deliberately

- **True-shape nesting.** See §5.8. It is a router's problem and a different cutting model.
- **Mixing sheet sizes within one material.** See §5.8, with the sample kitchen's own example.
- **Offcuts are not stock.** They are reported, never consumed. A nest that quietly ate last job's
  leftovers would be a nest nobody could check against the board actually in the shop.
- **Nothing enforces a stage limit.** The sample kitchen's deepest cut is 16 stages, which a beam
  saw does happily and a basic two-stage saw does not. `Cut.stage` is on every cut and the report
  prints the deepest, so a shop with that constraint can see it. Inventing a limit nobody has asked
  for would be worse than reporting the number.

**Where to look:** `nest/guillotine.ts` for the packer, the cut tree and the replay, with each
heuristic's reasoning written out; `nest/nest.ts` for materials, grain and sheet-size choice;
`costing/costing.ts` for the apportionment; `cutlist/export.ts` for the two CSVs;
`app/panels/NestPanel.tsx` for the drawing. `tests/nesting.test.ts` is the contract and carries the
longhand reference figures in its header.

### 4.9 G-code — Phases 4 and 5

**Asked for directly**, after Phase 3 shipped. The machine was named as a **KDT nesting router**, with
a **boring head**, and the output wanted **per nested sheet**. Everything below follows from those
three answers.

**Read this first, and do not let it get lost.** *None of this has been run on a machine.* The
**geometry** is asserted and can be trusted as far as tests go — a hole is where the model says, a
part is offset by exactly the cutter's radius, an arc arrives as an arc, the ordering is safe. The
**dialect** is not: whether this controller wants `G81` or explicit plunges, whether Z zero is the
material or the table, what selects a drill spindle. Those are unknowable from here and knowable in
about ten minutes from one `.nc` file the machine already runs. Until one has been compared against
`post/iso.ts`, treat the output as a draft and simulate or air-cut it.

`.nc` is a file extension, not a dialect. What it does tell us is worth something — the machine
takes plain-text ISO G-code rather than a proprietary format the way a Homag (`.mpr`) or a Biesse
(`.bpp`) does — so the *shape* of what is written is right even where the detail is not.

**What shipped.** `cam/` turns panels plus the nest into an ordered, machine-independent operation
list. `post/` turns that into G-code for a named machine. A machine picker and a `.nc` download per
sheet on the Nest tab, a CAM section in `npm run report`, and two shipped profiles: the KDT, and a
generic ISO one for simulating. The sample kitchen comes out as **5 programs, 641 operations, 554
holes** — the same 554 the drilling sheet has had since §4.6, because CAM reads the features rather
than inventing any.

#### Decisions worth not undoing

- **The operation list is a layer, not a step.** Nothing in `cam/` mentions a G-code word, and that
  is the test of whether a second machine is a second *profile* or a second CAM layer. If something
  in there ever needs to know what controller it is talking to, the split has failed.
- **The machine is data.** `MachineProfile` carries the dialect, the datum, the tool table, the
  envelope and the code words. A second machine is a record.
- **Which face goes up is CAM's decision and nobody else's.** The nest does not care — a saw cuts a
  rectangle whichever way up it is. A router cares completely, because the spindle reaches the face
  that is upward and nothing else. So a part is laid with its machined face up, which for a door
  means **back up**, because that is where the cups are.
- **Turning a part over mirrors it, and that is the most dangerous line in the phase.** A cup 22.5mm
  from the left edge of a door is 22.5mm from the *right* edge once the door is face-down on the
  bed. Get it backwards and every handed part in the job is bored on the wrong end — same holes,
  same diameters, same count, passing any test that counts them. This is §4.4's former axis and
  §4.6's mounting plate for the third time. `cam/sheetSpace.ts` owns the mapping and everything goes
  through it.
- **A mirror reverses an arc, and two negations cancel.** Worth writing out because it was wrong
  first time. Mirroring a ring negates every bulge; reversing the traversal to put the winding back
  counter-clockwise negates them again. So the bulge carried across is the **original number**.
  Negating once — the obvious thing to write — produces an arc bowing the other way, which is not a
  slightly different curve but the complement, cutting through the part. Caught by working a
  quarter disc through by hand before the code ran, and pinned by a test that measures where the
  arc's *centre* lands rather than reading the number back.
- **The tool offset is computed here, not left to the machine.** Every controller has G41/G42 and
  every one implements it slightly differently. A compensation bug is a crash, it happens at the
  machine, and no test written here could see it. An offset computed in the model is geometry, and
  geometry can be asserted: a 500×300 part with a 6mm bit gives a 506×312 centreline with 3mm
  corners, which is a thing a person can check in their head.
- **Boring first, perimeters last.** A part that has been cut out is loose. Boring one the vacuum
  is no longer holding is how a bit breaks and a part becomes a projectile. This is the one ordering
  rule that is a safety rule rather than an efficiency one.
- **A hole with no bit for it is named, never bored with the nearest one.** A Ø35 cup needs a 35mm
  boring bit; substituting a 12mm cutter would need a helical path this does not generate, and doing
  it silently would make the wrong hole.
- **The post refuses rather than warning.** A page that warns you and still offers the file is a
  page where somebody clicks the file. A refused program is not written at all.

#### The check that connects Phase 3 to Phase 5, and what it found

**A job nested for a saw cannot be cut on a router**, and there are two independent reasons that
are both invisible on screen:

- **kerf.** The gap between parts has to be at least the cutter. Nested at 3.2mm and cut with a 6mm
  bit, the toolpath separating two parts is wider than the gap it runs in — it takes 1.4mm off
  *each neighbour*, on every shared edge, on every sheet. Every part undersize, not one of them
  looking it.
- **sheet edge trim.** A part sitting hard against the sheet edge has to be cut from outside itself,
  and outside the sheet edge there is no sheet. The trim has to be at least the cutter's radius.

The first was designed for; **the second was found by running it** and is the more interesting one,
because nothing about a nest suggests it. Both are reported as one problem, because it is one
decision.

**The shipped defaults were changed as a result.** They went out at 3.2mm and 0 — saw figures — and
they were wrong for a shop with a nesting machine: the refusal was firing on the defaults, which is
a poor default. They are now 6 and 6. It costs nothing: the sample kitchen nests onto the same five
sheets at 3.2/0, 6/6 and 8/8, for the same $720.

#### The other bug worth recording

**Onion skin and spoilboard overcut are mutually exclusive, and were being applied together.** The
perimeter depth came out as `thickness + overcut − leaveUncut` = 16.3mm into 16mm board, which is
not an onion skin at all — it is a clean through cut with a smaller overcut, and every small part
would have come loose under the spindle exactly as if the setting had been left at zero. Leave
material and you never reach the underside; leave none and you go past it. There is no arithmetic
that does both. It now cuts to 15.8mm, and `perimeterDepth` is the one place that decides.

#### What is not done, deliberately

- **The drill bank is switched off.** It is the single biggest time saving available here — a
  System 32 row in one hit instead of twenty-one plunges — and it is the part of a machine that is
  least standard. A bank configured wrong fires a spindle that is not over the hole it thinks it is,
  so it stays off until somebody reads the codes off the machine. `DrillBank` is the field waiting.
- **Rebates are not machined.** They want a stepover pass and nothing in the shipped specs emits
  one. Reported, so a part with one says to cut it on the saw.
- **A groove wider than the cutter** is reported rather than cut in several passes.
- **Pockets are cleared only when rectangular.** Every pocket this codebase produces is one — a
  shaker recess — and a clearing path for a general outline would be written on guesswork.
- **No ramping into a plunge**, no lead-in or lead-out arcs, no climb/conventional choice. All real
  refinements; none of them is a correctness problem.
- **No simulation or backplot.** Still the hard gate before anything runs.

**Where to look:** `cam/sheetSpace.ts` for the transform and the flip, with the arc reversal reasoned
out; `cam/offset.ts` for the cutter offset; `cam/operation.ts` for the vocabulary and the ordering
rule; `cam/operations.ts` for the generator; `post/machine.ts` for what a machine is;
`post/iso.ts` for the writer; `post/check.ts` for what it refuses; `library/machines.ts` for the
KDT profile and, at the top, **how to make it real from one `.nc` file**. `tests/cam.test.ts` is the
contract and carries the longhand figures in its header.

---

## 5. Open items, in the order I'd do them

**5.2 has shipped — see 4.6.** What is left of it is Hettich and a handful of gaps, listed below.

**5.5 and 5.6 have shipped together — see 4.7.** They wanted the same answer to "what owns a thing
that spans a run?", so doing them apart would have meant answering it twice.

**Phase 3 has shipped — see 4.8.** What is left of it is in the new §5.8, and none of it blocks
anything.

**Phases 4 and 5 have shipped — see 4.9.** What is left of them is §5.9, and the first item on it is
the only one that matters.

**If asked which to do next: get one `.nc` file off the KDT and pin the dialect.** It is not a
phase, it is ten minutes, and until it is done every program this tool writes is a draft that has to
be simulated. `library/machines.ts` says at the top exactly what to compare and in what order. Every
other open item in this document is worth less than that one.

**A note that was here has been removed, and it is worth saying why rather than leaving a gap.**
Both this document and `docs/architecture.md` carried a suggestion that Phase 3's CSVs could be
imported into a third-party CAM package the user's contact runs, closing the loop at the saw
without waiting for Phases 4 and 5. It traced back to the very first commit, nothing in the repo
sourced it, and when it was put to the user they did not recognise it. **Do not reintroduce it.**
If a bridge to somebody else's CAM is ever worth building, it starts with the user saying whose
and what it imports — not with a session inferring a piece of shop equipment.

**5.7 is technically unblocked and should still wait.** The shared builders it wanted exist, but
it inherits the three judgement calls listed in 5.0 — and none of those has been checked against
a real job yet, so starting it now risks building the same mistake in two places. It also still
needs an answer to whether the routed piece is kerfed to bend or machined from something thicker;
a developed length only means something if the piece actually bends.

What is left of 5.3 is mostly Phase 4 work. 5.1 and 5.0 are both small tails.

### 5.0 A corner radius — what is left after 4.5

The feature is built and merged; see **4.5** for what it does and why it is that way. What
remains are gaps rather than missing work, and none of them blocks anything.

- ~~**Nesting reads a radiused corner as its bounding box.**~~ **Answered, and the answer is that
  this was never a gap for a saw.** A guillotine cut cannot follow a curve, so the sheet has to hold
  the blank and the curve is cut from the blank afterwards — see 4.8. What the nest does have to get
  right is that the blank is measured round the *outside* of the arc, which `panelExtent` has done
  since §4.4 and `tests/nesting.test.ts` now asserts on a skin and a bowed shelf. A router nest that
  reads the true shape is §5.8.
- **The plan view draws a cabinet's footprint as a rectangle**, so a radiused corner reads
  square there. Cosmetic.
- **A benchtop over a radiused base cabinet is still a rectangle.** The cabinet's box does not
  shrink, so the top is the right size — but its corner is square over a round cabinet. A benchtop
  is its own object now (§4.7), so this is a real thing to fix — give the top an arc — rather than a
  limitation of a slab the viewport was inventing.
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

- ~~**Nesting doesn't understand a curve.**~~ **Half of this was a misreading and is now
  corrected.** A radiused shelf reserving the rectangle it fits inside is not a gap for a *saw*, it
  is what cutting one on a saw means: the blank comes off the sheet and the curve is cut from the
  blank. §4.8 says so at length. The offcut between the curve and the corner is genuinely invisible
  to a **router**, which could nest another part into it — and that is §5.8, a different cutting
  model rather than a better version of the same one.
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
- **The one unconfirmed MERIVOBOX figure**, `runnerAboveCabinetFloor` — see §3. It only bites on a
  push-to-open bank, and the app is already saying so by name.
- ~~`dowelOffset` on the hinge.~~ **Confirmed** at 9.5mm from the INSERTA knock-in drilling pattern,
  and off the unchecked list.
- **The EXPANDO front fixing** — the screw-on variant is done; EXPANDO is a Ø8 dowel on the same
  pattern.
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

- ~~Cabinets snap to a wall but not to each other.~~ **Done.** `snapToNeighbour` in
  `project/wallPlacement.ts`, tried before the wall snap and winning within 60mm. It resolves both
  cabinets into the **run's own frame** before comparing, which is the lesson the benchtop
  run-finder had to learn — down the east wall two cabinets side by side share an X entirely, so
  the test for it is written on that wall rather than on the south one where a wrong
  implementation passes. Same yaw, same height off the floor and same line across the run are all
  required, and each rules out a real mistake rather than being tidiness.
- ~~Changing the front material doesn't change the colour on screen.~~ **Done.**
  `SheetMaterial.colour` is a hex the viewport prefers over the role colour; unset falls back
  exactly as before. It is a **screen approximation** and nothing is cut, priced or ordered from
  it — the decor name is the fact. Editable per job under Settings → Materials, and reported in
  the standards diff so a changed colour cannot make a job read as drifted with nothing listed.
  **One flat hex per decor was always the cheap version**, and the bench has since asked for real
  textures — see §5.8. ~~Nothing backfills this field onto a job saved before it existed.~~ **Fixed
  in project v12 / standards v8**, after it was reported from the bench as "changing the door to
  Notaio Walnut has done nothing" — the picker was working the whole time and the picture was not
  moving, because the job's own copy of the material list had no colours in it at all.
- Cabinets can be dragged but not rotated with the mouse; yaw is typed, or set by snapping to
  a wall.
- The custom cabinet excludes itself from benchtop runs — a banquette shouldn't get one, but
  a bench-height custom carcass arguably should. Needs a rule, or a per-cabinet flag. Note the
  appliance space (§4.7) is the shape of the answer: a flag saying what a unit does, not a guess
  from its geometry.
- ~~Nesting still estimates sheets from area × a yield allowance.~~ **Done — see 4.8.**
- A corner where two runs meet at 90° leaves whatever gap the cabinet sizes leave; there is no
  corner cabinet type and no check that the two runs don't foul each other's doors. This was waiting
  on the hardware rules, which now exist — `doorSwing` is read by the boring pass, so the information
  needed to work out whether two doors foul each other is in the model. Still nobody's asked.
### 5.5 Benchtops — what is left after 4.7

**Built and merged; see 4.7 for what it does and why.** A benchtop is its own object now, generated
from a run and then owned, and it holds both supplies — cut in the shop, or bought in per square
metre. What remains:

- **Waterfall and mitred ends are modelled but only lightly proved.** A waterfall produces a panel
  and is charged as extra area; a mitre is charged as a join. Neither has been checked against a
  real job, and a mitred corner between *two* tops is not linked — each top knows its own end is
  mitred and nothing knows they are the same corner. Worth doing when somebody actually orders one.
- **The joins are explicit and nothing suggests them by default.** `suggestedJoins` exists and the
  UI offers it on the "add a join" button, but where a join really goes is a judgement about what is
  least visible and the model should keep out of it.
- **Drainer grooves and tap-hole *sets*** are not modelled. A tap hole is a cutout like any other; a
  drainer is a pattern of shallow grooves and would be a `groove` feature run to a recipe.
- **A benchtop over a radiused base cabinet is still a rectangle.** The cabinet's box does not
  shrink, so the top is the right size, but its corner is square over a round cabinet. Now that a
  top is a first-class object with its own profile, this is a real thing to fix rather than a
  limitation of a derived slab — §5.0's note about it can be closed by giving the top an arc.
- **A shop-made top's *thickness* is the sheet's.** A 33mm laminate top built up from 18mm MDF and a
  substrate strip is two parts and a lamination, and the model cuts it as one 18mm part. Fine for a
  timber or single-thickness top; wrong for a built-up one.
- **Nothing links a top to a splashback.** The upstand is a strip on the top. Tiled and glass
  splashbacks are somebody else's trade and should probably stay out.

### 5.6 The ladder base — what is left after 4.7

**Built and merged; see 4.7.** Ribs to the floor, rails cut short, face cut over-height. What
remains:

- **`ladderFaceScribeEnd` is unconfirmed** and says so by name in the report and on screen. Which
  end of the kick face the 10mm sits at is a reading of the spec, and cutting it at the wrong end is
  a whole run of kick faces. Ten seconds with a tape closes it.
- **Ribs are evenly spaced, not seeded from the cabinet joins.** Deliberate — the frame is owned, so
  it must not start reading the cabinets again — but a shop that wants a rib under every carcass
  join has a case, and it would be a per-unit list of rib positions rather than a rule.
- **Nothing joins two plinths end to end.** Either side of the sample kitchen's dishwasher there are
  two separate frames, which is correct, but a long run broken by a fridge gets two frames with no
  record that they are one plinth line.
- **No levelling legs.** The ribs are what it stands on and the model says so; adjustable legs under
  a ladder base are a different way to build it and would be hardware rather than parts.
- **The face is not banded.** Its bottom edge is planed on site so it cannot be pre-banded and its
  top is hidden, but the two *ends* show at the end of a run. Left alone rather than guessing a
  convention.

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

<<<<<<< HEAD
### 5.8 Seeing it properly — decor textures and a wireframe view

**Both raised from the bench, and both are about the 3D view earning its keep.** Neither changes a
part, a price or a hole; both change whether the view is worth showing somebody.

#### Real decor textures, not an approximate colour

> "i don't want vaguely correct colour doors, i want textures and colours"

Fair. `SheetMaterial.colour` (§5.4) is one flat hex per decor and it was always the cheap version —
enough that a walnut door does not render the same off-white as a white melamine carcass, and no
more than that. A Notaio Walnut door and a Sepia Oak door are two browns.

What this wants is an **image per decor**, mapped onto the part:

- A `texture` field on `SheetMaterial`, beside `colour`, which stays as the fallback for any decor
  that hasn't got an image. The suppliers publish swatch images; they are the shop's to hold.
- **Scaled in millimetres, not in UV units.** A woodgrain repeat is a real distance — of the order
  of a metre — so the map has to be laid on at a real-world scale or a 300mm drawer front and a
  2000mm tall door end up with grain of two different sizes. The texture record therefore carries
  the physical size of one repeat.
- **Rotated by the part's own grain.** This is the part that makes it more than decoration.
  `SheetMaterial.grain` and `Panel.grain` already exist, and a texture laid down the part's length
  or across it *by that constraint* turns the 3D view into a **check on grain direction** — a door
  with the grain running the wrong way stops being a line in a cutlist note and becomes something
  you can see. That is worth having.

**It stays a screen approximation, and the note that says so must stay with it.** Nothing is cut,
priced or ordered from an image any more than from a hex — the decor *name* is the fact, and it is
what goes on the supplier order. A texture is more convincing than a colour, which makes saying so
more important rather than less.

The one genuinely open question is where the images live: bundled into the app (fixed set, no
setup), or loaded per job from a folder the shop points at (any decor, but a job that has to carry
its images with it). Worth asking before building.

#### A wireframe view

A display mode that draws edges only, alongside 3D and Plan. Useful for three things a solid render
cannot do: **seeing the construction** — where a shelf lands, how a rail sits, which way a back is
housed; **seeing through to the interior** without hiding a front; and **checking a joint** where two
parts meet, which a shaded surface hides.

The pieces are already there. Every panel's outline is in the model, `Boring.tsx` already draws hole
rings as line geometry rather than meshes, and `PanelMesh` already has the panel's own profile. It is
a third render path beside the solid one, not a new source of geometry.

Worth doing at the same time as the textures, because they are the two ends of the same slider —
one for showing a client, one for checking the build — and because both live in the same three files.
=======
### 5.8 Nesting — what is left after 4.8

**Built and merged; see 4.8 for what it does and why.** What remains, none of it blocking:

- **One sheet size per material, and it costs something real.** The sample kitchen's fourth carcass
  sheet holds a single 720×544 side panel. A 3600×1800 costs $138 and a 2400×1200 costs $63, so
  finishing that job on a small sheet would save $75 — and the model will not, because it picks one
  size per material. That is a defensible ordering decision (§4.8) rather than an oversight, but the
  number is real and the fix is bounded: `MaterialNest.sheet` becomes plural, `NestedSheet` already
  carries its own `usable` rectangle, and the search gains a per-sheet size choice. **Worth doing
  the next time somebody actually looks at a sheet order and asks about it.**
- **True-shape nesting, for a router.** A CNC can cut a part out of the middle of a sheet, so a
  radiused shelf's corner offcut could take another part — which a guillotine can never do. This is
  Phase 6 in the README's roadmap and it is genuinely a *second* nester rather than an improvement
  to this one: different cutting model, different validity rule, and no cut sequence at all because
  a router has a toolpath instead. The arcs are all in the model waiting for it. Do not try to make
  one nester do both.
- **The last sheet is not balanced.** First-fit fills sheets 1 to 3 and leaves the remainder on the
  last one, which is why the sample's fourth sheet is at 6%. Spreading the parts evenly would look
  tidier and cost exactly the same, so it is deliberately not done — but a shop that wants to cut
  one sheet a day rather than all four might disagree.
- **Offcuts are reported, never used.** Recording what is actually on the rack and nesting into it
  is a real feature and a big one: it needs stock to be a thing the app owns, with offcuts consumed,
  returned and going stale. Until then a nest can be checked against the shop; after it, it cannot
  unless the stock record is right.
- **Nothing enforces a two- or three-stage limit.** `Cut.stage` is reported and the sample reaches
  16. A shop whose saw cannot do that needs the packer constrained rather than the number printed,
  and it is a real constraint to add — but nobody has said their saw has it.
- **Bendy ply's barrel/column form still isn't recorded**, and now it matters more: it constrains
  which way a skin may be turned on the sheet, which is exactly what `orientationsFor` decides. It
  is *not* `GrainDirection` — see 5.1 — so the nester currently turns bendy ply freely. On a job
  with a radius in it, check the sheet before cutting; the parts carry a note saying so.
- **No labels or barcodes on the nest.** A part's position is on the CSV and on screen. A shop that
  wants a printed label per part is asking for a layout job rather than a nesting one.

### 5.9 G-code — what is left after 4.9

**Built and merged; see 4.9.** In rough order of what it is worth doing:

- **Pin the dialect against a real `.nc` file.** The one item that matters, and it is not
  development work. Take one program the KDT already runs — ideally one with drilling and one that
  cuts parts out — and compare it line for line against what `post/iso.ts` writes. The five things
  to check, in order, are listed at the top of `library/machines.ts`: **Z datum**, tool change,
  drilling style, the drill bank, then feeds. Until that is done, `unconfirmed` stays populated and
  every program says so in its own header.
- **Turn the drill bank on**, once its codes are known. Biggest time saving available: a System 32
  row in one hit instead of twenty-one plunges, on every side panel in every job. `DrillBank` is the
  field and `post/iso.ts` is where the grouping would go — bores on the same line, at the bank's
  pitch, become one selection and one plunge.
- **Ramp into a plunge**, and lead-in/lead-out arcs on a perimeter. A full-width plunge at the start
  of a cut is hard on a bit and leaves a mark. Real, and not a correctness problem.
- **Second setups are named but not produced.** A shaker door is machined on both faces; the nested
  program does one and lists the door. Producing the *second* program means a second nest of the
  parts that need turning over, which is a real piece of work and only bites on a routed kitchen.
- **Rebates, wide grooves and non-rectangular pockets** are each reported and not machined. See 4.9.
- **Simulation.** The hard gate, and still nothing here does it. Free simulators read the generic
  ISO profile's output, which is what that profile is for.
- **Feeds and speeds are guesses.** Deliberately slow ones — a feed too low wastes time, a feed too
  high breaks a bit. Copy the machine's own numbers when the `.nc` file arrives.
>>>>>>> main

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

Four things get asserted separately and all of them matter:
- **part size** — what goes on the cutlist
- **the cabinet-space box each panel occupies** — a left side carrying a right side's
  placement is the same size and completely wrong
- **where each feature lands, in part-space coordinates** — added in §4.6. A mounting plate
  measured from the wrong edge of a side panel is the same number of holes at the same diameter, so
  a test that counts them passes. `drillingStaysOnThePart` in `tests/helpers.ts` is the catch-all
  version of this and runs over every cabinet type at two widths and both hands.
- **where each blank lands on its sheet, and that the cuts really make it** — added in §4.8. This
  is the same lesson a fourth time: a nest with a part 8mm out, or two parts overlapping by a
  millimetre, or a cut no saw could make, looks exactly as convincing as a correct one. So nothing
  asserts that a nest looks reasonable. `auditNest` in `tests/nesting.test.ts` checks overlap and
  containment, and `replayCuts` follows the cut list knowing nothing about how it was produced.

Keep that standard. It is what made the errors found from the bench cheap to fix.

One more thing worth keeping, from §4.8: **the app was checked by reading the rendered SVG back**,
not by looking at the screenshot. 87 rectangles came out of the Nest tab's DOM and were asserted
not to overlap and not to hang off the board — the same question the suite asks of the model, asked
of what is actually on screen. A picture is the right thing to *show* somebody and the wrong thing
to verify against.
