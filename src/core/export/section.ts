/**
 * Sections — a vertical cut through a run, seen from the side.
 *
 * An elevation says how wide things are and where they sit along a wall. A section says the
 * things an elevation physically cannot: **how deep**, how far the top overhangs, how far the
 * kick is set back, how much clear air there is between the bench and the cupboard over it. On a
 * client drawing it is the sheet that answers "will my kettle fit under there".
 *
 * ## The judgement this file makes, stated because it is a judgement
 *
 * The shop asked for "sections that are relevant", and *relevant* is not a thing the model can be
 * asked. So this takes the trade's own answer — **typical sections** — and makes it objective:
 *
 *   **one section per cabinet type the job actually contains**, cut through the example of that
 *   type that crosses the most parts.
 *
 * Two properties make that defensible rather than arbitrary. It is **complete**: a job with a
 * banquette gets a banquette section without anybody remembering to ask for one, so a new cabinet
 * type cannot quietly go undrawn. And "crosses the most parts" picks the **most informative**
 * example — on a normal kitchen that is a base unit with a cupboard over it, which is the section
 * a client wants, rather than the base unit at the end of the run with nothing above it.
 *
 * **If the shop wants sections cut somewhere specific, that is a different rule and a small one.**
 * It is written here rather than left implicit so nobody has to re-derive it from the output.
 *
 * ## The projection
 *
 * The cut plane is vertical, perpendicular to the wall, at a chosen distance along it. Section
 * coordinates are:
 *
 *   **s** — out from the wall face into the room, running left to right on the page
 *   **v** — height above the floor, running up the page
 *
 * The wall is drawn at the left. That is a choice — a section can be cut looking either way — and
 * it is fixed rather than derived so every section in a pack reads the same way round. Unlike an
 * elevation, there is no mirroring hazard here: `s` is measured along the inward normal, which is
 * defined by the wall rather than by where a viewer stands.
 */

import { type Mm, mm } from '../units.ts';
import { v2 } from '../geom/vec.ts';
import type { CabinetPlacement } from '../geom/placement.ts';
import type { Panel } from '../model/panel.ts';
import type { Cabinet, CabinetTypeId } from '../model/cabinet.ts';
import { CABINET_TYPE_LABELS } from '../model/cabinet.ts';
import type { Project } from '../model/project.ts';
import type { MaterialLibrary } from '../model/material.ts';
import { findBenchtopMaterial } from '../model/material.ts';
import { type Wall, wallDirection, wallInwardNormal } from '../model/room.ts';
import { benchtopDepth, benchtopLength } from '../model/benchtop.ts';
import { yawCosSin } from '../geom/placement.ts';
import { v3 } from '../geom/vec.ts';
import { buildProject } from '../rules/build.ts';
import { buildRunUnits } from '../rules/runUnits.ts';
import { wallAnchorOf } from '../project/wallPlacement.ts';
import { panelSolidCorners } from './panelGeometry.ts';
import type { Dimension } from './dimension.ts';

/**
 * What a section item is.
 *
 * `cut` is a board the plane passes **through** — drawn solid, because that is what "in section"
 * means. `beyond` is deliberately absent: a typical section detail shows the boards it cuts, and
 * adding everything visible past the cut turns a readable detail into a picture of the inside of
 * a cupboard.
 */
export interface SectionItem {
  readonly kind: 'cut' | 'benchtop' | 'wallBody';
  readonly ownerId: string;
  readonly role: string;
  /** Out from the wall face. */
  readonly s0: Mm;
  readonly s1: Mm;
  /** Above the floor. */
  readonly v0: Mm;
  readonly v1: Mm;
}

