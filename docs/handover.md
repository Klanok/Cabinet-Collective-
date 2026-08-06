# Handover — start here

**Purpose:** feed this to a new Claude Code session as the founding context for continuing
work. It replaces the need to read the original session transcript.

**If you want the short form**, `docs/start-here.md` is a page you can paste into a new session as
its first message: where things stand, the one thing that is blocked, what to pick up, and how to
work. It points back into this document for everything else.

Read alongside:
- `docs/woodtron-dialect.md` — the machine's real dialect, read off ten programs it runs. **Read
  this before touching `post/` or `library/machines.ts`.**
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

**One thing from §4.9 said the dialect was unverified and that one `.nc` file off the machine was
worth more than any other open item in this document. Twenty-one of them arrived, and it was.**
`docs/woodtron-dialect.md` is what they say; §4.20 is the model grown to hold it. `G81` turned out
to be wrong — there is not one in twenty-one files — and Z zero turned out to be the table, which is
the correction §4.9's own list was written for. **What is still open is the half that was always the
harder half: none of this has been run on a machine.** A profile read off a program is a much better
draft than a guessed one and it is still a draft, simulation is still the gate, and the Woodtron
profile names four things it is known to get wrong.

Two lessons in that worth keeping. **Reasoning soundly to the wrong answer is normal** — the Z datum
shipped as `material-top` on the argument that it was the safer way to be wrong, the argument was
good, and every program written before the correction cut air. And **the files answered questions
nobody had thought to ask**, which is why they were worth more than a checklist: two work offsets,
two rapid heights, and a through drill that stops where a through router does not.

**Since then the work has been the 3D view earning its keep, and seating.** Both halves of §5.8
shipped: a **wireframe mode** beside 3D and Plan, and **real decor textures** — an image per decor,
scaled in millimetres and turned by the part's grain, and laid on from **where the part lands on the
nested sheet**, so grain runs continuously across parts cut out of one board. Then **banquette
seating** (§5.4): a seat carcass under a lift-up lid, upholstery as a material type of its own, and
an inside corner built on the §4.5 formers-and-bendy-ply rules.

**The banquette carcass was then rejected at the bench — "I would never build them as they
currently come in" — and rebuilt.** It had no front, the wrong kind of access, and an overhang
default that the plain unit and the corner unit did not even agree on. It now has a solid fixed
front in door decor that takes no hinges but is still routed by a door style, a hinged lift-up
inset flush into the top, and a divider only above a 1200mm clear span. **Read §5.4** — it records
what was wrong as well as what replaced it, because the shape of the mistake is the lesson. One
thing there is still open: the **lid stay is not modelled** (no such part in the Blum library,
and inventing one is the failure the unchecked list exists to prevent). The cushions used to be the
other one; they are costed now — see §4.19.

**Then a benchtop learned to follow the curve under it** (§4.13) — a kitchen with a radiused end
had a square top over a round cabinet, and the top now takes the cabinet's own radius as owned data
seeded from the run.

**And then a session of real use produced seven reports at once, which is the most useful thing in
this document right now.** One is fixed: costing was returning **NaN** on every job, curved or not,
because §5.0's laminate arrived with two new labour rates and the migration that carried it forward
never touched `settings.labour` — see §4.14, and note that `0 * undefined` is `NaN`, which is why a
kitchen with no curve in it went down too. **Three more are closed by §4.15**, which is the piece
of work three of those reports were all pointing at: every spec now **declares what it builds**,
instead of the answer being whether somebody remembered to call a function. That closed applied
ends doing nothing on a banquette and the half-built banquette corner in the same stroke. **§5.11
is what is left of the list.**

**And then the feature asked for alongside that list shipped: custom cutouts on one named part**
(§4.16). A hole through, a notch off an edge or a corner, and a groove or rebate in a face — each
stated the way a shop says it, *"250 up from the bottom, 100 in from the front"*, so the same
sentence comes out as a mirror image on the two hands and stays put when the cabinet is resized.
Two things in it are worth knowing before touching this area: **a notch is the part's shape and a
hole is machining**, which is what decides whether the nester's blank changes; and the cutlist used
to group parts on their bounding box, which a corner notch does not change — so it would have
printed one line of two where one of the two was notched.

**And then two of the August bench items were closed, and one of them turned out to be half built
already.** §4.17 is **getting a job out of the browser** — and the first thing that work found is
that this document was wrong: Save and Open had been in the Job menu since the very first commit,
and §5.11's *"the only way to get a job out of this app is to crash it first"* had been stale for
months. What was actually wrong was sharper. Opening a file that was not a job called `alert`,
which a sandboxed frame **silently ignores** — so picking the wrong file did nothing whatsoever,
on the one control handling the only copy of a measured room. That is the exact failure
`panels/ask.tsx` exists to prevent, still sitting there four sections after the decision was
written down. §4.18 is the **out-of-step indicator**: the benchtop radius that "does not work"
works, and always did, and the app now says when an owned unit no longer matches the cabinets under
it — which is the bill for the owned-not-derived bargain, finally paid.

**And a curve got its laminate back** — reported as *"the laminate decor is not showing on the bendy
ply. I thought that was already done."* **It was done, and it was invisible anyway**, which is a new
shape of stale claim worth naming: §4.23 taught the outer skin to carry the door decor *and* migrated
the allowance to **zero** on every job and every shop standard that already existed. So the rule
engine had no laminate to put on the skin and drew bendy ply — correctly, for a job that said there
was none. **A feature that ships switched off for everybody who already had the app has not shipped.**

The reason for the zero had expired: it was *"a shop's curve may have no laminate at all and nothing
on screen tells the two apart"*, and something on screen tells them apart now. Project **v36** /
standards **v27** repair a zero to the shipped 1mm — leaving a shop's own figure alone, because the
rule is carry values forward and change only what was wrong. It re-cuts (the allowance comes off the
substrate radius) and re-prices (the curve buys the sheet it is built with), both said out loud.

**Two of the mutations survived the first set of assertions** and both were real gaps: a repair
written as *"set them all to 1"* clobbers a shop that laminates in 2mm, and repairing the job without
the standards hands every *new* job an unlaminated curve. §4.22's chain, for the fourth time.

**And three bench bugs were fixed, two of which this document already claimed were fixed** (§4.22).
The `$NaN` quote came back — not because §4.14's repair was wrong, but because it lived in the
*project* migration chain and the **shop standards** chain has never once repaired a labour rate, so
a new job is copied from broken standards and born at the current schema with nothing left to fix
it. The Cost panel then hid the one row that was broken, because `NaN > 0` is `false`. A standalone
panel's rotation box shipped into the one branch it could never be seen in. And the cushion texture
turned out to be a **ref on the mesh** where the geometry is what gets replaced.

**And the cushions are costed at last** (§4.19). They were drawn and free, and *nothing said so* —
which is the serious half: a missing line that quotes at **zero** looks exactly like a finished
quote. They are **bought in as whole units from the upholsterer** — the shop supplies templates or a
particleboard substrate — so they are the same class of thing as a stone benchtop and produce no
parts at all. The rate is the shop's own: **$350 a lineal metre, charged per cushion**, so a metre
with a base and a back is $700 rather than $350.

**Then the machine files were turned into a machine** (§4.20). `MachineProfile` grew **two heads**,
because a real nesting machine has two of everything that matters — two work offsets, two rapid
heights, two through depths — and had one of each. **`WOODTRON_NESTING_ROUTER` is the first profile
in this codebase that was read rather than guessed.** The drill bank's spindle map is solved and the
bank is still switched off, held there by a missing type field rather than by a comment. Not one
move of already-written KDT output changed.

**And a standalone panel learned to stand edge out** (§4.21) — two bench reports that turned out to
be one fix, because a panel sitting like an applied end beside a cabinet is, by construction,
perpendicular to the wall that cabinet backs onto. A special case disappeared, which is usually the
sign a model is right.

**And the banquette was finished off** (§4.23) — three faults photographed at the bench, on one
branch because two of them re-price. The **cushion now stands 10mm proud of the finished front** and
is adjustable, which is the shop's own answer to a seat that was showing white carcass all round it;
a **front that never opens is no longer cut short by a door's swing clearance**; and the **finish
laminate is drawn** in the door decor rather than leaving a walnut kitchen with a cream curve in it.

**Two things that turned up while doing it are worth more than the three fixes.** The laminate was
not merely undrawn — it was **charged on every curve while the allowance for it was zero**, so a job
was cut without it and quoted with it, and v23's own comment says *"nothing is re-priced"*. That is
this document's repeating lesson arriving inside a migration's promise about itself. And §5.14's own
cushion fix was **half done**: the size was corrected, the placement was not, so both back cushions
sat exactly the right size and one bevel out of place on every axis — invisible to every assertion
that pass added, and found only by measuring the running app. **Assert occupancy, not size.**

**And then the three things that had been sitting at the top of the list all went.** The **inside
banquette corner** is an **L** now — a span along each wall, a seat depth off each, and a small
concave fillet where the two seat fronts meet — instead of the convex quarter disc the shop called
*"a complete mess"*. The **whole front is one formed, laminated piece of bendy ply**, which is the
shop's own answer and simpler than what was planned before asking. §5.13 item 1 has it, and
**read that before touching it**: the shape had been mis-derived twice from one sentence, and it
was mis-derived a third time in the session that built it — on paper, twice, before the geometry
engine settled it. **Filleting an inside corner makes the seat bigger**, because you are cutting
the corner off the void rather than off the solid.

**The Woodtron's second pass is written** (§5.10, the item this file called its most valuable for
three sessions). Every contour on the sheet goes to the 1.0mm skin, then `(NEXT OPERATION)`, then a
sheet-wide sweep takes them all through — which is what holds each part on the vacuum while its
neighbours are cut. It was a change to how `writeSheetProgram` *walks* the list rather than a new
number, exactly as §5.10 predicted, and it retired `PARTS DO NOT COME FREE` from the top of every
program the machine was handed.

**And a sheet is the board you are handed, not the area you can nest into** (§5.13 item 7). The
carcass board is 2410 × 1205 where it said 2400 × 1200, off the machine's own sheet declaration —
and then the shop corrected the rule itself: **the allowance is material dependent**, 10 and 5 on
carcass board against **20 and 10 on any MDF board**, finished or raw, because the margin is a
pressing trim rather than anything to do with a decor. That broke a migration written an hour
earlier which keyed its map on the **size alone**, and no size-keyed table can give two answers for
2400 × 1200. **The first re-price in this file that makes a job cheaper**: it was being quoted for
board it did not need.

Section 4 records how each works and why; section 5 is what is actually left to do.

```
npm install
npm run dev       # the app
npm test          # 1099 tests
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
| Rule engine — specs as data over a construction method | base, wall, tall, drawer-bank, custom, radius-end, banquette, banquette-corner, panel, appliance — all ten in `rules/registry.ts`, each declaring what it builds (4.15) |
| Panel features (the Phase 4 CAM interface) | Types defined; door styles populate pocket and profiled-cut, **hardware rules populate the drilling**, and a user can add their own — see 4.16 |
| Door styles — shaker, V-groove, routed MDF | **Model half done — toolpaths are Phase 4, see 5.3** |
| Tool profiles — a cutter's cross-section | Defined; a short shipped list, no editor |
| Costing — GST both contexts, install, delivery | Working, on placeholder pricing |
| Sheet cost | **Whole sheets, counted off a real nest.** The yield allowance is gone — see 4.8 |
| Nominal vs actual board thickness | Working, off until you measure a board |
| Cutlist — grouped lines | Working, CSV export; no PDF |
| Shop standards + per-job settings | Working, persisted to browser |
| Saved cabinet types | Working |
| Viewport — R3F, orbit + WASD/QE, drag to move, walls | Working |
| Wireframe view — a third mode beside 3D and Plan | Working, see 5.8 |
| A standalone panel — stands edge out, like an applied end | **Working, see 4.21.** Both halves of one bench report |
| Grain direction — a cabinet's fronts, and a standalone panel | Working, see 5.4 — stated as the room sees it, translated per part |
| Decor textures on parts, at true scale, turned by grain | **Working, see 5.8.** Bundled images, mapped through the nest |
| Banquette seating — solid front, hinged lift-up, cushions | Rejected at the bench, **rebuilt to the shop's own answers — see 5.4**, then finished off in **4.23**. Lid stay still unmodelled |
| A rounded corner on a banquette, carried by lid, front and cushion | **Working, see 4.15.** Applied ends build on one too |
| What each cabinet type supports, declared by its own spec | **Working, see 4.15 and 4.16.** `CabinetSpec.capabilities` — refusing costs a sentence |
| Inside banquette corner — an L with a concave fillet | **Working, see 5.13 item 1.** Formed bendy-ply front the whole way round, laminated; three independent numbers where there used to be one |
| Upholstery as its own material type | Working — Warwick Caulfield, nine colours, `library/upholstery.au.ts` |
| A seat cushion proud of the finished front, adjustable | **Working, see 4.23.** 10mm, the shop's own figure; flush at the ends and the back, and the reason for each |
| A front that does not open, cut without a door's reveal | **Working, see 4.23.** A reveal is swing clearance; a false front never swings |
| The finish laminate over a curve, drawn and honestly charged | **Working, see 4.23.** Door decor on the outer skin; a curve with none says so, and is no longer charged for one |
| Cushions cut to the size they claim, and placed where they claim | **Fixed, see 5.14 and 4.23.** Oversize by their own soft edge, then one bevel out of place on every axis — the second half invisible to the first half's tests |
| Every number a cushion mesh is built from, out of the JSX | **Working, see 4.23 and the end of 5.13 item 1.** `viewport/cushionMesh.ts` — every cushion on both units, including the two branches of the plain seat, which are now asserted to agree about their own size |
| Banquette cushions on the quote | **Working, see 4.19 and 4.23.** Bought in whole, $350/lin m **per cushion**, no parts produced |
| Room — any shape, drawn in a 2D plan with typed lengths | Working |
| Cabinets placed against a named wall, at any angle | Working |
| CI — typecheck, tests, build, cutlist smoke run on every PR | Working, `.github/workflows/ci.yml` |
| Drawer boxes and runners — MERIVOBOX | Working, see 4.6 |
| Drawer front heights set one at a time | Working — and each drawer then takes the tallest box its own front carries, see 5.2 |
| A grained drawer bank cut from one strip, in order | Working, see 4.8 — the rips are real cuts in the sequence |
| Hinge, runner and System 32 drilling | Working, see 4.6 |
| Hardware BOM, priced onto the quote | Working, indicative Blum pricing |
| Cutlist / hardware / drilling CSV export | Working. **PDF not done — print from the browser** |
| Hettich, the second hardware brand | Not started — one more record in `library/`, see 5.2 |
| Curved / radiused parts — arcs, bowed shelves, radiused ends | Working, see 4.4 |
| A corner radius on a base, wall or tall cabinet | Working — bendy ply and formers, see 4.5 |
| A benchtop following the curve under it | **Working, see 4.13.** Owned, seeded from the run, refreshed on regenerate |
| A sign that an owned run unit is out of step with its cabinets | **Working, see 4.18.** Unit card, issue bar and terminal report, off the same sentences |
| Saving a job to a file, and opening one | **Working, see 4.17.** Was already there and this file said otherwise; what was broken was the failure path |
| Saving the shop standards to a file | **Working, see 4.17.** New — they were unsavable and wiped by the same click |
| Custom grooves, holes and notches on one part | **Working, see 4.16.** Stated from named edges, on a named part rule |
| Any part deleted, and the carcass re-derived around it | **Working, see 5.13 item 3.** Not a panel switched off: the opening, and everything measured off it, moves |
| Any part cut from another board, at that board's real thickness | **Working, see 5.13 item 3.** A shelf centres on its own board, via `ctx.thicknessOf` |
| Which cabinet types allow that, in their own words | **Working, see 5.13 item 3.** `SpecCapabilities.partOverrides`; five allow it, five refuse and say why |
| A curve finished in the door decor, on jobs that already existed | **Repaired on load, see v36.** It was drawn since 4.23 and switched off by 4.23's own migration for everybody who had the app |
| The same corner routed from door board instead | **Not started — see 5.7, now unblocked** |
| Guillotine nesting — sheets, cut sequence, offcuts | **Working, see 4.8.** Nest tab, two CSVs |
| Choosing which sheet size a material is cut from | Working, see 4.8 and 5.9 — per material, on the Nest tab |
| CAM — panels + nest → machine-independent operations | **Working, see 4.9** |
| G-code — a post-processor per machine, `.nc` per sheet | **Working, see 4.9. Still not run on a machine — simulate first** |
| A labour rate missing from the shop standards | **Repaired on load, see 4.22.** Both version chains share one backfill; costing names a rate it cannot use |
| A cost line that cannot compute | **Shown, not hidden, see 4.22.** `NaN > 0` is false, so the broken row used to remove itself |
| Turning a cabinet that stands against a wall | **Working, see 4.22.** The box was in the branch for free-standing units only |
| The Woodtron dialect, off 21 real programs | **Read and written down — `docs/woodtron-dialect.md`** |
| A machine profile with two heads — origins, rapid heights, depths | **Working, see 4.20.** All four figures differ per head |
| A Woodtron profile, every figure read rather than guessed | **Working, see 4.20** — and it names four things wrong with itself |
| A sheet stated at the board's real size, per material | **Working, see 5.13 item 7.** Carcass 10 and 5 over, any MDF board 20 and 10 — the allowance is the material's |
| Nesting a curved part | **Nested as its blank, which is right for a saw — see 4.8** |
| True-shape nesting for a router | Not started — a different cutting model, see 5.9 |
| The drill bank — a System 32 row in one hit | **Spindle map solved, bank still off — see 4.20.** One question blocks it |
| The Woodtron's two passes — skin the sheet, then take it through | **Working, see 5.10.** Per sheet, not per part: that ordering is the only thing an assertion can see |
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
edit. Schema is at **v36**; migrations run in sequence in `model/project.ts`. Shop standards are
versioned separately and are at **v27** — and they get a *real* migration rather than a
rejection, because refusing to load them silently replaces a shop's accumulated kick heights,
reveals, door styles and saved cabinet types with the shipped Australian defaults.

**Read the migration list, not this paragraph.** Every migration carries its own reasoning in a doc
comment directly above it, and *that* is the record — a version number in prose goes stale, a
comment sitting on the function cannot. What follows is a map, not a substitute.

Only six migrations have changed a job that already existed rather than adding to it. **v9, v11,
v27 and v30** all re-price, and are argued below. **v13** is the 2mm front standoff, and it moves the
finished face of every front in every saved job. **v15 and v16** move holes — shelf-pin rows and
runner fixings respectively — and neither moves or resizes a single part; a side panel comes out
the same rectangle in the same place with a different set of Ø5 holes in it. Each of them says
so in its own comment rather than being quiet about it, which is the standard for this file.

Everything from **v17 on is additive** and is the same shape of change repeated: supplier decors,
their swatch textures, the Warwick upholstery range and the full MERIVOBOX height list reach a
job's own snapshot of the libraries **without replacing any material or runner already chosen**. A
new choice appears in the picker; nothing already selected moves. v20 exists only because a browser
keeps `localhost` storage across separately extracted source folders, so a snapshot could be
stamped current while missing the texture fields v18 was meant to add — a repair, not a change.

**v9, v11, v27 and v30 are the four exceptions on price, and all of them say so out loud.** They are
the same argument four times: no part that already existed moves, and the job gets dearer because it
was being quoted for less than it takes to build. v9 added the hardware a kitchen always had; v11
charges the board a kitchen always took; **v27 charges the cushions a banquette always had** (§4.19),
and that one does not even move a part, because a bought-in cushion is not one; **v30 makes those
cushions the size the shop actually builds them** (§4.23), which is bigger, and charges the
difference. Both halves of each are asserted separately — `tests/hardware.test.ts`,
`tests/nesting.test.ts`, `tests/cushionCost.test.ts` and `tests/banquetteFinish.test.ts` — so nobody
has to wonder whether a re-price was an accident.

**One re-price ran the other way and was a fault rather than a decision**, and it is worth knowing
because it is the only one: **v23 charged a finish laminate on every curve while setting the
allowance for it to zero**, so a job was cut without the laminate and quoted with it — up to a $400
sheet. Its own comment says *"nothing is re-priced"*. §4.23 ties the charge to the allowance, which
makes those jobs *cheaper* and says so on screen. A migration's comment is evidence, not proof.

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
grown a dishwasher space, an end base and two ladder bases — see §4.7 — and the drilling has been
corrected twice since, at v15 and v16, so the current report reads 87 parts and 486 holes. Run
`npm run report` for today's figure rather than trusting any number in this file. The reasoning
below is unaffected.)* 63 parts became 69 — the six extra are a bottom and a back
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
### 4.14 The NaN quote, and the migration that was half done

Reported from the bench as **costing returning NaN** in the permanent total in the corner of the
screen and in several figures low down the Cost tab. Both are one number: everything from
`totalCost` down is derived from a single sum, so one NaN upstream takes the whole quote.

**The cause is nowhere near the symptom, which is why it is worth writing out.** §5.0's finish
laminate arrived at project v23. That migration carried `finishLaminate` onto every construction
method and put the laminate sheet on every job's price list — and it did **not** touch
`settings.labour`, which had gained two new rates in the same commit. So every job saved before it
loaded with `laminateSetupMinutesPerCurve` undefined, and `costing.ts` computes:

```
  laminatedCurves * settings.labour.laminateSetupMinutesPerCurve
