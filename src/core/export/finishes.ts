/**
 * The finishes schedule — what the kitchen is actually made of, said the way a client reads it.
 *
 * ## It lists what the job *uses*, not what the library *offers*
 *
 * Every figure here is gathered from the parts and units the rule engine produced, so a decor
 * that no cabinet is cut from cannot appear on the schedule and one that is used cannot be
 * missing. Listing the material library instead would be a schedule that is right on the day it
 * is written and wrong the first time somebody overrides a sink base — the exact shape of stale
 * claim this codebase keeps finding.
 *
 * That also means a per-cabinet material override lands on the schedule automatically, which is
 * the case a hand-written list always gets wrong.
 *
 * ## Client language, not shop language
 *
 * A schedule is read by somebody choosing a kitchen, so it is grouped by **what you look at** —
 * doors and drawer fronts, benchtop, handles — rather than by the model's part roles. Where the
 * shop's word and the client's word differ, the client's wins: "Doors and drawer fronts", not
 * "door material slot".
 */

import { type Mm } from '../units.ts';
import type { Project } from '../model/project.ts';
import type { PanelRole } from '../model/panel.ts';
import {
  actualThicknessOf,
  findBenchtopMaterial,
  findEdgeBand,
  findSheet,
} from '../model/material.ts';
import { buildProject } from '../rules/build.ts';
import { buildRunUnits } from '../rules/runUnits.ts';

export interface FinishLine {
  /** What the client is looking at — "Doors and drawer fronts". */
  readonly what: string;
  /** Brand and decor, as the supplier names it. */
  readonly specification: string;
  /** Thickness or size, where it is a thing a client would ask about. Blank where it is not. */
  readonly detail: string;
  /** Which parts carry it, so nothing on the schedule is unattributable. */
  readonly usedFor: string;
}

/** Roles a client would call a front. */
const FRONT_ROLES = new Set<PanelRole>(['door', 'drawer-front', 'false-front', 'lid']);
/** Roles that are the carcass — the box, not the face. */
const CARCASS_ROLES = new Set<PanelRole>([
  'side', 'bottom', 'top', 'stretcher', 'shelf-fixed', 'shelf-adjustable', 'back', 'divider',
]);

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/**
 * The schedule for a job.
 *
 * Returns an empty list for an empty job rather than a table of headings with nothing under
 * them — a schedule of nothing is a sheet that looks like a fault.
 */
