/**
 * Guillotine packing — getting rectangles out of a sheet with a saw.
 *
 * **Every cut runs edge to edge.** That is not a simplification made to keep the algorithm
 * small; it is what a panel saw physically does. A beam saw drops a blade across a whole piece
 * and separates it into two, and the only way to cut a shape out of the middle of a sheet is to
 * stop using the saw. So a nest that is not guillotine-cuttable is not a nest this shop can cut,
 * and the constraint belongs in the structure rather than in a checker bolted on afterwards.
 *
 * Which is why the packer builds a **tree of cuts** rather than a list of free rectangles. A
 * free-rectangle list is the usual way to write this and it is faster, but it cannot say how the
 * parts come off the sheet — and "how it comes off" is the entire deliverable at the saw. Here,
 * placing a part *is* cutting a piece in two, so the cut sequence falls out of the packing with
 * nothing to derive and nothing to get out of step. `replayCuts` takes the sequence back to the
 * pieces it produces, which is how the tests prove the nest is cuttable rather than asserting it.
 *
 * Everything here is pure arithmetic on rectangles — no panels, no materials, no project. What a
 * part is, whether it may be turned, and which sheet it goes on are `nest.ts`'s questions.
 */

import { type Mm, type Mm2, GEOMETRIC_EPSILON, mm } from '../units.ts';

/**
 * A rectangle on a sheet.
 *
 * Sheet space: `x` runs along the sheet's **length**, `y` across its **width**, origin at the
 * corner of the usable area. It is deliberately not one of the three coordinate spaces in
 * `docs/coordinate-convention.md` — those describe where a part sits in a *room*, and a sheet on
 * a saw bench knows nothing about that. A placement maps a part's own bounding box onto here,
 * and the mapping is the orientation.
 */
export interface Rect {
  readonly x: Mm;
  readonly y: Mm;
  readonly length: Mm;
  readonly width: Mm;
}

export const rectArea = (r: Rect): Mm2 => r.length * r.width;

/** True when the rectangle has any size left in both directions. */
export const rectIsReal = (r: Rect): boolean =>
  r.length > GEOMETRIC_EPSILON && r.width > GEOMETRIC_EPSILON;

/**
 * Which way round a part is laid on the sheet.
 *
 * `as-cut` puts the part's own length along the sheet's length. `turned` is the same part
 * rotated 90°. Whether a part may be turned is a **grain** question and is answered before the
 * packer sees it — see `orientationsFor` in nest.ts.
 */
export type Orientation = 'as-cut' | 'turned';

export interface PackablePart {
  readonly id: string;
  /** The blank: the part's bounding box, which is what comes off the sheet. */
  readonly length: Mm;
  readonly width: Mm;
  /** The ways this part may be laid. Never empty — a part with no legal orientation cannot be cut. */
  readonly orientations: readonly Orientation[];
  /**
   * Parts that must come off **one piece, in this order**, ripped apart after it is cut out.
   *
   * A drawer bank in a grained decor is the case this exists for: the fronts have to be cut from
   * one strip in order or the grain steps at every joint and the bank reads as four unrelated
   * boards. So the packer finds a home for the whole strip, then rips it — and the rips are
   * **real cuts in the sequence**, not placements dropped in afterwards, which is what keeps
   * `replayCuts` meaningful. Somebody at the saw makes those cuts.
   *
   * Each `size` is measured along this part's own **width**, which is the axis the members stack
   * along; `length` is the dimension they all share. Sizes plus the kerfs between them add up to
   * the part's width, so the stack is exactly the blank the packer was asked to place.
   */
  readonly stack?: readonly { readonly id: string; readonly size: Mm }[];
}

export interface Placement {
  readonly partId: string;
  readonly orientation: Orientation;
  /** Where the blank lands, in sheet space. `length` runs along the sheet's length. */
  readonly at: Rect;
}

/**
 * One cut, in the order it is made.
 *
 * `piece` is what goes on the saw and `at` is where the blade lands, measured in sheet space on
 * `axis`. The cut spans `piece` completely on the *other* axis — that is the guillotine property,
 * and stating the piece rather than just the line is what makes it checkable: a cut whose extent
 * had to be inferred from neighbouring parts is a cut nobody can verify.
 */
