# Real programs off the machine

Two of the ten `.nc` files the shop supplied in August 2026, kept in the repo because **they are the
only ground truth this project has about what its machines actually accept.** Everything in
`src/core/library/machines.ts` is measured against these rather than against a manual.

- `woodtron-carcass-16.3.nc` — white carcass, 2410 × 1205 × 16.3. Multidrilling and a two-pass
  contour with a 1.0mm onion skin.
- `woodtron-door-18-with-hinge-boring.nc` — MDF door, 3115 × 1205 × 18.0. Ø35 hinge cups and Ø10
  dowels on the drill head, single-pass contour.

They are kept **byte for byte as they came off the machine**. Do not tidy, reformat or renumber
them: the whole value is that nothing has been through a human in between. `docs/woodtron-dialect.md`
is the reading of them, and cites line numbers.

The other eight are the same two shapes repeated across the job's sheets and add nothing the two
here do not show.
