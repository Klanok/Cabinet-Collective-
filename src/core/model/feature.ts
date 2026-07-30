/**
 * Panel features — parametric machining intent attached to a panel, never baked into its
 * mesh.
 *
 * This is the interface the Phase 4 CAM layer reads. A hinge cup stored as "35mm bore, 12.5mm
 * deep, at (37, 96) on the A-face" translates directly into a drilling operation; the same
 * hinge cup baked into triangles has to be reverse-engineered, and reverse-engineering intent
 * out of geometry is exactly how CAM output stops being trustworthy.
 *
 * Phase 1 defines the vocabulary. Phase 2 (hardware/joinery rules) is what populates it in
 * bulk — the specs here emit only features that follow from carcass construction itself.
 */

import { type Mm, mm } from '../units.ts';
import type { Vec2 } from '../geom/vec.ts';
import type { RectEdge } from '../geom/profile.ts';

/**
 * Which face a feature is machined from. Depths are always measured into the material from
 * the named face (see docs/coordinate-convention.md).
 *
 * 'B' requires the part to be flipped on the machine — a real setup cost, and a real chance
 * to machine the wrong side, so it is explicit in the data rather than inferred.
 */
export type MachiningFace = 'A' | 'B';

/** What a feature is for. Survives into CAM so operations can be grouped and tool-matched. */
export type FeaturePurpose =
  | 'hinge-cup'
  /**
   * The two small dowel holes that locate a hinge cup.
   *
   * Its own purpose rather than sharing the cup's, for two reasons that both matter later: they
   * take a different bit, so CAM groups them separately and does not tool-change three times per
   * hinge; and counting hinges for a BOM means counting *cups*, which a shared purpose would
   * make three times too many.
   */
  | 'hinge-dowel'
  | 'hinge-plate'
  | 'shelf-pin'
  | 'drawer-runner'
  | 'handle'
  | 'carcass-joint'
  | 'service-hole'
  | 'back-panel'
  | 'adjustable-leg'
  /** Machining that makes a front look like something — a shaker recess, a V-groove. */
  | 'front-style'
  | 'other';

/**
 * A named cutter, described by its cross-section.
 *
 * This exists because some cuts are not describable as a width and a depth. A flat-bottomed
 * groove is — it is the same rectangle however deep you go. A V-groove is not: its shape *is*
 * the cutter's shape, and how wide it comes out is a consequence of the cutter and how far it
 * plunges. So the cutter is the thing that knows, and the feature names it rather than
 * restating what it produces.
 *
 * Note this is a third distinct kind of curve in the codebase, and it is worth not confusing
 * them: a curve in **plan** is a part outline that bends (§5.1 of the handover), a curve in
 * **section** is this — the shape of the cut through the thickness.
 */
export type ToolSection =
  /** Flat-bottomed, square-walled. The ordinary router bit. */
  | { readonly kind: 'straight'; readonly diameter: Mm }
  /** A vee point. The included angle is the full angle between the two flutes. */
  | { readonly kind: 'vee'; readonly includedAngleDeg: number }
  /** Round-nose / core box. Cuts a half-round of this radius. */
  | { readonly kind: 'round'; readonly radius: Mm };

export interface ToolProfile {
  readonly id: string;
  /** What it is called in the shop — "12mm straight", "90° vee". */
  readonly name: string;
  readonly section: ToolSection;
}

/**
 * How wide a cut this tool leaves at the surface when plunged to `depth`.
 *
 * Derived rather than stored, so a V-groove's width can never disagree with the cutter that
 * makes it. A 90° vee at 6mm deep opens to 12mm; the same cutter at 3mm deep opens to 6mm.
 */
export const cutWidthAtDepth = (tool: ToolProfile, depth: Mm): Mm => {
  const s = tool.section;
  switch (s.kind) {
    case 'straight':
      return s.diameter;
    case 'vee': {
      const half = (Math.max(0, Math.min(179, s.includedAngleDeg)) / 2) * (Math.PI / 180);
      return mm(2 * Math.max(0, depth) * Math.tan(half));
    }
    case 'round': {
      // Past its own radius the cutter is a plain cylinder, so the cut stops widening.
      const d = Math.max(0, Math.min(depth, s.radius));
      return mm(2 * Math.sqrt(Math.max(0, d * (2 * s.radius - d))));
    }
  }
};

