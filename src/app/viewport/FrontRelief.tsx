/**
 * A routed front, seen.
 *
 * The viewport is told nothing about door styles. It reads the **features on the panel** — a
 * pocket, a run of profiled cuts — and shows what they describe. That is the same principle
 * the rest of the render follows: the view derives from the model, so it cannot drift from
 * what the cutlist and the machine are working to. Adding a style with a different recipe puts
 * a different shape on screen with nothing here having to be edited to match.
 *
 * A shaker recess is drawn as real geometry rather than shading. `extrudeProfile` doesn't cut
 * holes out of a mesh, so the front is drawn as a slab of the reduced thickness with a border
 * frame standing on it — which is exactly what a routed shaker door is anyway.
 *
 * Grooves are the one thing drawn rather than modelled. A V-groove's section comes from the
 * cutter, and cutting it out properly needs geometry this engine deliberately doesn't have, so
 * they are struck on the show face at the width the cutter actually gives. At kitchen scale
 * that reads correctly; it is a preview, and it is marked as one here rather than pretending.
 */

import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import type { Mm } from '../../core/units.ts';
import type { Panel } from '../../core/model/panel.ts';
import {
  type PocketFeature,
  type ProfiledCutFeature,
  cutWidthAtDepth,
} from '../../core/model/feature.ts';
import { findToolOrNull } from '../../core/library/tools.ts';
import { profileExtent } from '../../core/geom/profile.ts';

/** The pocket a front is recessed by, if it has one that doesn't go through the board. */
export const frontRecessOf = (panel: Panel, thickness: Mm): PocketFeature | null => {
  const pockets = panel.features.filter(
    (f): f is PocketFeature => f.kind === 'pocket' && f.depth > 0 && f.depth < thickness,
  );
  // Deepest wins if there is ever more than one — that is the floor you'd actually see.
  return pockets.sort((a, b) => b.depth - a.depth)[0] ?? null;
};

interface Bounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

const boundsOf = (points: readonly { x: number; y: number }[]): Bounds => ({
  x0: Math.min(...points.map((p) => p.x)),
  y0: Math.min(...points.map((p) => p.y)),
  x1: Math.max(...points.map((p) => p.x)),
  y1: Math.max(...points.map((p) => p.y)),
});

interface Strip {
  readonly key: string;
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The border left standing around the recess, as four strips.
 *
 * The top and bottom run the full length and the sides fill in between them, so the corners
 * are covered once rather than twice — a doubled corner would z-fight and show as a flicker.
 */
const borderStrips = (pocket: Bounds, length: number, width: number): Strip[] => {
  const strips: Strip[] = [];
  const push = (key: string, x0: number, y0: number, x1: number, y1: number) => {
    if (x1 - x0 > 0.01 && y1 - y0 > 0.01) {
      strips.push({ key, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 });
    }
  };
  push('bottom', 0, 0, length, pocket.y0);
  push('top', 0, pocket.y1, length, width);
  push('left', 0, pocket.y0, pocket.x0, pocket.y1);
  push('right', pocket.x1, pocket.y0, length, pocket.y1);
  return strips;
};

/** A line geometry through the given part-space points, at a fixed z. */
const lineGeometry = (points: readonly { x: number; y: number }[], z: number, close: boolean) => {
  const verts: number[] = [];
  const n = points.length;
  const segments = close ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    verts.push(a.x, a.y, z, b.x, b.y, z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  return g;
};

interface Props {
  panel: Panel;
  /** Full board thickness. The recess is measured down from the A-face at `thickness`. */
  thickness: Mm;
  /** The front's own colour, so the border reads as the same board it is cut from. */
  colour: string;
  wireframe?: boolean;
}

export function FrontRelief({ panel, thickness, colour, wireframe = false }: Props) {
  const recess = frontRecessOf(panel, thickness);
  const { length, width } = profileExtent(panel.profile);

  const grooves = panel.features.filter(
    (f): f is ProfiledCutFeature => f.kind === 'profiled-cut',
  );

  const recessOutline = useMemo(
    () => (recess ? lineGeometry(recess.outline, thickness - recess.depth, true) : null),
    [recess, thickness],
  );

  const grooveLines = useMemo(
    () =>
      grooves.map((g) => {
        const tool = findToolOrNull(g.toolId);
        // How wide the groove reads comes from the cutter, exactly as the real cut does.
        const cutWidth = tool ? cutWidthAtDepth(tool, g.depth) : 2;
        return {
          id: g.id,
          // Struck a fraction proud of the face so it doesn't z-fight with the panel itself.
          geometry: lineGeometry(g.path, thickness + 0.15, false),
          // A wider cutter throws a heavier shadow line. Clamped so it stays a line.
          opacity: Math.min(0.9, 0.4 + cutWidth / 20),
        };
      }),
    [grooves, thickness],
  );

  const strips = recess ? borderStrips(boundsOf(recess.outline), length, width) : [];
  const borderDepth = recess ? recess.depth : 0;

  return (
    <>
      {!wireframe && strips.map((s) => (
        <mesh
          key={s.key}
          position={[s.cx, s.cy, thickness - borderDepth / 2]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[s.w, s.h, borderDepth]} />
          <meshStandardMaterial color={colour} roughness={0.75} metalness={0.02} />
        </mesh>
      ))}

      {recessOutline && (
        <lineSegments geometry={recessOutline}>
          <lineBasicMaterial color="#8d8880" transparent opacity={0.8} />
        </lineSegments>
      )}

      {grooveLines.map((g) => (
        <lineSegments key={g.id} geometry={g.geometry}>
          <lineBasicMaterial color="#8d8880" transparent opacity={g.opacity} />
        </lineSegments>
      ))}
    </>
  );
}
