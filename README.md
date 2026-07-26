# Cabinet Collective

Parametric cabinet CAD, built around Australian joinery practice, with a roadmap toward
CAM/G-code output.

**Phase 1 is complete**: a room with parametric cabinets, real per-part geometry, a grouped
cutlist, and costing that handles GST properly — all driven from one versioned project model.

```bash
npm install
npm run dev       # the app
npm test          # 141 tests
npm run report    # cutlist + costing for the sample kitchen, in the terminal
```

## What it does today

Lay out base, wall, tall and drawer-bank cabinets along a run, inside a room you can size to
the real space. Every part — sides,
bottoms, top rails, backs, shelves, doors, drawer fronts, kicks — is derived from three
driving dimensions plus a construction method. Change a width, a drawer count or the carcass
thickness and the parts, the cutlist and the cost all move together, because there is only
one copy of each part in the system.

The sample kitchen is a 3000mm base run with 2400mm of wall cabinets over it: 7 cabinets,
63 parts, 29 cutlist lines, ~$1,800 on the seeded rates.

## Settings: your shop's numbers, per job

Every joinery number is editable, along with materials, standard cabinet sizes, room size,
margin, labour rates, install, delivery and the GST context. **Settings** in the top bar.

Reveals and gaps are split by **where they physically are** rather than being called
"horizontal" and "vertical" — those are read both ways in the trade, and getting it backwards
produces doors wrong on both axes:

- Reveal — top and bottom
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
- **Substrates**: melamine-faced particleboard as the carcass default, HMR for wet areas,
  MDF for doors and panels.
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

Two documents are worth reading before changing anything:

- **[docs/coordinate-convention.md](docs/coordinate-convention.md)** — the three coordinate
  spaces (world, cabinet, part) and why the A-face is defined the way it is. This is the
  decision that's painful to change later, so it's fixed and written down.
- **[docs/architecture.md](docs/architecture.md)** — module boundaries, the interfaces that
  matter, and where phases 2–5 attach.

Adding a cabinet type is a spec file plus a registry line. It does not touch the geometry
engine, the viewport or costing — `base`, `wall` and `drawer-bank` already share their carcass
builders, which is the test of whether that's actually true.

## Verification

141 tests, and the ones that matter are hand-calculated rather than snapshot:

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
- The full kitchen run: 63 parts, no warnings, everything inside the room, cabinets butted
  without gaps or overlaps.
- That a job and the shop standards stay isolated: editing one never touches the other, two
  jobs from the same standards stay independent, and a shop building to an 18mm carcass on a
  100mm kick gets parts and placements to match.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Data model, coordinate convention, rule engine, geometry, viewport, costing | **done** |
| 2 | Hardware/joinery rules (Blum first), full cutlist/BOM export | next |
| — | Drawing an arbitrary room plan (L-shaped, bulkheads, windows) | not started |
| — | Fully custom cabinets — scope still to be agreed | not started |
| 3 | Guillotine nesting for sheet goods, offcut tracking | |
| 4 | CAM feature layer — drilling, grooving, profiling | |
| 5 | One post-processor + simulation/backplot | |
| 6+ | Free-form CNC nesting, more post-processors, more hardware rule sets | |

Simulation is a hard gate before any G-code goes near real material.