export interface Section {
  /** 1, 2, 3… — sections are numbered where elevations are lettered, as a set of drawings does. */
  readonly key: string;
  readonly title: string;
  readonly typeId: CabinetTypeId;
  readonly cabinetId: string;
  readonly wallId: string;
  readonly items: readonly SectionItem[];
  readonly dimensions: readonly Dimension[];
  readonly extents: { minS: Mm; minV: Mm; maxS: Mm; maxV: Mm };
  readonly width: Mm;
  readonly height: Mm;
}

const DEPTH_DIM_OFFSET: Mm = mm(300);
const HEIGHT_DIM_STEP: Mm = mm(320);
/** How much wall is drawn above and below what is on it. */
const WALL_MARGIN: Mm = mm(150);

/** World point → this wall's section coordinates. */
const project = (wall: Wall, p: { x: number; y: number; z: number }) => {
  const n = wallInwardNormal(wall);
  const d = wallDirection(wall);
  return {
    s: (p.x - wall.start.x) * n.x + (p.z - wall.start.y) * n.y,
    v: p.y,
    // Along the wall too — not drawn, but it is how "does the plane cut this?" is answered.
    u: (p.x - wall.start.x) * d.x + (p.z - wall.start.y) * d.y,
  };
};

interface Box {
  s0: Mm; s1: Mm; v0: Mm; v1: Mm; u0: Mm; u1: Mm;
}

const boxOf = (wall: Wall, corners: { x: number; y: number; z: number }[]): Box => {
  const p = corners.map((c) => project(wall, c));
  return {
    s0: mm(Math.min(...p.map((q) => q.s))),
    s1: mm(Math.max(...p.map((q) => q.s))),
    v0: mm(Math.min(...p.map((q) => q.v))),
    v1: mm(Math.max(...p.map((q) => q.v))),
    u0: mm(Math.min(...p.map((q) => q.u))),
    u1: mm(Math.max(...p.map((q) => q.u))),
  };
};

/** Does the cut plane pass through this box? Touching the very edge does not count. */
const isCut = (box: Box, uCut: number): boolean => box.u0 < uCut - 0.5 && box.u1 > uCut + 0.5;

const panelBox = (
  wall: Wall,
  placement: CabinetPlacement,
  panel: Panel,
  materials: MaterialLibrary,
): Box => boxOf(wall, panelSolidCorners(placement, panel, materials));

/** The eight corners of a bought-in slab, which has no panels to project. See §4.31. */
const boughtInSlabCorners = (top: Project['benchtops'][number], thickness: Mm) => {
  const slabLength = benchtopLength(top);
  const slabDepth = benchtopDepth(top);
  const { c, s: sn } = yawCosSin(top.placement.yawDeg);
  const corner = (a: number, f: number, y: number) =>
    v3(
      top.placement.anchor.x + a * c + f * sn,
      top.placement.anchor.y + y,
      top.placement.anchor.z - a * sn + f * c,
    );
  const alongs = [-top.overhangs.left, -top.overhangs.left + slabLength];
  const fronts = [-top.overhangs.back, -top.overhangs.back + slabDepth];
  return alongs.flatMap((a) => fronts.flatMap((f) => [0, thickness].map((y) => corner(a, f, y))));
};