```

`0 * undefined` is `NaN`. **So it did not wait for a job with a curve in it** — the sample kitchen
has no curved part anywhere and went NaN too. That is why it reached every job rather than the few
with a radius, and why it looked like the costing engine rather than a missing field.

**v25 backfills every absent `LabourRates` field** from the shipped defaults, leaving anything the
shop set alone — including a deliberate zero, which is why it tests for the key rather than for
falsiness. The same rule v12 followed for the screen colours. Nothing that was set moves, so
nothing re-prices; what changes is that a job printing NaN now prints a number.

**Two lessons, and the second one cost an hour.**

- **A migration that adds a field has to ask every place that field is read**, not just the one it
  was written for. Two fields arrived in one commit for one feature and only one was carried
  forward. The backfill is deliberately written over the **whole record** rather than naming the
  two fields, so the next rate added cannot repeat this.
- **`DEFAULT_LABOUR_RATES` lives in `model/project.ts`, not in `library/defaults.au.ts`**, beside
  `DEFAULT_NESTING_SETTINGS` and for exactly the same reason: **a migration has to be able to reach
  it.** The library imports the model, so the model cannot import the library back. The first
  attempt at this fix did import it, and the cycle did not fail loudly — it silently built
  `AU_DEFAULT_SETTINGS` with `nesting: undefined` in it, which is a worse version of the bug being
  repaired. Caught by the suite, and worth remembering: **an import cycle here does not throw, it
  hands you an object full of holes.**

### 4.13 A benchtop follows the curve under it

A kitchen with a radiused end had a **square top over a round cabinet**. The cabinet's box does not
shrink when its corner is rounded (§4.5), so the slab was always the right *size* — it simply had a
sharp corner standing up to 200mm proud of the curve, on the one corner of a kitchen where the
top's edge is the thing a hand lands on.

**`Benchtop.corners` is owned data, and that is the whole design.** The obvious implementation is
to read the end cabinets when the parts are built, and it is wrong: `model/runUnit.ts` says
`fromCabinetIds` is for regenerate and nothing else, because the moment something else reads it,
moving a cabinet starts moving a benchtop again and the ownership is a fiction. So the corner
radius is generated from the run **once**, carried like `carcassDepth`, refreshed on regenerate,
and editable in between. Nothing at build time knows a cabinet exists.

**The radius the top takes is the cabinet's own, exactly, and that is not an approximation.** A
corner radius is struck about `finishedFrontZ` — the door plane, 580 on a 560 carcass (§5.0) — and
the shop's standard 20mm front overhang puts the top's front edge on that same plane, while the 0
end overhang lands its end on the cabinet's end face. So a fillet of radius `r` at the top's corner
is *concentric with the cabinet's arc*, and the top follows the curve with a constant overhang the
whole way round. That coincidence is why `corners` can be seeded from `carcassRadius` with no
arithmetic in between. Change an overhang afterwards and the arc stays tangent to both edges — it
is a fillet, so the outline is always valid — but it stops being concentric, which is the owner's
business rather than something the model should fight them about.

**Decisions worth not undoing:**

- **A radiused end is generated as `exposed`, not `wall`.** Everywhere else the generator assumes a
  wall, because an end wrongly called exposed puts a charged edge profile on a quote for an edge
  nobody sees. A curve is the exception and it is not a guess: nobody rounds a corner that dies
  into a wall, which is the same fact `radiusCorner` records by offering only the two front
  corners. Seeding it as `wall` would generate a top that contradicts itself the moment it exists.
- **`roundedCornerProfile` names its corners and has no default**, like `notchedRectProfile` and
  `bowedFrontProfile`. A slab lies decor face up with `v = −Z`, so part y runs from the **front**
  towards the back and the front corners are `x0y0` and `x1y0`. A caller that guessed would round
  the corners against the wall — right radius, right size, right blank, wrong quarter.
- **The geometry primitive throws and the builder never does.** `cornerRadiusFits` is the one
  exported check both use, so there is no boundary for them to disagree about — the same split
  `substrateRadius` uses. A radius the section cannot hold is cut square and reported, because a
  number field fires on every keystroke and "2000" arrives as "2" on its way through. §4.5's crash
  was exactly this on a curve.
- **The bounding box does not move**, so the nest still reserves the blank. Right for a saw: the
  rectangle comes off the sheet and the curve is cut from it (§4.8).
- **Only the first and last section carry a corner**, the same `isFirst`/`isLast` rule the banding
  already follows — a join in the middle of a top has two square ends meeting at it.
- **A waterfall or a mitre at a rounded corner is reported, not built.** A waterfall panel is
  mitred to the top along a straight line, and where the top turns a quarter circle there is no
  straight line to mitre to; the panel would have to be a developed curve on the §4.5 rules.
- **The curve is charged as hand work.** §3: a curved edge cannot go through the edgebander. The
  part carries a note saying so, and it reaches the cutlist line.

**Two figures moved, both downwards, and both were wrong before.** A rounded corner is *shorter*
than the square one it replaces — it takes `r` off the front and `r` off the end and gives back a
quarter circle, so the net is `r(π/2 − 2)`, about 86mm on a 200 radius. Charging the square corner
over-buys the edge profile by that much, which on a stone top is a per-metre rate. And the slab
loses `(1 − π/4)r²` of area. Small, and worth doing because it is the same figure a fabricator's
invoice is worked from.

**Project v24. Nothing already saved moves**, and this time in the strong sense rather than the
careful one: a square corner is not a compatible default chosen to preserve old behaviour, it is
the only shape a top has ever had. The version is bumped anyway, for the reason v4 was — a top with
a curve in it is a different part, and an older build would quietly cut it square. A radius reaches
an existing top by **regenerating** it, deliberately, because filling them in during the migration
would be a migration reading `fromCabinetIds` as a dependency.

**Where to look:** `geom/profile.ts` for `roundedCornerProfile` and `cornerRadiusFits`;
`model/benchtop.ts` for `corners`, `sectionCorners` and the corrected edge and area;
`project/generate.ts` for `cornersFromRun` and the concentricity argument;
`rules/runUnits.ts` for the slab. `tests/benchtopCorner.test.ts` is the contract and carries the
longhand figures in its header — including why the **arc's centre** is the assertion that matters,
which is §4.4's former axis and §4.9's mirrored arc for the fourth time.

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
- **One sheet size per material — chosen by cost, or named by the shop.** By default every size the
  material comes in is nested in full and the cheapest wins; a size that cannot hold every part
  loses to one that can, however cheap it is per square metre. A sheet size is what goes on the
  supplier order, and a nest mixing 3600×1800 and 2400×1200 across one material is an order whose
  first line is "work out which of these is which".
  **`NestingSettings.sheetSizes` overrides the search, per material**, and the shop often should:
  what the supplier has on the rack this week, what fits in the van, what two people can lift onto
  the saw and what there is half a pallet of already are all facts the search cannot see, and any
  of them beats a few dollars a sheet. Set on the Nest tab, where the sheet count and the price
  move as you change it. A saved choice naming a size the material no longer comes in is
  **reported and dropped, not obeyed and not fatal** — losing a job's whole nest over a stale
  preference would be the worse failure.
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

- **True-shape nesting.** See §5.9. It is a router's problem and a different cutting model.
- **Mixing sheet sizes within one material.** See §5.9, with the sample kitchen's own example.
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

**A real machine program arrived on 1 August 2026.**
`Helen Taylor Robes Stage 3_16NWW_S01R01.NC` is Mozaik output for the KDT, for a face-down
3110×1210×16mm Notaio Walnut sheet. It confirms that Z zero is the **table**; drilling ends at Z3,
while routing leaves 0.8mm on its first pass and finishes at Z-0.2 on its second. The boring head
uses explicit moves (`M33`, `M83`, `G600 T37` for 8mm and `G600 T35` for 35mm), not `G81`. Routing
uses `G90 G59`, `M6 T2`, `G43 H2`, and a 10mm two-wing compression bit at 18000rpm, F6000 entry and
F16000 cutting. Sheet Y runs negative; drilling and routing use separate G54/G59 work offsets; the
file also carries KDT-specific vacuum and homing commands.

The current KDT profile contradicts several of those confirmed facts. It remains unsafe for
production until the writer can express them, generated output is compared line by line, and it is
simulated. The customer-named reference file is not copied into the repository.

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
generic ISO one for simulating. The sample kitchen comes out as **5 programs, 573 operations, 486
holes** — the same 486 the drilling sheet reports, because CAM reads the features rather than
inventing any. *(It read 641 and 554 when this was written. Both figures moved together, which is
the point: the invariant is that CAM and the drilling sheet agree, not that either holds a
particular number. Check the current pair with `npm run report`, never this sentence.)*

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

### 4.15 What each spec says it builds — and the banquette's rounded corner

**Built and merged.** This section is the record of it rather than a plan, and the reason it is
worth a section of its own is the bug it started from, which is a *shape* of bug rather than one
mistake.

#### The stale warning

`cornerRadiusProblems` decided whether a cabinet could take a rounded corner by asking
`['base', 'wall', 'tall'].includes(ctx.cabinet.typeId)`. When §5.4 rebuilt the banquette it gained
`carcassCornerFormers` and `wrapLayers` as part rules, and the Inspector gained the radius control
for it — and this list was not touched. So a banquette with a 200mm radius on it **cut the formers,
cut the wrap, cut the bottom to the arc, and told the user**:

> A rounded corner is only built on base, wall and tall cabinets — this one would come out with the
> corner cut away and nothing wrapped round it.

Correct parts, green suite, wrong sentence, for as long as it took somebody to try it. The failure
is not that the list was wrong; it is that **the list was a second opinion about what a spec does**,
kept somewhere a spec author has no reason to look. Adding a part rule and updating a list in
another file are two edits, and only the first one is needed to make the cabinet come out right —
so the second one is the one that does not happen.

#### The declaration

`CabinetSpec.capabilities`, **required**, one field per capability. Every field is
`true | string` — either the spec builds it, or **the reason it does not, in the shop's words**:

```ts
capabilities: {
  cornerRadius: true,
  appliedEnds: true,
},
```

```ts
capabilities: {
  cornerRadius:
    'A radiused end is already one quarter circle — its width and depth are the radius. Set ' +
    'the size to change the curve rather than adding a corner radius on top of it.',
  appliedEnds: true,
},
```

Three properties of that shape, each of which is doing work:

- **Required, with no default.** A new spec that does not answer does not compile. The alternative
  — `cornerRadius?: boolean` defaulting to something — is a spec silently inheriting a capability
  it has not implemented, which is a cabinet with the corner cut away and nothing wrapped round it.
- **`true | string`, not a boolean.** A boolean lets a spec say no and leaves somebody else to
  invent the sentence. That is precisely how one spec's reason — an appliance space's *"a gap in the
  run rather than a cabinet"* — came to be written in a shared builder behind `spec.isCarcass ===
  false` and applied to anything that might ever refuse. It now sits in `applianceSpace.ts`, and the
  banquette corner carries a different sentence beside it because it is refusing for a different
  reason.
- **The app asks the spec too.** `Inspector.tsx` held its own copy of the same list — it is what
  offered the radius control on a banquette while the engine warned it could not have one. It reads
  `spec.capabilities` now. A control a type refuses is hidden **unless the cabinet is already
  carrying the option**, so a job retyped from a base to a custom can still be turned off rather
  than warning forever with nothing on screen to clear.

`tests/specCapabilities.test.ts` asserts the declaration against the rule engine rather than
against itself: for every spec claiming `cornerRadius: true` it **builds a cabinet and looks for a
former and a skin**, and for every spec that refuses it checks the warning is that spec's own
sentence. A declaration nothing checks is a comment.

#### What the banquette's corner then had to carry

The carcass was right; the three things sitting on it were not.

- **The lift-up.** The one that could not be built. A lift-up is flush with the top of the carcass
  by definition, and on a lidless seat box `carcassCornerFormers` puts a former at that same height
  — so at a 200mm radius the two occupied the same 217 × 180 of board at the same height. It now
  takes a **square notch** to land on the former, for the reason a shelf's notch is square: **a
  curved edge will not go through the edgebander**, and this panel is banded all round because it is
  handled every time the storage is opened. What it clears is the **former**, not the arc's bounding
  square — the former reaches inboard as far as the fixing strip, a strip's width further in than
  the tangent. The clearances cancel: the notch measures exactly `endInnerX − stripInnerX` by
  `D − tangentZ`, with no clearance term in it at all.
- **The solid front.** Already correct, and worth saying so rather than leaving it to be
  rediscovered: `fixedFrontPanel` lays out in `doorZone`, which stops at the fixing strip on a
  radiused cabinet. It is now asserted at 947 × 397 landing on x ∈ [1.5, 948.5] instead of being
  true by accident.
- **The cushion.** Viewport-only, and still uncosted (§5.4 (a) stands). Its *plan shape* is now
  arithmetic in `core/model/cushion.ts` where a test can read it, because the seat that sat 25mm
  proud of its own lid was found by measuring and a cushion ignoring a 200mm radius would just have
  looked like a slightly boxy cushion. The seat turns the same corner one inset tighter, and an end
  bolster stops at the tangent rather than hanging over the curve in mid-air. It reads the corner
  **the rule engine resolved**, carried out on `BuiltCabinet.radius`, not `options.carcassRadius`:
  a radius the bendy ply cannot turn resolves to null and the carcass is built square, and the
  cushion is the one part of a banquette nobody can check against a cutlist.

**Applied ends now build on a banquette**, which they never did — the checkbox was offered on every
type and the banquette spec had no `appliedEndPanels` rule, so ticking it did nothing and said
nothing. `underBenchtop: false`, because nothing lands on top of a banquette and the panel's top
edge is at seat height with a cushion beside it.

Checked in the running app as well as in the suite, per §7: a 1200 × 400 × 500 banquette with a
200mm front-right radius, an applied end on the left and both bolsters on, seeded into local
storage and read back from a screenshot looking down on the seat.

#### What is left

- **Only two capabilities are declared.** They are the two that had a stale list behind them.
  Others are candidates and none is urgent: whether a spec takes a door style, whether it joins a
  benchtop run (§5.4 has an open question about exactly that), whether it can carry a lid. Add one
  when a second place starts keeping a list of type ids, which is the signal.
- **A drawer bank and a custom carcass still refuse a rounded corner**, and both say so. A bank's
  fronts already lay out in the door zone, so turning it on is adding the two part rules the base
  cabinet has — not a rethink. Nobody has asked for it.
- **A shelf at a former's height still overlaps that former**, on every radiused carcass type and
  not only on a banquette. The shelf notch clears the arc's bounding square, and the former reaches
  a fixing strip's width further in than that. It bites only when a shelf lands at the same height
  as a former, which is why it has not been seen — a lift-up is guaranteed to clash and a shelf is
  not. Deliberately left, and written down so it is a known gap rather than a surprise.
- **The lid stay is still not modelled.** §5.4, and it did not move here. The cushions were the
  other half of that sentence and have since been costed — §4.19.

### 4.16 Custom features on an individual part

**Built and merged.** §5.12 was the plan; this is the record of what it came out as, and of the
two things in it that were not obvious until they were written.

> *"I need to be able edit individual parts to add custom grooves and cut outs to them — so say I
> add a drawer bank and want to do a cut out in the left hand end"*

All three kinds are there: a **hole** right through, a **notch** off an edge or a corner, and a
**groove or rebate** in a face. Inspector → **Cutouts**, per cabinet.

#### Stated from named edges, and that is the whole design

A custom feature says *"a Ø50 hole on `side-left`, 250 up from the bottom, 100 in from the front"*.
It never stores a part-space x and y, and §5.12 was right that this is the one thing that must not
be got wrong. On the reference drawer bank the two sides carry opposite part axes:

```
  Side L   u = +Y  v = +Z    part +y runs toward the FRONT
  Side R   u = +Y  v = −Z    part +y runs toward the BACK
