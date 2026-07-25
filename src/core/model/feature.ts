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

import type { Mm } from '../units.ts';
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
  | 'hinge-plate'
  | 'shelf-pin'
  | 'drawer-runner'
  | 'handle'
  | 'carcass-joint'
  | 'service-hole'
  | 'back-panel'
  | 'adjustable-leg'
  | 'other';

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

export type PanelFeature =
  | DrillFeature
  | DrillLineFeature
  | GrooveFeature
  | RebateFeature
  | CutoutFeature;

/** True when this feature goes all the way through and so changes the part's true area. */
export const isThroughFeature = (f: PanelFeature, thickness: Mm): boolean => {
  switch (f.kind) {
    case 'cutout':
      return true;
    case 'drill':
    case 'drill-line':
    case 'groove':
      return f.depth >= thickness;
    case 'rebate':
      return false;
  }
};

/** Features needing the part flipped. Phase 5's post-processor must not silently merge these. */
export const requiresFlip = (f: PanelFeature): boolean =>
  f.kind !== 'cutout' && f.face === 'B';
