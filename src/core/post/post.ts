/**
 * Job in, G-code out — the one call the app and the report both use.
 *
 * Everything below it is separable and tested on its own: `cam/` produces operations that know
 * nothing about G-code, `post/check.ts` refuses programs that would cost money, `post/iso.ts`
 * writes moves. This composes them in the one order that is safe, which is **check first**. A
 * writer that emits the program and then mentions a problem underneath it has already produced a
 * file somebody can send to a machine.
 */

import { type CamSetup, projectPrograms } from '../cam/operations.ts';
import type { SheetProgram } from '../cam/operation.ts';
import { type ProjectNest, nestProject } from '../nest/nest.ts';
import type { Project } from '../model/project.ts';
import { type Problem, checkProgram, refusals } from './check.ts';
import type { MachineProfile } from './machine.ts';
import { type PostResult, writeSheetProgram } from './iso.ts';

export interface PostedSheet {
  readonly program: SheetProgram;
  readonly problems: readonly Problem[];
  /** Null when a problem was serious enough to refuse. */
  readonly output: PostResult | null;
}

export interface PostedJob {
  readonly machine: MachineProfile;
  readonly sheets: readonly PostedSheet[];
  /** Problems that stopped a program being written. */
  readonly refused: readonly Problem[];
  readonly warnings: readonly string[];
}

/** What the machine profile says about how parts come off the sheet. */
export const setupFor = (machine: MachineProfile): CamSetup => ({
  partCutterToolId: machine.partCutterToolId,
  leaveUncut: machine.leaveUncut,
  throughOvercut: machine.throughOvercut,
});

export const postProject = (
  project: Project,
  machine: MachineProfile,
  nest: ProjectNest = nestProject(project),
): PostedJob => {
  const programs = projectPrograms(project, setupFor(machine), nest);
  const sheets: PostedSheet[] = programs.map((program) => {
    const problems = checkProgram(program, machine, nest);
    const stoppers = refusals(problems);
    return {
      program,
      problems,
      output: stoppers.length > 0 ? null : writeSheetProgram(program, machine, project.name),
    };
  });

  return {
    machine,
    sheets,
    refused: sheets.flatMap((s) => refusals(s.problems)),
    warnings: [
      ...sheets.flatMap((s) => s.problems.filter((p) => p.severity === 'warn').map((p) => p.message)),
      ...sheets.flatMap((s) => s.output?.warnings ?? []),
    ],
  };
};

/** How many programs a job comes to, and how many operations across all of them. */
export const postedTotals = (job: PostedJob) => ({
  sheetCount: job.sheets.length,
  written: job.sheets.filter((s) => s.output !== null).length,
  operationCount: job.sheets.reduce((s, sheet) => s + sheet.program.operations.length, 0),
  boreCount: job.sheets.reduce(
    (s, sheet) => s + sheet.program.operations.filter((op) => op.kind === 'bore').length,
    0,
  ),
  needsSecondSetup: [...new Set(job.sheets.flatMap((s) => s.program.needsSecondSetup))],
});
