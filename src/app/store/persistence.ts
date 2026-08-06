/**
 * Saving to the browser's local storage, and to a file.
 *
 * Two separate things are stored, because they have different lifetimes: the shop standards
 * outlive any one job, and the current job is whatever is on screen.
 *
 * Anything that fails to load is reported and replaced with a working default rather than
 * left to crash the app on startup — a corrupted save should cost you the save, not the tool.
 *
 * ## Why the file half matters more than it looks
 *
 * Local storage is keyed to one browser on one machine, and the shop runs this from a downloaded
 * ZIP — so "the same browser" is carrying a room somebody spent a day measuring, plus every kick
 * height, reveal, door style and saved cabinet type the shop has accumulated. Clearing browsing
 * data takes the lot, with no warning and nothing to restore from.
 *
 * So both are savable to a file and openable from one, and **the standards are not an afterthought
 * here**: they are the half that cannot be re-measured, only re-typed.
 */

import { type Project, migrateProject, projectFileProblem } from '../../core/model/project.ts';
import {
  AU_SHOP_STANDARDS,
  type ShopStandards,
  migrateStandards,
} from '../../core/standards/standards.ts';

const STANDARDS_KEY = 'cabinet-collective:standards:v1';
const PROJECT_KEY = 'cabinet-collective:project:v1';
/*
 * Which Inspector sections are folded open.
 *
 * A third key rather than a field on either of the other two, because it is neither a job nor a
 * shop standard — it is how this person likes the screen, and it must not travel. Put it in the
 * project and every saved job would carry somebody else's folds and need a schema migration to
 * add a section; put it in the standards and it would arrive in the shop's exported settings as
 * though it were a rule about cabinets. It is deliberately *not* offered as a file: losing it
 * costs one click per section, which is the definition of something not worth backing up.
 */
const UI_KEY = 'cabinet-collective:ui:v1';

const available = (): boolean => {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
};

const read = <T>(key: string, migrate: (raw: unknown) => T): { value: T | null; error?: string } => {
  if (!available()) return { value: null };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { value: null };
    return { value: migrate(JSON.parse(raw)) };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : String(e) };
  }
};

const write = (key: string, value: unknown): string | undefined => {
  if (!available()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return undefined;
  } catch (e) {
    // Quota is the realistic failure here — a large job with a big price list.
    return e instanceof Error ? e.message : String(e);
  }
};

export const loadStandards = (): { standards: ShopStandards; error?: string } => {
  const { value, error } = read(STANDARDS_KEY, migrateStandards);
  return { standards: value ?? AU_SHOP_STANDARDS, error };
};

export const saveStandards = (standards: ShopStandards): string | undefined =>
  write(STANDARDS_KEY, standards);

export const loadProject = (): { project: Project | null; error?: string } => {
  const { value, error } = read(PROJECT_KEY, migrateProject);
  return { project: value, error };
};

export const saveProject = (project: Project): string | undefined => write(PROJECT_KEY, project);

export const clearSaved = (): void => {
  if (!available()) return;
  localStorage.removeItem(PROJECT_KEY);
  localStorage.removeItem(STANDARDS_KEY);
};

/**
 * Read the Inspector's fold state back, or `null` if there is none.
 *
 * Returns the raw parsed value rather than a typed record: what a stored preference is *allowed*
 * to mean belongs with the sections themselves, in `panels/inspectorSections.ts`, where it can be
 * checked in Node. Anything unreadable comes back as `null` and the defaults win — a corrupted
 * preference should cost you the preference and nothing else.
 */
export const loadUiPrefs = (): unknown => {
  if (!available()) return null;
  try {
    const raw = localStorage.getItem(UI_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** Save the fold state. Failure is ignored on purpose — see `UI_KEY`. */
export const saveUiPrefs = (prefs: unknown): void => {
  write(UI_KEY, prefs);
};

/**
 * Hand the browser a file to download.
 *
 * One place, so the job and the standards cannot end up saving themselves in two slightly
 * different ways. Note the limit worth knowing about: a sandboxed frame without `allow-downloads`
 * blocks this silently, exactly as it blocks `confirm()` — see `panels/ask.tsx`. There is no way to
 * detect it from here, which is why the app reports what it *did*, and never claims the file
 * reached the disk.
 */
const download = (name: string, contents: string): void => {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

/** Download the current job as a file, so a job can be kept outside the browser. */
export const exportProjectFile = (project: Project): void =>
  download(`${fileStem(project)}.json`, JSON.stringify(project, null, 2));

/**
 * Download the shop standards.
 *
 * The other half of what local storage is holding, and the half nobody has ever been able to get
 * out. Kick heights, reveals, door styles and saved cabinet types are not re-measurable — they are
 * a shop's accumulated answers, and clearing browsing data takes them with the job.
 */
export const exportStandardsFile = (standards: ShopStandards): void =>
  download(
    `${standards.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'shop'}-standards.json`,
    JSON.stringify(standards, null, 2),
  );

/**
 * Download a generated text file — a cutlist, a hardware order, a drilling sheet.
 *
 * Its own function rather than sharing `download` above, because the mime type is the point: the
 * BOM in `text/csv` opens straight into Excel on Windows, which is where this one actually gets
 * used. The CSV itself is built in `src/core`, which is why it can be tested in Node.
 */
export const downloadTextFile = (name: string, contents: string, mime = 'text/csv'): void => {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

/** A filename stem from a job's name, safe on every platform. */
export const fileStem = (project: Project): string =>
  project.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'job';

/**
 * Read a job back from a file the user picks.
 *
 * Every failure comes back as a **sentence a cabinetmaker can act on** rather than a parser's
 * complaint, because the realistic mistake here is picking the wrong file out of a downloads
 * folder, not a corrupted one. The structural check runs *before* the migration chain: a file with
 * a plausible version number and no cabinets in it would otherwise be cast to a `Project` and take
 * the app down on the first render — see `projectFileProblem`.
 */
export const importProjectFile = async (file: File): Promise<Project> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return Promise.reject(
      new Error(`"${file.name}" is not a job file — it isn't the kind of file this app writes.`),
    );
  }
  const problem = projectFileProblem(parsed);
  if (problem) return Promise.reject(new Error(problem));
  return migrateProject(parsed);
};

/**
 * Read shop standards back from a file.
 *
 * `migrateStandards` gives a real migration rather than a rejection for the reason §2 sets out —
 * refusing a shop's accumulated standards silently replaces them with the shipped defaults — so
 * anything it can carry forward, it does. What is left to do here is tell the difference between a
 * standards file and a job file, since both are `.json` in the same folder.
 */
export const importStandardsFile = async (file: File): Promise<ShopStandards> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return Promise.reject(new Error(`"${file.name}" is not a shop standards file.`));
  }
  if (typeof parsed === 'object' && parsed !== null && 'cabinets' in parsed) {
    return Promise.reject(
      new Error(
        `"${file.name}" looks like a job rather than a set of shop standards. Open it with Job → Open from file.`,
      ),
    );
  }
  return migrateStandards(parsed);
};
