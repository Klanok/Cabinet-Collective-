/**
 * Turning a benchtop and a ladder base into parts.
 *
 * These are the run-level equivalent of `rules/parts.ts`, and they work the same way: each builder
 * documents the **unit-space volume** its part occupies, because that — not the part's size — is
 * what is easy to get wrong, and it is what the tests assert against.
 *
 * Unit space is cabinet space by another name: origin at the back-left corner of the run, +X along
 * the run, +Y up, +Z towards the front. The origin's height is the unit's own datum — the underside
 * of a benchtop, the floor under a ladder base. Overhangs put parts of a benchtop at negative X and
 * negative Z, which is correct and deliberate: the origin stays put when somebody changes an
 * overhang, so setting a 40mm end overhang does not shuffle everything else along by 40mm.
 *
 * ## A bought-in top produces nothing here
 *
 * That is the point of `supply`. Stone is templated on site after the cabinets are in and charged
 * per square metre by somebody else; there is no part to cut, and inventing one so that the cutlist
 * looks complete would put a 3m slab of engineered stone on a sheet order. It is costed in
 * `costing/benchtopCost.ts` instead, as the purchase-order line it is.
 */

import { type Mm, mm } from '../units.ts';
import {
  type Benchtop,
  benchtopCornerProblems,
  benchtopDepth,
  benchtopLength,
  benchtopSections,
  sectionCorners,
} from '../model/benchtop.ts';
import { type KickBase, ribPositions } from '../model/kickBase.ts';
import type { ConstructionMethod } from '../model/construction.ts';
import type { CutoutFeature, PanelFeature } from '../model/feature.ts';
import {
  type MaterialLibrary,
  actualThicknessOf,
  findBenchtopMaterial,
  findSheet,
} from '../model/material.ts';
import type { GrainConstraint, Panel, PanelRole } from '../model/panel.ts';
import type { Project } from '../model/project.ts';
import { type PanelPlacement, placement } from '../geom/placement.ts';
import {
  type Profile2D,
  cornerRadiusFits,
  rectProfile,
  roundedCornerProfile,
} from '../geom/profile.ts';
import { v3, type SignedAxis, type Vec2 } from '../geom/vec.ts';
import { type BandingRule, BAND_NONE, resolveBanding } from './spec.ts';

/**
 * One part of a run unit.
 *
 * Almost a `PartInstance`, and deliberately not one: a cabinet part names a *material slot* and lets
 * the cabinet resolve it, because which board a door comes from is the cabinet's business. A run
 * unit has no slots — a benchtop is cut from the benchtop material and a plinth face from the face
 * material — so it names the board outright and there is nothing left to resolve.
 */
interface UnitPart {
  readonly name: string;
  readonly role: PanelRole;
  readonly length: Mm;
  readonly width: Mm;
  /**
   * The part's shape, when it is not the plain `length` × `width` rectangle.
   *
   * A rounded corner is tangent to both edges, so the bounding box does not move and `length` and
   * `width` stay the size the part is nested and cut as — which is right for a saw, where the
   * blank comes off the sheet and the curve is cut from the blank (§4.8).
   */
  readonly profile?: Profile2D;
  readonly placement: PanelPlacement;
  readonly materialId: string;
  readonly bandedDirections: BandingRule;
  readonly grain: GrainConstraint;
  readonly features?: readonly PanelFeature[];
  readonly note?: string;
}

export interface BuiltRunUnit {
  readonly id: string;
  readonly name: string;
  readonly kind: 'benchtop' | 'kick-base';
  readonly panels: readonly Panel[];
  readonly warnings: readonly string[];
}

const toPanels = (
  parts: readonly UnitPart[],
  ownerId: string,
  ownerKind: 'benchtop' | 'kick-base',
  edgeBandId: string,
): Panel[] =>
  parts.map((part, i) => ({
    id: `${ownerId}:${part.role}:${i}`,
    ownerId,
    ownerKind,
    role: part.role,
    name: part.name,
    materialId: part.materialId,
    profile: part.profile ?? rectProfile(part.length, part.width),
    placement: part.placement,
    features: part.features ?? [],
    edgeBanding: resolveBanding(part.placement, part.bandedDirections, edgeBandId),
    grain: part.grain,
    note: part.note,
  }));

