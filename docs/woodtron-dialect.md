# The Woodtron dialect, read off real programs

**Source:** twenty-one `.nc` files from one job — `JN10_TallStore_339_B1..B15` (white carcass, 16.3mm) and
`JN10_TallStore_687_E1..E4,E8` (MDF doors, 18mm), with the job drawing
`JN10_Tall_Cupboards__Pelmets_B.pdf`. Supplied by the shop, August 2026. All were read; the
drawing is summarised in §9. **`B6`–`B15` are what solved the drill bank's spindle map** — the first
five sheets held one part each and one spindle group, and were ambiguous about both. Every group and
offset seen across all twenty-one files fits the map in §6 with nothing left over.

**This is the document §4.9 has been asking for since it was written.** Every figure below is read
off a program the machine actually runs, not inferred. Where two files disagree it is noted; they
mostly do not.

---

## 1. The sheet, and the header

```
N10 (Sheet B1 - 2410.0 x 1205.0 x 16.3)
N20 G8000              (LABEL CONTROL)
N30 G665               (START TOOL LIFE FUNCTION)
N40 G100 X2410.0 Y1205.0 Z16.3
N50 M60 M82            (VACUUM ON | STOPS DOWN)
N60 G90 G17            (ABSOLUTE PROGRAM | X-Y PLANE)
N70 G40 G80            (TOOL CENTRE | CANCEL CANNED DRILL)
N80 M91                (PUSHER UP)
N90 M82                (STOPS DOWN)
N100 M32 M05           (ROUTER UP | ROUTER OFF)
N110 M29               (ROUTER BRUSH UP)
N120 G0 G53 Z0
```

**Two real sheet sizes, and they settle §5.13 item 7 outright:**

| Board | Sheet | Nominal |
|---|---|---|
| White carcass | **2410.0 × 1205.0 × 16.3** | "2400 × 1200 × 16" |
| MDF door | **3115.0 × 1205.0 × 18.0** | "3600 × 1200 × 18"? — see below |

The shop's rule that *"2400 × 1200 is the usable area"* is exactly right: the real board is 10mm
over on the length and 5mm over on the width. **And the 16.3 is the same 16.3 §4.1 records** —
*"carcass board is generally entered into real world nesting as 16.3mm thick"* — arriving
independently, off the machine, three months later. That is a strong confirmation of the
nominal-vs-actual split.

`G40` is **cutter compensation off — "TOOL CENTRE"**. The programmed path *is* the tool centre, so
the post has to do the offsetting itself. `cam/offset.ts` already does exactly this.

- **Line numbers**: `N`, step 10, on every line including blanks.
- **`G100 X.. Y.. Z..`** restates the sheet — presumably the machine's own stock setup.
- Everything is `G90` absolute, `G17` XY plane.

## 2. Z zero — the table, confirmed twice over

Already fixed in `library/machines.ts`, and these files are the proof. On the 16.3mm carcass sheet:

```
Z46.3                     rapid plane for the drill head   = 16.3 + 30
Z26.3                     drill plunge clearance           = 16.3 + 10
Z36.3                     rapid plane for the router       = 16.3 + 20
Z26.3                     router plunge clearance          = 16.3 + 10
G1 ... Z1.0               first contour pass, 1.0mm left
G1 ... Z-0.2              through pass, 0.2 into the spoilboard
```

So Z0 is the table, the sheet's top face is at +thickness, and a through cut finishes at −0.2.

**Corrected figures**, all of which were guesses in the KDT profile:

| Figure | Was | Is | Read from |
|---|---|---|---|
| `zDatum` | `material-top` | **`table`** | every file |
| `clearanceHeight` (router) | 20 | **20** ✓ | 36.3 − 16.3 |
| `plungeClearance` | 3 | **10** | 26.3 − 16.3 |
| `throughOvercut` | 0.5 | **0.2** | Z−0.2 |
| `drillStyle` | `canned-g81` | **`explicit`** | no G81 anywhere |