export interface Cut {
  /** 1-based, in the order the cuts are made. */
  readonly sequence: number;
  /** 'x' is a cut across the sheet's length; 'y' is a cut along it. */
  readonly axis: 'x' | 'y';
  /** Where the near side of the blade lands. The kerf is removed from `at` to `at + kerf`. */
  readonly at: Mm;
  /** The piece being cut. */
  readonly piece: Rect;
  /**
   * How many cuts deep this one is — 1 for a cut on the whole sheet.
   *
   * Carried because some saws are limited to two- or three-stage cutting, and a shop with one of
   * those needs to know whether a nest exceeds what its saw will do. Nothing here enforces a
   * limit; a beam saw does n stages happily and inventing a constraint nobody has is worse than
   * reporting the depth and letting somebody look at it.
   */
  readonly stage: number;
}

export interface PackedSheet {
  /** The area cuts are made in — the sheet less whatever is trimmed off its edges. */
  readonly usable: Rect;
  readonly placements: readonly Placement[];
  readonly cuts: readonly Cut[];
  /** What is left over, as whole rectangles. */
  readonly offcuts: readonly Rect[];
}

export interface PackResult {
  readonly sheets: readonly PackedSheet[];
  /** Parts that fit no sheet at all, in any allowed orientation. */
  readonly unplaced: readonly string[];
}

// ---------------------------------------------------------------------------------------
// The cut tree
// ---------------------------------------------------------------------------------------

type Node =
  | { kind: 'free'; rect: Rect }
  | { kind: 'part'; rect: Rect; placement: Placement }
  | {
      kind: 'cut';
      rect: Rect;
      axis: 'x' | 'y';
      at: Mm;
      stage: number;
      /** The piece kept in hand — the low-coordinate side of the blade. */
      keep: Node;
      /** The piece set aside. Null when the kerf consumed everything past the cut. */
      rest: Node | null;
    };

/** What is left of `total` past a piece of `used`, once the blade has taken its width. */
const remaining = (total: Mm, used: Mm, kerf: Mm): Mm => mm(Math.max(0, total - used - kerf));

const fitsExactly = (available: Mm, wanted: Mm): boolean =>
  available - wanted <= GEOMETRIC_EPSILON;

/**
 * How the packer behaves — the three choices that are judgement rather than arithmetic.
 *
 * None of these is right in general. Which one wins depends on the shapes in the job, and the only
 * honest way to pick is to try them: see `packBest`, which runs every combination and keeps the
 * one that buys the least board. That is not indecision, it is what a nest is — a search — and the
 * packer is cheap enough to run eighteen times that pretending to know the answer in advance would
 * cost sheets to save microseconds.
 */
export interface PackStrategy {
  /** Which cut to make first when a part leaves an offcut in both directions. */
  readonly split: 'bigger-offcut' | 'shorter-axis' | 'longer-axis';
  /** How to choose between the pieces a part could go in. */
  readonly fit: 'short-side' | 'area';
  /** What order the parts are placed in. */
  readonly order: 'longest-side' | 'area' | 'narrowest';
}

/**
 * Every combination, in a fixed order so the same job always nests the same way.
 *
 * A nest that moved between two runs of the same job would be impossible to check against the one
 * printed yesterday, so determinism matters more here than it looks — `packBest` breaks ties with a
 * strict comparison and this array's order, and never with anything that could vary.
 */
export const PACK_STRATEGIES: readonly PackStrategy[] = (
  ['bigger-offcut', 'shorter-axis', 'longer-axis'] as const
).flatMap((split) =>
  (['short-side', 'area'] as const).flatMap((fit) =>
    (['longest-side', 'area', 'narrowest'] as const).map((order) => ({ split, fit, order })),
  ),
);

export const DEFAULT_STRATEGY: PackStrategy = {
  split: 'bigger-offcut',
  fit: 'short-side',
  order: 'longest-side',
};

