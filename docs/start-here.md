# Start a new session with this

Paste this whole file as the first message. It is the shortest thing that gets a fresh session
working correctly; `docs/handover.md` is the long form and this points into it.

---

Read `docs/handover.md` — it is the founding context for this project and replaces reading any
transcript. Then read `docs/woodtron-dialect.md` before touching anything under `src/core/post/` or
`src/core/library/machines.ts`.

## Where things stand

`main` is green at **1042 tests**. Schema **v32**, shop standards **v23**. Every session's work
lands on `main` through a pull request, so `git log main` is the honest answer to what has shipped —
check it rather than trusting this paragraph, which is exactly the kind of sentence that goes stale.

```
npm install
npm run dev       # the app
npm test
npm run build
npm run report    # cutlist, hardware BOM, drilling, nest, G-code and costing for the sample kitchen
```

## The lesson that keeps repeating — now seven sessions running

**A claim in this codebase goes stale and nothing fails when it does.** Four sessions caught stale
open items. One caught two stale *fix* claims and a bug report that was reproducible with one grep.
One caught **a migration's own doc comment about itself** — v23 swore *"nothing is re-priced"* while
charging a laminate sheet on every curve in every job that had one, for two years.

The seventh went the other way and is the one to copy: `PARTS DO NOT COME FREE` was true, stopped
being true when the Woodtron's second pass was written, and **went out in the same commit that made
it false**, along with the test pinning it.

**Check the code, not the paragraph.** The general form: a repair has to cover every chain that
reads the field, not every field in one chain. And when you make a claim false, go and find it.

## The one thing blocking real work — do not guess it

**The drill bank.** The spindle map is solved and the bank is switched off, held there by one
question: does a programmed coordinate position the **reference spindle** or the **head origin**?
They differ by **128mm** on an asymmetric pattern, every drilled row in all twenty-one machine files
is symmetric, and no amount of re-reading them can separate the two readings. It needs **one real
part whose true hole positions are known**. Until then every hole is reported by name and left out.

## Unblocked, in the order I would take them

1. **The tail of the sheet sizes**, §5.13 item 7. Three footprints are still stated at their usable
   area and named on `unconfirmedSheetSizes`. Each is one line in `CARCASS_REAL_SIZES` or
   `MD_REAL_SIZES` once somebody reads the published range — and an entry there repairs saved jobs
   as well as new ones, where a library edit alone reaches only the new.
2. **A part too big for its sheet is silently not nested**, §5.13 item 6. Design questions before
   code; it is closer to a benchtop's `joins` than to a nesting tweak.
3. **The custom cabinet whose part list is itself data**, §5.13 item 3. The largest item on the list
   and a rethink rather than a field.
4. **A test behind the inside corner cushion's mesh placement.** It took three goes and the last
   fault was only found by measuring the running app. §4.23's `viewport/cushionMesh.ts` is the
   pattern: get the arithmetic out of the JSX and assert it.

## Also open, and each says so in its own section

The KDT, which has exactly **one** confirmed fact (the Z datum) — do not invent KDT facts. The lid
stay on a banquette. What happens where an inside corner's two back cushions meet. Whether an
864 × 864 lift-up wants splitting into two lids. Hettich as a second hardware brand. Simulation,
which is still the gate before any G-code runs on a machine.

## How to work

**§6:** one scoped phase per session. **State the Definition of Done as assertions before writing
code.** Verify in the running app as well as in the suite (**§7** — read values back, never judge
from a screenshot): measuring the live scene has found the last four bugs that no test could see.
**Assert occupancy, not size** — a part of the right size in the wrong place is the same part.

**Run deliberate mutations to check the assertions bite**, and a mutation has to reproduce the
original *mechanism* rather than merely its shape. A per-part two-pass writer emits the same two
depths the same number of times as a per-sheet one; only the ordering separates them.

**The user is a cabinetmaker, not a developer.** Plain language, and complete step-by-step for
anything involving a terminal or GitHub. He runs it on Windows from a ZIP.

**Ask rather than derive.** Three times recently a shop answer was simpler than the design that was
about to be built without it — and this codebase's worst shipped feature, the quarter-disc corner
seat, came from re-deriving one sentence instead of asking about it.