The drill head rapids at **+30** where the router rapids at **+20** — two different clearance
planes, which the current `MachineProfile` has no way to express.

## 3. Through-drilling stops at the table; through-routing goes past it

Worth stating on its own, because it is a distinction the post does not currently draw:

```
G1 Z0.0    a drill going right through 16.3mm board — stops exactly at the table
G1 Z-0.2   the router taking a part out — 0.2mm into the spoilboard
```

A drill that overcut would be putting a Ø5 hole in the bed on every through-hole, hundreds of times
a sheet. The router's 0.2 is a single pass round each part.

## 4. Drill depths, and the hinge cup confirmed

Depths are `thickness − Z`:

| Programmed | Board | Depth | What it is |
|---|---|---|---|
| `Z0.0` | 16.3 | 16.3 | through |
| `Z13.3` | 16.3 | **3.0** | shallow, Ø5 |
| `Z4.3` | 16.3 | **12.0** | Ø5 — system/shelf-pin depth, five at a time |
| `Z3.3` | 16.3 | **13.0** | Ø5 in pairs (`B3`) — dowels |
| `Z5.0` | 18.0 | **13.0** | **Ø35 hinge cup** |
| `Z5.0` | 18.0 | **13.0** | Ø10 — dowel / EXPANDO |

**The Ø35 at 13mm deep is exactly what this codebase has always used for a Blum cup**, off Blum's
own drilling pattern (§3). It has now been confirmed against a program the machine runs.

## 5. Tooling

The router. **Two tools appear across the job**, which is what makes the pattern readable rather
than a single example:

```
(TOOL: 10COMP3W)          10mm compression spiral, 3 wing
G666 T1                   ← the tool change. NOT M6.
M28                       (ROUTER BRUSH DOWN)
M3 S24000                 (ROUTER ON | RPM)
G0 G53 Z0.
G55 G43 H1                (ROUTER ORIGIN | TOOL LENGTH COMP)
M31                       (ROUTER DOWN)
```

and, in `E3` and `E4`, a second change mid-program:

```
(TOOL: 12COMP3W)
G666 T8
M28
M3 S24000
G0 G53 Z0.
G55 G43 H8                ← H matches T
M31
```

**`H` always equals `T`.** The length-offset register and the tool number are the same index, so a
profile needs one number per tool rather than two. `T1` is the 10mm compression, `T8` the 12mm — so
the tool table is sparse and the numbers are the machine's own pockets, not a sequence to invent.

**A rip is not a contour, and it is written differently.** A trim cut plunges straight down and runs:

```
G0 X2446.9 Y1205.0
Z38.0                     18 + 20
Z28.0                     18 + 10
G1 Z-0.2 F4000            straight plunge — no ramp
Y0.0 F21000               one cut, edge to edge
G0 Z38.0
```

No 20mm lead-in ramp: that is used for a closed part outline, where the tool has to enter the
material somewhere it will later cut away. A straight rip across the sheet has nothing to lead into.
The two cases are genuinely different and the post needs both.

**Two work offsets, one per head** — and this is the single most structurally significant finding:

- **`G54` — MULTIDRILL ORIGIN**
- **`G55` — ROUTER ORIGIN**

The two heads are physically offset from each other and the machine keeps a separate origin for
each. A post that writes one origin for both puts every hole in the wrong place relative to every
cut. `MachineProfile` has no concept of this today.

**Feeds and speeds, real:**

| Move | Feed |
|---|---|
| Router ramp / lead-in | F7000 (carcass), F4000 (door) |
| Router cutting | F21000 (carcass) |
| Small drills (Ø3, Ø5, Ø10) | F3000 |
| Ø35 borer | **F500** |
| Spindle | S24000 |

The Ø35 is six times slower than the small drills. Feed is **per tool**, which `MachineTool` already
models — but the shipped numbers are far more conservative than these.

## 6. The multidrill bank — and its spindle map, solved

This is the feature `machines.ts` deliberately switched off. `B6`–`B9` carry enough variety to solve
it, which the first five files did not.

