# KDT Mozaik NC reference

This records the machine dialect observed in twelve 16mm White HMR carcass programs supplied on
1 August 2026. The customer filenames and programs are deliberately not copied into the repository.
This is evidence for the post-processor, not permission to run generated code on the machine.

## Stock and coordinate systems

- All twelve programs describe 2410 × 1210 × 16mm stock, loaded face down.
- Sheet X is positive along the 2410mm length.
- Sheet Y is negative across the 1210mm width.
- Drilling runs in `G54`; router work restates `G90 G59`.
- Router lead-ins deliberately leave the stock boundary. Observed travel includes negative X and
  positive Y, so a generated-program checker must distinguish machine travel from sheet bounds.
- Z is table-referenced. Material top is `Z16`, intermediate clearance is `Z21`, and router safe Z
  is `Z36`.

## Boring head

Across the set there are 565 drilling blocks, representing about 759 holes after gang drilling:

| Diameter/pattern | Selection | Final Z | Observed blocks |
| --- | --- | ---: | ---: |
| 3mm single | `G600 T38` | -0.3 | 274 |
| 5mm single | `G600 T25` | -0.3 | 132 |
| 10mm single | `G600 T36` | 4.0 | 88 |
| 5mm × 2 | T25/T26 or T25/T24 | 4.0 | 29 |
| 5mm × 4 | T25/T26/T32/T33 | 4.0 | 3 |
| 5mm × 5 | T21–T25 or T25–T29 | 4.0 | 39 |

`Z4` is a 12mm blind bore from the top of 16mm material. `Z-0.3` passes through the sheet by
0.3mm. The drilling feed is `F2000`. The evidence establishes the selections above, but not the
physical X/Y offsets of every boring-head spindle; that still requires the machine tool table or a
controlled pattern test.

The drilling section uses:

```text
M33
M83
G0 X0.0 Y0.0
G600 T...
G00 X... Y...
G01 Z... F2000
G00 Z21.000
...
M73
M5
G53 Z0.0
```

This is explicit positioning and `G600` spindle selection, not a `G81` canned cycle.

## Router work

Every sheet uses `M6 T1`, labelled `10mm 3 Wing Compression`, at `M3 S18000`.

- Entry/ramp feed: `F7000`.
- Cutting feed: `F18000`.
- First perimeter pass: ramp from material top to `Z0.8`, leaving a 0.8mm skin.
- Final perimeter pass: ramp to `Z-0.2`, cutting 0.2mm into the spoilboard.
- Each supplied sheet has one continuous cutout sequence.

Two sheets also contain pocket work with `M6 T11` at 18000rpm. Those paths finish at `Z8` or
`Z4`, respectively 8mm and 12mm below the material face. The files do not identify T11's cutter
diameter or type, so the post must not guess it.

## Program envelope

The repeated safe sequence is:

```text
M7
M73
M84
M511
M512
M513
M514
G91 G28 Z0.0
G40 G49 G80
G54
G90
G53 Z0.00
```

The repeated shutdown is:

```text
G0G90 G53 Z0.00
M5
M85
M501
M502
M503
M504
G91 G28 Z0.0
G91 G28 X0.0 Y0.0
M30
```

## Gate before generated NC is trusted

The current generic ISO writer does not yet emit this dialect. Production KDT output remains
blocked until it can express table-referenced Z, negative sheet Y, the vacuum/homing envelope,
explicit boring-head moves, `G600` selections, and G54/G59 separation. After that, compare a
generated sheet line-by-line, simulate it, air-cut it, and finally run a sacrificial sheet. T11 and
the complete boring-head station geometry remain explicit unknowns.
