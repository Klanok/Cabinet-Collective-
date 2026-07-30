# Cabinet Collective

Parametric cabinet CAD, built around Australian joinery practice, with a roadmap toward
CAM/G-code output.

**Phases 1 and 2 are complete**: a room with parametric cabinets, real per-part geometry, a
grouped cutlist, Blum hardware and the drilling that goes with it, and costing that handles GST
properly — all driven from one versioned project model.

```bash
npm install
npm run dev       # the app
npm test          # 481 tests
npm run report    # cutlist, hardware order, drilling and costing for the sample kitchen
```

## What it does today

Draw the room, then lay base, wall, tall, drawer-bank, custom and radiused-end cabinets
against its walls.

The **custom** cabinet is the same carcass with its part list chosen rather than fixed — top
panel, rails or open; back or none; shelves; vertical dividers; a lid; drawers or doors.
Between them those options cover a banquette base, a pigeon-hole unit and open shelving
without a bespoke cabinet type for each. Configure one, hit **Save as a cabinet type**, and
it's available in every job from then on. Every part — sides,
bottoms, top rails, backs, shelves, doors, drawer fronts, kicks — is derived from three
driving dimensions plus a construction method. Change a width, a drawer count or the carcass
thickness and the parts, the cutlist and the cost all move together, because there is only
one copy of each part in the system.

The sample kitchen is a 4200mm base run with 2400mm of wall cabinets over it: 8 cabinets and a
dishwasher space, 87 parts, 37 cutlist lines, 3 MERIVOBOX drawer sets, 22 hinges, 554 holes, one
stone benchtop and two ladder bases, ~$7,400 on the seeded rates.

## Hardware and drilling

Drawer boxes are cut to the **runner**, not to the cabinet. MERIVOBOX is the standard: pick a
box height and the nominal length is chosen from the cabinet's real inner depth, then the
bottom comes out `LW − 51` wide by `NL − 26` long and the wooden back at 83mm for an M profile.
Those are Blum's numbers, not conventions — which is exactly why drawer boxes waited for this
phase rather than being guessed at in Phase 1.

Everything vertical is measured from **the bottom of the runner**, which is Blum's own datum and
the only plane the drilling and the box can both be measured from without one going through the
other.

Every hole a cabinet needs is on its panels as machining intent, not baked into a mesh:

- **hinge cups** Ø35 × 13 in the back of each door, 22.5mm in from the hinged edge, 96mm from
  each end, with the two Ø8 dowels — and the count follows the door's height
- **mounting plates** two Ø5 × 13 at 32mm centres, 37mm back from the front edge of the side
  the door actually hinges on
- **runner fixings** two per side per drawer, on the runner's own bottom line, at the spacing
  that nominal length calls for
- **front fixings** four pilots in the back of each drawer front, 20.5 mm in from each outer
  cabinet face and 33.5 mm above the bottom of the runner — Blum's `20.5 + FA`, said from the
  cabinet so the reveal never has to be in the sum
- **shelf pins** System 32 rows front and back, where a cabinet has adjustable shelves

Every one of those is described **once, in cabinet space**, and converted into each panel's own
part space through its placement — which is what makes a left side and a right side come out
mirrored rather than identical. The Hardware tab shows the order and the hole count, and exports
the cutlist, the hardware order and a drilling sheet as CSV. A hinge cup is on the back face, so
the drilling sheet says which parts turn over — and on a plain-slab kitchen **none of them do**.
The face being machined is the face that goes up, so a door with work only in its back is bored
back-up in one setup. It is a routed front, recessed on the show face *and* bored in the back, that
genuinely needs two.

The Blum figures live in one file, `src/core/library/blum.ts`. Anything in there that has not
been checked against the catalogue is listed by name on screen and in the terminal report, the
same way indicative pricing is — because a figure nobody knows is unchecked is a figure that
gets trusted.

## Benchtops and ladder bases

These two are the only things in the tool that span a **run** of cabinets and belong to none of
them, and they're the only things that are **saved rather than worked out**. Everything else is
regenerated from its cabinet on every build, which is what stops a job carrying stale parts. A
benchtop stops being something that can be worked out the moment you set a 40mm overhang on one end
or put the sink 300mm off centre — so it's generated from a run once, and yours from then on.
Move a cabinet and the top stays exactly where it is, until you press **Regenerate**.

