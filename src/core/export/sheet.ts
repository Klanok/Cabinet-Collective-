/**
 * Paper, and the scale a drawing is at.
 *
 * ## Why this is its own module, and why it is pure
 *
 * A set of drawings makes one promise the rest of the app does not: **the paper is a measuring
 * instrument**. A client holds a sheet marked 1:50, puts a rule on it, and reads a number. If the
 * drawing is at 1:52 because that is what happened to fit the frame, the sheet is not a drawing
 * that is slightly out — it is a drawing that lies, and it lies most convincingly to the person
 * least able to check it.
 *
 * So the scale is chosen from a **ladder of real scales** and never computed to fit, and the
 * number in the title block is read off the same object the transform is built from. There is no
 * second place for it to disagree.
 *
 * Everything here is in **paper millimetres** — millimetres on the finished sheet — as against
 * the model millimetres the rest of the codebase speaks in. The two are never mixed in one
 * variable, and a function that takes both says which is which in its parameter names.
 */

import { type Mm, mm } from '../units.ts';

/** A sheet of paper, portrait, in paper millimetres. */
export interface PaperSize {
  readonly name: string;
  readonly width: Mm;
  readonly height: Mm;
}

export const A4: PaperSize = { name: 'A4', width: mm(210), height: mm(297) };
export const A3: PaperSize = { name: 'A3', width: mm(297), height: mm(420) };
export const A2: PaperSize = { name: 'A2', width: mm(420), height: mm(594) };

export const PAPER_SIZES: readonly PaperSize[] = [A4, A3, A2];

export type Orientation = 'portrait' | 'landscape';

/**
 * The scales a joinery drawing is allowed to be at.
 *
 * Deliberately a short list of the ones a shop actually uses, rather than every ratio that
 * exists. **The fit is chosen from this list rather than calculated**, which is the whole point:
 * a scale bar and a rule only work if the number is one somebody can divide by in their head.
 *
 * 1:1 and 1:2 are here for a detail sheet later; nothing on a floor plan will pick them.
 */
export const DRAWING_SCALES: readonly number[] = [1, 2, 5, 10, 20, 25, 50, 100, 200];

export interface DrawingScale {
  /** The N in 1:N. */
  readonly denominator: number;
  /** What goes in the title block. */
  readonly label: string;
  /**
   * Paper millimetres per model millimetre — the only number the transform may be built from.
   *
   * Exposed rather than left for the caller to compute as `1 / denominator`, so that the label
   * and the transform cannot be derived from the ratio by two different pieces of code.
   */
  readonly paperPerMm: number;
}

export const scaleOf = (denominator: number): DrawingScale => ({
  denominator,
  label: `1:${denominator}`,
  paperPerMm: 1 / denominator,
});

/** A model length, in paper millimetres, at this scale. */
export const onPaper = (modelMm: Mm, scale: DrawingScale): Mm =>
  mm(modelMm * scale.paperPerMm);

/**
 * The tightest standard scale that fits `content` inside `frame`.
 *
 * Tightest rather than loosest because a drawing wants to fill its frame — a plan floating in
 * the middle of an A3 at 1:200 is legible only in the sense that nothing is cut off.
 *
 * Returns `null` when even the loosest scale on the ladder cannot fit it. **Null rather than
 * falling back to a computed ratio**: a sheet that cannot hold the drawing at any honest scale
 * needs bigger paper, and saying so is the useful answer.
 */
export const fitScale = (
  content: { width: Mm; height: Mm },
  frame: { width: Mm; height: Mm },
): DrawingScale | null => {
  if (content.width <= 0 || content.height <= 0) return scaleOf(DRAWING_SCALES[0]!);
  for (const denominator of DRAWING_SCALES) {
    const scale = scaleOf(denominator);
    if (
      onPaper(content.width, scale) <= frame.width &&
      onPaper(content.height, scale) <= frame.height
    ) {
      return scale;
    }
  }
  return null;
};

/**
 * A laid-out sheet: the paper, and the rectangle a drawing may occupy on it.
 *
 * Coordinates are paper millimetres from the **top-left of the paper**, which is the direction
 * SVG counts in — so a frame at `y` is `y` down the page, not up it. Said here because the model
 * side of this codebase counts Y upward and mixing the two is the one mistake this file could
 * make that nothing would catch.
 */
export interface Sheet {
  readonly paper: PaperSize;
  readonly orientation: Orientation;
  /** Paper millimetres, after orientation is applied. */
  readonly width: Mm;
  readonly height: Mm;
  readonly margin: Mm;
  /** The strip along the bottom that the title block occupies. */
  readonly titleBlockHeight: Mm;
  /** Where the drawing goes — inside the margin, above the title block. */
  readonly frame: { x: Mm; y: Mm; width: Mm; height: Mm };
}

/** Margin and title block, in paper millimetres. Trade-standard proportions for A3. */
const DEFAULT_MARGIN: Mm = mm(10);
const DEFAULT_TITLE_BLOCK: Mm = mm(32);

export const layoutSheet = (
  paper: PaperSize,
  orientation: Orientation,
  margin: Mm = DEFAULT_MARGIN,
  titleBlockHeight: Mm = DEFAULT_TITLE_BLOCK,
): Sheet => {
  const landscape = orientation === 'landscape';
  const width = mm(landscape ? paper.height : paper.width);
  const height = mm(landscape ? paper.width : paper.height);
  return {
    paper,
    orientation,
    width,
    height,
    margin,
    titleBlockHeight,
    frame: {
      x: margin,
      y: margin,
      width: mm(width - margin * 2),
      height: mm(height - margin * 2 - titleBlockHeight),
    },
  };
};

/**
 * Where a model point lands on the paper.
 *
 * `origin` is the model point that sits at the frame's top-left, and the model's **Z runs down
 * the page** — the plan is the world's X/Z plane seen from above, exactly as `PlanView` draws it,
 * so no axis is flipped here. An elevation sheet will flip its vertical, and will say so where
 * it does it rather than here.
 */
export const toPaper = (
  point: { x: number; z: number },
  origin: { x: number; z: number },
  scale: DrawingScale,
  frame: { x: Mm; y: Mm },
): { x: Mm; y: Mm } => ({
  x: mm(frame.x + (point.x - origin.x) * scale.paperPerMm),
  y: mm(frame.y + (point.z - origin.z) * scale.paperPerMm),
});
