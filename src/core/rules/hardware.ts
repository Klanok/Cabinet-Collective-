/**
 * Resolving a cabinet's hardware — which runner, which length, which hinge.
 *
 * Done **once**, in `buildContext`, exactly as the corner radius is. Every builder and the boring
 * pass read the answer off the context rather than working it out again, because two places
 * deriving a nominal length is two places that can pick a different one, and the drawer bottom
 * would then be cut for a runner that isn't going in.
 *
 * Nothing here throws. A cabinet with no runner that fits, or one pointing at a system somebody
 * has deleted, still has to draw and still has to be visible in the viewport so it can be fixed —
 * the rule the corner radius crash taught (§4.5) and it holds for hardware too. Everything that
 * is wrong comes back through `hardwareProblems`.
 */

import { type Mm, mm } from '../units.ts';
import type { CabinetOptions } from '../model/cabinet.ts';
import {
  type DrawerRunnerSystem,
  type DrawerSideHeight,
  type HardwareLibrary,
  type HingeSystem,
  findHingeSystem,
  findRunnerSystem,
  findSideHeight,
  minInnerDepthFor,
  runnerFixingPositions,
} from '../model/hardware.ts';
import {
  CLIP_TOP_BLUMOTION,
  DEFAULT_DRAWER_SIDE_HEIGHT_CODE,
  MERIVOBOX,
} from '../library/blum.ts';
import type { RuleContext } from './context.ts';

/** The three ids a job defaults to, pulled out so the resolver doesn't need a whole `Project`. */
export interface HardwareDefaultIds {
  readonly runnerSystemId?: string;
  readonly drawerSideHeightCode?: string;
  readonly hingeSystemId?: string;
}

/** A runner that will actually go into this cabinet. */
export interface ResolvedRunner {
  readonly system: DrawerRunnerSystem;
  readonly sideHeight: DrawerSideHeight;
  readonly nominalLength: Mm;
  /**
   * Where this runner is screwed to the side panel, back from the panel's front edge, front-most
   * first. Four points on MERIVOBOX; a list rather than a pair so a system with a different count
   * needs no change here.
   */
  readonly fixingPositions: readonly Mm[];
  /** True when the length was chosen to suit the depth rather than asked for by name. */
  readonly automatic: boolean;
}

export interface ResolvedHardware {
  readonly runnerSystem: DrawerRunnerSystem;
  readonly sideHeight: DrawerSideHeight;
  readonly hinge: HingeSystem;
  /**
   * The runner, or `null` when no length this system makes will fit the cabinet.
   *
   * Null means **no drawer boxes get cut**, which is the honest outcome: a box sized to a runner
   * that cannot be bought is worse than no box and a warning. The fronts still come out, so the
   * cabinet still reads as a drawer bank on screen.
   */
  readonly runner: ResolvedRunner | null;
  /** Clear depth the runner had to fit in — front edge to the front face of the back. */
  readonly innerDepth: Mm;
}

/**
 * Resolve hardware for one cabinet.
 *
 * Falls back to the shipped Blum records when a job's library is empty or an id points at nothing,
 * the way `resolveDoorStyle` falls back to the plain slab. A deleted runner system must leave you
 * with a cabinet you can see and re-point, not a job that won't open.
 */
export const resolveHardware = (
  options: CabinetOptions,
  library: HardwareLibrary,
  defaults: HardwareDefaultIds,
  dims: { innerWidth: Mm; innerDepth: Mm },
): ResolvedHardware => {
  const runnerSystem =
    findRunnerSystem(library.runnerSystems, options.runnerSystemId) ??
    findRunnerSystem(library.runnerSystems, defaults.runnerSystemId) ??
    library.runnerSystems[0] ??
    MERIVOBOX;

  const sideHeight =
    findSideHeight(runnerSystem, options.drawerSideHeightCode) ??
    findSideHeight(runnerSystem, defaults.drawerSideHeightCode) ??
    findSideHeight(runnerSystem, DEFAULT_DRAWER_SIDE_HEIGHT_CODE) ??
    runnerSystem.sideHeights[0] ??
    findSideHeight(MERIVOBOX, DEFAULT_DRAWER_SIDE_HEIGHT_CODE)!;

  const hinge =
    findHingeSystem(library.hingeSystems, options.hingeSystemId) ??
    findHingeSystem(library.hingeSystems, defaults.hingeSystemId) ??
    library.hingeSystems[0] ??
    CLIP_TOP_BLUMOTION;

  return {
    runnerSystem,
    sideHeight,
    hinge,
    runner: resolveRunner(options, runnerSystem, sideHeight, dims.innerDepth),
    innerDepth: dims.innerDepth,
  };
};