```
M46                       (MULTIDRILL HEAD ON)
M38                       (MULTIDRILL HEAD DOWN)
G54                       (MULTIDRILL ORIGIN)

(TOOL: D5 12345)
B31                       (BINARY TOOL - mm to Origin: X0.  Y0. )
(TOOL: D5 21345)
B31                       (BINARY TOOL - mm to Origin: X32. Y0. )
(TOOL: D5 51234)
B31                       (BINARY TOOL - mm to Origin: X128. Y0. )
```

**Three groups, same bitmask, three different offsets — and that is what gives the map away.**

- **`B<n>` is a bitmask of which spindles fire.** `B1` = spindle 1. `B3` = spindles 1+2. `B31` =
  1,2,3,4,5. `B64` = spindle 7. `B32768` = spindle 16. `B65536` = spindle 17.
- **The digits after the diameter list the spindles, reference first.** `D5 12345` and `D5 51234`
  and `D5 21345` are the *same five spindles* in a different order; only the first digit changes,
  and it changes with the offset.
- **So the offsets read straight off:** reference spindle 1 → X0, spindle 2 → X32, spindle 5 → X128.

**The spindles are on a 32mm pitch, and spindle _n_ sits at (n − 1) × 32.** Every observation fits:

| Tool | Spindle | Offset | (n−1) × 32 |
|---|---|---|---|
| `D5 1` | 1 | X0 | 0 ✓ |
| `D5 12` | 1 | X0 | 0 ✓ |
| `D5 21` | 2 | X32 | 32 ✓ |
| `D5 21345` | 2 | X32 | 32 ✓ |
| `D5 51234` | 5 | X128 | 128 ✓ |
| `D3 7` | 7 | X192 | 192 ✓ |
| `D10 16` | 16 | **Y**160 | — |
| `D35 17` | 17 | **Y**192 | — |

**It is System 32, which is the whole point of the head.** A `B31` firing five Ø5 spindles at once
puts down five shelf-pin holes at 32mm centres in a single plunge — exactly the row that currently
costs twenty-one separate router plunges.

**Two rows.** Spindles 1–15ish run along **X**; 16 and 17 are offset in **Y** (160 and 192, also
32 apart) and carry the big bits — Ø10 and Ø35. So the hinge borer is on its own axis, which is why
a door program moves in Y between the cup and its dowels.

**One thing still needs checking against a known part: the sign.** "mm to Origin: X128" could mean
the head is positioned so the *reference* spindle lands on the programmed coordinate, or that the
programmed coordinate is the head origin and the spindle lands 128 further on. Both readings produce
the same holes for a symmetric pattern and differ by 128mm for an asymmetric one. **Do not build the
bank until that is settled against a part whose true hole positions are known** — it is the
difference between a shelf-pin row in the right place and one 128mm along.

## 7. Contours — lead-in, passes, arcs

```
G0 X1173. Y908.035        park just off the path
Z36.3                     rapid plane
Z26.3                     plunge clearance
G1 X1153. Y908.0 Z1.0 F7000    ← 20mm ramp down to depth, at the ramp feed
X3. F21000                     ← now at full cutting feed
G3 X-2. Y903.0 R5.0            ← arcs in R form, not IJK
...
G1 X1153.
X1143.
X1123. Y908.035 Z26.3          ← lead-out, retracting while moving
G0 Z36.3
```

- **A 20mm linear ramp in**, at a slower feed, then full feed for the cut.
- **A lead-out that retracts while still moving**, so the tool never dwells in the cut.
- **Arcs are `R` form.** `iso.ts` should be checked for which it writes.
- **Every arc is `G3`. There is not a single `G2` in twenty-one files.** So the direction round a
  part is consistent, which for an outside profile is what fixes climb versus conventional milling.
  A post that emitted whichever direction the ring happened to be wound in would cut half the parts
  the wrong way round, and the parts would still be the right size.
- **Corner radius R5.0 = the 10mm cutter's own radius**, because the path is the tool centre.