```

so that one sentence resolves to `y = 444` on the left side and `y = 100` on the right — the same
hole in the same place in the room. Written as a coordinate it would be 100 from the front on one
side and 100 from the **back** on the other, at the right diameter, in the right count, on a part
of exactly the right size. That is §4.6's mounting plate, §4.4's former axis and §4.9's mirrored arc
for the fourth time, and it is asserted rather than assumed —
`tests/customFeatures.test.ts` puts the same feature on both hands and checks the two answers sum
to the part's own width.

The mechanism is the one that already existed: `edgeFacing` resolves a cabinet direction to a named
edge of *this* panel, exactly as it does for banding. `faceFacing` is its mirror image and is new —
*"a groove in the face toward the right"* is the A face of a left side and the B face of a right
one, because `w = u × v` is derived. Six words name both, and which of the two a word means depends
on the part: on a side panel the front is an edge and the left is a face. A word that names a face
where an edge was wanted is **reported**, never guessed at.

The second thing it buys is stated in the definition of done and falls straight out: the position
**survives a resize**, because it is measured from an edge that still exists rather than from an
origin that moved. Make the cabinet 100 deeper and the hole is still 100 in from the front.

#### The split that decides what the nester reserves

**A notch is the part's shape; a hole and a groove are machining.** Made once, in
`rules/customFeatures.ts`, rather than bolted on the first time somebody cut a notch:

- a notch is cut into `Profile2D`, so the cutlist size, the banding length, the blank the nester
  reserves and the perimeter the router follows all see it;
- a hole and a groove are `PanelFeature`s and take nothing off the rectangle the part is cut from.

One honest edge case travels with that, because it looks like a gap otherwise: **a corner notch
changes the shape but not the blank.** A panel saw still cuts the whole rectangle and the bite comes
out afterwards — §4.8's *a nest is of blanks, not of shapes*, arriving at a part somebody notched
rather than one the engine curved. A notch off a **whole** edge does shrink the blank, and the test
asserts both.

A notch off the low edge of a part also has to slide the profile back onto its own origin **and
slide the placement the same distance in the cabinet**, because part space starts at the bounding
box. Do one and not the other and the board is the right size in the wrong place. `occupies` catches
it: 20 off the back of a side takes it from z ∈ [16, 560] to z ∈ [36, 560].

#### Two things that were wrong until they were checked in the running app

**A `map` reference passed a flattening tolerance of zero.** `profile.holes.map(flattenPolygonPoints)`
hands the callback the array *index* as its second argument, which `flattenPolygonPoints` reads as
its tolerance — so the first hole was flattened at a tolerance of 0 and asked for a circle in
**6.28 million segments**. The app did not crash; it hung. Worth carrying forward as a shape rather
than as a fact about this one line: a point-free `map` over a function with optional parameters is a
silent argument injection.

**The cutlist grouped on the bounding box, and a corner notch does not change one.** A side with a
scribe notch and a plain side of the same size collapsed onto one line as "2 ×", and one of the two
would have been cut wrong. The key now carries `profileSignature` and the custom features. The
**note deliberately stays out of it**, which is the distinction worth keeping: a note is advice about
where a part goes — "End rib" — and an end rib and a middle rib are the same part off the same line.
Keying on free text splits a line for a hint; keying on shape splits it for something the saw can
see. (Putting the note in the key was the first attempt, and it split the sample kitchen's plinth
ribs 8 → 4 + 4, which is how the difference got noticed.)

#### What else it touched

- **`extrudeProfile` cuts interior holes now**, both faces and the wall through the board, by
  bridging each hole into the outline. It said in its own docstring that it did not, and a hole you
  cannot see through is one a cabinetmaker cannot check. `panelDrawingProfile` is what feeds it: the
  cutout stays a **feature** and the drawing profile is derived at the point of drawing, the same way
  `forming` is. Verified by measuring the mesh, not by looking at it — the triangles of one face have
  to add up to the board less πr².
- **A groove is drawn struck on the face it is cut into**, which is the same preview convention
  `FrontRelief` already shipped for a V-groove and is marked as one. What it gets right is the two
  things somebody checks on screen: which face, and where it runs.
- **`CabinetSpec.capabilities.customFeatures`** — §4.15's declaration, and §5.12 was right that this
  is the same question in a different coat. Every spec that cuts parts says `true`; an appliance
  space refuses in its own words, because it cuts none.
- **CAM needed nothing.** A hole comes out as a closed contour offset *inward* by the cutter radius
  (a Ø50 hole with a Ø6 bit is a 22mm toolpath — offset outward it would cut Ø62), and a groove as an
  open one. The circle is **four quarter arcs** rather than two semicircles, purely so
  `offsetRingOutward` will touch it: it refuses a ring with fewer than three corners, and a hole cut
  on its own centreline is a waste pipe that rattles.
- **Schema v26**, and it adds nothing. A job saved before this has no custom features, which is what
  a cabinet with none means, so no part moves. The bump exists so an **older build refuses the file**
  rather than opening it and quietly cutting the parts without the cutouts — the v4 argument again.

#### What is left

- **A notch on a shaped part is refused**, in its own sentence. Cutting a rectangular bite out of an
  arbitrary outline is a boolean operation this geometry engine does not have, and the parts people
  notch are rectangles. A hole and a groove work on any part.
- **A groove's run is a straight line.** Two points, one width. An L-shaped groove would be a path,
  and nothing has asked for one.
- **Nothing places a feature by pointing at the 3D view.** `worldToPart` exists and has always been
  meant for exactly that (see `geom/placement.ts`), so the transform is not the missing piece — the
  interaction is.
- **A saved cabinet type does not carry its cutouts.** `savedTypeFromCabinet` copies options and
  materials, and a recipe with a waste hole in it is arguably right and arguably a trap. Nobody has
  asked; left deliberately.

### 4.17 Getting a job out of the browser

**The first thing this found is that this document was wrong**, and that is worth more than the
feature. §5.11 said *"the only way to get a job out of this app is to crash it first"*. It was not
true and had not been for a long time: `Save to file…` and `Open from file…` have been in the
**Job ▾** menu since the commit that introduced formed parts. A session that had trusted the
paragraph would have built a second copy of a feature that already existed.

**Check the code, not this file.** Every other section says so about *shipped* work going stale;
this one says it about an *open item* going stale, which is the direction nobody watches.

**Seven sessions running have now caught one, and the last two close the argument from both ends.**
Four caught stale open items; the fifth caught two stale *fix* claims and an unreproduced bug report
that was one grep from reproducing; the sixth (§4.23) caught a **migration's own comment about
itself** — v23 says *"nothing is re-priced"* and it charged a laminate sheet on every curve in every
job with one. A claim in a doc comment sitting directly on the function is the strongest form this
document has, and it was still wrong, because nothing fails when a comment goes stale.

**The seventh went the other way, and it is the one to copy.** The Woodtron profile's
`PARTS DO NOT COME FREE` was true, stopped being true the moment the second pass was written, and
**went out in the same commit that made it false** — along with the test pinning it. That is the
first claim in this file retired on purpose rather than caught later, and it is what noticing the
pattern is *for*.

The general form has not changed: **a repair has to cover every chain that reads the field, not
every field in one chain** — and a claim has to be checked against the code that reads it, not the
code it sits on. What the seventh adds: **when you make a claim false, go and find it.**

**What was actually broken was worse than what was claimed.** Four things, and the first is the one
that matters:

- **Opening a file that was not a job called `alert`.** §2 spends a paragraph on why
  `window.confirm` and `window.prompt` are banned — a sandboxed frame without `allow-modals`
  ignores them silently, so the call returns as though the user had cancelled — and `alert` is the
  same call in the same family, still sitting on the one control that handles a room somebody spent
  a day measuring. Pick the wrong file and **nothing happened at all**. The decision was recorded,
  the replacement was written, and one call site was never converted. `ask.tell` is that
  replacement: one button, because there is nothing to decide.
- **Three separate one-click ways to destroy the job on screen**, none of which asked: New empty
  job, Load sample kitchen, and Open from file. Local storage is overwritten in the same instant,
  so there was nothing behind any of them. Each now asks, and **the question names what is at
  stake** rather than saying "are you sure" — how many cabinets, and whether the job has ever been
  out of this browser.
- **Nothing said whether the job existed anywhere but this browser.** It does now, in the Job menu
  and as a mark on the menu button itself.
- **A JSON file that was not a job loaded anyway.** `migrateProject` catches a missing
  `schemaVersion` and a version from a newer build, and cannot catch anything else, because the last
  line of a migration chain is a cast. A file with a plausible version number and no cabinets in it
  went straight through, was written to local storage on the way in, and took the app down on the
  first render — which is the **reload loop `ErrorScreen` exists to escape**, arriving through the
  front door.

**And the shop standards could not be saved out at all.** They are wiped by the same click that
takes the job, and `ErrorScreen`'s own note has always admitted it. A room can be re-measured; a
shop's kick heights, reveals, door styles and saved cabinet types cannot — they can only be
re-typed. Settings → Shop standards now saves and opens them, and the footer no longer says "saved
automatically" when what it means is "saved to this browser".

**Decisions worth not undoing:**

- **`projectFileProblem` is deliberately not inside `migrateProject`**, and is called only on the
  file path. A job in local storage has been loading successfully, possibly for months; a check
  stricter than some old migration's output would take a shop's working job and replace it with a
  blank one at startup — and **v20 exists precisely because a snapshot once came out stamped current
  and missing fields**. A file somebody has just chosen is the opposite case: refusing it costs one
  click and tells them they picked the wrong file. Same asymmetry §2 draws about refusing to load
  somebody's standards.
- **It checks containers, not contents.** "Did you hand me a job?" is the question. A deep validator
  would be a second description of the model, free to disagree with the first — which is the fault
  this codebase is organised around not having.
- **`savedToFileAt` lives in the store, not on the project.** It is a fact about this browser
  session, not about the job: writing it into the job would mean saving a file whose contents record
  the moment it was saved, which is both circular and a schema migration for something the cutlist
  has no interest in. It starts `null` on every load, including for a job restored from storage —
  that job has provably survived a reload and just as provably has never been anywhere else, and
  the only place a "yes it was saved" flag could live is the storage being hedged against.
- **A job opened from a file starts in step with it**, and is not `touchProject`ed on the way in.
  Re-stamping it would mark it changed the instant it opened.
- **Nothing claims the file reached the disk.** A sandboxed frame without `allow-downloads` blocks
  the click as silently as it blocks `confirm`, and there is no way to detect it from here. The app
  reports what it *did*, which is all it honestly knows.

**Not done, and worth knowing:** there is still no autosave to anywhere but this browser, no recent
files list, and no warning on closing the tab. The last of those is a `beforeunload` handler and was
left alone deliberately — it fires on every reload during development and is the kind of thing that
gets switched off in annoyance and then is not there when it matters.

**Where to look:** `store/persistence.ts` for both round trips; `model/project.ts` for
`projectFileProblem` and why it sits outside the migration chain; `panels/ask.tsx` for `tell`;
`App.tsx` for the question the three destructive actions ask. `tests/projectFile.test.ts` is the
contract, and its header says why the wrong file — not a corrupt one — is the case being guarded.

### 4.18 An owned run unit that is out of step

> "The benchtop radius does not work."

**It works, and it always did.** The top was generated before the cabinet under it was given a
radius, and it stayed exactly where its owner put it, which is §4.7's whole design. What was missing
is that **the app said nothing**: no sign the top was out of step, and no hint that Regenerate is
the answer. §5.11 named this correctly — *"every owned field needs that indicator — this is the
cost of the owned-not-derived bargain and nobody had paid it"* — and this is the payment.

**A model that is right and silent looks, from the bench, exactly like a model that is wrong.** That
is the general lesson and it is why this got done before a new feature: the same shape will appear
for every future field that is generated once and then owned.

**The design is one sentence: it compares against exactly what the Regenerate button would produce.**
`benchtopOutOfStep` calls the same `regenerateBenchtop` the button calls and diffs the result. It
does not re-derive what a top *ought* to be, and that is not tidiness — a second derivation would be
free to disagree with the first, and the failure mode is an app reporting a problem that pressing
the button does not fix, which sends somebody hunting a fault that is not there. It is strictly
worse than saying nothing.

**Decisions worth not undoing:**

- **A unit with no run left is its own kind, and its button is disabled.** Both regenerate functions
  return the unit unchanged when nothing shares a cabinet with it — deleting every cabinet under a
  top and keeping the top is a normal state to be in the middle of. Reporting that as "no problem"
  hides it; reporting it as ordinary drift points at a button that cannot help. `regenerateFixesIt`
  is the field the UI reads, so a kind added later has to answer the question rather than inherit an
  assumption. A live button that does nothing is `panels/ask.tsx`'s failure wearing a different hat.
- **`runUnder` is one exported function**, used by both regenerators and by this. "Will the button do
  anything?" is asked in two places and must not have two answers.
- **Reading `fromCabinetIds` here does not break the ownership rule.** `model/runUnit.ts` warns that
  the moment something else reads that field, moving a cabinet starts moving a benchtop again — and
  that warning is about **geometry**. This returns sentences and moves nothing; the top stays where
  its owner put it until a person presses the button. `uncoveredRuns` already read it on the same
  terms.
- **An owner's own edits are silent.** A 40mm overhang, a sink, a join, a renamed end — `regenerated`
  carries every one across, so none of them is a difference the button would close and none may be
  reported. Half the value of an indicator is that it is off; one that lights up on a job nobody has
  touched is one the shop learns to ignore.
- **`height` on a plinth is reported and `depth` is not**, mirroring `regenerateKickBase` exactly.
  The height of a frame is not a choice — it is the gap between the floor and the underside of the
  carcasses — while the depth is, and may well have been pulled back to clear a skirting.
- **The threshold is 0.05mm**, deliberately far below the smallest real change: switching a board
  from 16 to a measured 16.3 moves a carcass 0.6mm, and that is a genuine re-cut this has to catch.
- **The same sentences reach all three places** — the unit card, the issue bar and `npm run report`.
  The report matters because a printed cutlist can be for a top that no longer fits the run, and
  that is the sheet somebody takes to the saw.

**The issue bar is where it earns its keep**, not the Tops tab. The Tops tab is exactly where
somebody is *not* looking when this happens: you move a cabinet in the 3D view, and the top that no
longer fits it is two tabs away.

**One thing found by driving the running app** rather than by the suite: making one cabinet deeper
puts the **benchtop and the plinth** out of step together, because one cabinet getting deeper
changes the run for everything that spans it. Each is its own owned object with its own button. That
is the design rather than a shortcoming, but it means "regenerate" is per unit and a job with a top
and two plinths over one run takes three presses.

**Where to look:** `project/outOfStep.ts` — the two rules it holds to are at the top of the file.
`tests/outOfStep.test.ts` is the contract and its header carries the reference run worked longhand.

### 4.19 Costing the banquette cushions

§5.11 recorded that the cushions were *"drawn but not costed — no fabric, no foam, no upholstery
labour on the quote, and nothing on the report says so"*. **The second half is the serious half.** A
missing line that announces itself is a job to finish; a missing line that quotes silently at
**zero** is a banquette sold for hundreds less than it costs, and nothing on the page tells you
which you are looking at. Same shape as §4.14's NaN quote: a number that looks finished and is not.

#### The two answers that decided everything, both from the shop

> "Generally bought in as a whole unit from the upholsterer — we'd only supply templates or
> particleboard substrates."

> "I generally allow $350 per lineal metre — that applies to the base and separately to the back or
> any returns, so 1 lineal metre of banquette with base and back would be $700."

The first puts a cushion in **exactly the class §4.7 built for a stone benchtop**: a purchase order,
not a part. Nothing here produces a `Panel`, nothing reaches the cutlist or the nest, and that zero
is the point rather than an omission — inventing a part so the cutlist looked complete would put
foam on a sheet order.

The second is the whole of the arithmetic, and **the clause that matters is "separately"**. The rate
is per *cushion*, not per run, which is the only reason a metre with a base and a back comes to $700.
Read it as per-run and every banquette in every quote is out by half. That reference figure is the
first assertion in `tests/cushionCost.test.ts`.

#### Decisions worth not undoing

- **The lineal lengths live in `model/cushion.ts` and the viewport reads them.** They used to be
  worked out inline in `BanquetteCushions.tsx` to decide how wide to draw a bolster. The moment a
  length became a *price*, two descriptions meant **a cushion you can see and a cushion you are
  charged for could be different lengths, with nothing on screen looking wrong.** `returnRun` and
  `cornerSeatRadius` are now shared, and `findUpholstery` is shared for the same reason — a cushion
  drawn in one fabric and charged at another's rate is the same fault in money.
- **A missing rate is a sentence, never a zero.** `cushionProblems` names the cabinet on the quote's
  own warnings. This is the actual bug being fixed, so a later change that "helpfully" falls back to
  a default rate would reintroduce it.
- **The seat is charged at the cushion's width, not the cabinet's** — 1190 on a 1200 banquette at the
  shipped 5mm inset. The upholsterer makes and measures the cushion.
- **A rounded front corner does not lengthen the seat.** The cushion spans the same distance along
  the run; one corner of it changes shape. Charging the longer front edge would be reading "lineal
  metre" as "perimeter", which is not how a run of seating is measured.
- **A return is charged only when there is a back**, because a return *is* the back turning the
  corner. Switching the back off takes the returns with it.
- **No minimum charge, deliberately.** A stone fabricator's minimum is on `FabricationCharges`
  because it was stated; nobody has said whether this upholsterer has one, and inventing a plausible
  figure is the failure the unchecked list exists to prevent.
- **`$350/m` is flagged `indicativePricing` even though it is the shop's own number**, because it is
  an *allowance* — what he prices at before the upholsterer has quoted — rather than an invoice.

#### The one figure that is a reading

**The corner unit's seat is charged along its arc**, so a 500mm corner is 785mm rather than 500.
The reasoning: a lineal metre of seating is measured along the front of the run, and the front of a
quarter-circle connector *is* the curve. The alternatives are one leg — which charges a corner less
than the straight metre either side of it, for more work — or both legs, which charges the same seat
twice. **Nobody has put a corner unit to the upholsterer**, so it belongs with `ladderFaceScribeEnd`
on §3's unchecked list rather than being presented as a fact.

#### It re-prices saved jobs, and says so

**Project v27 and standards v20. This is the third migration in this file to make a saved job
dearer**, after v9 and v11, and it is their argument for the third time: no part that already
existed moves — nothing here produces a part at all — and the job gets dearer because it was being
quoted for less than it takes to build. A 3m run with a back is about $2,100 of upholstery no quote
mentioned. Both halves are asserted separately in `tests/cushionCost.test.ts`: a job with no
banquette in it comes through at the identical total **to the cent**, and one with a banquette goes
up by the cushions it always had. A rate a shop has typed itself is never overwritten.

#### What is left

- **The particleboard substrate is not modelled.** The shop supplies *"templates or particleboard
  substrates"*, and only the first costs nothing. A substrate is a real part on a real sheet, and
  adding one would change the parts of every existing banquette — so it wants asking for rather than
  assuming. It is the obvious next question here.
- **Nothing asks the upholsterer's minimum**, per above.
- **The corner seat's arc reading** is unchecked.
- Foam density, fabric metres and a fabric roll width are all still in the model and still unused,
  because a bought-in cushion needs none of them. They earn their keep only if the shop ever makes
  cushions itself.

**Where to look:** `costing/cushionCost.ts` for the charge and the argument;
`model/cushion.ts` for the lengths both the picture and the price read; `library/upholstery.au.ts`
for the rate. `tests/cushionCost.test.ts` is the contract and carries every figure longhand.

### 4.20 A machine has two heads — and the first profile that was read rather than guessed

Definition of done was stated as assertions before anything was written, per §6, and all of them
pass. **The whole of this section is downstream of `docs/woodtron-dialect.md`** — read that first,
because every figure below came off a program the machine actually runs and the point of the work
was to let the model hold them.

**The one sentence version.** `MachineProfile` had one clearance height, one plunge clearance, one
through overcut and one work offset buried in a preamble. A real nesting machine has **two of each**,
one per head, and twenty-one of its own files say so.

#### What the model could not express, and now can

- **Two work offsets, one per head** — `G54` MULTIDRILL, `G55` ROUTER. **This is the one that would
  have cost a job.** The two heads are bolted to the same gantry in different places and the machine
  keeps a separate origin for each, so a post writing one origin for both puts *every hole wrong
  relative to every cut*, by the distance between the heads. The file it writes is perfectly
  plausible: every coordinate is a number the machine accepts, every part is the right size, and the
  holes are simply somewhere else. There is no assertion about a part's size that catches it, which
  is why the test is about which word is written and when.
- **Two rapid heights** — the drill head rapids at +30 where the router rapids at +20. Straight off
  `Z46.3` and `Z36.3` on a 16.3mm sheet.
- **Two through depths, and this one is a safety rule rather than a preference.** A through *route*
  finishes 0.2mm inside the spoilboard; a through *drill* stops **exactly at the table**, because a
  Ø5 that overcut would be putting a hole in the bed on every through-hole, hundreds of times a
  sheet. `throughOvercut` is therefore per head, and the drill head's is zero on every profile —
  asserted as a difference between the heads so that setting the two equal fails.

**A tool says which head it is on, and absent means the router.** That is what decides everything
above: the post reads the head off the tool, writes that head's work offset when it changes, and
rapids to that head's plane. An ordinary tool table needs no answer and a drill bank cannot be added
without one.

#### The drill bank — solved, and still switched off

`DrillBank` was rewritten around dialect §6: a **flat list of spindles**, each with a position and a
diameter, rather than a pitch and a count. Both parts of that matter — the two rows do not share a
numbering origin (spindle 16 sits at Y160, not at 15 × 32), and a row is not all one size (`D3 7`
puts a Ø3 in the middle of a row of Ø5). `drillRow` builds a row from the pitch rule so a profile
does not hand-list seventeen entries, and `bitmaskSelect` reproduces every `B` code in the files —
`B1`, `B3`, `B31`, `B64`, `B32768`, `B65536`.

**It is not fitted, and the type is what stops it.** `WOODTRON_DRILL_BANK_WITHOUT_DATUM` is an
`Omit<DrillBank, 'datum'>`, so it does not compile into a profile until somebody supplies the field.
That field is the open question: whether a programmed coordinate positions the **reference spindle**
or the **head origin**. Both give identical holes on a symmetric pattern and differ by **128mm** on
an asymmetric one, and every drilled row in the twenty-one files is symmetric — so the files cannot
settle it and neither can re-reading them. It wants one part whose true hole positions are known.

Making the question a missing field rather than a comment is the same move as `bowedFrontProfile`
taking its edge with no default (§4.4) and `radiusCorner` having none (§4.5). A default here would be
a guess that compiles.

#### The Woodtron profile, and the four things it says are wrong with itself

`WOODTRON_NESTING_ROUTER` is in the picker beside the KDT. Z datum, clearance planes, plunge
clearances, through depths, work offsets, `G666` tool changes with `G49` before them, `H` equal to
`T`, a sparse `T1`/`T8` tool table, S24000, F21000, and the preamble and postamble verbatim — all
read, none guessed. The 10mm compression spiral it cuts with is a new `straight-10` in `library/
tools.ts`; a compression spiral is a straight-sided tool, because what it *leaves* is a 10mm slot and
§2's rule is that a cutter's section is the only thing deciding a cut's width.

**Four things are known to be wrong, and every one is on `unconfirmed`** — printed on screen, in the
report, and at the top of every program it writes:

1. **Parts do not come free.** The machine's two passes are **per sheet** — every contour down to a
   1.0mm skin, then a second sheet-wide pass taking them all through — and that is what keeps each
   part held on the vacuum while its neighbours are cut. The post finishes each part before starting
   the next, so it writes the first pass only. `leaveUncut` therefore ships at the machine's own
   **1.0mm**, and *that is the deliberate choice*: setting it to 0 to match the finished depth would
   have the post cut each part clean out in turn and free the first one under a spinning cutter,
   which is precisely what the two-pass structure exists to prevent. A program that does not finish
   is an inconvenience; one that drops a part loose is not.
2. **No holes are drilled at all.** Every drill on this machine is on the multidrill head, which is
   off, and nothing in the files bores with the router — so the tool table has no drill in it and
   every hole is reported by name and left out. Putting one in would be inventing a bit the machine
   has not been seen to hold.
3. **Arcs go out in I/J form** where the real programs use `R`; and every arc in twenty-one files is
   `G3`, so the direction round a part is fixed there and is not here.
4. **A rip is written like a contour**, with a lead-in ramp a full-width separation cut should not
   have.

#### What did not change, which is the invariant that protects everything already written

**Not one move.** Every program the KDT writes for the sample kitchen is byte-for-byte what it was —
same coordinates, same depths, same feeds, same G-words, `G54` in the same place — checked by
dumping all five programs before and after. The only difference in the whole output is one added
line of `unconfirmed` comment. The work offset moving out of the preamble and onto the head lands
exactly where the preamble put it, because it is written **before** the retract rather than after:
the clearance being rapided to is the *incoming* head's, so it has to be measured in the incoming
head's own coordinate system.

**Nothing about the Woodtron was copied into the KDT.** Twenty-one files exist for one machine and
none for the other, and the only KDT fact anybody has is the Z datum, from the shop directly. So the
KDT's two heads carry identical figures, and that sameness is a *statement that nobody has looked* —
it is on its `unconfirmed` list in those words — rather than a claim that they match.

#### Verified

948 tests, up from 910. Checked in the running app as well as in the suite (§7, read back off the
DOM): the Woodtron is in the machine picker, its nine `unconfirmed` lines render, and the
nested-for-a-saw refusal correctly names **10mm** for its cutter where the KDT's says 6mm — the §4.9
kerf check earning its keep on a second machine, which is the first time it has had one.

Three deliberate mutations were run to check the assertions bite rather than merely pass: swapping
`G54` and `G55` fails two, giving both heads the router's rapid height fails three, and moving the
work offset to after the retract fails one.

**Where to look:** `post/machine.ts` for `HeadProfile`, `DrillBank` and the Z helpers;
`library/machines.ts` for both profiles, with each figure's dialect section named beside it;
`post/iso.ts` for where the head is read off the tool. `tests/machineHeads.test.ts` is the contract
and carries the whole §6 spindle table and every `B` code longhand in its header.

### 4.21 A standalone panel stands edge out

Two bench reports, and **they turned out to be one fix**:

> "a standalone panel should stand perpendicular to the wall, not flat against it"

> "it faces edge out, it has to sit next to the cabinet like an applied panel"

The second is the one that decided the shape. A panel is used as a decorative end beside a run, so
what you see standing in front of it is its **banded edge**, and its face runs front to back. It was
built the other way round — lying flat along the run like a splashback.

**The two reports are the same change because a panel that sits like an applied end against a
cabinet is, by construction, perpendicular to the wall that cabinet backs onto.** So there is no
snapping change, no yaw special case, and nothing in `project/wallPlacement.ts` was touched. What
changed is which plane the board is built in.

#### The whole of it, in two places

**`specs/standalonePanel.ts`** builds the board in the ZY plane instead of the XY one —
`placement(v3(0,0,0), '+Y', '+Z')` where it was `placement(v3(W,0,0), '+Y', '-X')`. `w = u × v` is
derived rather than chosen, so `(+Y) × (+Z) = +X` puts the thickness along the run on its own. That
one line is the entire difference between a splashback and an applied end.

**`createCabinet`** swaps the two footprint fields for a panel: `width` becomes a nominal board
thickness and `depth` becomes the face width. Doing it there rather than at each call site means
every caller still says `width` and still means the panel's face width — which is what a person
types — and the Inspector's box is still labelled **Width** for the same reason. The label follows
the panel, not the axis.

**A special case disappeared, which is the sign the model is right.** `Viewport3D` used to
substitute the board's real thickness for `cabinet.depth` when snapping a panel, because the stored
depth was a nominal 16 with nothing to do with the board. Now a panel's depth *is* how far it
reaches into the room, so the general path is the correct one and the override is gone.

The other consequence is the reported symptom stated as a number: `snapToNeighbour` butts the next
cabinet along by `neighbour.width`, so a panel used to leave a **600mm hole** in a run where an
applied end leaves 16.

#### The migration, and the half of the rule that holds

**Project v28, and no part changes.** A panel comes forward the same rectangle, the same size, in
the same material, banded on the same four edges, one identical line on the cutlist, nested into the
same blank. Nothing on the saw is affected and nothing re-prices. What moves is the footprint, and
it has to: the two fields swap.

**One visible cost, taken deliberately.** A panel somebody had already turned by hand to work around
the old build keeps its yaw, so it ends up 90° from where they left it — one field in the Inspector
to put back. Un-turning it automatically would mean guessing which panels were workarounds and which
were meant, and a rule that silently straightened a panel somebody meant to turn is not something
you would notice until the job was built.

The **Turned** step is 90° for a panel, which is the rest of the first report. It rarely needs
turning at all now — beside a cabinet it takes the cabinet's own angle — so the step is for the case
where it stands alone. The box still takes a typed number, so an angled wall is not shut out.

#### Verified

957 tests, up from 948. The new ones assert **occupancy rather than size**, which is the §4.4
standard and is the whole point here: a panel turned the wrong way is exactly the same rectangle in
exactly the same material and passes any assertion that counts millimetres of board. Two deliberate
mutations were run to check they bite — restoring the old placement fails two, removing the
`createCabinet` swap fails one.

Checked in the running app per §7, reading the model back rather than looking at the picture: adding
a panel gives `width 16, depth 600, height 2400` at schema 28, and the Inspector still asks for one
dimension called Width and still shows 600.

**One test had to be corrected rather than added**, and it is the interesting one. The existing
"uses a selected sheet without an independent manufacturing thickness" test set `depth: 99` with a
comment saying the compatibility footprint must not size the part. After this change `depth` *does*
size the part and `width` is the spare field — so the test still passed while its comment said the
opposite of the truth. That is §5.13's lesson again: a test can pin an old build in place while
staying green.

**Where to look:** `rules/specs/standalonePanel.ts` for the plane and why; `project/factory.ts` for
the swap and `PANEL_FOOTPRINT_THICKNESS`; `migrateV27toV28` in `model/project.ts`.
`tests/standalonePanel.test.ts` carries the before/after table longhand in its header.

### 4.22 Three bench bugs, and the one that had already been fixed once

Reported together, with a screenshot of a quote reading `$NaN`. All three were real; **two of the
three had a "this was fixed" claim attached to them in this document**, and both claims were true
and both fixes were incomplete in the same shape — right change, wrong coverage.

#### The NaN quote, back through the door §4.14 left open

**§4.14's fix was not wrong; it was in the wrong place to be enough.** It repairs a *job* at project
v24 → v25. The two laminate rates it repairs also live in the **shop standards**, which are
versioned separately — and **not one of the twenty standards migrations had ever touched
`settings.labour`**. v18 → v19 is the laminate's own standards migration and it fills in
`constructions` and stops.

So the route nobody was watching:

1. A shop's stored standards keep the holes through the whole standards chain.
2. `createEmptyProject` copies them into a new job **verbatim** — §2's copy-never-reference rule
   working exactly as designed, and carrying the fault with it.
3. That job is stamped at the **current** schema, so the project chain that knows the repair never
   runs on it.

The job is born broken, at the newest version, and `0 * undefined` is `NaN` — so it hit a job with
**no curve in it at all**, which is what made the cause look nothing like the symptom for the second
time.

**Why the existing test suite was green throughout.** `tests/labourRateBackfill.test.ts` was
thorough and every case in it started at schema 22 or 24 — *below* the version that repairs it — so
the repair always ran. A test written from the job end cannot see a fault that arrives from the
standards end. The new cases are written from the standards end for exactly that reason.

Three changes, and the third is the one that matters beyond this bug:

- **`migrateStandardsV20toV21`** backfills the rates into the standards. This is the one that stops
  it recurring, because standards are what new jobs are built from.
- **`migrateV28toV29`** re-runs the backfill on jobs already made from broken standards — the sweep-up
  for the job that was on screen. **Nothing re-prices**, in the strong sense: a quote printing `$NaN`
  was never a number anybody could send, so there is no old figure to protect, and an intact job
  comes through to the cent.
- **`withBackfilledLabourRates` is shared by all three call sites.** v25's own comment said the
  generic backfill was the guard against a repeat — it guarded the *field list* and not the *chains*.
  Two version histories read `LabourRates` and only one was taught to repair it.

**And costing now names a rate it cannot use**, rather than producing `NaN` in silence — §4.19's
*"a missing rate is a sentence, never a zero"*, applied to the figure that has taken the whole quote
down twice. The check is driven off `DEFAULT_LABOUR_RATES`'s keys rather than the job's own, because
the fault is a key that is **absent** and iterating what is there cannot see what is not.

#### The Cost panel hid the one line that was broken

**`n > 0` is the wrong question and it cost a session.** `NaN > 0` is `false`, so every optional row
driven by a broken figure quietly removed itself. The screen showed Sheet goods, Cushions,
Manufacturing and Install all reading correctly, then `$NaN` from Total cost down, with nothing on
screen connecting the two — the Laminating row that would have pointed straight at it was the row
that hid. `shows()` in `CostPanel.tsx` is the fix: a figure that is not a real number is **always**
displayed, because a row that cannot compute is exactly the row somebody needs to look at.

#### A standalone panel had no rotation control — and §4.21 had genuinely shipped one

Both true at once. The **Turned** field existed and its 90° step for a panel was right; it sat inside
the `else` of `anchor && wall`, so **any** cabinet placed against a wall lost it entirely. §4.21's own
argument is that a panel standing edge out beside a run is perpendicular to the wall that run backs
onto — so the one type that most needs turning was the one type that could never reach the box. It is
now offered in both branches. Turning a wall-placed cabinet off square makes it free standing of its
own accord, because `wallAnchorOf` only claims a wall when the yaw matches within tolerance.

#### The cushion texture, and why the wiring beat the arithmetic

§5.4(b) — the shared cached `Texture` having its `repeat` overwritten — **was** genuinely fixed: UVs
are baked into the geometry and nothing writes to the texture. The live fault was one layer down.

`applyFabricScale` ran from a ref on the `<mesh>`. **A mesh ref fires when the mesh is created, and
the mesh outlives its geometry**: `<extrudeGeometry args={…}>` is a child, so changing the back
cushion's height, thickness or lean — or the cabinet's width — makes R3F build a new geometry and
attach it to the same mesh. The ref never fires again and the replacement keeps raw millimetre UVs.
Which is why *"draws in flat colour until the cabinet is removed and re-added"* was the exact
symptom: remounting is the only thing that re-fires a mesh ref.

The scaling now hangs off the **geometry**, which is the thing it has to follow. The square seat
cannot do that — drei's `RoundedBox` builds its geometry internally, so there is no element to
attach to — and uses a layout effect with **no dependency array** instead. That is deliberate rather
than lazy: listing dependencies there would be re-deriving drei's own memo and would go stale with
it. It makes `applyFabricScale`'s idempotence guard **load-bearing** — without it the UVs would be
divided again every frame and the weave would collapse to nothing — so the arithmetic moved into
`viewport/fabricScale.ts` where `tests/fabricScale.test.ts` can pin exactly that.

**One verification lesson worth keeping, because it nearly produced a false pass.** The first attempt
to reproduce the old behaviour put the ref back on the mesh *as an inline arrow function* — and it
worked correctly, which looked like evidence the bug was imaginary. An inline callback ref has a new
identity on every render, so React re-fires it; the original was a stable `useCallback`, which does
not. **A mutation test has to reproduce the original mechanism, not merely the original shape.**

#### Verified

971 tests, up from 957. Checked in the running app per §7, reading values back rather than looking:

- Seeded a browser with shop standards broken exactly as the bench's are — the two rates deleted,
  version 20 — and read the Cost panel out of the DOM: twelve rows, **no NaN**, no page errors.
- Placed a panel against the south wall and read the Inspector back: **"Along the wall", "Gap behind"
  and "Turned" all present together**, which the old code made impossible. Typing 90 turns it, read
  back off the model at schema 29.
- Walked the live three.js scene and read the cushions' UV ranges. After changing the back cushion's
  height its geometry is rebuilt and still scaled (max U 1.393 → 1.793, marked). **Reverted to the
  original wiring it comes back at max U 538 — raw millimetres, unmarked** — which is the reported
  bug reproduced as a number rather than an impression.

Three deliberate mutations were run to check the assertions bite: removing the standards migration
fails two, removing the project sweep-up fails one, removing the idempotence guard fails one.

**Where to look:** `withBackfilledLabourRates` in `model/project.ts` and its three call sites;
`migrateStandardsV20toV21` in `standards/standards.ts`; `shows()` in `panels/CostPanel.tsx`;
`viewport/fabricScale.ts` for the arithmetic and why the guard matters.
`tests/labourRateBackfill.test.ts` carries the route through the standards chain written out, and
its second half says plainly which half of the cushion fix a test can reach and which needs the app.

### 4.23 The banquette finishing pass — the three that were left of §5.14

Definition of done was stated as assertions before anything was written, per §6, and all of them
pass. All three items shipped on one branch, which is what §5.14 asked for, because two of them
re-price and that argument is better made once. **996 tests, up from 971.**

#### The cushion stands 10mm proud of the finished front

> *"it should be adjustable — but generally should be 10mm proud of the finish panel/door"*

`seatCushionInset` held the cushion **5mm inside every carcass face**, so you looked down onto a
strip of white carcass all round it — *"standard straight run cushion is exposing the carcass"*.
`seatCushionOverhang` measures the other way, from the other datum: **proud of the finished front,
flush at the ends and the back.** On the shipped banquette the seat goes from 1190 × 490 to
**1200 × 530**.

**Only the front carries the overhang, and each of the other three is a physical answer rather than
a simplification.** The back goes against a wall, so a cushion proud there is a cushion the wall
pushes forward. The ends butt the next unit in the run — two cushions each 10mm proud of their own
end overlap by 20, and a run is the normal case. And a *finished* end does not change that: this
codebase already said so, in `banquette.ts`, which describes an applied end's top edge as sitting
*"at seat height with a cushion beside it"*. Beside, not under. That sentence was written for
another reason and answered this question.

**The rounded corner falls out instead of needing a rule.** Proud at the front and flush at the end
sounds like two edges that cannot be joined, and they join exactly: the cushion's fillet is the
**same radius as the carcass arc with its centre moved forward by the overhang**, still tangent to
both. The overhang then eases from 10mm at the front tangent to nothing at the end tangent, which is
what a soft corner does. One arc, one radius, and no second number to keep in step — where the old
code had `r − inset`, a second radius that could disagree.

**The corner unit takes no overhang, deliberately.** On a quarter disc the two straight edges are
*radii of the same circle* as the arc, so pushing the arc 10mm into the room pushes both edges 10mm
into the banquettes either side. "10mm proud of the finish panel" has no meaning on that outline —
and §5.13 item 1 says the outline is wrong in kind anyway. It goes **flush**, which closes the
reported fault there too, and takes the overhang when it gets its real L-shaped plan.

**Project v30 and standards v22, and it is the fourth migration in this file to make a saved job
dearer**, after v9, v11 and v27. The old field cannot be carried forward and that is the whole
reason this is a migration rather than a rename: the two measure **opposite directions from
different datums**, so no arithmetic turns a 5mm inset into the figure a shop would have typed had
they been asked about an overhang. A shop that typed 20 wanted the cushion held *further in*. So the
field is dropped and the shop's own 10mm is adopted. §4.19 charges the cushion's own width, so a
1200 banquette with a back goes from 2 × 1190 to 2 × 1200 of upholstery — about $7. Small, real, and
said out loud.

**Both chains, and that is §4.22's lesson applied rather than repeated.** A saved cabinet *type* in
the shop standards carries a full `CabinetOptions`, so repairing the job and leaving the recipe would
mean the next banquette placed from it arrived carrying a dead field and no overhang at all.
`withCushionOverhang` is shared by both chains rather than written twice.

#### A false front takes no reveal

`fixedFrontPanel` cut `H − revealTop − revealBottom` by `zone.width − 2 × revealSides`: 3mm short at
the top, 1.5mm at each end. **A reveal is clearance for a door to swing** — `revealTop` is 3mm
specifically so a door can open under a benchtop (§3) — and a false front takes no hinges, never
opens, and has a cushion above it rather than a benchtop. So the gap was clearance for a movement
that never happens, and all it did was show the white band along the top of the photograph. The
front now fills its zone exactly, and in a run two fronts **meet** instead of leaving a 3mm line.

`doorZone` still stops it at the fixing strip on a radiused unit, which is right: a strip is
structure, not clearance. **This re-cuts every banquette front in every saved job** — a rule change,
not a migration, so nothing carries the old size forward. It is named in v30's comment because the
two shipped together and a shop opening a saved job sees both. A base cabinet's door is asserted
untouched in the same test file, because that is the invariant protecting everything else.

#### The finish laminate is drawn, its absence is said, and it is charged only when it exists

`Panel.finishMaterialId` is new: **what is applied over the A-face after machining, never what the
part is cut from.** `wrapLayers` sets it to the **door decor** on the outer layer only — which is
what the laminate is, one sheet over the outside of the finished wrap, and what a shop orders, 1mm
matched to the doors. `materialId` still says bendy ply, so the cutlist, the nest and the CAM do not
move; §5.0's *"a dimension, not a part"* stands. What was missing was never a part — it was the fact
that **the finished face is not the face of the board.**

**There was a third disagreement nobody had found, and it is the sharpest.** `costing.ts` counted
*every* curve as laminated — any cabinet with a `skin` — and charged a sheet plus its labour whether
the method carried an allowance or not, while `substrateRadius` sized the formers off the same
allowance and got the other answer. So a job migrated by **v23, whose own comment says "nothing is
re-priced"**, was cut with no laminate in it and quoted with one: up to a $400 sheet for material
nobody buys. **That is the sixth stale claim caught, and the first that was a migration's own
promise about itself.** Both now read one predicate, `isLaminatedCurve`.

**And the zero is now a sentence.** `finishLaminate` migrates to zero on purpose, so a shop's curve
may genuinely be bare bendy ply — and drawing it honestly is not enough, because bare ply is also
what a curve looks like when nobody has noticed. `cornerRadiusProblems` says which, in millimetres,
on the cabinet. Not an error: a shop that veneers or paints its curves has a perfectly good bare
wrap, so it says what it will look like rather than what to do about it.

#### The fault the running app found, which the tests could not

**§5.14's own fix was half done and its test could not see the other half.** The last pass corrected
both cushions' **size** for the extrude bevel. It did not correct their **placement**, and the growth
is not symmetrical about the mesh origin: it runs from `−b` to `length − b`. So the back cushion and
both end bolsters were exactly the right size and **one bevel out of place on all three axes** — 18mm
into the wall at the back, 18mm off the end of the seat, and 18mm below the seat they rest on.

Measured in the live three.js scene: `x [18, 1218], y [462, 862], z [−18, 62]` where the model says
`[0, 1200] × [480, 880] × [0, 80]`. Confirmed as the bevel rather than an off-by-one by changing the
soft edge to 4mm and watching the displacement become exactly 4. **Every size assertion the last
pass added passes on the misplaced cushion**, which is the whole lesson: assert occupancy, not size —
§7 says it, and this is the second session running that this cushion has been the thing that taught
it.

The arithmetic came out of the JSX into `viewport/cushionMesh.ts` so it can be asserted rather than
looked at. Two figures that were written out twice under two names, identically, are now one — which
is how the placement came to be corrected in neither.

**The seat's own mesh followed later, and finished the job**: `seatCushionMesh` decides which of the
two shapes a seat is, how big it is and where it goes, so **the square branch and the rounded one
can no longer disagree about the size of one cushion** — which is what the 36mm was. That is now an
assertion rather than a hope: the same cabinet, drawn either way, has to come out at the identical
box. Its rounded corner is drawn through the model's own arc code instead of three.js's `absarc`,
which is the one thing here that changed the picture rather than moving it — the curve went from 12
segments to about 32, and the shipped 200mm corner measures **200.005mm at its widest in the running
scene**, five microns of polygon-offset artefact on a soft furnishing.

#### Verified in the running app (§7)

Read back out of the live scene rather than judged from a screenshot, on a job with three banquettes
and walnut doors:

- Seat cushion `x [0, 1200] × y [400, 480] × z [0, 530]` — flush at both ends and the back, 10mm
  past the 520 door face. Back cushion `[0, 1200] × [480, 880] × [0, 80]`, sitting exactly on it.
- Both end bolsters flush with the ends at `x [0, 80]` and `[1120, 1200]`, running `z [80, 528]` —
  starting in front of the back cushion and stopping at the front of the seat, symmetrical.
- Fronts `1200 × 400` and `950 × 400` on the radiused one, both `y [0, 400]`: full height, no band.
- **The curve's outer skin draws the `notaio-walnut` texture — the same map as the flat front beside
  it — over an inner layer still in `#d9bd90` bendy ply.** That is the bench photograph fixed.