interface FeatureBase {
  readonly id: string;
  readonly purpose: FeaturePurpose;
}

/** A single bore. Diameter and depth are as-machined, not nominal. */
export interface DrillFeature extends FeatureBase {
  readonly kind: 'drill';
  readonly face: MachiningFace;
  /** Part-space position of the bore centre. */
  readonly at: Vec2;
  readonly diameter: Mm;
  /** Measured into the material from `face`. Depth >= thickness is a through hole. */
  readonly depth: Mm;
}

/** A repeated bore along a line — shelf-pin rows, System 32 construction holes. */
export interface DrillLineFeature extends FeatureBase {
  readonly kind: 'drill-line';
  readonly face: MachiningFace;
  readonly start: Vec2;
  /** Step between consecutive holes. 32mm on the System 32 pitch. */
  readonly step: Vec2;
  readonly count: number;
  readonly diameter: Mm;
  readonly depth: Mm;
}

/** A cut of constant width and depth following a path — dados, back-panel grooves. */
export interface GrooveFeature extends FeatureBase {
  readonly kind: 'groove';
  readonly face: MachiningFace;
  /** Part-space polyline along the groove centreline. */
  readonly path: readonly Vec2[];
  readonly width: Mm;
  readonly depth: Mm;
}

/** A step cut along a whole edge — the usual way a back panel is housed. */
export interface RebateFeature extends FeatureBase {
  readonly kind: 'rebate';
  readonly face: MachiningFace;
  readonly edge: RectEdge;
  /** How far in from the edge the step runs. */
  readonly width: Mm;
  readonly depth: Mm;
}

/** A hole right through the panel, of arbitrary outline — sink cutouts, cable ports. */
export interface CutoutFeature extends FeatureBase {
  readonly kind: 'cutout';
  readonly outline: readonly Vec2[];
  /** Radius to leave at internal corners. Zero means the tool's own radius governs. */
  readonly cornerRadius: Mm;
}

/**
 * An area cleared to a flat floor at a constant depth — a shaker door's centre recess, a
 * housing for a hardware plate.
 *
 * Distinct from a groove, which follows a *line* at a constant width. A pocket follows an
 * *area*, and the tool has to clear the whole of it. Distinct from a cutout, which goes
 * through: a pocket has a floor, and that floor is what a shaker door's centre panel is.
 */
export interface PocketFeature extends FeatureBase {
  readonly kind: 'pocket';
  readonly face: MachiningFace;
  /** Part-space outline of the pocket, counter-clockwise. Square-walled. */
  readonly outline: readonly Vec2[];
  /** Measured into the material from `face`. */
  readonly depth: Mm;
  /** Radius left at internal corners. Zero means the cutter's own radius governs. */
  readonly cornerRadius: Mm;
  /** Cutter used to clear it. Straight-sided, so the walls come out square. */
  readonly toolId?: string;
}

/**
 * A cut whose cross-section is the cutter's own — a V-groove, a cove, a moulded edge.
 *
 * The tool decides the shape; the feature decides where it runs and how far it plunges. There
 * is deliberately no width field: see `cutWidthAtDepth`, which derives it. Storing a width
 * beside a named cutter would be a second thing claiming to know one fact.
 */
export interface ProfiledCutFeature extends FeatureBase {
  readonly kind: 'profiled-cut';
  readonly face: MachiningFace;
  /** Part-space polyline the cutter follows. */
  readonly path: readonly Vec2[];
  readonly toolId: string;
  /** Plunge depth, measured into the material from `face`. */
  readonly depth: Mm;
}

export type PanelFeature =
  | DrillFeature
  | DrillLineFeature
  | GrooveFeature
  | RebateFeature
  | CutoutFeature
  | PocketFeature
  | ProfiledCutFeature;

/** True when this feature goes all the way through and so changes the part's true area. */
export const isThroughFeature = (f: PanelFeature, thickness: Mm): boolean => {
  switch (f.kind) {
    case 'cutout':
      return true;
    case 'drill':
    case 'drill-line':
    case 'groove':
    case 'pocket':
    case 'profiled-cut':
      return f.depth >= thickness;
    case 'rebate':
      return false;
  }
};

/** Features needing the part flipped. Phase 5's post-processor must not silently merge these. */
export const requiresFlip = (f: PanelFeature): boolean =>
  f.kind !== 'cutout' && f.face === 'B';
