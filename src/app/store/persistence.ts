/**
 * Saving to the browser's local storage.
 *
 * Two separate things are stored, because they have different lifetimes: the shop standards
 * outlive any one job, and the current job is whatever is on screen.
 *
 * Anything that fails to load is reported and replaced with a working default rather than
 * left to crash the app on startup — a corrupted save should cost you the save, not the tool.
 */

import { type Project, migrateProject } from '../../core/model/project.ts';
import {
  AU_SHOP_STANDARDS,
  type ShopStandards,
  migrateStandards,
} from '../../core/standards/standards.ts';

const STANDARDS_KEY = 'cabinet-collective:standards:v1';
const PROJECT_KEY = 'cabinet-collective:project:v1';

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

/** Download the current job as a file, so a job can be kept outside the browser. */
export const exportProjectFile = (project: Project): void => {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'job'}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Download a generated text file — a cutlist, a hardware order, a drilling sheet.
 *
 * The CSV itself is built in `src/core`, which is why it can be tested in Node. All that happens
 * here is a Blob and a click. The BOM in `text/csv` opens straight into Excel on Windows, which is
 * where this one actually gets used.
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

/** Read a job back from a file the user picks. */
export const importProjectFile = async (file: File): Promise<Project> =>
  migrateProject(JSON.parse(await file.text()));