/** Everything in the job that the plane at `uCut` on `wall` passes through. */
const itemsOnPlane = (project_: Project, wall: Wall, uCut: number): SectionItem[] => {
  const items: SectionItem[] = [];
  const materials = project_.materials;

  for (const b of buildProject(project_)) {
    for (const panel of b.panels) {
      const box = panelBox(wall, b.cabinet.placement, panel, materials);
      if (!isCut(box, uCut)) continue;
      items.push({ kind: 'cut', ownerId: b.cabinet.id, role: panel.role, ...strip(box) });
    }
  }

  const runPlacements = new Map([
    ...project_.benchtops.map((t) => [t.id, t.placement] as const),
    ...project_.kickBases.map((k) => [k.id, k.placement] as const),
  ]);
  for (const unit of buildRunUnits(project_)) {
    const placement = runPlacements.get(unit.id);
    if (!placement) continue;
    for (const panel of unit.panels) {
      const box = panelBox(wall, placement, panel, materials);
      if (!isCut(box, uCut)) continue;
      items.push({
        kind: panel.role.startsWith('benchtop') ? 'benchtop' : 'cut',
        ownerId: unit.id,
        role: panel.role,
        ...strip(box),
      });
    }
  }

  // A bought-in top has no parts and is still cut through. §4.31's lesson, applied here rather
  // than re-learned: "no parts" and "nothing to draw" are different questions.
  for (const top of project_.benchtops) {
    const material = findBenchtopMaterial(materials, top.materialId);
    if (material.supply !== 'bought-in') continue;
    const box = boxOf(wall, boughtInSlabCorners(top, material.thickness));
    if (!isCut(box, uCut)) continue;
    items.push({ kind: 'benchtop', ownerId: top.id, role: 'benchtop', ...strip(box) });
  }

  return items;
};

const strip = (box: Box) => ({ s0: box.s0, s1: box.s1, v0: box.v0, v1: box.v1 });

/**
 * Which example of a type to cut through: the one the plane finds the most in.
 *
 * On a normal kitchen that is a base unit with a cupboard over it and a top on it — the section a
 * client actually wants — rather than whichever base happens to be first in the job, which might
 * be the one at the end of the run with nothing above it.
 *
 * **A section titled "typical base unit" has to cut the base unit.** An appliance space produces
 * no parts, so its plane still finds the benchtop bridging it — and the first pack drew a sheet
 * called *Typical appliance space* showing a wall, a top and nothing else. It is a real plane
 * through a real job and it is not a drawing of anything, which is the distinction: the cabinet
 * the sheet is named after must appear on it.
 */
const bestExample = (
  project_: Project,
  candidates: { cabinet: Cabinet; wall: Wall; uCut: number }[],
): { cabinet: Cabinet; wall: Wall; uCut: number; items: SectionItem[] } | null => {
  let best: { cabinet: Cabinet; wall: Wall; uCut: number; items: SectionItem[] } | null = null;
  for (const c of candidates) {
    const items = itemsOnPlane(project_, c.wall, c.uCut);
    if (!items.some((i) => i.ownerId === c.cabinet.id)) continue;
    if (!best || items.length > best.items.length) best = { ...c, items };
  }
  return best;
};

/**
 * The dimensions on a section: depths along the bottom, heights up the left.
 *
 * Heights are the ones a client asks about — the bench, and the clear air under whatever is over
 * it. Both are read off what is drawn, so a run on a plinth or built to a client's own height
 * dimensions as it is rather than as the standards say it should be.
 */
const sectionDimensions = (items: readonly SectionItem[], wallHeight: Mm): Dimension[] => {
  const dims: Dimension[] = [];
  if (items.length === 0) return dims;

  const carcassLike = items.filter((i) => i.kind === 'cut');
  const tops = items.filter((i) => i.kind === 'benchtop');
  const floor = mm(0);

  // Depth: from the wall face to the front of the deepest thing at bench height or below.
  const lower = items.filter((i) => i.v0 < (tops.length ? Math.min(...tops.map((t) => t.v1)) : wallHeight));
  if (lower.length > 0) {
    const front = mm(Math.max(...lower.map((i) => i.s1)));
    dims.push({
      a: v2(0, floor),
      b: v2(front, floor),
      offset: v2(0, -1),
      distance: DEPTH_DIM_OFFSET,
      value: front,
      kind: 'cabinet',
    });
  }

  let step = 0;
  const heightTo = (value: Mm, kind: Dimension['kind'] = 'height'): Dimension => ({
    a: v2(0, floor),
    b: v2(0, value),
    offset: v2(-1, 0),
    distance: mm(HEIGHT_DIM_STEP * (step++ + 1)),
    value,
    kind,
  });

  if (tops.length > 0) dims.push(heightTo(mm(Math.max(...tops.map((t) => t.v1)))));

  /*
   * The gap between the bench and whatever is over it — the splashback height, and the figure a
   * client asks about before any other on this sheet. Only drawn when there is something above:
   * a dimension to nothing is worse than no dimension.
   */
  const benchTop = tops.length > 0 ? Math.max(...tops.map((t) => t.v1)) : null;
  if (benchTop !== null) {
    const above = carcassLike.filter((i) => i.v0 > benchTop + 1);
    if (above.length > 0) {
      const underside = mm(Math.min(...above.map((i) => i.v0)));
      dims.push({
        a: v2(0, benchTop),
        b: v2(0, underside),
        offset: v2(-1, 0),
        distance: mm(HEIGHT_DIM_STEP * (step++ + 1)),
        value: mm(underside - benchTop),
        kind: 'height',
      });
    }
  }

  if (carcassLike.length > 0) {
    const highest = mm(Math.max(...carcassLike.map((i) => i.v1)));
    if (benchTop === null || highest > benchTop + 1) dims.push(heightTo(highest, 'overall'));
  }

  return dims;
};