/**
 * Which nominal length goes in.
 *
 * An explicit length is honoured **only if the system makes it and the cabinet will hold it**.
 * Silently substituting the nearest one that fits would be the worst of the three options: you
 * would order the length you typed and find the boxes cut for a different one.
 */
const resolveRunner = (
  options: CabinetOptions,
  system: DrawerRunnerSystem,
  sideHeight: DrawerSideHeight,
  innerDepth: Mm,
): ResolvedRunner | null => {
  const asked = options.drawerNominalLength;
  const lengths = sideHeight.nominalLengths ?? system.nominalLengths;
  const made = (nl: Mm) => lengths.some((l) => l === nl);

  if (asked !== undefined) {
    if (!made(asked) || minInnerDepthFor(system, asked) > innerDepth) return null;
    return {
      system,
      sideHeight,
      nominalLength: asked,
      fixingPositions: runnerFixingPositions(system, asked),
      automatic: false,
    };
  }

  const fitting = lengths.filter((nl) => minInnerDepthFor(system, nl) <= innerDepth);
  const best = fitting.length === 0 ? null : mm(Math.max(...fitting));
  if (best === null) return null;
  return {
    system,
    sideHeight,
    nominalLength: best,
    fixingPositions: runnerFixingPositions(system, best),
    automatic: true,
  };
};

/** True when this cabinet type has drawers in it, and so cares about the runner at all. */
export const hasDrawers = (ctx: RuleContext): boolean =>
  ctx.cabinet.typeId === 'drawer-bank' &&
  ((ctx.options.drawerFrontHeights?.length ?? 0) > 0 || (ctx.options.drawerCount ?? 0) > 0);

/**
 * What is wrong with this cabinet's hardware, in plain terms.
 *
 * Run from `buildCabinet` for every cabinet, alongside `cornerRadiusProblems`. A cabinet with no
 * drawers and no doors produces nothing here, which is what lets the "nothing existing moves"
 * invariant compare warnings as well as parts.
 */
export const hardwareProblems = (ctx: RuleContext): string[] => {
  const problems: string[] = [];
  const hw = ctx.hardware;

  if (ctx.options.runnerSystemId && ctx.options.runnerSystemId !== hw.runnerSystem.id) {
    problems.push(
      `This cabinet asks for runner system "${ctx.options.runnerSystemId}", which is not in this ` +
        `job — it has been built on ${hw.runnerSystem.name} instead.`,
    );
  }
  if (ctx.options.drawerSideHeightCode && ctx.options.drawerSideHeightCode !== hw.sideHeight.code) {
    problems.push(
      `${hw.runnerSystem.name} does not come in height "${ctx.options.drawerSideHeightCode}" — ` +
        `built at ${hw.sideHeight.name}.`,
    );
  }
  if (ctx.options.hingeSystemId && ctx.options.hingeSystemId !== hw.hinge.id) {
    problems.push(
      `This cabinet asks for hinge system "${ctx.options.hingeSystemId}", which is not in this ` +
        `job — it has been bored for ${hw.hinge.name} instead.`,
    );
  }

  if (!hasDrawers(ctx)) return problems;

  const system = hw.runnerSystem;
  const asked = ctx.options.drawerNominalLength;
  const lengths = hw.sideHeight.nominalLengths ?? system.nominalLengths;

  if (hw.runner === null) {
    if (asked !== undefined && !lengths.some((l) => l === asked)) {
      problems.push(
        `${system.name} is not made at ${Math.round(asked)}mm. It comes in ` +
          `${lengths.join(', ')}mm at height ${hw.sideHeight.code} — a runner is one of those ` +
          'lengths or it does ' +
          'not exist, so no drawer boxes have been cut.',
      );
    } else if (asked !== undefined) {
      problems.push(
        `A ${Math.round(asked)}mm ${system.name} runner needs ` +
          `${Math.round(minInnerDepthFor(system, asked))}mm of clear depth and this cabinet has ` +
          `${Math.round(hw.innerDepth)}mm. No drawer boxes have been cut.`,
      );
    } else {
      const shortest = Math.min(...lengths);
      problems.push(
        `${Math.round(hw.innerDepth)}mm of clear depth is not enough for any ${system.name} ` +
          `runner — the shortest is ${shortest}mm and needs ` +
          `${Math.round(minInnerDepthFor(system, mm(shortest)))}mm. No drawer boxes have been cut.`,
      );
    }
    return problems;
  }

  // A box narrower than this is not a drawer, it is a slot. Reported rather than cut.
  const bottomWidth = ctx.interiorWidth - system.bottomWidthDeduction;
  if (bottomWidth <= 0) {
    problems.push(
      `${system.name} takes ${system.bottomWidthDeduction}mm out of the opening and this cabinet ` +
        `has only ${Math.round(ctx.interiorWidth)}mm — there is no drawer bottom left to cut.`,
    );
  }

  return problems;
};