/**
 * Which cut to make first, when the part leaves an offcut in both directions.
 *
 * Cutting across the length first leaves a full-height column beside the part; cutting along it
 * leaves a full-width strip above. Under `bigger-offcut` the rule is to **take whichever of those
 * two is the larger piece**, because a big offcut in one piece is worth more than the same area in
 * two: it can still take a big part, and it is what ends up on the rack as usable stock.
 *
 * Both alternatives also leave a second, smaller offcut, but that one is always the loser of the
 * comparison — an x-first cut's second offcut is `l × leftoverY`, which cannot exceed the y-first
 * cut's `L × leftoverY`. So the whole decision reduces to the two full-span pieces, which is why
 * this is two multiplications rather than a search.
 *
 * The other two ignore the part and split on the shape of the piece, which fragments differently
 * and sometimes better. Ties everywhere go to cutting across the length, which on a run of
 * same-width parts keeps the sheet in columns and gives the saw a repeated setting.
 */
const firstAxis = (
  piece: Rect,
  length: Mm,
  width: Mm,
  kerf: Mm,
  split: PackStrategy['split'],
): 'x' | 'y' => {
  switch (split) {
    case 'shorter-axis':
      return piece.length <= piece.width ? 'x' : 'y';
    case 'longer-axis':
      return piece.length > piece.width ? 'x' : 'y';
    case 'bigger-offcut':
      return remaining(piece.length, length, kerf) * piece.width >=
        remaining(piece.width, width, kerf) * piece.length
        ? 'x'
        : 'y';
  }
};

/**
 * Rip one blank into the parts that had to come off it together, in order.
 *
 * Reached only once the blank has been cut out of the sheet, so `piece` is exactly the strip. The
 * members stack along the blank's own **width**, which lands on the sheet's `y` axis when the
 * blank is laid as cut and on `x` when it is turned — the same swap `footprintOf` makes, for the
 * same reason.
 *
 * Every rip is a real `cut` node, so the sequence somebody follows at the saw includes them and
 * `replayCuts` verifies them like any other. That is the whole reason this lives in the packer
 * rather than expanding a placement afterwards: a placement nothing cut out would replay as a
 * part that appears from nowhere.
 */
const ripStack = (
  piece: Rect,
  members: readonly { readonly id: string; readonly size: Mm }[],
  orientation: Orientation,
  kerf: Mm,
  stage: number,
): Node => {
  const alongX = orientation === 'turned';
  const [head, ...tail] = members;
  if (!head) return { kind: 'free', rect: piece };

  const at: Rect = alongX
    ? { x: piece.x, y: piece.y, length: head.size, width: piece.width }
    : { x: piece.x, y: piece.y, length: piece.length, width: head.size };
  const part: Node = { kind: 'part', rect: at, placement: { partId: head.id, orientation, at } };
  // The last member is the whole of what is left — there is nothing after it to cut away.
  if (tail.length === 0) return part;

  const rest: Rect = alongX
    ? {
        x: mm(piece.x + head.size + kerf),
        y: piece.y,
        length: mm(piece.length - head.size - kerf),
        width: piece.width,
      }
    : {
        x: piece.x,
        y: mm(piece.y + head.size + kerf),
        length: piece.length,
        width: mm(piece.width - head.size - kerf),
      };

  return {
    kind: 'cut',
    rect: piece,
    axis: alongX ? 'x' : 'y',
    at: alongX ? mm(piece.x + head.size) : mm(piece.y + head.size),
    stage,
    keep: part,
    rest: ripStack(rest, tail, orientation, kerf, stage + 1),
  };
};

/**
 * Cut `piece` down until what is left is exactly the part, recording each cut on the way.
 *
 * The recursion is the point: a part is placed by cutting the piece it sits in, and the piece it
 * sits in is one of the two halves of the cut before it. There is no separate step that works out
 * how the parts come off — placing and cutting are one operation.
 */
