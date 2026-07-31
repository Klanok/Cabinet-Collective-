/**
 * Where the shelf-pin holes go up a side panel.
 *
 * Pure arithmetic on spans, with no idea what a panel or a placement is, because the two things
 * this has to get right are both about *numbers on a line* and both were wrong before:
 *
 * ## 1. The row does not run the full height
 *
 * > "adjustable shelf holes should not go full height in the end panel, it should have a setting
 * > that sets how far off the top, bottom and fixed shelves"
 *
 * It used to start one pitch up from the bottom edge and stop one pitch short of the top, which is
 * a row of holes through the zone where the bottom panel is housed and another through the zone
 * where the rails are — holes no shelf can ever use, in the part of the panel most likely to have
 * a dowel or a confirmat in it. `clearance` is how far the first and last hole keep off the end of
 * the panel, and off anything fixed across it.
 *
 * ## 2. The row is centred, so a flipped panel still lines up
 *
 * > "we also need to ensure that they are always equidistant so you can't end up with a flipped
 * > back and the holes offset"
 *
 * This is the one that matters, and it is worth writing down why the obvious thing fails.
 *
 * The System 32 convention is to index off the bottom edge: holes at 32, 64, 96 and so on. That is
 * interchangeable across panels **only when the panel height is itself a multiple of the pitch**,
 * because flipping a panel end-for-end puts a hole that was at `y` at `H − y`. A 720mm side is
 * 22.5 pitches, so a hole at 704 lands at 16 when you turn the panel over — every hole out by half
 * a pitch, on a part that is otherwise identical either way up. Two sides cut from one programme,
 * one of them rotated, and the shelf rocks.
 *
 * So the run is **centred in its clear span** instead: the gap left at the bottom is the gap left
 * at the top, by construction, at any panel height. The holes stay on the pitch — a line borer
 * still sets one offset and steps — they simply no longer start at a whole multiple of it.
 *
 * The centring is exact and is deliberately **not** rounded to a tidy number. Rounding is the one
 * thing that could reintroduce the asymmetry, and it would do it silently, at some heights only.
 *
 * ## Fixed shelves split the run rather than ending it
 *
 * A cabinet with a fixed shelf across the middle wants pins above it and below it, so an
 * obstruction cuts the span in two and each piece is centred in itself. Note what this means for
 * symmetry: a panel with an **off-centre** fixed shelf comes out with an asymmetric set of runs,
 * and that is correct — such a panel is already not flippable, because the housing for the fixed
 * shelf is off-centre too. Symmetry is preserved exactly where it exists.
 */

import { type Mm, mm } from '../units.ts';

/** A closed interval on the panel's height axis. */
export interface Span {
  readonly lo: Mm;
  readonly hi: Mm;
}

/** One line-bored run: where the first hole is, and how many follow it at the pitch. */
export interface PinRun {
  /** Position of the first hole on the same axis the span was given in. */
  readonly first: Mm;
  readonly count: number;
}

/** The clear spans left of `span` once every obstruction is taken out of it. */
const clearSpans = (span: Span, obstructions: readonly Span[]): Span[] => {
  const blocking = obstructions
    .filter((o) => o.hi > span.lo && o.lo < span.hi)
    .sort((a, b) => a.lo - b.lo);

  const spans: Span[] = [];
  let lo = span.lo;
  for (const o of blocking) {
    if (o.lo > lo) spans.push({ lo, hi: mm(Math.min(o.lo, span.hi)) });
    lo = mm(Math.max(lo, o.hi));
  }
  if (lo < span.hi) spans.push({ lo, hi: span.hi });
  return spans;
};

/**
 * The pin runs for one span, keeping `clearance` off both ends of it and off anything fixed
 * across it, with each run centred in the piece of span it lives in.
 *
 * Returns an empty list rather than a degenerate run when nothing fits — a side too short for a
 * single hole gets no holes, not one hole in an arbitrary place.
 */
export const shelfPinRuns = (
  span: Span,
  obstructions: readonly Span[],
  pitch: Mm,
  clearance: Mm,
): PinRun[] => {
  if (pitch <= 0) return [];
  const runs: PinRun[] = [];

  for (const clear of clearSpans(span, obstructions)) {
    const lo = clear.lo + clearance;
    const usable = clear.hi - clearance - lo;
    if (usable < 0) continue;
    const count = Math.floor(usable / pitch + 1e-9) + 1;
    const length = (count - 1) * pitch;
    // The whole point: half the slack at each end, so `first − lo` equals `hi − last`.
    runs.push({ first: mm(lo + (usable - length) / 2), count });
  }

  return runs;
};
