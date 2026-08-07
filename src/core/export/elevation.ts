/**
 * Elevations — a wall seen square-on, from inside the room.
 *
 * ## The projection, and why it is worth writing down
 *
 * An elevation is two numbers per point:
 *
 *   **u** — distance along the wall from its start corner, running left to right on the page
 *   **v** — height above the floor, running up the page
 *
 * The one that can be silently wrong is `u`, because getting its *direction* backwards mirrors
 * the drawing — and a mirrored kitchen is completely plausible. Every unit is the right size,
 * every dimension reads correctly, and the sink is at the wrong end. It is the same failure this
 * codebase keeps finding in other clothes: right part, wrong place.
 *
 * So it is derived rather than guessed. A viewer standing in the room looks along `−n`, where `n`
 * is the wall's inward normal, with world +Y up. Their right hand is `forward × up`:
 *
 *     f = (−n.x, 0, −n.y),  up = (0, 1, 0)
 *     f × up = (n.y, 0, −n.x)
 *
 * and `wallInwardNormal` is the left normal of the wall's direction, `n = (−d.y, d.x)`, so
 *
 *     right = (n.y, −n.x) = (d.x, d.y) = d
 *
 * **The viewer's right is the wall's own direction of travel.** So `u` is exactly the `along`
 * that `wallAnchorOf` already reports, and nothing needs flipping. That is checked independently
 * by `placeAgainstWall`: a cabinet standing on a wall gets `yawAgainstWall`, which maps its local
 * +X onto `d` — and a cabinet's parts are laid out with local x running left to right as you face
 * it. Two derivations, one answer.
 *
 * ## What is drawn is what is built
 *
 * The items come from **projecting the real panels** the rule engine produced, not from
 * re-deriving where a door ought to be. A drawer bank whose fronts were set by hand draws the
 * fronts it will actually be cut to, and §4.29's bank that no longer overflows draws as it now
 * builds. Re-deriving the front layout here would be a second place that decides it, which is
 * the mistake this codebase exists not to make.
 */

import { type Mm, mm } from '../units.ts';
import { v2 } from '../geom/vec.ts';
import { v3 } from '../geom/vec.ts';
import type { Panel } from '../model/panel.ts';
import type { Project } from '../model/project.ts';
import { type Room, type Wall, wallDirection, wallLength } from '../model/room.ts';
import { partToWorld } from '../geom/placement.ts';
import { panelExtent } from '../model/panel.ts';
import { benchtopDepth, benchtopLength } from '../model/benchtop.ts';
import { findBenchtopMaterial } from '../model/material.ts';
import { yawCosSin } from '../geom/placement.ts';
import { type MaterialLibrary, actualThicknessOf, findSheet } from '../model/material.ts';
import { buildProject } from '../rules/build.ts';
import { buildRunUnits } from '../rules/runUnits.ts';
import { wallAnchorOf } from '../project/wallPlacement.ts';
import type { Dimension } from './dimension.ts';

/**
 * What an item on an elevation is, which decides how heavily it is drawn and what is drawn over
 * what. Deliberately coarse: a client is looking at a face, not a parts list.
 */
export type ElevationItemKind = 'front' | 'kick' | 'benchtop' | 'carcass' | 'appliance';

export interface ElevationItem {
  readonly kind: ElevationItemKind;
  readonly cabinetId: string;
  /** The cabinet's code, on the carcass outline only — a front carries no label. */
  readonly label?: string;
  /** Along the wall from its start corner. */
  readonly u0: Mm;
  readonly u1: Mm;
  /** Above the floor. */
  readonly v0: Mm;
  readonly v1: Mm;
}

export interface Elevation {
  /** A, B, C… — the same letters the floor plan's markers carry. */
  readonly key: string;
  readonly wallId: string;
  readonly wallName: string;
  readonly wallLength: Mm;
  readonly wallHeight: Mm;
  readonly items: readonly ElevationItem[];
  readonly dimensions: readonly Dimension[];
  readonly extents: { minU: Mm; minV: Mm; maxU: Mm; maxV: Mm };
  readonly width: Mm;
  readonly height: Mm;
}

/** How far dimension runs stand off, in model millimetres. */
const WIDTH_DIM_OFFSET: Mm = mm(260);
const OVERALL_DIM_OFFSET: Mm = mm(760);
const HEIGHT_DIM_OFFSET: Mm = mm(360);

