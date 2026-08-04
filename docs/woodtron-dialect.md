# The Woodtron dialect, read off real programs

**Source:** ten `.nc` files from one job — `JN10_TallStore_339_B1..B5` (white carcass, 16.3mm) and
`JN10_TallStore_687_E1..E8` (MDF doors, 18mm), with the job drawing
`JN10_Tall_Cupboards__Pelmets_B.pdf` for reference. Supplied by the shop, August 2026.

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
| `Z4.3` | 16.3 | **12.0** | Ø5 — system/shelf-pin depth |
| `Z5.0` | 18.0 | **13.0** | **Ø35 hinge cup** |
| `Z5.0` | 18.0 | **13.0** | Ø10 — dowel / EXPANDO |

**The Ø35 at 13mm deep is exactly what this codebase has always used for a Blum cup**, off Blum's
own drilling pattern (§3). It has now been confirmed against a program the machine runs.

## 5. Tooling

The router:

```
(TOOL: 10COMP3W)          10mm compression spiral, 3 wing
G666 T1                   ← the tool change. NOT M6.
M28                       (ROUTER BRUSH DOWN)
M3 S24000                 (ROUTER ON | RPM)
G0 G53 Z0.
G55 G43 H1                (ROUTER ORIGIN | TOOL LENGTH COMP)
M31                       (ROUTER DOWN)
```

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

## 6. The multidrill bank — how it actually works

This is the feature `machines.ts` deliberately switched off, and the files show why it was right to
wait, and exactly how to turn it on.

```
M46                       (MULTIDRILL HEAD ON)
M38                       (MULTIDRILL HEAD DOWN)
G54                       (MULTIDRILL ORIGIN)

(TOOL: D3 7)
B64                       (BINARY TOOL - mm to Origin: X192. Y0. )
G0 X2031. Y894.85
...
(TOOL: D5 51234)
B31                       (BINARY TOOL - mm to Origin: X128. Y0. )
```

- **`B<n>` is a bitmask selecting which spindles fire.** `B31` = 11111 = five spindles at once;
  `B64` = one spindle, bit 7; `B1` = bit 1; `B32768` = bit 16; `B65536` = bit 17.
- **The comment gives that selection's offset from the head origin**, and the programmed X/Y is the
  *head* position, not the hole position. A hole at true X11.15 is programmed as `X-180.85` with a
  `B64` whose offset is X192: −180.85 + 192 = 11.15. **This is why programmed coordinates go
  negative and outside the sheet** — they are head positions, not hole positions.
- The tool comment names the spindles in the group: `D3 7` is a Ø3 in position 7; `D5 51234` is Ø5
  spindles 5,1,2,3,4; `D35 17` is the Ø35 in position 17.
- Spindle offsets seen: X0/X128/X192 in the X row, Y160/Y192 for the Ø10 and Ø35 — so the head has
  **at least two rows**, one offset in X and one in Y.
- The same `B31` appears with offset `X128` in the carcass files and `X0` in others, with the tool
  named `51234` vs `12345`. So the offset is *of the reference spindle in that group*, and the
  group can be referenced from either end.

**Nothing should be built from this without the machine's own spindle map.** What the files prove
is the *mechanism*; the actual spindle table — which position carries which diameter, at what
pitch — has to come from the machine.

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
- **Corner radius R5.0 = the 10mm cutter's own radius**, because the path is the tool centre.

**Two passes on the 16.3 carcass, one on the 18mm door:**

| | Pass 1 | Pass 2 |
|---|---|---|
| Carcass 16.3 | `Z1.0` — leaves 1.0mm | `Z-0.2` — through |
| Door 18.0 | — | `Z-0.2` — through, single pass |

The carcass leaves a **1.0mm onion skin** on the first pass and takes it out on the second. The
shipped profile guesses 0.2mm. The doors are cut in one pass with no skin at all — big parts on
vacuum hold themselves.

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

## What this does **not** answer

- **The spindle map** for the drill bank — which position is which diameter, and the full offset
  table. The mechanism is clear; the numbers are not.
- **The KDT.** Every file here is Woodtron. The Z datum is confirmed for both by the shop directly,
  but nothing else here should be assumed to carry across.
- **Whether the 3115 door sheet is a stock size or a cut-down.** It wants checking against Laminex
  and Polytec's published sizes along with the rest of §5.13 item 7.
- **Tool numbers**: only `T1` (the 10mm compression) appears. Everything else is on the drill head.