/* ── Benchtops ──────────────────────────────────────────────────────────────────────────── */

/**
 * A cutout, in the part space of the section it lands in.
 *
 * Part space for a slab runs +X along the top and +Y **from the front towards the back**, because
 * the slab lies A-face up and its `v` axis is −Z. So a sink 100mm from the back edge of a 620 top
 * is at y = 520, and getting that inverted would put every sink hard against the front edge — which
 * would look entirely plausible in a test that only asserted the hole's size.
 */
const cutoutFeature = (
  id: string,
  centre: Vec2,
  width: Mm,
  depth: Mm,
  cornerRadius: Mm,
  purpose: 'service-hole',
): CutoutFeature => ({
  id,
  kind: 'cutout',
  purpose,
  cornerRadius,
  outline: [
    { x: centre.x - width / 2, y: centre.y - depth / 2 },
    { x: centre.x + width / 2, y: centre.y - depth / 2 },
    { x: centre.x + width / 2, y: centre.y + depth / 2 },
    { x: centre.x - width / 2, y: centre.y + depth / 2 },
  ],
});

/**
 * A shop-made benchtop's parts: the slab in as many sections as it is joined into, a waterfall
 * panel at each end that has one, and the upstand.
 *
 * The **section** is the unit of cutting, not the top. A 3.6m top joined once is two parts, and
 * they are what goes on the sheet order — a single 3.6m line would be a part no sheet holds and a
 * quote that quietly assumed one did.
 */