/**
 * One section per cabinet type in the job, numbered.
 *
 * A type with no example standing on a wall is skipped rather than cut against nothing — an
 * island has no wall to measure from, and a section of one is a different drawing (§5, unbuilt).
 */
export const sectionsFor = (project_: Project): Section[] => {
  const room = project_.room;
  const byType = new Map<CabinetTypeId, { cabinet: Cabinet; wall: Wall; uCut: number }[]>();

  for (const cabinet of project_.cabinets) {
    const anchor = wallAnchorOf(room, cabinet);
    if (!anchor) continue;
    const wall = room.walls.find((w) => w.id === anchor.wallId);
    if (!wall) continue;
    const list = byType.get(cabinet.typeId) ?? [];
    // Cut through the middle of the cabinet, which is clear of its own sides.
    list.push({ cabinet, wall, uCut: anchor.along + cabinet.width / 2 });
    byType.set(cabinet.typeId, list);
  }

  const sections: Section[] = [];
  for (const [typeId, candidates] of byType) {
    const chosen = bestExample(project_, candidates);
    if (!chosen) continue;

    const { wall, items } = chosen;
    const dimensions = sectionDimensions(items, wall.height);

    const ss = [0, ...items.flatMap((i) => [i.s0, i.s1])];
    const vs = [0, ...items.flatMap((i) => [i.v0, i.v1])];
    // The wall itself, drawn as the thing everything is measured from.
    const wallTop = mm(Math.max(...vs) + WALL_MARGIN);
    ss.push(-wall.thickness);
    vs.push(wallTop);
    for (const d of dimensions) {
      ss.push(d.a.x + d.offset.x * d.distance, d.b.x + d.offset.x * d.distance);
      vs.push(d.a.y + d.offset.y * d.distance, d.b.y + d.offset.y * d.distance);
    }

    const extents = {
      minS: mm(Math.min(...ss)),
      minV: mm(Math.min(...vs)),
      maxS: mm(Math.max(...ss)),
      maxV: mm(Math.max(...vs)),
    };

    sections.push({
      key: String(sections.length + 1),
      title: `Typical ${CABINET_TYPE_LABELS[typeId].toLowerCase()}`,
      typeId,
      cabinetId: chosen.cabinet.id,
      wallId: wall.id,
      items: [
        // The wall body, so a section is measured off something rather than floating.
        {
          kind: 'wallBody' as const,
          ownerId: wall.id,
          role: 'wall',
          s0: mm(-wall.thickness),
          s1: mm(0),
          v0: mm(0),
          v1: wallTop,
        },
        ...items,
      ],
      dimensions,
      extents,
      width: mm(extents.maxS - extents.minS),
      height: mm(extents.maxV - extents.minV),
    });
  }

  return sections;
};