**The dishwasher.** A gap between two cabinets used to break the run — right for a fridge, wrong for
a dishwasher, and there's nothing you can *measure* that tells them apart. So you place an
**appliance space**: a named gap of a known width that nothing is cut for, and that carries the
answer. It asks two questions separately, because they are two questions — does the top run over it,
and does the plinth run under it. A dishwasher is yes and no: the top goes straight over, and the
plinth stops either side because the machine stands on the floor. The sample kitchen has one in it,
and comes out as **one 4200mm top and two plinths**.

**Cut or bought.** Which one a top is comes off the material you pick, and it changes everything
downstream. A shop-made top — laminated MDF, timber — is a cut part: it's on the cutlist in as many
pieces as you've joined it into, the sink hole is machining, and it's priced as sheet and banding
like a door. A stone top isn't a part at all: it's templated on site after the cabinets are in, and
it's quoted the way the fabricator quotes it — per square metre, **plus** a charge for each cutout
by what the cutout is for, plus a charge per join, plus edge profiling by the metre, all against a
**minimum**. Costed as bare area × rate, a 900mm vanity comes out at about a third of the real
number.

You set the overhangs on each edge independently — a breakfast bar is one edge, not four — say what
happens at each end (into a wall, exposed, waterfall, mitred), put the joins where they'll be least
visible, and add sink, hob and tap-hole cutouts. A run with no top on it yet is still drawn in 3D,
but as a **ghost**: see-through, so it can't be mistaken for something you've specified. Nothing is
cut or quoted for it until you generate one.

**The ladder base** is the alternative to a kick panel per cabinet: a frame on the floor that a whole
run sits on, with the kick face applied to the front. The ribs run to the floor and are what the run
stands and gets levelled on; the front and back rails are cut 10mm short so they hang clear and the
frame beds down on the ribs alone — on a floor that's never flat, that's the difference between
packing three ribs and fighting a rail that rocks. The face is cut 10mm over-height to be planed in
on site. Generating one switches the individual kick off every cabinet over it, because a run on a
continuous plinth doesn't also carry a kick panel each.

Which *end* of the kick face that extra 10mm sits at is the one figure here that hasn't been
confirmed — it ships as the floor, as a scribe allowance — and the app says so by name, on screen
and in the report, until somebody checks it. Cutting it at the wrong end is a whole run of kick
faces.

## Drawing the room

Every kitchen is a different shape, so the room isn't a box you type two numbers into. Switch
the viewport to **Plan** and walk the room the way you'd measure it: each wall runs on from the
last, you say which way it turns, and you **type what it measures**. Nothing is sized by
dragging — a wall that's 4185 because that's where you let go of the mouse is worse than no
wall at all. The last wall closes back onto the first, and the plan tells you how far off it is
until it does.

Change a length later and every wall after it moves with it, the same as it would on paper:
make the room 600 longer and the wall running back the other way gives up the 600, so the plan
stays closed.

Name your walls what you call them on site — "sink wall", "window wall" — because those names
are what you pick from when you place a cabinet. In the Inspector a cabinet says where it
stands the way you'd say it: **against the sink wall, 600 along, no gap behind**. Drag one near
a wall in the 3D view and it parks flush and square against it, turned the right way round.

## Door styles

The door is the part of a kitchen a client actually chooses, so it's a **saved recipe**, not a
drawing. Under **Settings → Door styles** you set a border width, a recess depth and an internal
corner radius, give it a name, and that style applies to whatever size front the job turns out
to need — a 717mm door and a 237mm drawer front off the same numbers.

These are **one-piece** fronts: a single MDF slab with the shaker or V-groove look routed into
its face, then wrapped or sprayed. Which means the thing worth knowing about them:

- A shaker door is still **one part on the cutlist**, the same 717 × 447 a plain slab door is.
- It's **banded exactly as a plain door is** — the routing is on the face, the edges are
  untouched.
- What changes is the router time, and that's **priced on the quote**: each style carries its
  own minutes per front, charged at your shop rate. Quote a shaker kitchen as if the doors were
  plain and you've given away the routing.

A style applies to doors, drawer fronts, false fronts and applied end panels — a shaker kitchen
has shaker drawer fronts too. Any single cabinet can override it in the Inspector, for the one
that's deliberately a plain slab.

One thing it does on its own: a drawer front too narrow to carry the border comes out a **plain
slab and says so**. A 140mm front with a 57mm border has 26mm of centre left, and machining that
would be a rebate through the whole part.

## Curves

Three kinds of radius work, all cut from real circles rather than from a lot of short straight
lines pretending to be one.

