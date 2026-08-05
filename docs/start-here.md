# Start a new session with this

Paste this whole file as the first message. It is the shortest thing that gets a fresh session
working correctly; `docs/handover.md` is the long form and this points into it.

---

Read `docs/handover.md` — it is the founding context for this project and replaces reading any
transcript. Then read `docs/woodtron-dialect.md` before touching anything under `src/core/post/` or
`src/core/library/machines.ts`.

## Where things stand

`main` is green at **1099 tests**. Schema **v36**, shop standards **v27**. Every session's work
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

## Unblocked, and it is the only one left

**A part too big for its sheet is silently not nested**, §5.13 item 6. Design questions before code;
it is closer to a benchtop's `joins` than to a nesting tweak.

**~~The custom cabinet.~~ Built, both halves** — §5.13 item 3. Any part deleted or cut from another
board, and a deleted end **re-derives** the carcass rather than switching a panel off. The Parts list
in the Inspector is the editor; a deleted part stays on it, struck through, so it can be put back.
Base, wall, tall, drawer-bank and custom allow it; the other five refuse in their own words. A part
that centres on its own thickness — a shelf, a divider — asks `ctx.thicknessOf(i)`, which `build.ts`
scopes per rule so no builder ever names its own key. **Nothing is left on it.**

**~~The sheet sizes.~~ Closed in full — read §5.13 item 7 before touching any of this.** The wait was
for a published range; suppliers publish the **nominal**, so that figure was never coming, while the
shop had already given the rule. Every footprint now traces to the shop or the machine:

```
carcass and melamine   +10 / +5     any MDF board   +20 / +10
imported plywood       TIGHTER — 2440 × 1220 quoted, 2410 × 1205 given
finish laminate        3600 × 1350 Polytec, 3600 × 1500 Laminex
```

**Ply is the one that shrinks** and it is the trap: a rule remembered as "the real sheet is bigger"
applied to ply cuts a part short. **Do not put a figure on a caution list instead of asking** — the
shop's rule about a class is the answer for every member of it, and `unconfirmedSheetSizes` turned
out to be rendered in **zero** places while three sections of the handover said it showed on screen.

**The finish laminate is a decor**, so it is one record per brand and `costing.ts` resolves it from
the door decor's `brand` — *"the brand being used depends on the project as it's a decor, a choice
the client would make for the finish."* Still assumed: that the laminate matches the doors.

**A feature that ships switched off for everybody who already had the app has not shipped.** §4.23
drew the laminate on a curve *and* migrated the allowance to zero on every existing job, so the bench
saw bendy ply for months and reported it as never done. v36 repairs the zero. Before writing "done",
ask what a **saved** job does — a migration that defaults a new feature off is a feature nobody has.

**~~The cushion meshes.~~ Done, both of them** — `viewport/cushionMesh.ts` (§4.23 and the end of
§5.13 item 1). **No cushion mesh is built from arithmetic a test cannot read now**, where all three
faults these cushions have had were invisible to everything except measuring the running app. Eleven
mutations reproducing those faults were all caught, and the assertion worth knowing about is that a
square seat and a rounded one on the same cabinet must finish at the identical box — §5.14's 36mm
fault stated as a question rather than left as a hope.

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

**And when you have been told, that is the answer — apply it and stop asking.** The sheet sizes sat
open for sessions waiting on a published figure that does not exist, while the shop's rule had been
given twice; the rule was applied to the MDF boards and then parked on a caution list as though it
were doubtful. *"Why was that advice ignored?"* is a fair question and it cost real time. A rule the
shop states about a class of thing is the answer for **every** member of that class, and an
`unconfirmed…` list is for figures nobody has an answer for — not for answers you would prefer to
have from somewhere else. (That list turned out to be rendered nowhere, so it was never even a
caution — just a note steering sessions. If a figure genuinely has no answer, wire it to a panel.)

**Test where the right answer and the plausible-wrong one separate.** The laminate is charged
against the door decor's brand; the first assertion for it ran on a **Polytec** job, where the right
sheet is also the cheapest — so a costing that ignored the decor entirely and took the cheapest
laminate passed it. Only the mutation found that. The assertion that bites runs on a **Laminex** job,
where the right sheet is the *dearer* one. Same shape as the fillet in §5.13: pick the case the two
answers disagree on.
