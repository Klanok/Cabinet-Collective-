/**
 * The derived values a cabinet spec works from.
 *
 * A spec never reaches into a `Project`. It gets a context — the driving dimensions plus the
 * handful of quantities that fall straight out of the construction method — which is what
 * keeps specs declarative and independently testable.
 */

import { type Mm, mm } from '../units.ts';
import type { Cabinet, CabinetOptions } from '../model/cabinet.ts';
import {
  type ConstructionMethod,
  horizontalDepth,
  sideDepth,
} from '../model/construction.ts';
import { type MaterialLibrary, actualThicknessOf, findSheet } from '../model/material.ts';
import type { HardwareLibrary } from '../model/hardware.ts';
import { type CornerRadius, resolveCornerRadius, substrateRadius } from './radius.ts';
import {
  type HardwareDefaultIds,
  type ResolvedHardware,
  resolveHardware,
} from './hardware.ts';

/** The resolved material ids for one cabinet, defaults already applied. */
/**
 * The four carcass parts the interior is measured between, at the thickness each is really cut
 * from — **or zero where the part is not built at all**.
 *
 * This replaces `W − 2t` and `H − 2t`, which said "a carcass has two sides and they are the same
 * board". Both halves of that turned out to be assumptions the shop does not make:
 *
 * > *"if you delete an end it re-derives"*
 * > *"genuinely different thicknesses depending on real world availability"*
 *
 * Zero is load-bearing here rather than a sentinel: a missing side takes nothing out of the
 * opening and the interior starts at the cabinet's own face, which is exactly what `left = 0`
 * computes without a branch anywhere downstream.
 */
export interface ShellThicknesses {
  readonly left: Mm;
  readonly right: Mm;
  readonly bottom: Mm;
  readonly top: Mm;
}

/** Every shell part present and cut from the carcass board — what every cabinet was until now. */
export const uniformShell = (t: Mm): ShellThicknesses => ({
  left: t,
  right: t,
  bottom: t,
  top: t,
});

export interface ResolvedMaterials {
  readonly carcass: string;
  readonly back: string;
  readonly door: string;
  /** Bendy ply for a formed skin. Resolved for every cabinet; cut only by curved ones. */
  readonly skin: string;
  readonly edgeBand: string;
}

/**
 * The thicknesses a cabinet is actually built from.
 *
 * These come from the **boards**, not from the construction method. A construction method
 * declares the nominal board it is designed around — "frameless 32mm, 16mm carcass" — but the
 * arithmetic has to follow the sheet that will really be cut, because that is the thing the
 * parts have to fit between. Nominal 16mm melamine measures about 16.3, and a bottom panel
 * calculated at 16 is 0.6mm too wide to go in.
 */
export interface BuildThicknesses {
  readonly carcass: Mm;
  readonly back: Mm;
  readonly door: Mm;
  /**
   * Bendy ply. This one does something none of the others do: it sets a **length**.
   *
   * Every other thickness here decides how a part fits between two others. A skin's thickness
   * decides how far round the curve its neutral axis runs, and therefore how long to cut it —
   * so a board that measures 3.2 rather than 3 makes the skin longer, not tighter.
   */
  readonly skin: Mm;
}

export const thicknessesFor = (
  materials: ResolvedMaterials,
  library: MaterialLibrary,
): BuildThicknesses => ({
  carcass: actualThicknessOf(findSheet(library, materials.carcass)),
  back: actualThicknessOf(findSheet(library, materials.back)),
  door: actualThicknessOf(findSheet(library, materials.door)),
  skin: actualThicknessOf(findSheet(library, materials.skin)),
});

export interface RuleContext {
  readonly cabinet: Cabinet;
  readonly construction: ConstructionMethod;
  readonly materials: ResolvedMaterials;
  readonly options: CabinetOptions;

  /** Driving dimensions. */
  readonly W: Mm;
  readonly H: Mm;
  readonly D: Mm;

  /**
   * Carcass, back and door thicknesses — **as the boards really measure**, not as they are
   * named. See `BuildThicknesses`.
   */
  readonly t: Mm;
  readonly tb: Mm;
  readonly td: Mm;
  /** Bendy ply thickness — decides a skin's developed length, not a fit. */
  readonly ts: Mm;