const placeInPiece = (
  piece: Rect,
  partId: string,
  orientation: Orientation,
  length: Mm,
  width: Mm,
  kerf: Mm,
  stage: number,
  split: PackStrategy['split'],
  stack?: readonly { readonly id: string; readonly size: Mm }[],
): Node => {
  const exactX = fitsExactly(piece.length, length);
  const exactY = fitsExactly(piece.width, width);

  if (exactX && exactY) {
    // The blank's own size, not the piece's — the piece may be a fraction larger through
    // arithmetic noise, and a placement is what gets drawn, exported and checked for overlap.
    const at: Rect = { x: piece.x, y: piece.y, length, width };
    if (stack && stack.length > 1) return ripStack(at, stack, orientation, kerf, stage);
    return { kind: 'part', rect: at, placement: { partId, orientation, at } };
  }

  const axis = exactY ? 'x' : exactX ? 'y' : firstAxis(piece, length, width, kerf, split);

  if (axis === 'x') {
    const keepRect: Rect = { x: piece.x, y: piece.y, length, width: piece.width };
    const restLength = remaining(piece.length, length, kerf);
    const restRect: Rect = {
      x: mm(piece.x + length + kerf),
      y: piece.y,
      length: restLength,
      width: piece.width,
    };
    return {
      kind: 'cut',
      rect: piece,
      axis: 'x',
      at: mm(piece.x + length),
      stage,
      keep: placeInPiece(keepRect, partId, orientation, length, width, kerf, stage + 1, split, stack),
      rest: rectIsReal(restRect) ? { kind: 'free', rect: restRect } : null,
    };
  }

  const keepRect: Rect = { x: piece.x, y: piece.y, length: piece.length, width };
  const restWidth = remaining(piece.width, width, kerf);
  const restRect: Rect = {
    x: piece.x,
    y: mm(piece.y + width + kerf),
    length: piece.length,
    width: restWidth,
  };
  return {
    kind: 'cut',
    rect: piece,
    axis: 'y',
    at: mm(piece.y + width),
    stage,
    keep: placeInPiece(keepRect, partId, orientation, length, width, kerf, stage + 1, split, stack),
    rest: rectIsReal(restRect) ? { kind: 'free', rect: restRect } : null,
  };
};

type FreeNode = Node & { kind: 'free' };

const freeLeaves = (node: Node, into: FreeNode[] = []): FreeNode[] => {
  if (node.kind === 'free') into.push(node);
  else if (node.kind === 'cut') {
    freeLeaves(node.keep, into);
    if (node.rest) freeLeaves(node.rest, into);
  }
  return into;
};

/** Replace one free leaf, identified by reference, with the subtree that places a part in it. */
const replaceLeaf = (node: Node, target: Node, replacement: Node): Node => {
  if (node === target) return replacement;
  if (node.kind !== 'cut') return node;
  const keep = replaceLeaf(node.keep, target, replacement);
  const rest = node.rest ? replaceLeaf(node.rest, target, replacement) : null;
  return keep === node.keep && rest === node.rest ? node : { ...node, keep, rest };
};

/** How many cuts deep a free leaf already sits, so the cuts made in it continue the count. */
const stageOfLeaf = (node: Node, target: Node, depth = 0): number => {
  if (node === target) return depth;
  if (node.kind !== 'cut') return -1;
  const inKeep = stageOfLeaf(node.keep, target, depth + 1);
  if (inKeep >= 0) return inKeep;
  return node.rest ? stageOfLeaf(node.rest, target, depth + 1) : -1;
};

// ---------------------------------------------------------------------------------------
// Choosing where a part goes
// ---------------------------------------------------------------------------------------

interface Candidate {
  readonly leaf: FreeNode;
  readonly orientation: Orientation;
  readonly length: Mm;
  readonly width: Mm;
  /** Smaller is better, compared in order. */
  readonly score: readonly [number, number];
}

const footprintOf = (part: PackablePart, orientation: Orientation) =>
  orientation === 'as-cut'
    ? { length: part.length, width: part.width }
    : { length: part.width, width: part.length };