- With `finishLaminate` at zero the same curve draws two layers of bendy ply, and the warning
  reaches both places a cabinet warning goes: the list's warn-dot and the Inspector.

Seven deliberate mutations were run to check the assertions bite, each reproducing the original
mechanism rather than its shape: the inset cushion fails 5, the reveal on the front fails 3, costing
counting every curve fails 1, a finish on every wrap layer fails 1, dropping the standards migration
fails 1, carrying the old number forward fails 2, and the old mesh placement fails 3.

**Where to look:** `model/cushion.ts` for the plan and why only the front is proud;
`rules/parts.ts` `fixedFrontPanel`, `wrapLayers` and `isLaminatedCurve`; `model/panel.ts`
`finishMaterialId`; `viewport/cushionMesh.ts` for the placement; `migrateV29toV30` and
`migrateStandardsV21toV22`. `tests/banquetteFinish.test.ts` is the contract and carries every figure
longhand.

---

### 4.24 The Inspector folds, and three things were clipped that nobody had measured

§5.11's last two entries, and the reason they are one session rather than two: *"the input for the
bottom front is partly off-screen"* and *"any other user may struggle"* turned out to share a
mechanism, and neither was what it said on the tin.

**Everything here was measured in the running app before anything was changed**, per §7, and the
numbers are why the work went where it did. On a 1366 × 768 laptop, with the sample kitchen:

```
one drawer bank's Inspector      2242px of controls in a 712px window — 3.1 screens
the left column, all of it       2513px, scrolling as one strip
the Parts list Delete buttons    41px past the panel — they read "De"
text at 11px or smaller          781 of ~830 pieces of text on screen
```

**The report was not about drawer fronts.** `.field > span` was `flex: 0 0 auto` and
`.field-input` was `flex: 0 1 150px`, so the box was the only thing in a row allowed to shrink and
a long label ate it. `Front 1 (bottom) — E — 192mm` is the longest label in the app at 186px, which
left its box **50px** against the 102px its `Front 2` neighbour kept. Nothing was off-screen; one
control was half the size of the identical control beneath it. The same rule was quietly clipping
the `mm` after every wider row, which is why those read "mn".

**And folding the Inspector could not have fixed the scrolling on its own**, which is the part
worth carrying forward. The cabinet list and the Inspector shared one scroll column, and nine
cabinets is 659px of list — so the Inspector's first field started below the fold *however short
the Inspector was*. The height in the way belonged to something else. The left column is now two
panes that scroll independently, the list capped at 40%, and the cabinet you click is on screen
because it cannot be pushed off.

**What folding costs, and what pays for it.** A shut section that says nothing is
indistinguishable from one with nothing in it — §4.18's lesson arriving in the UI. So every
section that can hold a departure from the default carries it on the header while it is shut: "1
deleted", "3 overrides", "2 cutouts". A cabinet on the job defaults shows nothing rather than a
row of zeroes. **Fold away the controls, never the facts.** The decisions live in
`panels/inspectorSections.ts` rather than in the component precisely so they can be checked in
Node — `tests/inspectorSections.test.ts`, 14 assertions.

Verified against the DOM at **1280 × 720, 1366 × 768, 1600 × 900 and 1920 × 1080** — the shop runs
this on various screens — 23 assertions, all passing:

- the Inspector has **200px+ on screen** for all nine cabinets, at every size
- **folded, the whole map fits its pane** at every size, so every heading is reachable at once
- **nothing overhangs its panel** — five tabs, the Inspector with every fold open, and Settings
- **no input under 100px**, which is the drawer front report asserted by width
- **no text under 12px**
- a deleted part still reads "1 deleted" with Parts shut, and survives a reload

**Six deliberate mutations, each restoring the original mechanism rather than its shape**: the
fixed-width label fails 1, the auto-layout Parts table fails 1, the 12px section margins fail 1, a
summary that stops rendering fails 1, the single scrolling column fails 1, an 11px heading fails 1.

**One mutation did not bite, and it is the useful one.** A test asserting that a part put back
stops counting survived a summary that counted override *records* instead of departures — because
`withPartOverride` prunes a record that no longer says anything, so there is no record to
miscount. The comment above that test claimed a mechanism this codebase does not have. It is
corrected in place rather than deleted, because it still fails when the pruning and the counting
go loose together — but it is not the test of the counting, and it said it was. **A test's stated
reason can go stale exactly like a doc comment, and only a mutation finds it.**

**One thing this did not touch and should be said plainly:** the Settings modal is 1277 lines and
had no pass beyond the clipping check and the type size, and the nine "+ cabinet type" buttons
still wrap to three lines above the list. Neither is clipped and neither is small; both are still
cluttered.

**Where to look:** `panels/Section.tsx` for the fold and why it is `<details>`;
`panels/inspectorSections.ts` for the defaults, the stored-preference merge and the summaries;
`store/persistence.ts` `UI_KEY` for why the fold state is a third key rather than a field on the
job or the standards. **No schema change** — v36 and standards v27 stand, and a saved job opens
unaffected, which is the §4.23 question asked in advance for once.

---

### 4.25 The Settings window groups, and a setting nobody could reach

The other half of §5.11's *"any other user may struggle"*, and it was not the screen §4.24 expected
to find. **The Settings window was never the mess the Inspector was** — it was already tabbed seven
ways, nothing in it was clipped, and three of the seven tabs fitted on a laptop screen as they
stood. Measured at 1280 × 720 before anything changed, in a 439px modal body:

```
Joinery          1474px — 3.4 screens, 26 settings in one flat list
Hardware          872px — 2.0 screens
Materials         744px — 1.7 screens
Costing           742px — 1.7 screens
Door styles / Standard sizes / Room     already fit
```

So the work was **grouping**, not shrinking, and the distinction matters: folding fixes a height,
grouping fixes finding a thing. Joinery is now six groups in the order you build the cabinet —
carcass and back, kick and plinth, fronts and reveals, shelves and system holes, curves, applied
ends — and Hardware, Materials and Costing fold at seams the screen already had as headings.
Every tab's map now fits its window at 1280 × 720 through 1920 × 1080.

**A setting existed that nothing on screen could change, and the grouping is what found it.**
`finishLaminate` has been on the construction method since §4.23. It has a label in
`labelForConstructionKey`, it is read by the rule engine, it appears in
`differencesFromStandards` when it drifts — and its own doc comment says *"adopting it is a
deliberate edit per method"*. There was no control, on any screen, to make that edit with. §4.23
deliberately migrated every existing method to zero so a job already quoted kept cutting the way
it was quoted, which was right, and left the shop no way to ever adopt it, which was not. It has a
control now, in the Curves group.

**The grouping is asserted total, not remembered.** `CONSTRUCTION_FIELDS` is a flat list, so a
group written as "the keys I remembered" drops the next setting somebody adds — it would exist,
drift, and have nowhere to be. That is §4.15's fault in a new place. `tests/joineryGroups.test.ts`
asserts **every settings key on a `ConstructionMethod` is in exactly one group**, counted against
the model itself rather than a second list: 30 keys, less `id`, `name` and `family`, is 27
settings, and 27 are grouped. `finishLaminate` is what that assertion caught, and it is the
argument for it.

Verified against the DOM at **1280 × 720, 1366 × 768, 1600 × 900 and 1920 × 1080** — 17
assertions, all passing:

- **every tab's map fits its window, folded**, at every size
- **nothing is clipped** — seven tabs, folded *and* with every fold open, in both scopes
- **no text under 12px**, on every tab
- a shut group **still says how far this job has drifted from the shop standards**, and only the
  group that holds the change says it
- the **"not yet checked at the bench" list is never inside a fold**, and neither is Hardware's
  catalogue list
- both panels **remember their own folds and neither clobbers the other** — one stored record, and
  writes merge

**Six deliberate mutations, each restoring the original mechanism**: Joinery rendered flat fails 1,
a summary that stops rendering fails 1, drift counted over the whole method instead of the group
fails 1, the bench warnings moved inside a fold fails 1, ignoring the stored folds fails 1, and
removing the laminate control fails 1.

**What a folded group says here is different from the Inspector's, on purpose.** The Inspector
badges a departure from the *job default*; this screen badges a departure from the **shop
standards**, because that is what the screen is for and it is already what the footer counts. A
method the standards do not have at all badges nothing per group — it is one line in
`differencesFromStandards`, by name, and counting all 27 keys as drift would drown the groups that
genuinely moved.

**Where to look:** `panels/joineryGroups.ts` for the six groups and the drift summary;
`panels/settingsSections.ts` for every fold id in the modal, one defaults record, and the oversize
board summary; `panels/Section.tsx` for why two panels can share one stored record. **No schema
change** — v36 and standards v27 stand.

---

## 5. Open items, in the order I'd do them

**5.2 has shipped — see 4.6.** What is left of it is Hettich and a handful of gaps, listed below.

**5.5 and 5.6 have shipped together — see 4.7.** They wanted the same answer to "what owns a thing
that spans a run?", so doing them apart would have meant answering it twice.

**Phase 3 has shipped — see 4.8.** What is left of it is in the new §5.9, and none of it blocks
anything.

**Phases 4 and 5 have shipped — see 4.9.** What is left of them is §5.10, and the first item on it is
the only one that matters.

**5.8 has shipped, both halves — the wireframe view and real decor textures.** They were listed
together because they are the two ends of one slider and live in the same three files, and doing
them together is what happened. §5.8 now records how the textures work rather than what they should
be, including the part that exceeded the plan: a decor is mapped from the part's **position on the
nested sheet**, so the 3D view reads the cut plan.

**The banquette in 5.4 shipped, was rejected at the bench, and has been rebuilt to the shop's own
answers.** Solid fixed front in door decor, hinged lift-up inset flush into the top, no divider
below a 1200mm clear span, nothing overhanging anything. **Its rounded corner now reaches the lid,
the front and the cushion, and applied ends build on one — see 4.15**, which is also where the
stale "only built on base, wall and tall" warning went and why each spec now declares what it
supports. What is still open there: the **lid stay is not modelled**, the corner unit has never been
asked the same access question. The **cushions are costed now** — §4.19, bought in whole from the
upholsterer at $350 a lineal metre per cushion — and a cushion nobody can price now says so instead
of quoting at zero. **And the finishing pass is done** — §4.23: the cushion stands proud of the
front, the front is cut full height, and the curve carries its laminate.

**If asked which to do next: the drill bank is one measurement away and is worth more than
everything else open put together. Nothing else is blocked.**

**The one thing to get off the shop: one real Woodtron part whose true hole positions are known** —
a shelf-pin row measured off a known edge. That settles whether a programmed coordinate positions
the **reference spindle** or the **head origin**, which is the only thing keeping the drill bank
off. The spindle map is solved; the bank is one field away. **128mm is the cost of guessing**, every
drilled row in all twenty-one files is symmetric, and no amount of re-reading them can separate the
two readings. Until it is answered every hole is reported by name and left out, and the shop bores
them on the borer.

**Unblocked, in the order I would take them:**

- **A part too big for its sheet is silently not nested**, §5.13 item 6. Design questions before
  code, and it is closer to a benchtop's `joins` than to a nesting tweak. **It is the only item on
  either August list still open.**
- ~~**Sheet sizes, the tail of §5.13 item 7.**~~ **Closed in full.** The wait was for a published
  range, and suppliers publish the **nominal** — so the figure this file kept asking for was never
  coming, while the shop's own rule had been on the table twice: *"the sizes are not to be trusted …
  as per my previous advice allow 20mm in length and 10mm in width for all mdf prefinished boards.
  Why was that advice ignored?"* Every footprint now traces to the shop or the machine, plywood and
  the two laminates included — v33/v24, v34/v25, v35/v26.
- ~~**The custom cabinet whose part list is itself data**, §5.13 item 3.~~ **Built, both halves and
  the millimetre after them** — the model, the Parts-list editor, and a part centred on its own
  board. Nothing is left on it.
- ~~**A test behind the corner cushion's mesh placement.**~~ **Done** — `insideCornerSeatMesh`, and
  the end of §5.13 item 1 for what it caught and what was measured to confirm it.

**~~The one with the most value in it: write the Woodtron's second pass.~~ Done.**
`writeSheetProgram` now walks the operation list twice: every contour to the 1.0mm skin, then
`(NEXT OPERATION)` and a sheet-wide sweep taking each skinned perimeter through at a single plunge,
exactly as the machine's own files have it. It was a change to how the writer *walks* the list
rather than a new number, as §5.10 said it would be.

**Three things about it are worth keeping.** The second pass is **per sheet, not per part**, and
that ordering is the only thing an assertion can see: a per-part writer produces the same two
depths, the same number of times, in the same file, interleaved — so `tests/cam.test.ts` asserts
that no through cut appears before the marker and no skin cut after it, and counting would have
passed on the bug. The second pass is a **single plunge**, not a stepped descent, because there is
only 1mm of board left there. And **`leaveUncut` stays at 1.0**: the fix was never the number, it
was where the number comes off, and setting it to zero still cuts each part clean out in turn.

**It cleared a stale claim of its own making.** `PARTS DO NOT COME FREE` was the first line of the
Woodtron profile's `unconfirmed` list and printed at the top of every program the machine was
handed. It was true, it stopped being true, and it went with the commit that made it false — along
with the test that pinned it. That is the seventh stale claim in this file and the first that was
retired *on purpose* rather than caught later.

**It also reaches the KDT**, whose `leaveUncut` is 0.2mm — so its parts did not come free either,
quietly, and now do.

**One is still waiting on the shop, asked and unanswered:**

- **One Woodtron part whose true hole positions are known** — a shelf-pin row measured off a known
  edge. That settles whether a programmed coordinate is the reference spindle or the head origin
  (§4.20), which is the only thing keeping the drill bank off. The map is solved; the bank is one
  field away. **128mm** is the cost of guessing, and no amount of re-reading the files answers it.

**The banquette corner, in more detail**, §5.13 item 1. The
shop's answer arrived in the session that fixed §4.22's bench bugs and was deliberately not built in
it, because that session was scoped to those bugs. **It is not the shape anybody had assumed.** The
seat is an **L** — a span along each wall, a run's depth off each, ~900 and 500 in the shop's own
example — with a small **concave fillet**, ~150mm, where the two seat fronts meet. So `validate`'s
`W = D = insideCornerRadius` has to go: those are three separate numbers, seat depth becomes a real
input, and the lid, the backs and the cushion all follow the new outline. Read §5.13 item 1 before
starting; it has the shop's words and what falls out of them.

**§4.23 left it two things.** The corner unit's cushion is now **flush** rather than 5mm inside the
carcass, which closes the exposed-carcass half of the report — but it takes **no overhang**, because
a quarter disc's two straight edges are radii of its own arc and pushing the arc into the room pushes
them into the units either side. Give it the shop's 10mm when it has an L to be proud of, where the
two seat fronts are real edges. And §4.19's corner-seat arc charge still measures that quarter
circle, so it moves with the outline.

**The KDT is a separate and still-open question.** Every one of the twenty-one files is a Woodtron
and **nothing has been carried across** — the only KDT fact anybody has is the Z datum, from the
shop directly. One program off it would do for the KDT what those did for the Woodtron, and
`library/machines.ts` says at the top exactly what to compare and in what order, with the Woodtron
doc as the worked example.

**The banquette finishing pass is done — all four of §5.14, see §4.23.** The cushion stands 10mm
proud of the finished front and is adjustable, a false front takes no reveal, and the finish laminate
is drawn in the door decor, said out loud when it is absent, and charged only when it exists. It
re-priced saved jobs (v30 / standards v22) and re-cut every banquette front, both deliberately and
both said out loud. **The one thing deliberately left there:** the corner unit takes no overhang,
because a quarter disc's straight edges are radii of its own arc — it gets one with §5.13 item 1's
real outline.

**For the app: everything named here has shipped** — the out-of-step indicator is §4.18, getting a
job out of the browser is §4.17, §5.12's custom part features are §4.16, the cushions are §4.19, and
the standalone panel standing edge out is §4.21. **§5.11 and §5.13 are what is left of the two
August lists.** What has the clearest shape now:

- **The particleboard substrate under a bought-in cushion**, which §4.19 deliberately did not build.
  The shop supplies *"templates or particleboard substrates"* and only the first costs nothing; a
  substrate is a real part on a real sheet, so adding one changes the parts of every existing
  banquette and wants asking for rather than assuming. It is the obvious next question.
- ~~**Sheet sizes off Polytec's and Laminex's published ranges.**~~ **Done, and not that way** —
  see §5.13 item 7. The published ranges quote the nominal, so what closed it was the shop's own
  rule applied to both classes of board rather than a catalogue figure.
- **A pass over the whole UI.** The user's own words are *"any other user may struggle"*. Bigger and
  vaguer than anything else here, and worth agreeing a definition of done for before starting.

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
  reads the true shape is §5.9.
- ~~**The corner radius finishes at the carcass, not at the finished front face.**~~ **Fixed.**
  Raised from the bench as *"why has the radius applied to cabinets not updated to meet the
  finished door depth yet?"* — and it never had. Every figure in `resolveCornerRadius` was measured
  off the carcass depth `D`, so on a 900 × 560 base with 18mm doors the curve finished at 560 while
  the doors either side finished at 580. Twenty millimetres — a 2mm standoff plus the door — behind
  the fronts, on the one corner of a kitchen where the board *is* the finish.

  It is struck about `finishedFrontZ` now, so the arc's centre moves forward with the plane and the
  laminated face lands on the doors' plane exactly. Verified end to end: outer ply at 579, plus the
  1mm finish laminate, is 580 — the door face — and 899 + 1 = 900 across.

  **Two consequences are worth knowing before reading the geometry.** The substrate now sits
  *forward* of the carcass front rather than behind it: at a 200 radius the plate reaches z = 564,
  4mm proud of the 560 carcass, because forward of the end panel the plate is the only thing
  holding the curve. And the curved kick's radius dropped three compensating terms — it read
  `r + td + frontStandoff − kickSetback` and now reads `r − kickSetback`, because the kick and the
  carcass curve finally share a centre. A compensation disappearing rather than being re-tuned is
  the sign the datum was the thing that was wrong.

  **This re-cuts every radiused cabinet in every saved job, and no migration can prevent it.** The
  other part-moving changes in this file — v13, v15, v16 — each added a *field*, so an old value
  could be carried forward. This is a corrected derivation with nothing to carry: the old numbers
  were wrong, not merely different. A job with a curve in it that was quoted before this must be
  re-checked against the new figures before it is cut.

  **`radius = width = depth` no longer degenerates into the quarter-round unit — `radius = width =
  finished depth` does.** The radius consumes the cabinet when it reaches the plane the curve is
  struck about, which is 580 on a 560-deep carcass. `tests/cornerRadius.test.ts` states it that way
  now. The standalone radius-end unit is untouched: it carries no doors, so its own front face is
  its finish.
- **The plan view draws a cabinet's footprint as a rectangle**, so a radiused corner reads
  square there. Cosmetic.
- ~~**A benchtop over a radiused base cabinet is still a rectangle.**~~ **Done — see 4.13.** The
  top takes the cabinet's own radius, and it is owned data seeded from the run rather than read
  back off the cabinets at build time.
- **A curve carries a 1mm finish laminate over the ply**, applied by hand after machining so it
  shows the same decor as the doors. The formers and the wrap are cut a laminate under size, so the
  finished face lands on the radius that was asked for and the cabinet a client measures does not
  change. Shipped at 1mm on new methods; **saved jobs and standards migrate to zero** (project v23,
  standards v19) because a curve already quoted was cut without it. It is a dimension, not a part —
  nothing is machined for it, and whether the laminate itself should be costed and ordered has not
  been asked.
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

- **Existing jobs and saved shop standards can still select the old 3mm bendy ply.** The shipped
  default was corrected to `bendy-ply-8`, but the change deliberately did not overwrite a job's
  snapshotted `skinMaterialId`; doing so would silently change former radii, developed skin lengths,
  plate sizes and price on an already quoted job. This is why an older job can still show and cut
  3mm while a genuinely new job uses 8mm. **The cabinet warning and confirmed one-click upgrade are
  now done:** a legacy curve says that its former radii, skin lengths and price will change, and the
  old selection remains until the user accepts. **The standards-level half is now done too:** the
  Materials screen identifies a legacy 3mm job or shop default and offers an explicit switch to
  8mm, while leaving existing quoted geometry unchanged until that button is used. A future refinement
  can show the exact before/after dimensions and price rather than naming what will change.