  /** Clear width between the sides. */
  /**
   * The shell this cabinet really has — which of the four parts exist, and the board each is cut
   * from. Everything below is derived from it rather than from `t`.
   */
  readonly shell: ShellThicknesses;
  /**
   * The board the part now being produced is really cut from, by its index in its own rule.
   *
   * **A part that centres on its own thickness has to know its own thickness.** A shelf sits on the
   * division line, so it starts at `centre − t/2`; with `t` the carcass board, a shelf cut from
   * 18mm in a 16mm cabinet sat a millimetre low — the right board on the cutlist, in not quite the
   * right place, which is the class of fault §7 exists for.
   *
   * **The index is the rule's own and there is no key here**, deliberately. `build.ts` scopes this
   * per rule as it produces, so a builder asks "how thick is the one I am making" without ever
   * naming a rule key — which would be a second source of truth about which rule it belongs to,
   * and would silently miss the day a spec registered the same builder under another name.
   *
   * Answers the carcass board for anything not overridden, which is every part until somebody
   * says otherwise.
   */
  readonly thicknessOf: (index: number) => Mm;
  /** Cabinet-space x where the interior starts: the left end's own board, or 0 if there is none. */
  readonly interiorX0: Mm;
  /** Cabinet-space y where the interior starts: the bottom's own board, or 0 if there is none. */
  readonly interiorY0: Mm;
  readonly interiorWidth: Mm;
  /** Clear height between bottom and top/stretchers. */
  readonly interiorHeight: Mm;
  /** Front-to-back size of a side panel. */
  readonly sideDepth: Mm;
  /** Front-to-back size of the horizontals. */
  readonly horizontalDepth: Mm;
  /** Cabinet-space z of the front face of the back panel — where the interior starts. */
  readonly interiorBackZ: Mm;
  /**
   * Cabinet-space z of the **back of a front** — the carcass front plus the standoff.
   *
   * Resolved here so no builder re-derives it. A door's back face is not on the carcass: it stands
   * off by the hinge's natural gap, which also leaves room for a bump stop.
   */
  readonly frontBackZ: Mm;
  /**
   * Cabinet-space z of the **finished face of the kitchen** — the front of a door.
   *
   * This is the plane a radiused corner has to finish in, which is the whole reason it is worth
   * naming. It exists whether or not the cabinet has doors: a decorative radiused end still has to
   * line up with the fronts either side of it.
   */
  readonly finishedFrontZ: Mm;

  /**
   * The rounded front corner, if this cabinet has one — resolved once, so no builder has to
   * re-derive it and get a different answer.
   *
   * `null` is the usual case and means a square cabinet, exactly as before. It is null both
   * when no corner was named and when the radius is zero: **naming a corner is not a radius,
   * and a radius with no corner named is not a corner**. Either half on its own does nothing,
   * which is what protects every job already quoted.
   */
  readonly radius: CornerRadius | null;

  /**
   * The runner and hinge systems this cabinet is built and bored to — resolved once, so no
   * builder and no boring rule has to work out a nominal length and get a different answer.
   *
   * Never null. Which *runner length* fits can be null, and that lives inside — see
   * `ResolvedHardware.runner`.
   */
  readonly hardware: ResolvedHardware;
}

/** Everything `buildContext` needs to resolve hardware, which is the job's library and its ids. */
export interface HardwareSelection {
  readonly library: HardwareLibrary;
  readonly defaults: HardwareDefaultIds;
}

/**
 * Resolve the corner radius, or `null` if this cabinet hasn't got a usable one.
 *
 * Both halves are required, and there is deliberately no default for either. See
 * `CabinetOptions.radiusCorner` for why the corner is never guessed.
 *
 * A radius too small for the wrap to turn also comes back `null`, so the cabinet is drawn
 * square and `cornerRadiusProblems` says why. **This has to be caught here rather than left to
 * the builders**, and the reason is worth writing down: a number field fires on every
 * keystroke, so typing "200" makes the app resolve a 2mm radius first. Two layers of 3mm ply
 * leave nothing of a 2mm radius, `cylindricalForming` rightly refuses it, and the throw took
 * the whole app to a blank screen — then persisted the job, so every reload blanked it again.
 * The rule engine's job is to report an impossible cabinet and keep drawing, never to throw.
 */
const resolveRadius = (
  options: CabinetOptions,
  construction: ConstructionMethod,
  dims: { W: Mm; D: Mm; t: Mm; tb: Mm; ts: Mm; td: Mm },
): CornerRadius | null => {
  const corner = options.radiusCorner;
  const radius = options.carcassRadius ?? 0;
  const layers = options.skinLayers ?? 2;
  if (!corner || radius <= 0) return null;
  const finishLaminate = construction.finishLaminate ?? mm(0);
  if (substrateRadius(mm(radius), layers, dims.ts, finishLaminate) <= 0) return null;
  return resolveCornerRadius({
    corner,
    radius: mm(radius),
    layers,
    W: dims.W,
    D: dims.D,
    t: dims.t,
    tb: dims.tb,
    ts: dims.ts,
    finishLaminate,
    finishedFrontZ: mm(dims.D + (construction.frontStandoff ?? 2) + dims.td),
    // Older methods that predate the field are migrated to the shipped 50, but a method
    // hand-built in a test may not be, so it falls back to the same number rather than to NaN.
    stripWidth: mm(construction.fixingStripWidth ?? 50),
  });
};

