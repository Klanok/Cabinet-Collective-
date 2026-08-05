/**
 * Telling one part of a cabinet to differ from what its spec would build.
 *
 * ## What the shop asked for
 *
 * > *"add and delete any part — left end, back, bottom, each individually — and choose the
 * > material per part"*
 *
 * Two answers settled the shape of it, and both are bigger than they sound:
 *
 * > *"if you delete an end it re-derives"* — so a deleted part is not a panel switched off, it is
 * > a **carcass with one fewer side**, and everything measured off that side moves. The bottom of a
 * > 600 cabinet with no left end is 600 wide starting at x = 0, not 568 starting at 16.
 *
 * > *"genuinely different thicknesses depending on real world availability"* — so a per-part
 * > material is not a decor swap. An 18mm end in a 16mm cabinet takes 2mm more out of the opening,
 * > and every part sized on that opening follows.
 *
 * Both land on the same two figures: **where the interior starts, and how wide it is**. Those were
 * `ctx.t` and `W − 2t` — one thickness, twice, on the assumption that a carcass has two sides and
 * they are the same board. `RuleContext.shell` replaces the assumption with the parts that are
 * really there.
 *
 * ## Why it is a list on the cabinet
 *
 * The same argument `customFeatures` makes, and it is the same shape of thing: a list **keyed by
 * part** rather than one more dimension every spec reads, and on the cabinet rather than on the
 * panels, because **panels are derived and never stored**. Resize the cabinet and the parts are cut
 * again with the overrides still on them.
 *
 * The key is the part *rule* name — `side-left`, `bottom`, `shelves` — which §5.12 chose for
 * exactly this: adding a shelf does not move `side-left`, where it would move part number 7.
 */

import type { PartKey } from '../rules/build.ts';

/** One part of a cabinet, told to differ from what its spec would build. */
export interface PartOverride {
  /** The rule key — `side-left`, `bottom`, `shelves`. */
  readonly key: string;
  /**
   * Which one, where the rule makes several.
   *
   * Absent means **every part that rule makes**, which is what "no shelves" wants; `2` is the third
   * shelf and leaves its neighbours alone. The shop asked for individual shelves by name.
   */
  readonly index?: number;
  /** Do not build it at all, and re-derive the carcass around its absence. */
  readonly omit?: boolean;
  /**
   * Cut it from this board instead of the one its material slot resolves to.
   *
   * A real board, so a real thickness: *"genuinely different thicknesses depending on real world
   * availability."* Nothing here is a decor swap.
   */
  readonly materialId?: string;
}

/** The override that applies to one produced part, or nothing. */
export const overrideFor = (
  overrides: readonly PartOverride[] | undefined,
  key: string,
  index: number,
): PartOverride | undefined => {
  if (!overrides || overrides.length === 0) return undefined;
  /*
   * The more specific one wins, and it has to: "no shelves, except shelf 2 is 18mm" is a sentence
   * a shop says. A rule-wide entry and an indexed one are merged rather than one replacing the
   * other, so the indexed entry only has to say what differs.
   */
  const whole = overrides.find((o) => o.key === key && o.index === undefined);
  const one = overrides.find((o) => o.key === key && o.index === index);
  if (!whole) return one;
  if (!one) return whole;
  return { ...whole, ...one };
};

/** Whether a produced part survives its overrides. */
export const isOmitted = (
  overrides: readonly PartOverride[] | undefined,
  key: string,
  index: number,
): boolean => overrideFor(overrides, key, index)?.omit === true;

/**
 * The overrides that name a part this cabinet does not build, so they can be reported rather than
 * silently doing nothing.
 *
 * The same contract §4.16 gives a custom feature whose part has gone: an override that quietly
 * matches nothing is a setting somebody made that the job forgot, and the only sign would be a
 * cabinet that looks slightly wrong.
 */
export const strandedOverrides = (
  overrides: readonly PartOverride[] | undefined,
  parts: readonly PartKey[],
): readonly PartOverride[] =>
  (overrides ?? []).filter(
    (o) =>
      !parts.some((p) => p.key === o.key && (o.index === undefined || p.index === o.index)),
  );