/** Roles a client sees the face of. Carcass boards behind a door are not on an elevation. */
const FRONT_ROLES = new Set(['door', 'drawer-front', 'false-front', 'lid']);
const KICK_ROLES = new Set(['kick']);
const TOP_ROLES = new Set(['benchtop', 'benchtop-upstand', 'benchtop-waterfall']);

/**
 * Run-unit parts an elevation shows.
 *
 * **A ladder base's kick face belongs here**, and leaving it out is what the first drawing of the
 * sample kitchen did: the units floated with a band of daylight under them, because that shop
 * stands its runs on a shared plinth rather than giving each carcass its own kick. Same board,
 * same job, different owner — and an elevation cares what you see, not who owns it.
 *
 * `kick-rail` and `kick-rib` are deliberately absent: they are the structure behind the face and
 * nobody sees them.
 */
const RUN_UNIT_ROLES = new Set([...TOP_ROLES, 'kick']);

/**
 * A panel's eight **solid** corners in world space — both faces, not one.
 *
 * Part space is x along the length, y across the width, z through the thickness. Taking only the
 * z = 0 face is enough for a board standing up, because its thickness runs *into* the elevation
 * and contributes nothing to the outline. It is wrong for a board lying **flat**: a benchtop's
 * face is horizontal, so one face projects to a line and the whole 18mm band disappears. Both
 * faces, and the thickness comes from the board it is actually cut from.
 */
const panelSolidCorners = (
  cabinetPlacement: Parameters<typeof partToWorld>[0],
  panel: Panel,
  materials: MaterialLibrary,
) => {
  const { length, width } = panelExtent(panel);
  const t = actualThicknessOf(findSheet(materials, panel.materialId));
  return [0, t].flatMap((z) =>
    [v3(0, 0, z), v3(length, 0, z), v3(length, width, z), v3(0, width, z)].map((p) =>
      partToWorld(cabinetPlacement, panel.placement, p),
    ),
  );
};

/** World point → this wall's elevation coordinates. */
const project = (wall: Wall, p: { x: number; y: number; z: number }): { u: number; v: number } => {
  const d = wallDirection(wall);
  return {
    u: (p.x - wall.start.x) * d.x + (p.z - wall.start.y) * d.y,
    v: p.y,
  };
};

/** The (u, v) box a panel occupies on this wall's elevation. */
const panelBox = (
  wall: Wall,
  cabinetPlacement: Parameters<typeof partToWorld>[0],
  panel: Panel,
  materials: MaterialLibrary,
) => {
  const uv = panelSolidCorners(cabinetPlacement, panel, materials).map((p) => project(wall, p));
  const us = uv.map((p) => p.u);
  const vs = uv.map((p) => p.v);
  return {
    u0: mm(Math.min(...us)),
    u1: mm(Math.max(...us)),
    v0: mm(Math.min(...vs)),
    v1: mm(Math.max(...vs)),
  };
};

/** Is any part of this box within the stretch of wall we are drawing? */
const overlapsWall = (box: { u0: Mm; u1: Mm }, length: Mm): boolean =>
  box.u1 > -1 && box.u0 < length + 1;

/**
 * The elevation of one wall.
 *
 * `key` is passed in rather than worked out here, so the letter on the sheet and the letter in
 * the marker on the floor plan are **one decision made once**. Lettering them separately is how
 * a marker comes to point at the wrong sheet.
 */
