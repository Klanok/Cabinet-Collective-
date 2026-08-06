# Start a new session with this

Paste this whole file as the first message. It is the shortest thing that gets a fresh session
working correctly; `docs/handover.md` is the long form and this points into it.

---

Read `docs/handover.md` — it is the founding context for this project and replaces reading any
transcript. Then read `docs/woodtron-dialect.md` before touching anything under `src/core/post/` or
`src/core/library/machines.ts`.

## Where things stand

`main` is green at **1124 tests**. Schema **v36**, shop standards **v27**. Every session's work
lands on `main` through a pull request, so `git log main` is the honest answer to what has shipped —
check it rather than trusting this paragraph, which is exactly the kind of sentence that goes stale.

```
npm install
npm run dev       # the app
npm test
npm run build
npm run report    # cutlist, hardware BOM, drilling, nest, G-code and costing for the sample kitchen
```

## The one thing blocking real work — do not guess it

**The drill bank.** The spindle map is solved and the bank is switched off, held there by one
question: does a programmed coordinate position the **reference spindle** or the **head origin**?
They differ by **128mm** on an asymmetric pattern, every drilled row in all twenty-one machine files
is symmetric, and no amount of re-reading them can separate the two readings.

**The measurement was expected imminently, so ask before assuming it is still outstanding.** What
settles it, in five minutes on scrap: one program, two plunges **at the same X and Y**, one firing
spindle 1 (`B1`) and one firing spindle 5 (`B16`). One hole means a programmed coordinate positions
the **reference spindle**; two holes 128mm apart means it is the **head origin**. It has to come off
the multidrill head — a row bored on the borer measures the wrong machine. A part on its own settles
nothing without the program that drilled it.

## Unblocked, in the order I would take them

1. **A part too big for its sheet is silently not nested**, §5.13 item 6 — the last of that list.
   Wanted: an option to split it. **Design questions before code**, and they are the shop's to
   answer: where the split may fall, whether the halves get a joining detail or are simply two
   parts, and what the cutlist calls them. A split part is two parts and a join, which puts it
   closer to a benchtop's `joins` than to a nesting tweak.
2. **A drawer front's height can change the cabinet's height**, §5.11 — reported, never reproduced.
   The useful detail when it is reported again is whether the height moves *as you type* or *on
   save*, because those are two different bugs. **The off-screen input reported with it is a
   separate, closed thing — §4.24** — so do not take a fresh report of one as evidence of the
   other.
3. **What is left of the UI pass**, §5.11 — and it is now one small thing. The Inspector is done
   (§4.24) and the Settings window is done (§4.25). Left: the nine **"+ cabinet type" buttons**
   above the cabinet list wrap onto three lines and hold about 160px whether or not you are adding
   a cabinet. Not clipped, not small, just clumsy — and worth asking the shop how they actually
   add cabinets before redesigning it.

## Waiting on the shop, and worth asking early

- **Does a client ever pick a *contrasting* finish laminate?** Today the curve is finished in the
  door decor, hardcoded as `finish: 'door'` in the part rules. If a laminate can differ from the
  doors it is a field on the construction method, not a derivation.
- **Should a *housed* back follow a deleted end?** The shipped back laps over the carcass, so it is
  full width by definition and correctly does not move. Housed into the sides it would follow the
  opening like the top does.
- The standing ones, each with its own section: the KDT, which has exactly **one** confirmed fact
  (the Z datum) — do not invent KDT facts. The lid stay on a banquette. What happens where an inside
  corner's two back cushions meet. Whether an 864 × 864 lift-up wants splitting into two lids.
  Hettich as a second hardware brand. **Simulation, which is still the gate before any G-code runs
  on a machine.**

## Closed recently — read before reopening any of it

**The whole UI pass — §4.24 the Inspector, §4.25 the Settings window.** Two things there are
worth knowing before you touch either: a shut section **always says what is set inside it**, which
is the only reason folding is safe, and the Joinery grouping is asserted **total** against the
model — every setting on a construction method is in exactly one group, so a field added later
fails the suite instead of vanishing off the screen. That assertion immediately found
`finishLaminate`: a setting whose own doc comment said *"adopting it is a deliberate edit per
method"*, with no control anywhere in the app to make the edit with.

**The Inspector half — §4.24.** One drawer bank was 2242px of controls in a 712px window; the whole
of a cabinet now fits one screen folded, at four screen sizes. The reported "off-screen" drawer
front input was never off-screen — a long label was eating the box, in a rule shared by every field
in the app, so it was clipping other panels too.

**The Settings half — §4.25.** Not the mess the Inspector was: already tabbed, nothing clipped,
three of seven tabs already fitting. The work was **grouping** rather than shrinking — Joinery was
26 settings in one flat list — and grouping is a different job from folding: one fixes a height,
the other fixes finding a thing.