### The two passes are per **sheet**, not per part

`B7`, `B8` and `B9` each hold **two** parts, and that is what makes the structure readable — the
first five files had one part each and were ambiguous about it:

```
(first block)     part A round at Z1.0 ... then part B round at Z1.0
(NEXT OPERATION)  part A round at Z-0.2 ... then part B round at Z-0.2
```

**Every contour on the sheet is cut to the onion skin first, and only then does a second pass take
them all through.** Not two passes per part. That matters: it is what keeps every part held down on
the vacuum while its neighbours are being cut, and a post that finished each part before starting
the next would drop the first one loose under the cutter.

| | Pass 1 | Pass 2 |
|---|---|---|
| Carcass 16.3 | `Z1.0` — leaves 1.0mm | `Z-0.2` — through |
| Door 18.0 | — | `Z-0.2` — through, single pass |

### Each tool gets its own routering block

`B7`–`B9` change tool mid-program, and the block structure is explicit:

```
(FINISH ROUTERING)
M29                       brush up
G49                       CANCEL TOOL LENGTH COMP
G0 G53 Z0.

(START ROUTERING)
B0 M47 / M05 M32 / M29    everything safe first
(TOOL: 12COMP3W)
G666 T8
...
```

**`G49` between tools** — the length offset is cancelled before the next `G43 H<n>` sets it again.

### A rip is not a contour

The 12mm tool's only job in these files is a full-width separation cut:

```
G0 X2410. Y857.3
Z36.3 / Z26.3
G1 Z-0.2 F4000            straight plunge — no ramp
X0. F21000                one cut, edge to edge across the whole sheet
G0 Z36.3
```

No lead-in ramp: that is for a closed outline, where the tool has to enter the material somewhere it
will later cut away. A rip that runs off both edges has nothing to lead into. **The two cases are
genuinely different and the post needs both.**

## 8. The end

```
(FINISHED ALL OPERATIONS)
B0 M47                    (DRILLS UP | DRILL MOTOR OFF)
M05 M32                   (ROUTER UP | ROUTER OFF)
G0 G53 Z0.
G0 G53 X0. Y0.
G667                      (END TOOL LIFE FUNCTION)
M29                       (ROUTER BRUSH UP)
M30                       (END PROGRAM)
```

Machine-code summary, for the profile:

| Code | Meaning |
|---|---|
| `G8000` | label control |
| `G665` / `G667` | start / end tool life |
| `G100 X Y Z` | declare the sheet |
| `G666 T<n>` | router tool change |
| `G54` / `G55` | multidrill origin / router origin |
| `G53` | machine coordinates |
| `M60` | vacuum on |
| `M82` / `M91` | stops down / pusher up |
| `M46` / `M47` | multidrill head on / drill motor off |
| `M38` | multidrill head down |
| `B<n>` / `B0` | select drill spindles / all up |
| `M31` / `M32` | router down / router up |
| `M28` / `M29` | router brush down / up |
| `M3 S<rpm>` / `M05` | spindle on / off |

---

## 9. The job drawing, and what it settles

`JN10_Tall_Cupboards__Pelmets_B.pdf` — *Ethereal Projects*, for McCormack / Clyde & Co, Level 10,
600 Bourke Street Melbourne. Office tall cupboards and pelmets, "FOR CONSTRUCTION".

**The finishes schedule names the real suppliers**, which matters for §5.13 item 7:

| Code | Finish |
|---|---|
| FT03 | **Polytec** — Aston White, Smooth |
| LM03 | **Polytec** — Black, Matt |
| INT | **16mm White PB** |
| KL | Battalion 1XRX6 straight cam lock |
| — | Barben Bac 173/B, 100mm, transparent brass (handle) |

Three things follow.

**Polytec is a real supplier on real jobs**, so the instruction to price and size from Polytec's and
Laminex's own published sheets is not hypothetical.

**"16mm White PB" is the carcass**, and the machine cut it at **16.3**. Nominal on the drawing,
actual on the machine — §4.1's whole argument, appearing on one job.