- ~~**Nesting doesn't understand a curve.**~~ **Half of this was a misreading and is now
  corrected.** A radiused shelf reserving the rectangle it fits inside is not a gap for a *saw*, it
  is what cutting one on a saw means: the blank comes off the sheet and the curve is cut from the
  blank. §4.8 says so at length. The offcut between the curve and the corner is genuinely invisible
  to a **router**, which could nest another part into it — and that is §5.9, a different cutting
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
- **The full MERIVOBOX height range.** **N, M and K are now shipped from verified Blum planning
  data:** 68.5/60.5, 91/83 and 129/121mm for side/back respectively, with N restricted to NL
  400–550 and K to NL 300–600 so the app cannot pair a side with a length Blum does not sell.
  What remains is E height. It is an M side built up with gallery, BOXCOVER or BOXCAP—not a fourth
  solid profile—so those must be distinct hardware configurations with an honest BOM. They share
  the verified 184mm chipboard-back height but do not share the parts being ordered.
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

- **Standalone panels as a cabinet type — first version shipped.** The user can place an individual
  rectangular panel in the room as a first-class unit, edit its face width/height and select its
  sheet material. Its thickness is the selected sheet material's actual thickness, the
  same single source of truth used by every generated cabinet part; independently typed thickness,
  laminations and adjustable/build-up versions are later extensions. It snaps flush to walls,
  cabinet carcasses and applied-end outer faces. It flows through the same panel
  record, viewport, cutlist, nesting, costing and CAM paths as generated cabinet parts rather than
  becoming a separate drawing-only object. This is for fillers, scribes, loose ends, backing pieces
  and other job panels that do not belong to a carcass. This first version is vertical-grain and
  bands all four edges; per-edge banding is the next control, not hidden data. **Grain is now
  editable** — see the entry below.
- ~~**No option for grain direction.**~~ **Done, per cabinet, and it reaches a standalone panel.**
  Asked for from the bench as simply *"i dont seem to have an option for grain direction"*, and
  the control was indeed missing everywhere: grain was chosen by each part builder, shown
  read-only on the cutlist, and settable nowhere. `CabinetOptions.grainDirection` is now
  `'vertical' | 'horizontal'`, unset meaning each part keeps whatever its own shape wants.

  **The translation is the whole of it, and it is a trap worth naming.** A `GrainConstraint` is
  relative to the **part's own length**, and a door's length runs up it while a drawer front's runs
  across a bank — so `length-along-grain` is a *vertical* grain on one and a *horizontal* grain on
  the other. The same value, opposite directions. Handing that enum to the user would be handing
  them a control whose meaning changes per part, so the option is stated as the room sees it and
  `grainForFront` in `rules/build.ts` translates it by reading back the part's `u` axis. That is
  the same move `machineFront` makes three lines earlier to keep a V-groove upright on a drawer,
  and it is the same class of error as writing part-space hardware coordinates by hand: the wrong
  answer is the right *size* and passes anything that only measures the part. `tests/banquette.test.ts`
  therefore asserts a real-world direction on both a door and a drawer front, and asserts that the
  two come back with **different** constraints from one setting.

  Resolved in `build.ts` rather than in the part builders, for the reason §4.3 gives about door
  styles: fronts are produced in several places, and a rule wired into three of them is a kitchen
  with one door cut the wrong way.

  **Which parts it governs is its own list, and that is deliberate.** `GRAIN_CHOICE_ROLES` is the
  styled fronts *plus* `panel` — a loose panel is nothing but a show part, and *"standalone panels
  need grain direction"* came straight back from the bench once the fronts had it. The obvious
  shortcut is to add `panel` to `STYLED_FRONT_ROLES` and reuse that; **do not.** That list decides
  what a **door style routes**, so it would cut shaker grooves into every filler, scribe and
  backing piece in the job. The two lists overlap on doors because a door is both a styled front
  and a part whose grain you choose — they are answering different questions, and
  `tests/standalonePanel.test.ts` pins them apart with a panel built under `shaker-57` that comes
  out with no front-style features on it.

  Carcass parts are left alone. A carcass part's grain is a construction fact rather than a
  preference, and on white melamine it is `any`, which is exactly what lets the nester turn it for
  yield; overriding that would cost board to no visible end.

  **It reaches the nest, not just the picture.** `orientationsFor` turns a grain constraint into
  the orientations a part may take on the sheet, so on a grained decor a door switched to
  horizontal goes from `as-cut` to `turned` — the cut plan, the sheet count and the 3D texture all
  follow. On an ungrained white melamine nothing moves, which is correct rather than a gap.
- **Banquette seating — rejected at the bench, and rebuilt to what the shop actually builds.**

  > "the banquettes are not currently fit for purpose — I would never build them as they currently
  > come in, I would have a solid front maybe with some kind of inset lift up below the cushion to
  > access the space for long term storage — the overhangs don't make sense as they default either"

  Three faults, the geometry backed all three, and all three are now fixed. Keeping the record of
  what was wrong because the *shape* of the mistake is the lesson: every one of them passed a test
  suite that counted parts and never asked where they were.

  **There was no front of any kind.** A 1200 banquette built Side L, Side R, Bottom, Back, Divider
  and Lid — you looked straight into the carcass. Worse, `customCabinet.ts` *warns* when a lid and
  a door are combined, so the model actively discouraged the one arrangement the shop builds.
  **Access was wrong in kind, not in detail.** A slab sat on top of the carcass; what a banquette
  has is an inset panel under the cushion, hinged at the back. **And the overhang default was
  incoherent across the two banquette types.** On a 1200×500 carcass the lid came out **1240 × 520
  at x = −20** — 20mm proud at both ends and the front — while `banquette-corner`'s lid was **500 ×
  500 at x = 0**, dead flush. Put the two together, which is the entire reason the corner exists,
  and one lid stood 20mm proud of the other; two plain banquettes overlapped their lids by 40mm and
  could not be built at all. The cushion compounded it — sized off the *carcass* at 1190 against a
  1240 lid, so a 25mm ledge stuck out all round underneath it, which is what made the render look
  wrong before anything was measured.

  **What it is now**, from the shop's own answers — *"solid fixed front in door decor, hinged
  lift-up, no divider… cushion comes off… may introduce one internally above a span of 1200 for
  structural rigidity"*:

  - **A solid fixed front in door decor.** Role `false-front`, not `door`, and the distinction does
    real work: `boring.ts` selects `door` and `drawer-front`, so a fixed front takes **no hinge cups
    and no plates** and none reach the hardware BOM — but `false-front` is in `STYLED_FRONT_ROLES`,
    so a shaker or V-groove kitchen still routes it like the doors either side. It stands off the
    carcass by exactly what a door does, so a banquette lines up in a run. **Part length runs
    across, not up** — modelled on `drawerFronts`, not `doors`, because a seat front is wide and
    low and its grain runs horizontally along the run. Copying the door would have stood the grain
    on end across a 1200 × 397 front.
  - **A hinged lift-up, inset.** Sized to the opening less a 2mm clearance all round, its top face
    flush with the top of the carcass so the cushion lands on one continuous plane. Cut from
    carcass board, because nothing sees it, but banded all round because it is handled every time
    the storage is opened. The cushion is a separate thing that lifts off first.
  - **No divider, until the span needs one.** `dividerCount: 0`, and `banquetteDividerCount` adds
    one above a **1200mm clear span** — measured on the span between the sides, not the nominal
    width, because the span is what deflects. It takes the maximum of that and whatever was asked
    for, so it only ever adds; a shop wanting three bays in a 900 seat still gets three.
  - **Nothing overhangs anything.** There is no lid to overhang: the top of the carcass is one flat
    plane. `tests/banquette.test.ts` asserts occupancy rather than size for exactly this reason —
    the placement bug found while writing it put the lift-up a board thickness low with a
    *correct* footprint, and a size assertion passes on that.

  **The hinge itself is deliberately not modelled.** There is no lid stay in the Blum library this
  build ships, and inventing a part number and a price is the failure `npm run report`'s unchecked
  list exists to prevent. **Open, and needing the shop:** which stay, and whether the panel lands on
  cleats, a rebate or nothing but the hinge. None of those change the panel's cut size, which is why
  the carcass could be built without them — but a banquette's hardware line is empty until they are
  answered. The same access question has **not** been asked of `banquette-corner`, whose lid is
  still a plain flush quarter-circle in door decor.

  What follows is what else shipped with the original and still stands.

  `banquette-corner` is a quarter-circle connector for two banquettes meeting at 90°, built on the
  §4.5 formers-and-bendy-ply rules; it validates that width and depth both equal its radius, because
  anything else is not one circular corner. Upholstery is **its own material type** rather than a
  sheet — brand, collection, colour, fallback hex, texture, roll width, composition and abrasion
  rating — shipped as the nine Warwick Caulfield colours. Cushion width, depth, thickness, inset,
  back height, back thickness, back angle and corner radius are all recorded separately from the
  boards, and end cushions are per-side flags.
  **Three things are deliberately still open, and the first is the one that matters:**
  ~~**(a)** cushions are **viewport-only** — a banquette quotes as though the seating were free, and
  nothing on the report says so.~~ **Costed — see §4.19.** The answer turned out to make the fabric
  and foam questions moot: cushions are **bought in as finished units**, so there is no fabric
  quantity to work out and no foam to order, and the charge is $350 a lineal metre **per cushion**.
  The half that mattered was the warning: a cushion nobody can price now says so by name rather than
  quoting at zero. What is still open there is the **particleboard substrate**, which is a real part
  and was deliberately not built. ~~**(b)** The cushion renderer mutates `repeat` on the
  texture `useLoader` hands back, and that object is **shared and cached**.~~ **Done** — UVs are baked
  into the geometry and nothing writes to the texture. A *second* fault behind it was fixed later
  (§4.22): the baking was attached to the mesh rather than to the geometry, so a rebuilt cushion
  silently kept raw millimetre UVs.
  **(c)** Cushion textures are scaled in UV units off the cabinet's bounding box (`width / 250`),
  not in millimetres off the cushion — which is the rule §5.8 sets for board decors and the board
  path keeps. Foam grades and seam or piping styles remain unstarted and are still not worth
  inventing. Storage access is no longer on that list — it is the lift-up above.
- **The banquette corner has no bottom panel.** The plain banquette does; the corner produces backs,
  formers, skin and a lid and nothing to stand on. That may well be right for a connector spanning
  two units, but nothing asserts it either way, so a later reader cannot tell a decision from an
  omission. Decide it and write the test.
- ~~**Cabinets must snap to applied ends as well as cabinet carcasses.**~~ **Done.** Neighbour
  snapping targets the applied end's outer face using the selected door board's actual thickness.
  It accounts for the contacting end on both cabinets, keeps the carcass edge when no panel is
  present, and is covered on both hands and rotated wall runs.
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
- ~~**A benchtop over a radiused base cabinet is still a rectangle.**~~ **Done — see 4.13.**
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

### 5.8 Seeing it properly — decor textures and a wireframe view

**Both raised from the bench, and both are about the 3D view earning its keep.** Neither changes a
part, a price or a hole; both change whether the view is worth showing somebody.

#### Real decor textures, not an approximate colour

**Shipped.**

> "i don't want vaguely correct colour doors, i want textures and colours"

Fair. `SheetMaterial.colour` (§5.4) is one flat hex per decor and it was always the cheap version —
enough that a walnut door does not render the same off-white as a white melamine carcass, and no
more than that. A Notaio Walnut door and a Sepia Oak door are two browns.

What it wanted was an **image per decor**, mapped onto the part, and that is what it now has:

- A `texture` field on `SheetMaterial`, beside `colour`, which stays as the fallback for any decor
  that hasn't got an image. The suppliers publish swatch images; they are the shop's to hold.
- **Scaled in millimetres, not in UV units.** A woodgrain repeat is a real distance — of the order
  of a metre — so the map is laid on at a real-world scale, or a 300mm drawer front and a 2000mm
  tall door end up with grain of two different sizes. The texture record carries the physical size
  of one repeat, and `PanelMesh` divides millimetres by it to get UVs.
- **Rotated by the part's own grain.** This is the part that makes it more than decoration.
  `SheetMaterial.grain` and `Panel.grain` already existed, and a texture laid down the part's length
  or across it *by that constraint* turns the 3D view into a **check on grain direction** — a door
  with the grain running the wrong way stops being a line in a cutlist note and becomes something
  you can see. That is worth having, and it is the reason to prefer this over a shader trick.

**It went one better than the plan, and that is the piece worth not losing.** A part is not textured
from its own origin — it is textured from **where it actually lands on the nested sheet**.
`viewport/sheetTexture.ts` indexes the derived nest, `pointOnSheet` maps a point on a panel blank
into real sheet coordinates (handling a part the nest turned 90°), and `PanelMesh` bakes those into
the geometry's UVs. So the grain runs continuously across parts cut side by side out of one board,
exactly as it will in the room, and a deterministic per-sheet offset stops two purchased sheets
starting on the identical pixel. The **nest is the source of the picture**, which means the 3D view
is now reading the cut plan rather than approximating it.

Note the mechanism: UVs are baked into each panel's geometry and the shared `Texture` object is
never written to. That matters because `useLoader` caches and hands the *same* texture to every
part using that decor — the banquette cushion path did not follow this and mutates `repeat`, which
is the bug recorded in §5.4.

**It stays a screen approximation, and the note that says so must stay with it.** Nothing is cut,
priced or ordered from an image any more than from a hex — the decor *name* is the fact, and it is
what goes on the supplier order. A texture is more convincing than a colour, which makes saying so
more important rather than less.

**The open question was answered: the images are bundled.** Eight Polytec board designs and nine
Warwick upholstery colours live in `public/materials/`, resolved through `viewport/assetUrl.ts` so
they survive being hosted under a sub-path. That is the fixed-set, no-setup half of the choice
below, and it costs ~2.5 MB in the repo and in every deploy. Per-job folders remain unbuilt; the
next decor a shop wants still means a commit. `assetUrl` is applied to fabrics only when the brand
is Warwick and the collection is Caulfield — a hardcoded pair, duplicated in two components — so
any fabric added later with a local path skips the fix and 404s off-root. Generalise it before
adding a second supplier.

The question it answered, for the record — where the images live: bundled into the app (fixed set, no
setup), or loaded per job from a folder the shop points at (any decor, but a job that has to carry
its images with it). Bundled won.

#### A wireframe view

**Shipped.** The viewport now has a third mode beside 3D and Plan. It keeps every panel's real
geometry and machining marks, removes the opaque faces, strengthens the part outlines and preserves
selection and dragging through an invisible interaction surface. Run-owned parts and bought-in tops
switch with the cabinets, so the mode never shows a misleading mixture of solid and outlined work.

A display mode that draws edges only, alongside 3D and Plan. Useful for three things a solid render
cannot do: **seeing the construction** — where a shelf lands, how a rail sits, which way a back is
housed; **seeing through to the interior** without hiding a front; and **checking a joint** where two
parts meet, which a shaded surface hides.

The pieces are already there. Every panel's outline is in the model, `Boring.tsx` already draws hole
rings as line geometry rather than meshes, and `PanelMesh` already has the panel's own profile. It is
a third render path beside the solid one, not a new source of geometry.

Worth doing at the same time as the textures, because they are the two ends of the same slider —
one for showing a client, one for checking the build — and because both live in the same three files.
### 5.9 Nesting — what is left after 4.8

**Built and merged; see 4.8 for what it does and why.** What remains, none of it blocking:

- ~~**One sheet size per material, and it costs something real.**~~ **Half done: the shop can now
  choose the size.** Asked for from the bench as *"i want to be able to select the size of carcass
  sheet i am cutting"*, and the honest finding was that the nester was already better than this
  section claimed — it does not pick one size blindly, it nests **every** size in full and takes
  the cheapest. What was missing was not a better search but a way to overrule it, because the
  reasons to overrule it are all outside the model. `NestingSettings.sheetSizes` maps a material id
  to a `sheetSizeKey`; absent means the search decides, which stays the default.

  **Watch what it does to oversize parts, because it is the point rather than a wrinkle.** Put the
  sample kitchen's carcass on 2400×1200 and the 3000mm plinth rails stop fitting any sheet: the
  nest reports them as oversize, allows a whole sheet each as a floor, and the job goes from 5
  sheets to 10. That is the correct answer loudly given, and it is exactly why the choice belongs
  to a person.

  **What is still not done is mixing sizes within one material** — finishing a job on one small
  sheet after three big ones. The sample kitchen's fourth carcass sheet still holds a single
  720×544 side panel, and $138 against $63 is still real money. That needs `MaterialNest.sheet` to
  become plural and the search to choose per sheet rather than per material, and it needs an
  answer to what the supplier order then says.
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

### 5.10 G-code — what is left after 4.9

**Built and merged; see 4.9.** In rough order of what it is worth doing:

- **~~Pin the dialect against a real `.nc` file.~~ Done for the Woodtron — see 4.20 and
  `docs/woodtron-dialect.md`.** Twenty-one programs, every figure read off them. **Still open for the
  KDT**, where the only fact anybody has is the Z datum and nothing from the Woodtron has been
  carried across. One program off it would do the same job.
- **The second pass, and it is now the item that matters most.** The Woodtron cuts every contour on
  a sheet to a 1.0mm skin and then takes them **all** through in a second sheet-wide pass, which is
  what keeps each part held on the vacuum while its neighbours are cut. The post finishes each part
  before starting the next, so it writes the first pass only and parts come off still attached.
  Doing this properly means the writer grouping perimeters into two sheet-wide passes rather than
  stepping depth per part, which is a change to how `writeSheetProgram` walks the list rather than a
  new number. Until then the Woodtron profile says so in nine words at the top of every program.
- **Answer the drill bank's one question, then turn it on.** The spindle map is solved (4.20); what
  blocks it is whether a programmed coordinate positions the *reference spindle* or the *head
  origin* — 128mm apart on an asymmetric pattern. It needs **one part whose true hole positions are
  known**, not more reading. Then it is `drillBank: { ...WOODTRON_DRILL_BANK_WITHOUT_DATUM, datum:
  ... }` plus the grouping in `post/iso.ts`: bores on the same line, at the bank's pitch, become one
  `B` mask and one plunge. Biggest time saving available — a System 32 row in one hit instead of
  twenty-one plunges, on every side panel in every job.
- **The Woodtron cannot drill anything at all** until that happens, because every drill on it is on
  the bank and nothing bores with its router. Holes are reported by name and left out.
- **Arcs in `R` form, and always `G3`.** The real programs use `R` where `post/iso.ts` writes `I`/`J`,
  and there is not a single `G2` in twenty-one files — so that machine's direction round a part is
  fixed and the post's is whichever way the ring happened to be wound. Half the parts would be cut
  climb where they should be conventional, and every one of them would still be the right size.
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

### 5.11 Reported from the bench, August 2026 — what is left of that list

A session's worth of use produced seven reports at once. **Four are now closed** — the NaN quote
(§4.14), applied ends doing nothing on a banquette and the half-built banquette corner (both
§4.15), and the benchtop radius that "does not work" (§4.18). The unreported risk at the bottom of
this list is closed too, and **that entry turned out to be wrong about the app** — see §4.17, and
read the correction, because it is the only case so far of an *open item* going stale rather than a
claim about shipped work.

What follows is the remainder, plus the diagnosis of each.

**Read the closed ones anyway if you are new here**, because the *shape* of them is the lesson: a
feature wired into some specs and not others, and a guard list kept in a second file that a spec
author has no reason to look at. §4.15 is the fix and the argument for it.

#### ~~The cause: a feature is wired into some specs and not others~~ — fixed, see 4.15

`rules/registry.ts` holds ten specs, and they have grown by copy-paste. So **"does this cabinet
type support X?" is answered by whether somebody remembered to call a function**, and nothing
declares it. Today:

- `appliedEndPanels` is called by six specs — base, wall, tall, drawer-bank, custom, radius-end.
  **Not banquette, not banquette-corner.** So the tick box is offered, and ticking it does nothing,
  silently.
- The corner radius is guarded by `!['base','wall','tall'].includes(typeId)` in
  `cornerRadiusProblems`, **but the banquette spec has `formers` and `skin` rules wired in.** So a
  radiused banquette builds two formers and two skin layers *and* warns that the corner "would come
  out with the corner cut away and nothing wrapped round it". The guard describes a cabinet that
  does not exist.