**Open radius shelving.** Any custom cabinet has a **shelf front bow**: how far the front of a
shelf stands proud at its middle. That's the measurement you'd actually take — a straightedge
across the front and a tape to the middle — so it's the one you type, and the radius follows
from it. The shelf keeps its back where a straight one had it and reaches forward.

The thing that matters here is the banding. A curved edge is **longer than the straight line
across it**: an 866mm shelf bowed 40mm has 871mm of front edge, and the cutlist buys 871. It's
only about 5mm a shelf, but it's 5mm the wrong way, every shelf, and it used to be invisible.

**Enclosed radiused ends.** Add a **Radiused end** to finish a run. It's a quarter circle, so
it has one plan dimension rather than two — you set the radius and the width and depth follow.
Out comes what one actually is: a stack of quarter-disc formers, bendy ply over them, and a
curved kick.

Three numbers in there are each a wasted sheet if you get them wrong, and all three are worked
out for you:

- **The formers are cut smaller than the finished radius**, by however many layers of skin go
  over them. Cut them to the finished size and the curve stands proud of the run's front face by
  the thickness of the skin — a step right where a hand lands.
- **Each layer of bendy ply is a different length.** The outer one wraps the inner one, so it has
  further to go — on a 560 quarter, 877.3 against 872.6. Cut them the same and the outer one is
  4.7mm short, which you find out with the glue on.
- **Those lengths are measured round the middle of the board**, not the inside or the outside
  face. Round the inside it comes up short; round the outside it runs long.

Every skin is on the cutlist as the **flat rectangle you actually cut**, with a note saying what
radius to bend it to. Bendy ply is sold barrel form or column form depending which way it bends,
and the app doesn't know which you've bought — so the note tells whoever's cutting to check the
sheet first.

**A rounded corner on an ordinary cabinet.** A base, wall or tall cabinet takes a **rounded
corner** — pick which front corner, left or right as you stand and look at it, and type the
radius. The cabinet **keeps its size**: a 900 × 720 × 560 with a 200 radius is still 900 × 720
× 560, and the only board you lose is the corner offcut. A radiused end is the same thing grown
until the radius equals the width and the depth, which is why the two produce the same shape at
that point.

What comes out is what one is built from:

- **The end panel stays in**, set back behind the ply so the ply finishes flush, and shortened
  by the radius. It's still carrying the shelves, the top and the benchtop over it — you don't
  throw away a good 460mm side panel to get a 100mm curve.
- **A 50mm strip of flat front** beside the curve, which is what the curved piece is fixed to.
  It's there whether the cabinet has doors or not, and it's under **Settings → Construction** if
  your shop works to something other than 50.
- **The wrap is one piece per layer, no join** — the strip, round the corner, then flat all the
  way down the end to the back. An exposed end wants no joint line in it.
- **Shelves get a square notch** at that corner rather than a curved one. That's the
  edgebander's doing, not the saw's: a curved edge won't go through it. The top and bottom do
  take the curve, because that edge disappears under the ply and never gets banded.
- **Doors keep clear of the strip**, and the app checks the pair for width against the door
  opening you'd actually have — a 550 radius on a 900 leaves 300mm of front, and it says so
  rather than quietly cutting two 147mm doors.

Setting a radius **defaults the cabinet to no doors and no shelves**, because the usual reason
for one is a decorative end rather than a cupboard. Ask for a door and you'll get one, sized to
what the curve left.

## What the board measures, not what it's called

Nominal 16mm melamine runs about 16.3. Anything that has to fit *between* two boards depends on
the real figure — a bottom panel cut at 900 − 2×16 is 0.6mm too wide to go in.

So a board carries both numbers. **16mm** is its name: what you order, what the supplier
invoices, what the cutlist groups and sorts by. **16.3** is what it measures, and that's what
the parts are cut to.

Nothing is measured for you. Every board starts as "it measures what it says", so a job cuts
exactly as it always did until you say otherwise under **Settings → Materials → what the boards
really measure** — which lists only the boards this job uses. Entering a figure moves every part
made from that board, so it's yours to enter, and a job you've already quoted or cut keeps the
sizes it was quoted and cut to.

Carcass thickness therefore follows the board you pick. There's no thickness box under Joinery
at all — a construction method describes how the parts go together (back style, kick, reveals,
gaps, shelf clearances, hole pitch), and the board says how thick it is. One place knows each
fact, so the two can't disagree.