/**
 * Score a possible home for a part. Both rules are the same two numbers in the other order.
 *
 * **short-side** minimises the smaller of the two leftovers. That is the rule that keeps a piece
 * from being nibbled into a shape nothing else fits: a part dropped into a rectangle 4mm wider
 * than itself leaves a 4mm strip, which is not an offcut, it is sawdust with a coordinate. Area
 * alone does not see that — a big piece with a big leftover scores the same as a snug one.
 *
 * **area** minimises the waste instead, which keeps big pieces intact for longer and does better
 * on a job of a few large parts. Neither wins everywhere, which is what `packBest` is for.
 */
const scoreFit = (
  leaf: Rect,
  length: Mm,
  width: Mm,
  fit: PackStrategy['fit'],
): readonly [number, number] => {
  const shortSide = Math.min(leaf.length - length, leaf.width - width);
  const waste = rectArea(leaf) - length * width;
  return fit === 'short-side' ? [shortSide, waste] : [waste, shortSide];
};

const better = (a: Candidate['score'], b: Candidate['score']): boolean =>
  a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1];

const bestCandidate = (
  root: Node,
  part: PackablePart,
  fit: PackStrategy['fit'],
): Candidate | null => {
  let best: Candidate | null = null;
  for (const leaf of freeLeaves(root)) {
    for (const orientation of part.orientations) {
      const { length, width } = footprintOf(part, orientation);
      if (length > leaf.rect.length + GEOMETRIC_EPSILON) continue;
      if (width > leaf.rect.width + GEOMETRIC_EPSILON) continue;
      const score = scoreFit(leaf.rect, length, width, fit);
      if (!best || better(score, best.score)) best = { leaf, orientation, length, width, score };
    }
  }
  return best;
};

/**
 * What order the parts go down in.
 *
 * `longest-side` and `area` are the two standard ones and mostly agree. `narrowest` sorts by the
 * part's *smaller* dimension, which groups parts of a similar width together — and on a guillotine
 * saw that is worth more than it sounds, because a run of same-width parts comes off one strip
 * with one setting instead of being scattered.
 *
 * The last comparison is always the id, so two identical parts never swap places between runs.
 */
const orderParts = (
  parts: readonly PackablePart[],
  order: PackStrategy['order'],
): PackablePart[] => {
  const longest = (p: PackablePart) => Math.max(p.length, p.width);
  const shortest = (p: PackablePart) => Math.min(p.length, p.width);
  const area = (p: PackablePart) => p.length * p.width;
  const byId = (a: PackablePart, b: PackablePart) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return [...parts].sort((a, b) => {
    switch (order) {
      case 'longest-side':
        return longest(b) - longest(a) || area(b) - area(a) || byId(a, b);
      case 'area':
        return area(b) - area(a) || longest(b) - longest(a) || byId(a, b);
      case 'narrowest':
        return shortest(b) - shortest(a) || longest(b) - longest(a) || byId(a, b);
    }
  });
};

// ---------------------------------------------------------------------------------------
// Reading the finished tree
// ---------------------------------------------------------------------------------------

const collect = (
  node: Node,
  out: { placements: Placement[]; cuts: Omit<Cut, 'sequence'>[]; offcuts: Rect[] },
) => {
  switch (node.kind) {
    case 'free':
      out.offcuts.push(node.rect);
      return;
    case 'part':
      out.placements.push(node.placement);
      return;
    case 'cut':
      /*
       * The cut is emitted before the pieces it makes, and the piece kept in hand before the one
       * set aside. That is the order somebody at the saw actually works in: make the cut, carry on
       * with the piece you are holding, come back to the offcut. `stage` is on every cut for
       * anyone who would rather group them — a beam saw operator making all the first cuts before
       * any of the second.
       */
      out.cuts.push({ axis: node.axis, at: node.at, piece: node.rect, stage: node.stage });
      collect(node.keep, out);
      if (node.rest) collect(node.rest, out);
  }
};

const readSheet = (root: Node, usable: Rect): PackedSheet => {
  const out = { placements: [] as Placement[], cuts: [] as Omit<Cut, 'sequence'>[], offcuts: [] as Rect[] };
  collect(root, out);
  return {
    usable,
    placements: out.placements,
    cuts: out.cuts.map((c, i) => ({ ...c, sequence: i + 1 })),
    offcuts: out.offcuts,
  };
};