§4.3 already solved this once, for door styles, by resolving in `build.ts` rather than in the part
builders — *"fronts are produced in four places and a style wired into three of them is a kitchen
with one plain door in it"*. The lesson was learned for one feature and not generalised.

**The fix was to make each spec declare what it supports**, so the UI stops offering what is not
built and the builder stops half-applying it. **Built — `CabinetSpec.capabilities`, see §4.15**,
where the declaration is required, carries the shop's own sentence when a spec refuses, and is
asserted against the rule engine rather than against itself.

#### ~~The banquette's corner radius~~ — built, see 4.15. **The distinction under it still matters**

**A finished radius at the end of a run is not the same curve as the internal connector**, and
this file has now recorded the confusion in both directions, so it is worth stating plainly:

- **`banquette-corner`** is a quarter-circle connector joining **two runs** meeting at 90°.
- **A corner radius on a plain banquette** is the finished curve where **a run stops** — the same
  family as §4.5's front corner radius on a base cabinet.

They are different parts doing different jobs, and a banquette needs both. It was proposed in this
session that the connector made the corner radius redundant; **the shop corrected it directly** —
*"with the banquette the internal curve is not the same as finish curve on the end of a run"* — and
that correction is why this paragraph exists.

All four things that had to follow the carcass now do — the lift-up takes a square notch onto the
former, the solid front stops at the fixing strip, the cushion follows through `model/cushion.ts`,
and applied ends build on a banquette. **§4.15 is the record.** One thing there is worth carrying
forward rather than forgetting: the cushion's `cushionCornerRadius` is the **soft edge of an
upholstered pad**, 18mm, which is a different radius from the carcass one and has to coexist with
it — not a duplicate to tidy away.

#### The rest of the list

- ~~**Costing returns NaN.**~~ **Fixed twice — see 4.14, then 4.22.** It was one absent labour
  rate, and it hit every job rather than only curved ones. It came back, because 4.14 repaired the
  *job* chain and the **shop standards** chain had never repaired a labour rate at all — so a new
  job was copied from broken standards and born at the current schema with no migration left to run
  on it. **The lesson is about the fix, not the bug:** a repair has to cover every chain that reads
  the field, not every field in one chain.
- ~~**The benchtop radius "does not work".**~~ **Fixed — see 4.18.** It worked; it is *owned* data
  (§4.13), so it follows the cabinets only when the top is **regenerated**, and the app gave no
  signal. It does now, on the unit card, in the issue bar and in the terminal report. The general
  lesson is the one this item was always really about: **a model that is right and silent looks,
  from the bench, exactly like a model that is wrong**, so every future field that is generated once
  and then owned needs the same answer to "is this still true?".
- ~~**Applied ends do nothing on a banquette.**~~ **Fixed — see 4.15**, along with the stale guard
  that caused it.
- ~~**Texture and laminate on a bendy-ply radius.**~~ **Closed at last — and it took two goes and a
  second report.** It was never a texture-loading fault: the laminate was charged in `costing.ts`
  and dimensioned on the construction method while **no part carried it and nothing rendered it**.
  §4.23 fixed that half — the outer skin has carried `finishMaterialId` ever since and the viewport
  reads it. **This entry then sat here saying "not yet fixed" while the other half went unnoticed:**
  §4.23's own migration zeroed the allowance on every job that already existed, so there was no
  laminate for the skin to carry and the bench went on seeing bendy ply. Reported a second time —
  *"the laminate decor is not showing on the bendy ply. I thought that was already done"* — and
  repaired by **v36 / standards v27**.

  **Two lessons, and the second is the one worth keeping.** A fix that lands one half of a report and
  leaves the entry saying "not yet fixed" costs the next session the whole diagnosis again. And **a
  feature that ships switched off for everybody who already has the app has not shipped** — before
  writing "done", ask what a *saved* job does.
- ~~**A banquette's back cushion draws in flat colour** until the cabinet is removed and
  re-added.~~ **Fixed — see §4.22**, and the diagnosis in this entry was out of date. §5.4(b)'s
  shared-texture fault had already been fixed; what was left was a ref on the **mesh** where the
  **geometry** is the thing R3F replaces, so a rebuilt cushion kept raw millimetre UVs. Removing and
  re-adding the cabinet "fixed" it because remounting is the only thing that re-fires a mesh ref.
- **Changing a drawer front's height can change the cabinet's height.** Still not reproduced; the
  useful detail when it is reported again is whether the height moves *as you type* or *on save*,
  because those are two different bugs.

  ~~**and the input for the bottom front is partly off-screen**~~ — **that half is fixed, see
  §4.24, and it was not off-screen.** It was *squashed*: `.field` let the label take whatever it
  wanted and left the box to shrink, so `Front 1 (bottom) — E — 192mm` — the longest label in the
  app — kept **50px** where the plain `Front 2` beside it kept 102. Worth separating from the
  height bug above, because the two were reported in one sentence and only one of them was ever
  about drawer fronts: the mechanism was in the shared field row and was clipping other panels
  too.
- ~~**The UI is navigable but cluttered**~~ — **done, in two passes: §4.24 the Inspector, §4.25
  the Settings window.** The user's words were *"any other user may struggle"*. Closed: every
  panel's height, every clipped control in the app, and the type size throughout. **What is left
  is one thing and it is small** — the nine "+ cabinet type" buttons above the cabinet list still
  wrap onto three lines and take about 160px whether or not you are adding a cabinet. Not clipped,
  not small, just clumsy.

#### ~~Not reported, and a bigger risk than anything above~~ — done, see 4.17, and **this entry was wrong**

**A job lives only in the browser's storage for `localhost`**, and that part was and is true.
Clearing browser data wipes it with no warning, it does not travel between machines, and the shop
runs this from a downloaded ZIP.

**What was written here next was false, and the falsehood is the lesson.** This entry claimed *"the
only way to get a job out of this app is to crash it first"*. `Save to file…` and `Open from file…`
had been in the **Job ▾** menu since the commit that introduced formed parts. The sentence about
`ErrorScreen` was true when somebody wrote it, or was never checked, and it then sat here as an open
item long enough that a session acting on it would have built a second copy of a shipped feature.

Every other part of this document warns that a claim about *shipped* work goes stale. This is the
first time an **open item** went stale, and it is the direction nobody watches: the list of things
left to do is trusted precisely because nobody wants to re-verify it. Check the code.

The real faults were on the failure paths — an `alert` that a sandboxed frame ignores silently,
three one-click ways to destroy a job without being asked, and a non-job file that loaded far enough
to crash the app into the reload loop. All fixed, and **the shop standards can now be saved out
too**, which genuinely could not be done before. §4.17 is the record.

### 5.14 The banquette finishing pass — **shipped in full, see 4.23**

**All four are done.** The oversize cushions were fixed in the pass that wrote this section; the
other three shipped on one branch, as this section asked, and §4.23 is the record of what was built
and what it cost. What follows is the diagnosis as it was written, kept because it survived contact
with the work — including the trap in the third item, which was real and turned out to have a third
half nobody had found.

**One thing here was left open and is worth carrying forward on its own:** the corner unit still
takes no cushion overhang, deliberately, because a quarter disc's straight edges are radii of its own
arc. It gets one when §5.13 item 1 gives it a real L-shaped outline.

**Four things, reported together while looking at a real corner banquette on screen. One is fixed;
the other three are diagnosed to the line and not built.** They belong on **one branch**, because
two of them carry a deliberate re-price and that argument is better made once than twice.

**The one that is done — both cushions were oversize by their own soft edge.** An extrude's
`bevelSize` grows the outline outward on every plan edge as well as through the thickness, and only
the thickness was being taken back off. On a 1200 × 500 seat at the shipped 18mm soft edge the
extruded seat came out **1226 × 526** and the back cushion **116 × 436 × 1226**, against stated
figures of 1190 × 490 and 80 × 400 × 1190. Both now build their shape inside the bevel so it grows
back to exactly the plan, and on a rounded corner the radius is inset with it — a fillet offset
inward by `b` has radius `r − b`, which is what keeps the cushion's arc concentric with the carcass
curve rather than `b` fatter than it.

Two things about *how* that was found are worth more than the fix:

- **Only the curved seat looked wrong**, because a square seat is drawn by drei's `RoundedBox`,
  whose `args` are the finished size and which needs no correction. So the two branches disagreed
  about how big the same cushion is on the same cabinet by 36mm. That is §5.4's lid bug exactly, and
  the pattern is now three-for-three: **two descriptions of one thing, and the one nobody can check
  against a cutlist is the one that drifts.**
- **The back cushion's identical fault was found by measuring the running app after the seat was
  fixed**, not by reading the diff. Reading the code found one of the two.

#### The three that are left

- **The cushion should sit 10mm proud of the finished front, and be adjustable.** Straight from the
  shop: *"it should be adjustable — but generally should be 10mm proud of the finish panel/door"*.
  Today `seatCushionInset` holds it **5mm inside every carcass face**, so you look down onto white
  carcass all the way round it — reported as *"standard straight run cushion is exposing the
  carcass"*. **This re-prices**: §4.19 charges the seat at the cushion's own width, so a cushion that
  grows charges more. It is the v9/v11/v27 argument for the fourth time and must say so out loud.
  Note the field's *meaning* inverts — an inset becomes an overhang — so the migration cannot simply
  carry the number forward.

- **A banquette front is cut 3mm short at the top, and the gap shows.** `fixedFrontPanel` cuts
  `H − revealTop − revealBottom`, and `revealTop` is 3mm. **That reveal exists so a door can open
  under a benchtop** (§3). A banquette front is a `false-front`: it takes no hinges, it never opens,
  and there is no benchtop above it — the cushion sits on top. So the clearance is for a movement
  that never happens and all it does is expose carcass, which is the white band visible along the top
  of the front in the photograph. Same argument for the 1.5mm each side, and in a run of seating the
  fronts should meet rather than leave a gap. One line, and it **re-cuts every existing banquette
  front**, so it travels with the migration above.

- **The finish laminate is charged, dimensioned, and drawn nowhere.** Reported as *"laminate finish
  is still not applying to bendy ply as a finish"*, and the photograph is unambiguous: the curved
  wrap renders **cream** where the flat front beside it is walnut. `wrapPart` sets `material: 'skin'`
  — the bendy ply, which is what you order — and `Viewport3D.tsx:94` draws every panel in its own
  material. **`LAMINATE_MATERIAL_ID` appears in exactly one place in the codebase, `costing.ts:28`,
  where it is charged as sheet goods.** No part carries it and nothing renders it. §5.0 decided it
  was *"a dimension, not a part"*, which is right for the cutlist and leaves the curve showing its
  substrate for ever.

  **There is a second half, and it is the one that will waste somebody's afternoon.**
  `finishLaminate` **migrates to zero** on saved jobs and standards (project v23, standards v19),
  deliberately, because a curve already quoted was cut without it. So a shop's curve may have *no
  laminate at all* rather than an unrendered one — and **nothing on screen tells those two apart**,
  which is §4.18's lesson wearing a new hat. Fixing the render without surfacing the zero would make
  the bare-ply case invisible instead of wrong.

**Where to look:** `viewport/BanquetteCushions.tsx` for the bevel correction that is done, with both
reference measurements in its comments; `rules/parts.ts` `fixedFrontPanel` for the reveal;
`rules/parts.ts` `wrapPart` and `Viewport3D.tsx:94` for the laminate.

**Three things this diagnosis did not know, all found by the work — §4.23 has them in full.** The
laminate was not only undrawn, it was **charged unconditionally** while the formers were sized off
an allowance of zero, which makes v23's *"nothing is re-priced"* the sixth stale claim in this file.
The bevel fix above was itself half done — the size was corrected and the **placement** was not, so
the back cushion and both bolsters were exactly the right size and one bevel out of place on every
axis, invisible to every assertion that pass added. And the overhang's awkward-looking corner case
turned out not to exist: proud at the front and flush at the end is one arc of the carcass's own
radius with its centre moved forward.

### 5.13 Reported from the bench, August 2026 — the second list

Seven items, with a screenshot for the first. **Six are closed** — 1, 2, 3, 4, 5 and 7 — and what is
left is **item 6**, a part too big for its sheet. Item 5 leads because it is the most important
correction in this whole document.

#### ~~5. Z zero is the decking sheet, not the top of the material~~ — **fixed**

> "With both the KDT and the Woodtron the gcode works from the decking sheet up, that is to say a Z
> value of -0.2mm would be cutting 0.2mm into the sacrificial board."

**This is the first figure to come off the machine's unchecked list, and it was wrong.**
`library/machines.ts` shipped `zDatum: 'material-top'` with a comment arguing it was the *safer* way
to be wrong — a material-top program run on a table-zero machine cuts air, where the reverse drives
the full thickness into the bed. The reasoning was sound and the answer was still wrong, which is
exactly why the list exists rather than the reasoning.

Both profiles are now `table`. The abstraction was already right — `zAtDepth` and `zClearance` have
always handled both — so the fix was one field, and **every program written before it cut air on
this machine**: at 16mm the contour went to Z−16.5 where the material does not start until Z+16.

Two things came out of it worth keeping. The program header line never needed changing, because it
reads `zDatum` and always said whichever was set — it was a *test* pinning the guess in place. And
**nothing in the suite asserted a single Z value**, on the number this file calls the most expensive
one there is. `tests/cam.test.ts` now reads every Z back out of a real program and asserts none goes
below the overcut.

#### The rest, not yet done

1. **The internal banquette corner is an external radius, and the cushion is turned the wrong way.**
   Screenshotted. `banquetteCorner.ts` and `BanquetteCornerCushions` both build a quarter *disc* —
   convex, bulging into the room. The shop's words: *"a complete mess."*

   **The shop has now answered this, and the answer is neither of the two readings that were put to
   them.** Both of those assumed the unit was a square with a disc taken out of it, which is what
   `validate`'s `W = D = insideCornerRadius` rule made it look like. It is not.

   > *"essentially it wont be 500 x 500 — it could be 900 x 900 along the back wall with 500mm depth
   > to both. In this scenario you could have an internal radius of 150mm or so."*

   **The seat is an L, and the radius is a small separate fillet on its inside corner.** Two walls
   meeting at a corner; the unit spans some length along each wall — 900 was the example — and the
   seat is a run's depth off each wall, 500. So the plan is the union of two rectangles: 900 × 500
   down one wall and 500 × 900 down the other, sharing the 500 × 500 square in the back corner. The
   far corner of the 900 × 900 footprint is 900 from both walls, which is bed depth rather than seat
   depth, and is not seat at all.

   That leaves exactly one corner where the two seat fronts meet, pointing into the room, and it is
   **concave** — the seat wraps around it. The ~150mm is the fillet rounding it off, tangent to both
   fronts. Hence *"internal radius"*, and hence a figure with nothing to do with the unit's size.

   **Three things follow, and the first is why this is not the one-line change this item used to
   promise:**
   - **The unit is wrong in kind, not in detail.** `quarterRing` builds a convex quarter disc; this
     wants a concave fillet on an L. Different outline, and the backs, the lid and the cushion all
     follow the outline.
   - **`validate` is wrong.** It insists width = depth = `insideCornerRadius`. On this description
     they are **three separate numbers** — 900, 900 and 150 — and the constraint has to go. The field
     name was right the whole time; the geometry built from it was not.
   - **Seat depth becomes a real input**, 500 off each wall, and it need not equal the span. There is
     no field for it today.

   **Deliberately not built in the session that got this answer**, which was scoped to three bench
   bugs. Written down instead, because §4.5's four corner decisions carry the standing note that a
   fresh session re-deriving a shop decision gets a different answer — and this item has now been
   mis-derived twice from the same sentence.

   #### Built — see the spec, `model/insideCorner.ts` and both test files

   **The unit is an L now**, and the shop answered the two questions §5.13 was holding on:

   > *"the entire radius front should be formed bendy ply then laminated — that is the point of this
   > cabinet"*

   So there is **no flat front panel and no door-decor part on this unit at all**. The whole front —
   along one leg, round the fillet, along the other — is one formed piece per layer, and the
   laminate over it is the finish (`finishMaterialId`, §4.23). That is §4.5's *"one piece, no join"*
   wrap bent the other way.

   > *"the strip should be there and set back from the radius by 50mm — depending on what the
   > entered radius is"*

   So the formers run `fixingStripWidth` past each tangent, giving the ply a rigid landing where it
   comes out of the bend, and a radius that does not leave the strip room is reported.

   **Three things in it are worth not re-deriving:**

   - **Filleting the inside corner makes the seat *bigger*.** It is a reflex vertex, so rounding it
     cuts the corner off the **void**. 650,000mm² → 654,828.5. Reasoning gave the opposite answer
     twice; the assertion is what settles it.
   - **Every surface is `r + d` about one centre out in the room**, so the formers are cut to
     `r + skin` where a convex corner's are `r − skin`. On the shipped figures the ply's back face
     lands 3mm *in front of* the carcass and the formers pack it out to finish flush with the
     banquettes either side.
   - **The assertions that bite are the fillet's centre and the plan area, not its radius.** The
     rejected quarter disc has the identical radius and arc length.

   **Project v31**, and it is the fifth migration here to re-price and the first that can make a job
   **cheaper**: the corner seat is charged along two straight fronts plus a short fillet where it
   used to be charged along one long convex arc that was never built, and the two backs are now one
   per wall at its own span rather than the same number twice. Nothing carries forward, because the
   old shape does not exist: `width = depth = radius` was one number written three times, so there
   is no seat depth to recover. A saved 500 × 500 unit comes back **reporting that a 500 seat depth
   leaves no L in a 500 span**, which is the honest outcome — what it should be is a decision about
   two real walls.

   Verified in the running app per §7, reading the live scene rather than looking: backs at
   `[0,900]×[0,16]` and `[0,16]×[16,900]`, both open ends at the seat depth off their own wall,
   three formers at `[500,718]²`, and the formed front's show layer carrying the **walnut** texture
   over an inner layer still in bendy ply. The cutlist: 707.5 and 720 × 400 of bendy ply, which is
   `232 + (150 + 1 + 4) × π/2 + 232` and one board thickness more.

   #### What is left on it

   - ~~**The corner cushion's mesh took three goes and the third was found by measuring.**~~
     **Done.** The whole derivation — the outline, the inset the extrude's bevel grows back, and the
     origin the mesh sits at — is `insideCornerSeatMesh` in `viewport/cushionMesh.ts`, and the
     component is left with three.js objects built from numbers somebody else has checked. Eight
     assertions in `tests/banquetteCorner.test.ts`, worked longhand off the reference unit; the
     figures they claim were then **read back out of the running scene** (§7) rather than looked at:
     seat x 0 → 900, y 400 → 480, z 0 → 900, both fronts at 530 — ten proud of the finished 520 —
     the far corner of the footprint empty, and the fillet 140 at the show face about (670, 670).

     **Five deliberate mutations, each reproducing one of the faults this cushion has actually
     had**, and each caught: the origin written as the finished front (the 372mm one), the bevel
     left off the lift, the outline not inset, the bulge left un-negated through the reflection, and
     the overhang applied the wrong way. The one worth knowing is the fourth — a fillet flattened
     the wrong way is 14,249mm² out and looks entirely plausible on screen, which is the same thing
     the carcass's own centre assertion exists for.

     Nothing about the picture changed, and that is the point: this was the arithmetic moving to
     where a test in Node can read it.

     ~~**What it leaves is the plain banquette's own seat cushion.**~~ **Done too — `seatCushionMesh`,
     recorded in §4.23.** No cushion mesh anywhere is built from arithmetic a test cannot read now.
     Six more mutations, all caught, and the one worth keeping is that **a square seat and a rounded
     one on the same cabinet are asserted to finish at the identical box** — the two branches
     disagreeing by 36mm is §5.14's first fault, and it was only ever a hope that they matched.
     The one real change to the picture: that corner is drawn through the model's arc code now
     rather than three.js's `absarc`, and it measures 200.005mm at its widest in the running scene.
   - **The back cushions run each wall's full span**, which is right for the backs and means they
     meet at the corner rather than mitring. Nobody has been asked what happens where they meet.
   - **The lid stay is still unmodelled**, as on the plain banquette.
   - Nothing asks whether a lift-up this size wants two lids rather than one; an 864 × 864 panel is
     a big thing to lift in one piece.

2. ~~**A standalone panel should stand perpendicular to the wall, not flat against it**~~ —
   **done, see §4.21.**