const benchtopParts = (
  top: Benchtop,
  thickness: Mm,
  sheetMaterialId: string,
  warnings: string[],
): UnitPart[] => {
  const parts: UnitPart[] = [];
  const depth = benchtopDepth(top);
  const total = benchtopLength(top);
  const sections = benchtopSections(top);
  // The top's left-hand end, in unit space. Negative when it overhangs the run.
  const leftEdge = mm(-top.overhangs.left);
  const frontEdge = mm(top.carcassDepth + top.overhangs.front);

  let along = 0;
  sections.forEach((sectionLength, i) => {
    const start = along;
    along += sectionLength;

    const isFirst = i === 0;
    const isLast = i === sections.length - 1;

    /*
     * Banding, stated as directions rather than edges — the established rule everywhere in this
     * codebase, and it earns its keep here too. The front always gets a finished edge. An end gets
     * one only when somebody sees it: a `wall` end dies into something, a `mitred` end is a joint,
     * and a `waterfall` end is covered by the panel hanging off it.
     */
    const banded: SignedAxis[] = ['+Z'];
    if (isFirst && top.ends.left === 'exposed') banded.push('-X');
    if (isLast && top.ends.right === 'exposed') banded.push('+X');

    const features: PanelFeature[] = [];
    for (const cutout of top.cutouts) {
      const x = cutout.along - start;
      const withinSection =
        cutout.along - cutout.width / 2 >= start - 0.001 &&
        cutout.along + cutout.width / 2 <= start + sectionLength + 0.001;
      if (!withinSection) {
        // Only complain once, from the section the cutout's centre falls in.
        if (x >= 0 && x < sectionLength) {
          warnings.push(
            `${top.name}: the ${cutout.kind} cutout at ${Math.round(cutout.along)}mm crosses a ` +
              'join. Move the join or move the cutout — a sink cannot straddle two pieces.',
          );
        }
        continue;
      }
      features.push(
        cutoutFeature(
          `${top.id}:${cutout.id}`,
          { x, y: depth - cutout.fromBack },
          cutout.width,
          cutout.depth,
          cutout.cornerRadius,
          'service-hole',
        ),
      );
    }

    /*
     * The rounded front corner, over a radiused base cabinet.
     *
     * A radius the section cannot hold is **dropped and reported**, never thrown: the rule engine
     * has to keep producing a drawable cabinet for a half-typed number, and "200" arrives as "2"
     * on its way through. Same reason `substrateRadius` resolves to null rather than throwing —
     * see §4.5's crash, which was exactly this on a curve.
     */
    const corners = sectionCorners(top, i, sections.length);
    const cornersFit = cornerRadiusFits(mm(sectionLength), depth, corners) === undefined;
    const rounded = cornersFit && Object.keys(corners).length > 0;

    parts.push({
      name: sections.length > 1 ? `Benchtop ${i + 1}` : 'Benchtop',
      role: 'benchtop',
      length: mm(sectionLength),
      width: depth,
      profile: rounded ? roundedCornerProfile(mm(sectionLength), depth, corners) : undefined,
      // Lies flat, decor face up: u along the run, v from the front towards the back, so
      // u × v = +Y. The origin is therefore the **front**-left corner of the section.
      placement: placement(v3(leftEdge + start, 0, frontEdge), '+X', '-Z'),
      materialId: sheetMaterialId,
      bandedDirections: banded,
      grain: 'length-along-grain',
      features,
      note: [
        sections.length > 1 ? `Section ${i + 1} of ${sections.length}` : undefined,
        // §3: a curved edge cannot go through the edgebander. It is hand work, and whoever is
        // cutting needs to know that before the part reaches the bander rather than at it.
        rounded ? 'Rounded corner — band the curve by hand' : undefined,
      ]
        .filter(Boolean)
        .join('. ') || undefined,
    });
  });

  warnings.push(...benchtopCornerProblems(top));

  /*
   * A waterfall or a mitre at a rounded corner is not modelled, and guessing at one would be
   * worse than saying so. A waterfall panel is mitred to the top along a straight line; where the
   * top turns a quarter circle there is no straight line to mitre to, and the panel would have to
   * be a developed curve on the §4.5 rules. Nobody has asked for one.
   */
  for (const side of ['left', 'right'] as const) {
    if (top.corners[side] <= 0) continue;
    const end = top.ends[side];
    if (end === 'waterfall' || end === 'mitred') {
      warnings.push(
        `${top.name}: the ${side} end is ${end === 'waterfall' ? 'a waterfall' : 'mitred'} and ` +
          'also carries a corner radius. That join is not modelled — square the corner or ' +
          'square the end.',
      );
    }
  }

  /*
   * Waterfall ends.
   *
   * The panel hangs under the overhanging end of the top with its **outside face flush with the end
   * of the top**, and the two meet on a mitre. So it is cut to the long point — the full height from
   * the top surface to the floor — and it occupies the thickness *inboard* of the top's end, which
   * is the part that reads wrong until you picture it.
   */
  const floorToTop = mm(-top.placement.anchor.y);
  const waterfallLength = mm(top.placement.anchor.y + thickness);
  if (top.ends.left === 'waterfall') {
    parts.push({
      name: 'Benchtop waterfall — left',
      role: 'benchtop-waterfall',
      length: waterfallLength,
      width: depth,
      // Stands upright, show face outward (−X): u = +Y, v = −Z gives u × v = −X.
      placement: placement(v3(leftEdge + thickness, floorToTop, frontEdge), '+Y', '-Z'),
      materialId: sheetMaterialId,
      bandedDirections: ['+Z'],
      grain: 'length-along-grain',
      note: 'Mitred to the top at the long point',
    });
  }
  if (top.ends.right === 'waterfall') {
    parts.push({
      name: 'Benchtop waterfall — right',
      role: 'benchtop-waterfall',
      length: waterfallLength,
      width: depth,
      // The other hand: show face outward (+X) means u = +Y, v = +Z, so the origin moves to the
      // back edge. Same part, opposite handedness — written out rather than mirrored, because a
      // mirrored placement is exactly the bug this convention exists to make visible.
      placement: placement(
        v3(leftEdge + total - thickness, floorToTop, mm(-top.overhangs.back)),
        '+Y',
        '+Z',
      ),
      materialId: sheetMaterialId,
      bandedDirections: ['+Z'],
      grain: 'length-along-grain',
      note: 'Mitred to the top at the long point',
    });
  }

  if (top.upstand) {
    parts.push({
      name: 'Benchtop upstand',
      role: 'benchtop-upstand',
      length: total,
      width: top.upstand.height,
      // Stands on the top surface at the back, facing forward: u = +X, v = +Y, u × v = +Z.
      placement: placement(v3(leftEdge, thickness, mm(-top.overhangs.back)), '+X', '+Y'),
      materialId: sheetMaterialId,
      bandedDirections: ['+Y'],
      grain: 'length-along-grain',
    });
  }

  return parts;
};