// ---------------------------------------------------------------------------------------
// The packer
// ---------------------------------------------------------------------------------------

export interface PackOptions {
  /** Width the blade removes on every cut. */
  readonly kerf: Mm;
  /** The area cuts are made in — one sheet, less any edge trim. */
  readonly usable: Rect;
}

/**
 * Pack parts onto as many sheets as it takes, one strategy.
 *
 * **First fit.** Each part goes onto the earliest sheet with room, which keeps the early sheets
 * full and leaves the last one the one with space in it. That is worth more than the extra yield a
 * best-fit-across-all-open-sheets search would find: a shop cuts sheet 1 before sheet 4, and a nest
 * that scatters six parts over four sheets to save a few percent is a nest that costs four sheet
 * handlings to save nothing.
 *
 * What order the parts go down in, how a home is chosen and how a piece is split are the strategy's
 * three questions. `packBest` runs every combination.
 */
export const packSheets = (
  parts: readonly PackablePart[],
  options: PackOptions,
  strategy: PackStrategy = DEFAULT_STRATEGY,
): PackResult => {
  const { kerf, usable } = options;
  const { split, fit, order } = strategy;
  const roots: Node[] = [];
  const unplaced: string[] = [];

  for (const part of orderParts(parts, order)) {
    let placed = false;
    for (let i = 0; i < roots.length; i++) {
      const candidate = bestCandidate(roots[i]!, part, fit);
      if (!candidate) continue;
      roots[i] = replaceLeaf(
        roots[i]!,
        candidate.leaf,
        placeInPiece(
          candidate.leaf.rect,
          part.id,
          candidate.orientation,
          candidate.length,
          candidate.width,
          kerf,
          1 + stageOfLeaf(roots[i]!, candidate.leaf),
          split,
          part.stack,
        ),
      );
      placed = true;
      break;
    }
    if (placed) continue;

    const fresh: Node = { kind: 'free', rect: usable };
    const candidate = bestCandidate(fresh, part, fit);
    if (!candidate) {
      // Too big for a whole sheet in every orientation it is allowed. Reported, never silently
      // dropped — a part missing from a nest is a part missing from the order.
      unplaced.push(part.id);
      continue;
    }
    roots.push(
      replaceLeaf(
        fresh,
        candidate.leaf,
        placeInPiece(
          candidate.leaf.rect,
          part.id,
          candidate.orientation,
          candidate.length,
          candidate.width,
          kerf,
          1,
          split,
          part.stack,
        ),
      ),
    );
  }

  return { sheets: roots.map((r) => readSheet(r, usable)), unplaced };
};

/** Strictly better on the first figure the two disagree about. Equal scores are not less. */
const lexicographicallyLess = (a: readonly number[], b: readonly number[]): boolean => {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]!;
  }
  return false;
};

/** The biggest single piece left over anywhere in a result — the offcut most worth racking. */
const largestOffcut = (result: PackResult): Mm2 =>
  result.sheets.reduce(
    (biggest, s) => s.offcuts.reduce((b, o) => Math.max(b, rectArea(o)), biggest),
    0,
  );

/**
 * Nest the same parts every way the packer knows, and keep the best result.
 *
 * A nest is a search, and no single heuristic wins on every job — that is the honest state of the
 * art, not a gap in this implementation. Running all eighteen combinations takes milliseconds on a
 * kitchen, and the alternative is picking one in advance and paying for it in sheets: on the sample
 * kitchen the difference between the best and the worst of them is a whole sheet of carcass board.
 *
 * The comparison, in order:
 *
 *   1. **Fewest parts left unplaced.** A nest that cannot fit a part is not a cheaper nest.
 *   2. **Fewest sheets.** This is the money.
 *   3. **Biggest single offcut.** Between two nests that buy the same board, the one that leaves
 *      its waste in one piece is worth more — that piece goes on the rack and gets used.
 *   4. **Fewest cuts.** Saw time, and a tiebreak that is at least about something real.
 *
 * Every comparison is strict, so the first strategy in `PACK_STRATEGIES` wins a tie and the same
 * job always nests the same way.
 */
