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

```
npm install
npm run dev       # the app
npm test          # 169 tests
npm run build
npm run report    # cutlist + costing for the sample kitchen, in the terminal
```

Everything is merged to `main`. `src/core` is pure TypeScript — no React, no Three.js — so the
model, rule engine, costing and cutlist all run and test in Node.

### What exists

| Area | State |
|---|---|
| Coordinate convention (world / cabinet / part, A-face) | Fixed and documented |
| Geometry engine — profile + extrude, ear-clipping | Straight-edged polygons only |
| Rule engine — specs as data over a construction method | base, wall, tall, drawer-bank, custom |
| Panel features (the Phase 4 CAM interface) | Types defined, barely populated |
| Costing — GST both contexts, install, delivery | Working, on placeholder pricing |
| Cutlist — grouped lines | Working, no CSV/PDF export yet |
| Shop standards + per-job settings | Working, persisted to browser |
| Saved cabinet types | Working |
| Viewport — R3F, orbit + WASD/QE, drag to move, walls | Working |
| Room | **Rectangle only. Cannot draw a plan.** |
| Hardware / joinery rules (Blum) | **Not started — this is Phase 2** |
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
deliberate edit. Schema is at **v3**; migrations run in sequence in `model/project.ts`.

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

## 4. Open items, in the order I'd do them

### 4.1 Nominal vs actual board thickness — do this first, it's small

Raised by the user and **not yet implemented.**

> "Carcass board is generally entered into real world nesting as 16.3mm thick as that is the
> closest to reality."

Nominal 16mm board measures about 16.3mm. Today `SheetMaterial.thickness` is used both as the
name of the board *and* as the number the rule engine calculates with, so a bottom panel comes
out as `W − 2×16` when reality is `W − 2×16.3` — 0.6mm too wide to fit between the sides.

**Suggested shape:** keep `thickness` as the nominal figure used for naming and ordering, add
`actualThickness` (defaulting to nominal), and have the rule engine, grooves and dados use
`actualThickness`. Nesting and CAM will need the actual figure too.

**Warn the user before doing it:** this changes every part size by a fraction of a millimetre,
which invalidates the cutlist he has just verified against 16mm arithmetic. It should be his
call whether to switch, and per-material.

### 4.2 Drawing room walls — highest practical value

The room is a rectangle sized by width/depth/height (`core/model/room.ts`, editable under
Settings → Room, rendered by `app/viewport/RoomShell.tsx`). Every real kitchen is a different
shape, so this is hit on every job.

**Needed:** a 2D plan view where wall segments can be drawn, with lengths typed rather than
dragged for accuracy, and cabinets that can sit against whatever has been drawn.

Suggested Definition of Done: *"trace an L-shaped kitchen with typed wall lengths, place
cabinets against two different walls, and see them correctly in 3D."*

### 4.3 Curved parts — the foundation is worth doing before Phase 4

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

### 4.4 Phase 2 — hardware and joinery rules

Per the original architecture: Blum first, Hettich second. This is on the critical path to
trustworthy CAM output, and drilling accuracy is what actually stops material being ruined.
Also in Phase 2: full cutlist/BOM export (CSV/PDF).

Drawer **boxes** were deliberately left out of Phase 1 — their sizes are dictated by runner
specs (Legrabox/Tandembox nominal lengths, side thicknesses, clearances), and guessing them
ahead of the hardware rules is how material gets wasted.

### 4.5 Smaller things noted but not done

- Cabinets can be dragged but not rotated with the mouse; yaw is typed.
- The custom cabinet excludes itself from benchtop runs — a banquette shouldn't get one, but
  a bench-height custom carcass arguably should. Needs a rule, or a per-cabinet flag.
- Nesting still estimates sheets from area × a yield allowance. Phase 3 replaces it.

---

## 5. How to work on this

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

## 6. Verification standard

Tests are hand-calculated, not snapshots. The reference figures are written out longhand in
each test file's header so they can be checked by eye against real practice.

Two things get asserted separately and both matter:
- **part size** — what goes on the cutlist
- **the cabinet-space box each panel occupies** — a left side carrying a right side's
  placement is the same size and completely wrong

Keep that standard. It is what made the errors found from the bench cheap to fix.