export const buildBenchtop = (top: Benchtop, project: Project): BuiltRunUnit => {
  const warnings: string[] = [];
  const library: MaterialLibrary = project.materials;
  const material = findBenchtopMaterial(library, top.materialId);

  if (material.supply === 'bought-in') {
    // Nothing is cut. See the note at the top of this file — and `costing/benchtopCost.ts`, which
    // is where a bought-in top does appear.
    return { id: top.id, name: top.name, kind: 'benchtop', panels: [], warnings };
  }

  if (!material.sheetMaterialId) {
    warnings.push(
      `${top.name}: "${material.decor}" is shop-made but names no sheet to cut it from, so it ` +
        'produces no parts. Point it at a board in Settings → Materials.',
    );
    return { id: top.id, name: top.name, kind: 'benchtop', panels: [], warnings };
  }

  const sheet = findSheet(library, material.sheetMaterialId);
  const thickness = actualThicknessOf(sheet);
  const parts = benchtopParts(top, thickness, material.sheetMaterialId, warnings);

  return {
    id: top.id,
    name: top.name,
    kind: 'benchtop',
    panels: toPanels(parts, top.id, 'benchtop', project.defaults.edgeBandId),
    warnings,
  };
};

/* ── Ladder bases ───────────────────────────────────────────────────────────────────────── */

/**
 * A ladder base's parts.
 *
 * Unit space here has its origin **on the floor**, which makes the three specified facts read
 * directly off the numbers: the ribs run from y = 0, the rails start at y = `railFloorGap` and so
 * hang clear of it, and the face — cut over-height with the extra at the floor — starts at
 * y = −`scribeAllowance` and hangs *below* the floor line, exactly as it does on the bench before
 * anyone planes it in.
 */