3. **The custom cabinet is not custom enough.** Wanted: add and delete *any* part — left end, back,
   bottom, each individually — and choose the material **per part**.

   #### The model is built — `model/partOverride.ts`, and it was not the rewrite this said it was

   Two answers from the shop decided the shape, and both are bigger than they sound:

   > *"if you delete an end it re-derives"*

   > *"genuinely different thicknesses depending on real world availability"*

   **They land on the same two figures.** `interiorWidth` was `W − 2t` and every horizontal was
   placed at `x = ctx.t` — one thickness, twice, on the assumption that a carcass has two sides and
   they are the same board. `RuleContext.shell` replaces the assumption with the four parts that are
   really there, at the boards they are really cut from, and **zero is load-bearing**: a missing side
   takes nothing out of the opening and the interior starts at the cabinet's own face, with no branch
   anywhere downstream.

   So a deleted end is **not a panel switched off**. On a 600 cabinet the bottom goes from 568
   starting at x = 16 to **584 starting at x = 0**, and the right side does not move — the cabinet is
   still the width it was drawn at. An 18mm end in a 16mm carcass takes 2mm more out of the opening
   and everything measured off it follows.

   **It is a list keyed by part, on the cabinet** — the same shape as `customFeatures` and for the
   same reasons, including that panels are derived and never stored. It needs no migration: an
   absent list is exactly today's cabinet, which is also the first assertion in
   `tests/partOverrides.test.ts` and what makes the other 1068 tests the control for it.

   **The one to keep:** an omitted part keeps its own index, so deleting shelf 2 of 3 leaves shelf 3
   addressable as `2`. Renumbering the survivors would silently re-point every override and every
   custom feature after it — §5.12's stable-key argument, one level down. Four mutations, all
   caught, and one of them is that renumbering.

   **A bug this found in itself:** the stranded-override check judged an override against the parts
   that *survived*, so every omission reported itself as naming a part the cabinet does not build.
   It is judged against what the spec would build now.

   #### The controls, and what each type will allow

   **The Parts list in the Inspector is the editor.** It was already there, listing what the cabinet
   cuts; each row now carries a board and a Delete. A deleted part **stays on the list**, struck
   through with dashes for its size — `BuiltCabinet.offeredParts` is what the spec *would* build, and
   without it deleting is a one-way door with nothing on screen to say a part is missing rather than
   never offered.

   **`SpecCapabilities.partOverrides` is the tenth capability**, and adding it broke every spec until
   each answered — which is the mechanism working. Base, wall, tall, drawer-bank and custom say yes:
   a run sharing one end panel is ordinary joinery and the shared carcass builders already
   re-derive. The other five refuse in their own words — *"a banquette's parts are not
   interchangeable — the front carries the lift-up's hinges and the cushion sits over the top, so
   deleting one leaves a seat over a hole"*.

   **A refusal is not a warning with the feature still on.** The overrides are resolved to nothing
   on a refusing spec, once, so a banquette that says "you cannot delete this" does not then delete
   it. That is one of three mutations, all caught.

   **Verified in the running app** (§7), read back rather than looked at: a 900 custom cabinet's
   bottom goes **868 → 884** when the left end is deleted and back to 868 when it is restored; the
   custom cabinet shows 7 rows with 7 boards and 7 Deletes; a banquette shows its refusal and **no
   controls at all**.

   #### What is left on it
   - ~~**A part whose placement centres on its own thickness.**~~ **Fixed.** A shelf sits *on* the
     division line, so it starts at `centre − t/2` — and that `t` was the carcass board whatever the
     shelf was cut from, so an 18mm shelf came out the right size, on the right board, on the right
     line of the cutlist, and **1mm low**. Nothing about it looks wrong anywhere, which is §7's
     argument for occupancy over size in one sentence.

     **`RuleContext.thicknessOf(index)` answers it, and there is deliberately no key in it.**
     `build.ts` scopes the lookup per rule as it produces, so a builder asks *"how thick is the one
     I am making"* without ever naming its own rule key — a key in the builder would be a second
     source of truth about which rule it belongs to, and would silently miss the day a spec
     registered the same builder under another name.

     Three mutations, all caught, and the one worth keeping is the middle: **the thickness resolved
     once per rule and reused** puts every shelf on the first one's offset and passes every size
     assertion. The test that bites overrides *one* of three shelves and asserts all three centres —
     188, 360 and 532 on a 688 opening, which divides exactly so nothing rests on a tolerance.
   - **An applied back does not follow a deleted end**, deliberately: it laps the carcass and is the
     full width by definition. Housed into the sides it would follow the opening like the top does.
     Worth knowing before somebody reports it.

4. ~~**Woodtron `.nc` files are coming.**~~ **They arrived — twenty-one of them, read up in
   `docs/woodtron-dialect.md`, and the model has since been grown to hold them: see §4.20.**
   Carcass programs at 16.3mm and MDF door programs at 18mm, from one job. **Read that document
   before touching `post/` or `machines.ts`**; what follows is only the headline.

   It answers far more than the datum. The corrected figures: `plungeClearance` is **10**, not 3;
   `throughOvercut` is **0.2**, not 0.5; `drillStyle` is **explicit**, not `canned-g81`; the tool
   change is **`G666 T1`**, not `M6`; the onion skin is **1.0mm** on carcass and **none** on doors.
   Arcs are in **R form**. Feeds are per tool and much faster than the shipped guesses — F21000
   cutting, F3000 drilling, **F500 for the Ø35 borer**.

   **Three findings are structural rather than numeric**, and each is something `MachineProfile`
   cannot express today:

   - **Two work offsets, one per head** — `G54` is the multidrill origin and `G55` the router
     origin. The heads are physically apart and the machine keeps a separate zero for each. A post
     that writes one origin for both puts every hole wrong relative to every cut.
   - **The drill head and the router rapid at different heights** — +30 and +20.
   - **`B<n>` is a bitmask selecting which spindles fire**, and the programmed coordinate is offset
     from the holes by the firing group's distance from the head origin — which is why real programs
     have negative X well outside the sheet. **Whether that coordinate is the head origin or the
     reference spindle's own position is the one thing still open**; an earlier draft of this bullet
     stated the first as settled and it was not, which is the §5.11 lesson about a stale *open item*
     repeating itself inside one. See the paragraph below, and §4.20.

   **The first two are built — §4.20.** `MachineProfile` now carries a `HeadProfile` per head, so
   the two origins and the two rapid heights are expressible, and a `WOODTRON_NESTING_ROUTER`
   profile exists with every figure read off these files.

   **Two things are confirmed that this codebase already believed**, which is worth as much as the
   corrections: the **Ø35 hinge cup at 13mm deep**, exactly as §3 has it off Blum's own pattern; and
   **16.3mm carcass board**, exactly the figure §4.1 records from the shop, arriving independently
   off the machine months later.

   **The spindle map is now solved too**, from the later sheets: the drill spindles are on a **32mm
   pitch**, spindle *n* at `(n − 1) × 32`, in two rows — X for the small bits, Y for the Ø10 and the
   Ø35. It is System 32, which is the whole point of the head: five Ø5 spindles firing at once put a
   shelf-pin row down in one plunge instead of twenty-one router pecks. **One thing still blocks
   switching it on** — whether the programmed coordinate is the reference spindle's position or the
   head origin. Both readings give the same holes for a symmetric pattern and differ by 128mm for an
   asymmetric one, so it wants settling against a part whose true hole positions are known.

   Every file is a **Woodtron**; only the Z datum is confirmed for the KDT, by the shop directly.

6. **A part too big for its sheet is silently not nested.** Wanted: an option to **split** it.
   Design questions before code: where the split may fall, whether the halves get a joining detail
   or are simply two parts, and what the cutlist calls them. A split part is two parts and a join,
   which makes it closer to a benchtop's `joins` than to a nesting tweak.

7. **Sheet sizes are wrong — 2400 × 1200 is the usable area, not the sheet.** **Half done.**

   **The one size anybody has measured is fixed.** `docs/woodtron-dialect.md` §1 has the machine's
   own sheet declaration off a real job — the white carcass board is **2410.0 × 1205.0** — which is
   the shop's rule exactly, 10 over on the length and 5 on the width. `AU_STANDARD` is that figure
   now, and project **v32** / standards **v23** carried it into saved jobs; **v33 / v24** finished
   the job for the large sheet — see below.

   **It re-prices *downward*, which is a first here.** Every earlier re-price made a job dearer
   because it was quoted for less than it takes to build; this one is the reverse and the same
   shape — the job was quoted for board it did not need. No part moves and no cut plan is
   disturbed, because a nest is derived on every load and never stored.

   **The other half of the migration would have gone silently.** `sheetSizeKey` is the *dimensions*,
   so moving a size orphans any material a shop has set to be cut from it. `nestMaterial` reports
   that rather than failing, which is honest, but it is still a setting quietly reverting to
   automatic — so `withRekeyedSheetChoices` moves the choices with the sizes. **Add to
   `REAL_SHEET_SIZES` rather than editing a material** when the rest arrive: an entry there repairs
   saved jobs as well as new ones, where a library edit alone reaches only the new.

   **The shop then corrected the rule itself, and the correction is the important half:**

   > *"laminex and polytecs boards are material dependant. Generally allow 20mm in length and 10mm
   > in width for MD finish boards."* — and, asked what MD meant: *"MDF"*.

   So `2400 × 1200` is **2410 × 1205** on a carcass board and **2420 × 1210** on an MD finish one.
   **A single global rule would have put every decorative door board 10mm short on the length and 5
   on the width** — a part per sheet on a long run. It also broke the migration written an hour
   earlier, which keyed its map on the **size alone**: no size-keyed table can give two answers for
   2400 × 1200. That is worth keeping, because the size looked like the obvious key right up until
   the fact arrived that made it impossible.

   **And "MD finish" turned out to be the wrong half of the phrase.** Asked whether a raw sheet was
   different, the shop's answer was *"yes raw mdf is the same 20 and 10"* — so the set is **every
   MDF board, finished or raw**. That is the answer the physics wanted: the margin is a **pressing
   trim**, a board cut to its nominal after it is pressed, and whether a decor goes on afterwards
   has nothing to do with it. The narrower reading was the safe place to be wrong while nobody had
   said, which is the only reason it shipped that way for a commit.

   `MDF_BOARDS` is a **list rather than a rule over substrate strings** — the set is a judgement, a
   list can be read at a glance and corrected in one line, and a query would have swept in
   `laminate-1mm`, which carries an MDF substrate and is a 1mm facing sheet rather than a board.
   Both the library and the migration read it.

   **3115 × 1205 is in**, confirmed twice: the MDF door programs ran on one, and the shop says
   *"3115 is a typical polytec size."* Stated as measured, so it takes no allowance on top.

   #### Closed — and how it closed is worth more than the sizes

   **Three footprints sat on `unconfirmedSheetSizes` waiting for "the published range", and that
   wait was the mistake.** Suppliers publish the **nominal**: 3600 × 1800 is what every catalogue
   says, so the figure this document kept asking for does not exist. Meanwhile the shop had given
   the rule twice — 10 and 5 on carcass board, 20 and 10 on any MDF board — and the app was applying
   it to the MDF sizes **and printing a caution against its own output at the same time**, on the
   grounds that *"generally allow" is an allowance and not a published size*.

   Asked to go and get the sizes, a session found only that the oversize is real and varies by
   manufacturer (*"2420 × 1213mm or 3630 × 1213mm … may change with a change in manufacturer"*).
   The shop's response settled it:

   > *"the sizes are not to be trusted … as per my previous advice allow 20mm in length and 10mm in
   > width for all mdf prefinished boards. Why was that advice ignored?"*

   **It had not been ignored in the numbers** — every one of the ten `MDF_BOARDS` has shipped at
   nominal + 20/10 since v32, and `MD_REAL_SIZES` carried it into saved jobs. It was ignored in the
   app's own voice, which is the half a user actually sees. **Project v33 / standards v24** apply the
   carcass rule to the large sheet too — 3600 × 1800 → **3610 × 1805** — and cut the caution list
   from three entries to one.

   **The re-price runs downward again**, the same shape as v32: no part moves, no cut plan is
   disturbed, and a job that was quoted for board it did not need may now fit on fewer sheets. The
   sample kitchen does not change — 4 carcass sheets either way — which is the honest outcome and
   why the assertion is a **direction** rather than a figure.

   **v33 exists because v32 already ran.** A job saved since v32 is at the current version with the
   old large sheet in it and nothing left to repair it — §4.22's fault, one chain along — so the
   repair had to be re-run under a new version rather than added to the old table.

   #### And then the last two classes were answered too — v34 / v25

   Asked what was left, the shop gave both in one line:

   > *"ply is generally tighter allow 2410 X 1205. laminate is generally 3600 X 1350 for polytec.
   > Laminex is generally 3600 X 1500."*

   **Plywood is the one class that shrinks**, and it is the trap in the whole set. Every board here
   grows over the size it is sold by; ply is quoted at the metric-imperial 2440 × 1220 and gives
   **2410 × 1205**. A rule remembered as *"the real sheet is bigger"* applied to ply cuts a part
   short. It reaches birch ply and the three bendy plys — which is **every curved part in the
   model** — and it is why `realSizesFor` routes three classes rather than two.

   **That one re-prices upward**, the first since v30: less usable sheet is more sheets. The
   argument is v9's and v11's — the job was being quoted for board it does not get.

   **The laminate was a correction rather than an allowance.** 3660 × 1830 and 2440 × 1220 are
   board-ish footprints neither supplier sells a *facing sheet* in; the real ones are the two
   brands' own. Its price carries forward as a **rate per m²** rather than as a price, because these
   are different sheets and not the same sheet measured better — carrying $401.87 onto a 5.40m²
   sheet would have quietly invented a $74/m² laminate. A shop that edited the rate keeps its own.

   **`unconfirmedSheetSizes` is gone, and the way it went is the lesson.** Every footprint now
   traces to the shop or to the machine, so it had nothing left to say — but the finding is that it
   had never said anything anyway. **It was rendered in zero places**, while its own comment claimed
   it appeared *"in the report and on screen"* and this document repeated that in three sections.
   The hardware, ladder, applied-end and machine lists are all genuinely rendered, which is exactly
   what made the claim look plausible. **A list nothing renders is not a safety net.** If a future
   footprint has no answer, wire it to a panel the way `unconfirmedHardwareFigures` is.

   #### The laminate is a decor, so it is one record per brand — v35 / v26

   That modelling question was put to the shop and answered:

   > *"the brand being used depends on the project as it's a decor, a choice the client would make
   > for the finish"*

   So there is no single finish laminate. A curve is finished in the **door decor** — `finish:
   'door'` in the part rules, drawn through `Panel.finishMaterialId` — so a job's laminate is
   whatever brand its doors are, and `costing.ts` resolves it from that decor's own `brand`.
   `laminate-polytec-1mm` at 3600 × 1350 and `laminate-laminex-1mm` at 3600 × 1500 replace the one
   record; `LAMINATE_MATERIAL_ID` is gone and `laminateForDecor` is what answers instead.

   **The fault it prevents is a quote nothing on screen would question.** One record carrying both
   sizes let the cheapest-buy search charge a **Laminex sheet on an all-Polytec job** — the wrong
   sheet on the order, $32.40 out on the quote, and no way to tell by looking.

   **And the first assertion written for it did not bite.** Polytec's sheet is both the right answer
   for a Polytec job *and* the cheaper of the two, so a costing that ignored the decor entirely and
   took the cheapest laminate passed it. The mutation is what found that. The assertion that bites
   runs on a **Laminex** job, where the right sheet is the *dearer* one — which is the same lesson
   as §5.13's fillet: pick the case where the right answer and the plausible-wrong answer separate.

   A decor whose brand has no laminate on the price list is charged against whatever is there **and
   says so**, because a curve costed against the wrong brand and reported beats one costed at
   nothing — §4.19's missing line that quotes at zero.

   **What is still assumed:** that the laminate matches the doors. `finish: 'door'` is hardcoded in
   the part rules, so a client who wants a *contrasting* laminate has nowhere to say it. That is a
   field on the construction method rather than a derivation, and nobody has asked for it.

   **The `.nc` files settle the principle and give two real numbers**: the white carcass board is
   **2410.0 × 1205.0 × 16.3** and the MDF door board is **3115.0 × 1205.0 × 18.0**, straight off the
   machine's own sheet declaration. So the shop's rule is exactly right — 10mm over on the length,
   5mm over on the width. The published sizes turned out not to be wanted after all, and
   whether 3115 is a stock size or a cut-down wants checking.

**Asked for and declined, recorded so nobody picks it back up as an oversight:** the particleboard
substrate under a bought-in cushion (§4.19). Put to the shop directly and answered *"no don't worry
about the substrate for now."*

### 5.12 Custom features on an individual part — **shipped, see 4.16**

What follows is the plan as it was written. It survived contact with the work, including the
warning in bold, so it is kept as the reasoning rather than rewritten; **§4.16 is the record of
what was built and what is left.**


**Asked for directly:** *"I need to be able edit individual parts to add custom grooves and cut
outs to them — so say I add a drawer bank and want to do a cut out in the left hand end"*. All
three kinds are wanted, not one: **a round hole** through a panel for a waste pipe or a cable, **a
notch** off an edge or a corner for a skirting or a stud, and **a groove or rebate** in a face.

**Three of the four pieces already exist**, which is why this is tractable:

- **The vocabulary.** `GrooveFeature`, `CutoutFeature`, `RebateFeature`, `PocketFeature` and
  `DrillFeature` are all defined in `model/feature.ts`, each carrying a tool, a depth and a face.
- **A stable name for every part.** `build.ts` already ids a panel as
  `` `${cabinet.id}:${rule.key}:${i}` ``, and the rule keys are meaningful and stable —
  `side-left`, `side-right`, `bottom`, `back`, `rails`, `fronts`, `kick`. So "the left hand end of
  that drawer bank" is `side-left`, and that name survives resizing the cabinet, changing the board
  or adding a shelf. **If it were an array index it would not**, and this feature would be far
  nastier — adding a shelf would move somebody's cutout to a different part.
- **CAM already reads features**, so a drawn cutout reaches the G-code the way a hinge cup does.
  Note §4.9's limits: pockets are cleared only when rectangular, and rebates are reported rather
  than machined.

What is missing is somewhere on the **cabinet** to store them, resolution onto the right part
during the build, and a UI to place them. Panels stay derived and never stored — that rule does not
bend — so the features live on the cabinet keyed by part name and are attached as the parts are
produced.

**The one thing that must not be got wrong: never store a raw part-space x and y.** A side panel's
part axes run opposite ways on the left and the right hand. "100 in from the front edge" stored as
`x = 100` lands 100 from the front on one side and 100 from the **back** on the other — the same
hole, the same diameter, on a part of exactly the right size, passing any test that counts holes.
That is §4.6's mounting plate, §4.4's former axis and §4.9's mirrored arc for the fourth time. So a
user feature is **stated from named edges** — *"250 up from the bottom, 100 in from the front"* —
and resolved through the part's own placement, exactly as hardware is stated in cabinet space and
converted by `cabinetToPart`. It also means the position survives the cabinet getting deeper,
because it is measured from an edge that still exists rather than from an origin that moved.

**The nest has to know which kind it is.** A hole in the middle of a panel does not change the
blank; a notch off an edge does. Handle that once, when the three kinds are built, rather than
bolting it on the first time somebody cuts a notch.

This wants **§4.15's declared capabilities underneath it**, because "can this part take a user
feature?" is the same question in a different coat.

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

**How to measure the running app, because it is now the most productive check in this file.** It is
not a project dependency and costs one install — `npm i playwright` in a scratch directory, pointed
at the browser already on the machine — then drive `npm run dev` headless and read values back:

- **The 3D scene.** Set `window.__THREE_DEVTOOLS__` to an `EventTarget` in an init script *before*
  the page loads; three dispatches an `observe` event carrying the `WebGLRenderer`, and wrapping its
  `render` captures the scene. From there, walk to a cabinet's group, invert its `matrixWorld`, and
  every panel's real position, size, UVs and texture are readable in cabinet-space millimetres.
- **The DOM**, for anything the app tabulates — the Parts list, the Nest tab's SVG rectangles.

That is how the cushions' placement, the corner seat's 372mm error, the re-derived bottom going
868 → 884, and the laminate's missing texture were each settled. **A picture is the right thing to
show somebody and the wrong thing to verify against.**

One more thing worth keeping, from §4.8: **the app was checked by reading the rendered SVG back**,
not by looking at the screenshot. 87 rectangles came out of the Nest tab's DOM and were asserted
not to overlap and not to hang off the board — the same question the suite asks of the model, asked
of what is actually on screen. A picture is the right thing to *show* somebody and the wrong thing
to verify against.