## Settings: your shop's numbers, per job

Every joinery number is editable, along with materials, standard cabinet sizes, ceiling height,
margin, labour rates, install, delivery and the GST context. **Settings** in the top bar. The
room's shape is drawn in the Plan view rather than typed here.

Reveals and gaps are split by **where they physically are** rather than being called
"horizontal" and "vertical" — those are read both ways in the trade, and getting it backwards
produces doors wrong on both axes:

- Reveal — top
- Reveal — bottom (commonly zero: a base cabinet door is flush with the carcass bottom and
  carries its reveal only at the top, under the benchtop)
- Reveal — left and right
- Gap between doors (side by side)
- Gap between drawer fronts (stacked)

There are two scopes, and the distinction is deliberate:

- **This job** — what this kitchen is built to. Changing it affects nothing else.
- **Shop standards** — what *new* jobs start from. Changing it affects nothing already created.

A job takes a **copy** of the standards when it's created, never a reference. So changing your
standard kick height next year can't reach back and re-price or re-cut a kitchen you quoted
this year — a job is a record of what was agreed. Where a job has drifted from your standards,
the settings screen lists exactly how, and you can either pull it back into line or promote it
to become the new standard.

Everything saves to the browser automatically. **Job ▾** also gives you save-to-file and
open-from-file, so a job can live outside the browser.

## Australian defaults, not a localisation pass

- **Millimetres only.** There is no imperial fallback and no conversion layer.
- **Frameless (European 32mm) construction** is the baseline the rule engine is designed
  around. Face-frame would be an additional construction method, not the default.
- **Sheet sizes**: 3600×1800 and 2400×1200, with 2440×1220 for imported product.
- **Thicknesses**: 16 / 18 / 25mm.
- **Substrates**: white HMR particleboard as the carcass default. A carcass is specified as a
  *board*, not a finish — nobody orders a carcass in a decor name. Decors are for doors,
  panels and any carcass genuinely on show.
- **Dimensions**: 720mm base carcass on a 150mm kick (870 to benchtop underside, 900
  finished), 560mm base depth, 300mm wall depth, wall cabinets hung at 1500mm for a 600mm
  splashback.
- **GST** is modelled as arithmetic, not a display toggle — see below.
- **AUD**, no multi-currency.

## GST

The two registration contexts differ on the **cost** side, not just the invoice:

| | Cost base | Charged on the sale |
|---|---|---|
| GST registered | ex-GST — the input credit is claimed back | 10% |
| Not registered | GST-inclusive — the credit can't be claimed, so it's a real cost | nil |

Treating the unregistered case as "same numbers, just don't add GST at the end" understates
cost by the GST on every sheet and every metre of edging. Switch the entity in the Cost panel
and the material line moves, not just the total.

## Pricing is indicative

The material library carries **real decor names and real sheet sizes, but placeholder
prices**. Every affected record is flagged `indicativePricing`, and the cost panel says so on
screen. Load your actual trade pricing into `src/core/library/materials.au.ts` before quoting
anything from this.

## How it's built

`src/core` is pure TypeScript — no React, no Three.js — so geometry, rules and costing are
testable in Node and reusable by every later phase. `src/app` is the React/R3F layer on top,
and the dependency only points one way.

**Continuing this work in a new session? Start with
[docs/handover.md](docs/handover.md)** — it carries the current state, the decisions that
shouldn't be casually undone, the shop-specific corrections, and the open items in
recommended order.

Two more documents are worth reading before changing anything:

- **[docs/coordinate-convention.md](docs/coordinate-convention.md)** — the three coordinate
  spaces (world, cabinet, part) and why the A-face is defined the way it is. This is the
  decision that's painful to change later, so it's fixed and written down.
- **[docs/architecture.md](docs/architecture.md)** — module boundaries, the interfaces that
  matter, and where phases 2–5 attach.

Adding a cabinet type is a spec file plus a registry line. It does not touch the geometry
engine, the viewport or costing — `base`, `wall` and `drawer-bank` already share their carcass
builders, which is the test of whether that's actually true.

## Verification

481 tests, and the ones that matter are hand-calculated rather than snapshot:

- Every part size for the reference 900×720×560 base cabinet, worked out longhand in the test
  file header and asserted individually.
- The **cabinet-space box each panel occupies** — not just its size. A left side with a right
  side's placement is the same size and completely wrong, so placement is asserted separately.