export const elevationOfWall = (
  project_: Project,
  wall: Wall,
  key: string,
): Elevation => {
  const room: Room = project_.room;
  const length = wallLength(wall);
  const built = buildProject(project_);
  const items: ElevationItem[] = [];

  /** Cabinets on this wall, left to right — `along` is already the elevation's u. */
  const onWall = built
    .flatMap((b) => {
      const anchor = wallAnchorOf(room, b.cabinet);
      return anchor && anchor.wallId === wall.id ? [{ built: b, along: anchor.along }] : [];
    })
    .sort((a, b) => a.along - b.along);

  for (const { built: b, along } of onWall) {
    const placement = b.cabinet.placement;

    /*
     * An appliance space produces no parts — nobody makes a dishwasher — so a loop over panels
     * leaves a hole in the run with nothing to explain it. The first elevation of the sample
     * kitchen had exactly that: an unlabelled gap between two units, which reads as a mistake.
     * It is drawn as the opening it is, named, because that is what the client is buying room for.
     */
    if (b.cabinet.typeId === 'appliance') {
      items.push({
        kind: 'appliance',
        cabinetId: b.cabinet.id,
        label: b.cabinet.name.split(' ')[0] ?? b.cabinet.name,
        u0: mm(along),
        u1: mm(along + b.cabinet.width),
        v0: placement.anchor.y,
        v1: mm(placement.anchor.y + b.cabinet.height),
      });
      continue;
    }

    const boxes = b.panels.map((panel) => ({
      panel,
      box: panelBox(wall, placement, panel, project_.materials),
    }));

    // The unit's outline: everything it is made of except the kick, which is its own band and
    // is set back behind the doors.
    const carcass = boxes.filter(({ panel }) => !KICK_ROLES.has(panel.role));
    if (carcass.length > 0) {
      items.push({
        kind: 'carcass',
        cabinetId: b.cabinet.id,
        label: b.cabinet.name.split(' ')[0] ?? b.cabinet.name,
        u0: mm(Math.min(...carcass.map((c) => c.box.u0))),
        u1: mm(Math.max(...carcass.map((c) => c.box.u1))),
        v0: mm(Math.min(...carcass.map((c) => c.box.v0))),
        v1: mm(Math.max(...carcass.map((c) => c.box.v1))),
      });
    }

    for (const { panel, box } of boxes) {
      if (FRONT_ROLES.has(panel.role)) {
        items.push({ kind: 'front', cabinetId: b.cabinet.id, ...box });
      } else if (KICK_ROLES.has(panel.role)) {
        items.push({ kind: 'kick', cabinetId: b.cabinet.id, ...box });
      }
    }
  }

  /*
   * Benchtops and ladder bases belong to a run rather than to any cabinet, so they are found
   * separately and kept if they cross this wall. A top over a dishwasher is one top, and it has
   * to draw as one band rather than stopping at each carcass it happens to cover.
   */
  // A `BuiltRunUnit` carries its parts but not where it stands — the placement lives on the
  // stored benchtop or ladder base, exactly as the viewport looks it up.
  const runPlacements = new Map(
    [
      ...project_.benchtops.map((t) => [t.id, t.placement] as const),
      ...project_.kickBases.map((k) => [k.id, k.placement] as const),
    ],
  );
  /*
   * **A bought-in top has no parts and is still on the drawing.**
   *
   * Nobody in this shop cuts a stone top — it is templated on site — so `buildRunUnits` produces
   * no panels for it and a loop over panels alone draws no benchtop at all. That is right for a
   * cutlist and wrong for an elevation: the client is looking at a kitchen, and the bench is the
   * line their eye goes to first. Drawn as the one slab that arrives on the truck, which is
   * exactly what the viewport does with it.
   */
  for (const top of project_.benchtops) {
    const material = findBenchtopMaterial(project_.materials, top.materialId);
    if (material.supply !== 'bought-in') continue;
    const slabLength = benchtopLength(top);
    const slabDepth = benchtopDepth(top);
    const t = material.thickness;
    const { c, s: sn } = yawCosSin(top.placement.yawDeg);
    // The slab's own frame: along the run from its left overhang, and out from the wall.
    const corner = (a: number, f: number, y: number) =>
      v3(
        top.placement.anchor.x + a * c + f * sn,
        top.placement.anchor.y + y,
        top.placement.anchor.z - a * sn + f * c,
      );
    const alongs = [-top.overhangs.left, -top.overhangs.left + slabLength];
    const fronts = [-top.overhangs.back, -top.overhangs.back + slabDepth];
    const corners = alongs.flatMap((a) =>
      fronts.flatMap((f) => [0, t].map((y) => corner(a, f, y))),
    );
    const uv = corners.map((p) => project(wall, p));
    const box = {
      u0: mm(Math.min(...uv.map((p) => p.u))),
      u1: mm(Math.max(...uv.map((p) => p.u))),
      v0: mm(Math.min(...uv.map((p) => p.v))),
      v1: mm(Math.max(...uv.map((p) => p.v))),
    };
    if (!overlapsWall(box, length)) continue;
    items.push({ kind: 'benchtop', cabinetId: top.id, ...box });
  }

  for (const unit of buildRunUnits(project_)) {
    const placement = runPlacements.get(unit.id);
    if (!placement) continue;
    for (const panel of unit.panels) {
      if (!RUN_UNIT_ROLES.has(panel.role)) continue;
      const box = panelBox(wall, placement, panel, project_.materials);
      if (!overlapsWall(box, length)) continue;
      items.push({
        kind: KICK_ROLES.has(panel.role) ? 'kick' : 'benchtop',
        cabinetId: unit.id,
        ...box,
      });
    }
  }

  /*
   * Dimensions.
   *
   * Widths run under the drawing, one per unit plus an overall; heights run up the left-hand
   * side. Every figure is the **stored** width or the projected height of a real part, and
   * `dimensionIsHonest` asserts each one against the points it is drawn between.
   */
  const dimensions: Dimension[] = [];
  const floor = mm(0);

  for (const { built: b, along } of onWall) {
    dimensions.push({
      a: v2(along, floor),
      b: v2(along + b.cabinet.width, floor),
      offset: v2(0, -1),
      distance: WIDTH_DIM_OFFSET,
      value: b.cabinet.width,
      kind: 'cabinet',
    });
  }

  if (onWall.length > 0) {
    const first = onWall[0]!;
    const last = onWall[onWall.length - 1]!;
    const runStart = first.along;
    const runEnd = last.along + last.built.cabinet.width;
    dimensions.push({
      a: v2(runStart, floor),
      b: v2(runEnd, floor),
      offset: v2(0, -1),
      distance: OVERALL_DIM_OFFSET,
      value: mm(runEnd - runStart),
      kind: 'overall',
    });
  }

  /*
   * Heights, up the left. Taken off the drawn items rather than from bench-height settings, so a
   * cabinet standing on something, or one the shop has made non-standard, dimensions as it is.
   */
  const tops = items.filter((i) => i.kind === 'benchtop');
  const carcasses = items.filter((i) => i.kind === 'carcass');
  const heightAt = (value: Mm, index: number): Dimension => ({
    a: v2(0, floor),
    b: v2(0, value),
    offset: v2(-1, 0),
    distance: mm(HEIGHT_DIM_OFFSET * (index + 1)),
    value,
    kind: 'height',
  });
  if (tops.length > 0) {
    dimensions.push(heightAt(mm(Math.max(...tops.map((t) => t.v1))), 0));
  }
  if (carcasses.length > 0) {
    const highest = mm(Math.max(...carcasses.map((c) => c.v1)));
    // Only worth a second figure if something stands above the bench.
    if (tops.length === 0 || highest > Math.max(...tops.map((t) => t.v1)) + 1) {
      dimensions.push(heightAt(highest, tops.length > 0 ? 1 : 0));
    }
  }

  // Extents: the wall itself, everything on it, and the dimensions standing off it.
  const us = [0, length];
  const vs = [0, wall.height];
  for (const i of items) {
    us.push(i.u0, i.u1);
    vs.push(i.v0, i.v1);
  }
  for (const d of dimensions) {
    us.push(d.a.x + d.offset.x * d.distance, d.b.x + d.offset.x * d.distance);
    vs.push(d.a.y + d.offset.y * d.distance, d.b.y + d.offset.y * d.distance);
  }

  const extents = {
    minU: mm(Math.min(...us)),
    minV: mm(Math.min(...vs)),
    maxU: mm(Math.max(...us)),
    maxV: mm(Math.max(...vs)),
  };

  return {
    key,
    wallId: wall.id,
    wallName: wall.name,
    wallLength: length,
    wallHeight: wall.height,
    items,
    dimensions,
    extents,
    width: mm(extents.maxU - extents.minU),
    height: mm(extents.maxV - extents.minV),
  };
};

/**
 * One elevation per wall that carries cabinets, lettered to match the floor plan's markers.
 *
 * The letters come from `elevationMarkers` rather than being counted again here — see
 * `planSheet.ts`. Two places counting to the same letter is two places that can disagree, and
 * the way that fails is a marker on the plan pointing at the wrong sheet.
 */
export const elevationsFor = (
  project_: Project,
  markers: readonly { key: string; wallId: string }[],
): Elevation[] =>
  markers.flatMap((marker) => {
    const wall = project_.room.walls.find((w) => w.id === marker.wallId);
    return wall ? [elevationOfWall(project_, wall, marker.key)] : [];
  });