Also: the custom cabinet (§5.13 item 3, model + Parts-list editor + per-part thickness), the sheet
sizes in full (§5.13 item 7), both cushion meshes (`viewport/cushionMesh.ts`), the finish laminate
as a per-brand decor, and the laminate repair that made §4.23's drawing visible on jobs that
already existed. Every footprint now traces to the shop or the machine:

```
carcass and melamine   +10 / +5     any MDF board   +20 / +10
imported plywood       TIGHTER — 2440 × 1220 quoted, 2410 × 1205 given
finish laminate        3600 × 1350 Polytec, 3600 × 1500 Laminex
```

**Ply is the one that shrinks**, and it is the trap in the set: a rule remembered as *"the real sheet
is bigger"* applied to ply cuts a part short.

## The lesson that keeps repeating — nine sessions running

**A claim in this codebase goes stale and nothing fails when it does.** Sessions have caught stale
open items, stale *fix* claims, a bug report reproducible with one grep, and **a migration's own doc
comment about itself** — v23 swore *"nothing is re-priced"* while charging a laminate sheet on every
curve that had one.

The eighth session found three more shapes of it, and they are the ones to watch for:

- **A comment that says the opposite of the code.** `AU_LARGE`'s doc comment read *"Measured"* on the
  one sheet size deliberately left unmeasured — and two other places repeated it.
- **A safety net nothing renders.** `unconfirmedSheetSizes` was rendered in **zero** places while
  three sections of the handover said it appeared on screen and in the report.
- **A feature that ships switched off for everybody who already has the app.** §4.23 drew the
  laminate on a curve *and* zeroed the allowance on every existing job, so the bench saw bendy ply
  for months and reported it as never done. **Before writing "done", ask what a *saved* job does.**

The ninth found two more, and both are in places nobody thinks to look:

- **A passing test whose stated reason is wrong.** §4.24 has an assertion about a deleted part
  being put back, with a comment explaining the mechanism it guards. The mechanism does not exist —
  the record it described is pruned elsewhere — and the test passed anyway, for a different reason
  than the one written above it. **Only the mutation found it**, which is the argument for running
  them: a green suite tells you the assertions hold, never that they hold for the reason you think.
- **A doc comment describing a control that does not exist.** v36's migration comment says *"a shop
  that veneers or paints its curves still says so in one setting, and the carcass warning names the
  field"*. There was no such setting — `finishLaminate` had no control on any screen, so a shop
  migrated to 1mm that does not laminate could not say so. See §4.25. Every other part was right:
  the field, the label, the drift report, the migration. Nobody checked that the sentence promising
  the shop a setting described a setting. **A claim about what the *user* can do goes stale exactly
  like a claim about the code**, and what found it was a mapping asserted total rather than written
  from memory.

**Check the code, not the paragraph.** The general form: a repair has to cover every chain that
reads the field, not every field in one chain. And when you make a claim false, go and find it.

## How to work

**§6:** one scoped phase per session. **State the Definition of Done as assertions before writing
code.** Verify in the running app as well as in the suite (**§7** — read values back, never judge
from a screenshot): measuring the live scene has found bugs no test could see, repeatedly. **§7 has
how to drive it headless** — it is not a project dependency, so it costs one install. **Assert
occupancy, not size** — a part of the right size in the wrong place is the same part.

**Run deliberate mutations to check the assertions bite**, and a mutation has to reproduce the
original *mechanism* rather than merely its shape. Two of this session's assertions passed their
mutations and had to be rewritten, so this is not a formality.

**Test where the right answer and the plausible-wrong one separate.** The laminate is charged against
the door decor's brand, and the first assertion for it ran on a **Polytec** job — where the right
sheet is *also* the cheapest, so a costing that ignored the decor entirely passed. The one that bites
runs on a **Laminex** job, where the right sheet is the dearer one.

**The user is a cabinetmaker, not a developer.** Plain language, and complete step-by-step for
anything involving a terminal or GitHub. He runs it on Windows from a ZIP.

**Ask rather than derive.** A shop answer is repeatedly simpler than the design about to be built
without it — and this codebase's worst shipped feature, the quarter-disc corner seat, came from
re-deriving one sentence instead of asking about it.

**And when you have been told, that is the answer — apply it and stop asking.** The sheet sizes sat
open for sessions waiting on a published figure that does not exist, while the shop's rule had been
given twice; the rule was applied to the MDF boards and then parked on a caution list as though it
were doubtful. *"Why was that advice ignored?"* is a fair question and it cost real time. **A rule the
shop states about a class of thing is the answer for every member of that class**, and an
`unconfirmed…` list is for figures nobody has an answer for — not for answers you would prefer to
have from somewhere else.