- Door and drawer-front gaps and reveals, including that a pair of doors ends up exactly 3mm
  apart with 1.5mm at each outer edge.
- Both GST contexts, including that the material cost ratio between them is 1.1 within
  per-panel rounding.
- That each reveal applies to the edge it names — swapping which one is large swaps which door
  dimension shrinks.
- That a job saved before reveals were split still cuts identically after migration.
- The full kitchen run: 87 parts, with the arithmetic from the Phase 1 63 written out step by step
  — drawer boxes in, per-cabinet kicks out and onto the ladder base, an end base added, nothing cut
  for the dishwasher space and nothing cut for the stone top — and not one of the original parts
  moved. No warnings, everything inside the room, cabinets butted without gaps or overlaps.
- That a job and the shop standards stay isolated: editing one never touches the other, two
  jobs from the same standards stay independent, and a shop building to an 18mm carcass on a
  100mm kick gets parts and placements to match.
- That a shaker door is the same rectangle a slab door is: same size, same placement, same
  banding, same material, same number of cutlist lines, and the same sheet cost. Only the
  routing line on the quote moves.
- The hardware, against the Blum sheet: a 600 × 560 bank resolving NL 500 because 550 would want
  553mm of clear depth and there is 544; its bottom at 517 × 474 and its back at 517 × 83; and the
  same bottom coming out 516.4 wide once the carcass board is measured at 16.3.
- The drilling **by coordinate, not by count**: Door L's cups at part y = 424.5 and Door R's at
  22.5, and the mounting plates at part y = 507 on the left side and 37 on the right — the same
  37mm from the front edge, which no hard-coded number could produce for both. Plus a catch-all
  that every hole on every part of every cabinet type, at two widths and both hands, lands inside
  the part it is bored in.
- That the v9 migration moves no part that already existed, and *does* re-price a saved job upward
  by the hardware it always needed — both asserted, so neither is an accident.
- The curves, against figures worked longhand in the test headers: a circle written as two
  half-circle edges coming out at exactly πr² and 2πr rather than at zero and 400; a shelf
  bowed 50 over 900 measuring 350 deep at its middle; and the two skin layers of a radiused end
  differing by exactly one board thickness round the turn.

All of it runs on every pull request (`.github/workflows/ci.yml`) — typecheck, tests, build, and
a terminal cutlist for the sample kitchen in both a plain and a routed door style. A property
like the shaker/slab one above is the kind that breaks quietly and stays broken, so it is worth
having something other than memory re-checking it.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Data model, coordinate convention, rule engine, geometry, viewport, costing | **done** |
| — | Drawing the room plan — any shape, typed wall lengths, walls at any angle | **done** |
| — | Nominal vs actual board thickness (16 vs 16.3mm) | **done** |
| — | Door styles — shaker and V-groove as machining, saved and costed | **done**; toolpaths in 4 |
| — | Curved parts — arc-capable profiles, radiused shelving, radiused ends | **done** |
| — | A rounded corner on a base, wall or tall cabinet — bendy ply and formers | **done** |
| — | The same corner routed from door board instead of wrapped in ply | not started |
| 2 | Hardware/joinery rules — MERIVOBOX boxes, CLIP top boring, System 32, hardware BOM, CSV export | **done** |
| — | Hettich as the second hardware brand | not started |
| — | PDF export (CSV is done; print from the browser meanwhile) | not started |
| — | Cabinets butting up against each other on a drag, not just against walls | **done** |
| — | Decor colours in the 3D view, so a walnut door doesn't render as white melamine | **done** |
| — | Benchtops as their own unit, rather than derived from the cabinets under them | **done** |
| — | A separate ladder kick under a run, rather than a kick per cabinet | **done** |
| — | An appliance space, so a top runs over a dishwasher and not over a fridge | **done** |
| — | Waterfall and mitred benchtop corners linked to each other, not just flagged per top | not started |
| — | Wall openings — bulkheads, windows, out-of-square walls and scribes | not started |
| 3 | Guillotine nesting for sheet goods, offcut tracking | not started |
| 4 | CAM feature layer — toolpaths from the features Phase 2 and the door styles emit | not started |
| 5 | One post-processor + simulation/backplot | not started |
| 6+ | Free-form CNC nesting, more post-processors, more hardware rule sets | not started |

Material pricing is still indicative — the decor names and sheet sizes are real, the dollars are
placeholders. Load your trade pricing before quoting from this.

Simulation is a hard gate before any G-code goes near real material.