**The 3115mm door sheet is explained.** The elevations show cupboards to **+2700** with doors around
2700 and 2418 tall. A 2700 door does not come out of a 2400 sheet, which is why the door board is
3115 long and the carcass board is 2410. **Sheet length is chosen by the tallest part**, which is an
argument for §5.9's per-material sheet choice being a real need rather than a nicety.

**Not modelled at all:** the cam lock. Cabinet locks are not in `library/blum.ts` or anywhere else,
and this job has one per door.

---

## 10. What the model now carries, and what it still cannot

`MachineProfile` was grown to hold this document — see handover §4.20. **A `WOODTRON_NESTING_ROUTER`
profile now exists**, every figure on it read off the sections above rather than guessed, and it is
in the machine picker beside the KDT.

What made it possible was giving a machine **two heads**. `HeadProfile` carries the work offset, the
rapid height, the plunge clearance and the through overcut, and all four differ between §2's drill
head and its router. The work offset is written when the head *changes*, so a router-only program
still says `G55` exactly once.

`DrillBank` was rewritten around §6: a flat list of spindles with a position and a diameter each,
rather than a pitch and a count, because the two rows do not share a numbering origin and the
diameters vary along a row. `WOODTRON_DRILL_BANK_WITHOUT_DATUM` holds the solved map — and its type
is `Omit<DrillBank, 'datum'>`, so the sign question below is enforced by the compiler rather than by
a comment. It cannot be fitted to the profile until somebody answers it.

**Four things in the profile are known to be wrong or missing**, and each is on its `unconfirmed`
list, printed on screen, in the report and at the top of every program it writes:

- **Parts do not come free.** §7's two passes are *per sheet*, and the post finishes each part
  before starting the next. So `leaveUncut` ships at the machine's own **1.0mm first-pass figure**
  and the second pass has to be added by hand. Setting it to 0 to match the finished depth would do
  the exact thing the two-pass structure exists to prevent — free the first part under the cutter.
- **No holes are drilled.** Every drill in these files is on the multidrill head and nothing bores
  with the router, so the tool table has no drill in it and every hole is reported by name and left
  out. Putting one in would be inventing a bit the machine has not been seen to hold.
- **Arcs go out in I/J form**, and every arc here is `R` — and every one is `G3`.
- **A rip is written like a contour**, with the lead-in ramp §7 says it should not have.

## What this does **not** answer

- **The sign, and it is the one that blocks the drill bank.** §6 solved *which spindle is where*;
  what is still open is whether the programmed coordinate positions the **reference spindle** or the
  **head origin**. Every drilled row in the twenty-one files is symmetric about its part, so the two
  readings produce identical output and no amount of re-reading these files will separate them. It
  needs one part whose true hole positions are known. 128mm is the cost of guessing.
- **Ø8.** The bank carries Ø3, Ø5, Ø10 and Ø35; this shop's hardware wants Ø8 dowels, which nothing
  on the head matches. Even with the bank on, those want the borer.
- **How long the first row is.** Spindle 7 is the highest number seen on it, and "1–15ish" is a
  reading of the head rather than a count off a file.
- **Where rows 1 and 2 sit relative to each other on the *other* axis.** Spindles 16 and 17 are only
  ever referred to by a Y offset; their X is recorded as zero and is a guess.
- **The KDT.** Every file here is Woodtron. The Z datum is confirmed for both by the shop directly,
  but nothing else here should be assumed to carry across — and nothing has been. The KDT's two
  heads are given the same numbers deliberately, which is a statement that nobody has looked, not a
  claim that they match.
- **Whether the 3115 door sheet is a stock size or a cut-down.** It wants checking against Laminex
  and Polytec's published sizes along with the rest of §5.13 item 7.
- **Tool numbers beyond `T1` and `T8`.** Those two are the whole of what the files show, so the
  profile's table is sparse on purpose: the numbers are the machine's own pockets and a dense
  `1..n` table would be a fiction.