export const packBest = (
  parts: readonly PackablePart[],
  options: PackOptions,
): PackResult & { strategy: PackStrategy } => {
  let best: (PackResult & { strategy: PackStrategy }) | null = null;
  let bestScore: readonly [number, number, number, number] | null = null;

  for (const strategy of PACK_STRATEGIES) {
    const result = packSheets(parts, options, strategy);
    const cuts = result.sheets.reduce((s, sheet) => s + sheet.cuts.length, 0);
    const score = [
      result.unplaced.length,
      result.sheets.length,
      -largestOffcut(result),
      cuts,
    ] as const;
    if (!bestScore || lexicographicallyLess(score, bestScore)) {
      best = { ...result, strategy };
      bestScore = score;
    }
  }

  return best!;
};

/**
 * The area a sheet can be cut from, once its edges are trimmed.
 *
 * Trim comes off all four sides. A shop that only straightens two reference edges is trimming
 * less than this says, and should set the figure to suit — which is why it ships at zero rather
 * than at a guess.
 */
export const usableArea = (length: Mm, width: Mm, trim: Mm): Rect => ({
  x: trim,
  y: trim,
  length: mm(Math.max(0, length - 2 * trim)),
  width: mm(Math.max(0, width - 2 * trim)),
});

// ---------------------------------------------------------------------------------------
// Proving it
// ---------------------------------------------------------------------------------------

/**
 * Follow the cut sequence and report what comes off the sheet.
 *
 * This is the check that the nest is really cuttable, and it is deliberately written the long way
 * round: it knows nothing about the tree the packer built, only the sheet it started with, the
 * list of cuts and the kerf. Each cut has to name a piece that is actually on the bench, land
 * inside it, and split it in two. Anything the packer got wrong shows up as a cut with nowhere to
 * be made.
 *
 * What comes back is every piece left at the end. On a correct nest that is exactly the
 * placements plus the offcuts, which is what `tests/nesting.test.ts` asserts.
 */
export const replayCuts = (
  usable: Rect,
  cuts: readonly Cut[],
  kerf: Mm,
): { pieces: readonly Rect[]; problems: readonly string[] } => {
  const problems: string[] = [];
  const pieces: Rect[] = [usable];

  const same = (a: Rect, b: Rect) =>
    Math.abs(a.x - b.x) <= GEOMETRIC_EPSILON &&
    Math.abs(a.y - b.y) <= GEOMETRIC_EPSILON &&
    Math.abs(a.length - b.length) <= GEOMETRIC_EPSILON &&
    Math.abs(a.width - b.width) <= GEOMETRIC_EPSILON;

  for (const cut of cuts) {
    const index = pieces.findIndex((p) => same(p, cut.piece));
    if (index < 0) {
      problems.push(
        `Cut ${cut.sequence} is on a piece ${cut.piece.length}×${cut.piece.width} at ` +
          `(${cut.piece.x}, ${cut.piece.y}) that is not on the bench.`,
      );
      continue;
    }
    const piece = pieces[index]!;
    const near = cut.axis === 'x' ? piece.x : piece.y;
    const span = cut.axis === 'x' ? piece.length : piece.width;
    if (cut.at <= near + GEOMETRIC_EPSILON || cut.at >= near + span - GEOMETRIC_EPSILON) {
      problems.push(
        `Cut ${cut.sequence} at ${cut.axis} = ${cut.at} does not fall inside the piece it is on.`,
      );
      continue;
    }

    const keep: Rect =
      cut.axis === 'x'
        ? { ...piece, length: mm(cut.at - piece.x) }
        : { ...piece, width: mm(cut.at - piece.y) };
    const rest: Rect =
      cut.axis === 'x'
        ? { ...piece, x: mm(cut.at + kerf), length: mm(near + span - cut.at - kerf) }
        : { ...piece, y: mm(cut.at + kerf), width: mm(near + span - cut.at - kerf) };

    pieces.splice(index, 1, ...[keep, rest].filter(rectIsReal));
  }

  return { pieces, problems };
};