export const finishesSchedule = (project: Project): FinishLine[] => {
  const built = buildProject(project);
  const panels = built.flatMap((b) => b.panels);
  const lines: FinishLine[] = [];

  /** Distinct sheet materials used by panels whose role passes `pick`, with a count. */
  const sheetsUsedBy = (pick: (role: PanelRole) => boolean) => {
    const counts = new Map<string, number>();
    for (const panel of panels) {
      if (!pick(panel.role)) continue;
      counts.set(panel.materialId, (counts.get(panel.materialId) ?? 0) + 1);
    }
    return [...counts.entries()].map(([id, count]) => ({ sheet: findSheet(project.materials, id), count }));
  };

  for (const { sheet, count } of sheetsUsedBy((r) => FRONT_ROLES.has(r))) {
    lines.push({
      what: 'Doors and drawer fronts',
      specification: `${sheet.brand} ${sheet.decor}`,
      detail: `${actualThicknessOf(sheet)}mm`,
      usedFor: `${count} ${plural(count, 'front', 'fronts')}`,
    });
  }

  for (const { sheet, count } of sheetsUsedBy((r) => CARCASS_ROLES.has(r))) {
    lines.push({
      what: 'Carcasses',
      specification: `${sheet.brand} ${sheet.decor}`,
      detail: `${actualThicknessOf(sheet)}mm`,
      usedFor: `${count} ${plural(count, 'part', 'parts')}`,
    });
  }

  /*
   * Benchtops come off the stored units rather than off panels, because a **bought-in** top has
   * no panels at all — nobody in this shop cuts stone. §4.31 and §4.32 both turned on that, and a
   * schedule that read panels alone would leave the stone off the one sheet a client reads to find
   * out what their benchtop is.
   */
  const tops = new Map<string, number>();
  for (const top of project.benchtops) tops.set(top.materialId, (tops.get(top.materialId) ?? 0) + 1);
  for (const [id, count] of tops) {
    const material = findBenchtopMaterial(project.materials, id);
    lines.push({
      what: 'Benchtop',
      specification: `${material.brand} ${material.decor}`,
      detail: `${material.thickness}mm${material.supply === 'bought-in' ? ', supplied and templated' : ', shop-made'}`,
      usedFor: `${count} ${plural(count, 'top', 'tops')}`,
    });
  }

  /*
   * Edge banding, on the fronts a client sees the edge of.
   *
   * `EdgeBanding` is **per edge** — a part can carry a different band on each of its four — so a
   * front is counted once per distinct band it wears rather than once per banded edge. Counting
   * edges would report a plain door as four.
   */
  const bands = new Map<string, number>();
  for (const panel of panels) {
    if (!FRONT_ROLES.has(panel.role)) continue;
    for (const id of new Set(Object.values(panel.edgeBanding).filter(Boolean))) {
      bands.set(id, (bands.get(id) ?? 0) + 1);
    }
  }
  for (const [id, count] of bands) {
    const band = findEdgeBand(project.materials, id);
    if (!band) continue;
    lines.push({
      what: 'Edging',
      specification: `${band.brand} ${band.decor}`,
      detail: `${band.thickness}mm`,
      usedFor: `${count} ${plural(count, 'front', 'fronts')}`,
    });
  }

  /*
   * Hardware, from what the cabinets were actually **built and bored to** — `ResolvedHardware`,
   * not the job's library. A cabinet that names its own runner is quoted and machined for that
   * runner, so that is what belongs on the schedule.
   */
  const runners = new Map<string, number>();
  const hinges = new Map<string, number>();
  for (const b of built) {
    const boxes = b.panels.filter((p) => p.role === 'drawer-bottom').length;
    if (boxes > 0) {
      const name = b.hardware.runnerSystem.name;
      runners.set(name, (runners.get(name) ?? 0) + boxes);
    }
    const doors = b.panels.filter((p) => p.role === 'door').length;
    if (doors > 0) {
      const name = b.hardware.hinge.name;
      hinges.set(name, (hinges.get(name) ?? 0) + doors);
    }
  }
  for (const [name, count] of runners) {
    lines.push({
      what: 'Drawer runners',
      specification: name,
      detail: 'soft close',
      usedFor: `${count} ${plural(count, 'drawer', 'drawers')}`,
    });
  }
  for (const [name, count] of hinges) {
    lines.push({
      what: 'Hinges',
      specification: name,
      detail: '',
      usedFor: `${count} ${plural(count, 'door', 'doors')}`,
    });
  }

  // Ladder bases and kick faces — the plinth a client sees along the floor.
  const kickMaterials = new Map<string, number>();
  for (const unit of buildRunUnits(project)) {
    for (const panel of unit.panels) {
      if (panel.role !== 'kick') continue;
      kickMaterials.set(panel.materialId, (kickMaterials.get(panel.materialId) ?? 0) + 1);
    }
  }
  for (const panel of panels) {
    if (panel.role !== 'kick') continue;
    kickMaterials.set(panel.materialId, (kickMaterials.get(panel.materialId) ?? 0) + 1);
  }
  for (const [id, count] of kickMaterials) {
    const sheet = findSheet(project.materials, id);
    lines.push({
      what: 'Kick',
      specification: `${sheet.brand} ${sheet.decor}`,
      detail: `${actualThicknessOf(sheet)}mm`,
      usedFor: `${count} ${plural(count, 'face', 'faces')}`,
    });
  }

  return lines;
};

/** Every distinct thickness a job uses, for a test that wants one. */
export const scheduleThicknesses = (lines: readonly FinishLine[]): Mm[] =>
  lines.flatMap((l) => {
    const m = l.detail.match(/^(\d+(?:\.\d+)?)mm/);
    return m ? [Number(m[1]) as Mm] : [];
  });