export const buildContext = (
  cabinet: Cabinet,
  construction: ConstructionMethod,
  materials: ResolvedMaterials,
  thicknesses: BuildThicknesses,
  hardware: HardwareSelection,
  /**
   * The shell as overridden, or every part present in the carcass board — which is what every
   * cabinet was before per-part overrides existed, and what every caller that does not care still
   * gets by leaving this off.
   */
  shell: ShellThicknesses = uniformShell(thicknesses.carcass),
): RuleContext => {
  const t = thicknesses.carcass;
  const tb = thicknesses.back;
  const { width: W, height: H, depth: D } = cabinet;
  // The opening is what is left between the parts that are really there, at the boards they are
  // really cut from. With a uniform shell this is `W − 2t` exactly as it always was.
  const interiorWidth = mm(W - shell.left - shell.right);
  // The clear run a runner has to live in: front edge of the carcass back to the front face of the
  // back panel. The same figure under both back styles, because the back occupies z ∈ [0, tb]
  // either way — what changes between them is how deep the *side* runs, not the opening.
  const innerDepth = horizontalDepth(D, tb);

  return {
    cabinet,
    construction,
    materials,
    options: cabinet.options,
    W,
    H,
    D,
    t,
    tb,
    td: thicknesses.door,
    ts: thicknesses.skin,
    shell,
    // Replaced per rule by `build.ts` while it produces; the carcass board is the answer for
    // every part nobody has overridden.
    thicknessOf: () => t,
    interiorX0: shell.left,
    interiorY0: shell.bottom,
    interiorWidth,
    interiorHeight: mm(H - shell.bottom - shell.top),
    sideDepth: sideDepth(construction, D, tb),
    horizontalDepth: innerDepth,
    // Under both back styles the back occupies z ∈ [0, tb], so the interior starts at tb.
    interiorBackZ: tb,
    // Older methods that predate the field are migrated to the shipped 2, but a method hand-built
    // in a test may not be, so it falls back to the same number rather than to NaN.
    frontBackZ: mm(D + (construction.frontStandoff ?? 2)),
    finishedFrontZ: mm(D + (construction.frontStandoff ?? 2) + thicknesses.door),
    radius: resolveRadius(cabinet.options, construction, {
      W,
      D,
      t,
      tb,
      ts: thicknesses.skin,
      td: thicknesses.door,
    }),
    hardware: resolveHardware(cabinet.options, hardware.library, hardware.defaults, {
      innerWidth: interiorWidth,
      innerDepth,
    }),
  };
};


/** Validate driving dimensions before any parts get built. */
/**
 * What deleting a shell part costs the cabinet, reported rather than refused.
 *
 * **Refusing is the wrong answer here** and that is the whole point of the distinction: the shop
 * deleted the end deliberately — a run of cabinets sharing one end panel is ordinary joinery — so
 * a carcass with one side is a cabinet to build, not an error. A carcass with *no* sides is still
 * something to build and something nobody should discover from a photograph.
 *
 * These are warnings, so `buildCabinet` goes on to produce the parts. `validateContext`'s problems
 * are the other kind: dimensions that cannot produce a meaningful part at all.
 */
export const shellProblems = (ctx: RuleContext): string[] => {
  const problems: string[] = [];
  if (ctx.shell.left <= 0 && ctx.shell.right <= 0) {
    problems.push(
      'Both ends have been deleted, so nothing holds this carcass square — the shelves and the ' +
        'bottom have nothing to be fixed to. It is still cut as drawn.',
    );
  }
  if (ctx.shell.bottom <= 0 && ctx.shell.top <= 0) {
    problems.push(
      'This cabinet has neither a bottom nor a top, so its ends have nothing tying them ' +
        'together. It is still cut as drawn.',
    );
  }
  return problems;
};

export const validateContext = (ctx: RuleContext): string[] => {
  const problems: string[] = [];
  if (ctx.interiorWidth <= 0) {
    problems.push(
      `Width ${ctx.W}mm is too narrow for ${ctx.t}mm sides — no interior opening remains.`,
    );
  }
  if (ctx.interiorHeight <= 0) {
    problems.push(`Height ${ctx.H}mm is too short for ${ctx.t}mm horizontals.`);
  }
  if (ctx.horizontalDepth <= 0) {
    problems.push(`Depth ${ctx.D}mm is not deeper than the ${ctx.tb}mm back panel.`);
  }
  return problems;
};