const kickBaseParts = (
  base: KickBase,
  construction: ConstructionMethod,
  thickness: Mm,
  frameMaterialId: string,
  faceMaterialId: string,
  faceThickness: Mm,
): UnitPart[] => {
  const parts: UnitPart[] = [];
  const railHeight = mm(base.height - construction.ladderRailFloorGap);
  const railBottom = mm(construction.ladderRailFloorGap);

  // Rails run the full length; the top edge of each is flush with the top of the ribs.
  parts.push({
    name: 'Plinth rail — front',
    role: 'kick-rail',
    length: base.length,
    width: railHeight,
    // Upright along the run, facing forward: u = +X, v = +Y, u × v = +Z.
    placement: placement(v3(0, railBottom, mm(base.depth - thickness)), '+X', '+Y'),
    materialId: frameMaterialId,
    bandedDirections: BAND_NONE,
    grain: 'any',
    note: `Cut ${construction.ladderRailFloorGap}mm short — hangs clear of the floor`,
  });
  parts.push({
    name: 'Plinth rail — back',
    role: 'kick-rail',
    length: base.length,
    width: railHeight,
    placement: placement(v3(0, railBottom, 0), '+X', '+Y'),
    materialId: frameMaterialId,
    bandedDirections: BAND_NONE,
    grain: 'any',
    note: `Cut ${construction.ladderRailFloorGap}mm short — hangs clear of the floor`,
  });

  /*
   * Ribs. Full height, floor to the underside of the carcasses — these are what the run stands and
   * gets levelled on, which is why they and not the rails reach the floor.
   */
  const maxGap = base.maxRibGap ?? construction.ladderMaxRibGap;
  const ribs = ribPositions(base.length, thickness, maxGap);
  const ribLength = mm(base.depth - 2 * thickness);
  ribs.forEach((centre, i) => {
    parts.push({
      name: 'Plinth rib',
      role: 'kick-rib',
      length: ribLength,
      width: base.height,
      // Across the run, standing upright: u = +Z (front-to-back), v = +Y (up), so u × v = −X.
      placement: placement(v3(mm(centre + thickness / 2), 0, thickness), '+Z', '+Y'),
      materialId: frameMaterialId,
      bandedDirections: BAND_NONE,
      grain: 'any',
      note: i === 0 || i === ribs.length - 1 ? 'End rib' : undefined,
    });
  });

  if (base.hasFace) {
    const allowance = construction.ladderFaceScribeAllowance;
    const atFloor = construction.ladderFaceScribeEnd === 'floor';
    parts.push({
      name: 'Kick face',
      role: 'kick',
      length: base.length,
      width: mm(base.height + allowance),
      placement: placement(v3(0, atFloor ? mm(-allowance) : 0, base.depth), '+X', '+Y'),
      materialId: faceMaterialId,
      bandedDirections: BAND_NONE,
      grain: 'length-along-grain',
      note:
        `Cut ${allowance}mm over-height — the extra is at the ` +
        `${atFloor ? 'floor' : 'top'}, to be planed in on site`,
    });
    // Named so it is obvious the figure was used, if the face thickness ever starts mattering.
    void faceThickness;
  }

  return parts;
};

export const buildKickBase = (base: KickBase, project: Project): BuiltRunUnit => {
  const warnings: string[] = [];
  const construction = project.constructions.find((c) => c.id === project.defaults.constructionId);
  if (!construction) {
    return {
      id: base.id,
      name: base.name,
      kind: 'kick-base',
      panels: [],
      warnings: [`${base.name}: the job's construction method is missing.`],
    };
  }

  const frameMaterialId = base.frameMaterialId ?? project.defaults.carcassMaterialId;
  const faceMaterialId = base.faceMaterialId ?? project.defaults.doorMaterialId;
  const thickness = actualThicknessOf(findSheet(project.materials, frameMaterialId));
  const faceThickness = actualThicknessOf(findSheet(project.materials, faceMaterialId));

  if (base.height <= 0) {
    warnings.push(
      `${base.name}: the cabinets over it sit on the floor, so there is no height for a plinth. ` +
        'Lift them by the kick height first.',
    );
    return { id: base.id, name: base.name, kind: 'kick-base', panels: [], warnings };
  }
  if (base.depth <= 2 * thickness) {
    warnings.push(
      `${base.name}: a ${Math.round(base.depth)}mm frame leaves no rib between ` +
        `${Math.round(thickness)}mm rails.`,
    );
    return { id: base.id, name: base.name, kind: 'kick-base', panels: [], warnings };
  }
  if (base.height <= construction.ladderRailFloorGap) {
    warnings.push(
      `${base.name}: a ${Math.round(base.height)}mm plinth is not taller than the ` +
        `${construction.ladderRailFloorGap}mm the rails are cut short by.`,
    );
    return { id: base.id, name: base.name, kind: 'kick-base', panels: [], warnings };
  }

  const parts = kickBaseParts(
    base,
    construction,
    thickness,
    frameMaterialId,
    faceMaterialId,
    faceThickness,
  );

  return {
    id: base.id,
    name: base.name,
    kind: 'kick-base',
    panels: toPanels(parts, base.id, 'kick-base', project.defaults.edgeBandId),
    warnings,
  };
};

/** Every run unit in the project, built. */
export const buildRunUnits = (project: Project): readonly BuiltRunUnit[] => [
  ...project.benchtops.map((t) => buildBenchtop(t, project)),
  ...project.kickBases.map((k) => buildKickBase(k, project)),
];
