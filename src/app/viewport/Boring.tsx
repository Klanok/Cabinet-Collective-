/**
 * The drilling, seen.
 *
 * The viewport is told nothing about hinges or runners. It reads the **drill features on the panel**
 * and draws a circle of the right diameter at the right place, exactly as `FrontRelief` reads a
 * pocket. So a hinge cup appears on the back of a door because the rule engine put one there, and
 * if the rule engine puts it on the wrong end you can see that in three seconds.
 *
 * That is the whole reason this exists. §7's standard is that work gets checked in the running app
 * and not only in the suite, and boring is the case where that matters most: a mounting plate 37mm
 * from the *back* of a side panel is the same count of the same holes at the same diameter, and a
 * test that only counts them passes. Looking at it does not.
 *
 * Drawn as line rings in **one geometry per face**, not as one mesh per hole. A pantry side carries
 * forty-odd system holes and a kitchen a few hundred, and a mesh each would be a few hundred draw
 * calls for something that reads perfectly as an outline.
 */

import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import type { Mm } from '../../core/units.ts';
import type { Panel } from '../../core/model/panel.ts';
import type { DrillFeature, DrillLineFeature } from '../../core/model/feature.ts';

/** One hole, resolved out of a single bore or one step of a row. */
interface Hole {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly face: 'A' | 'B';
}

const holesOf = (panel: Panel): Hole[] => {
  const holes: Hole[] = [];
  for (const f of panel.features) {
    if (f.kind === 'drill') {
      const d = f as DrillFeature;
      holes.push({ x: d.at.x, y: d.at.y, radius: d.diameter / 2, face: d.face });
      continue;
    }
    if (f.kind === 'drill-line') {
      const l = f as DrillLineFeature;
      for (let i = 0; i < l.count; i++) {
        holes.push({
          x: l.start.x + l.step.x * i,
          y: l.start.y + l.step.y * i,
          radius: l.diameter / 2,
          face: l.face,
        });
      }
    }
  }
  return holes;
};

/** Ring segments for a set of holes, all at one z. Twelve sides reads as a circle at this scale. */
const ringGeometry = (holes: readonly Hole[], z: number): BufferGeometry => {
  const sides = 12;
  const verts: number[] = [];
  for (const h of holes) {
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const b = ((i + 1) / sides) * Math.PI * 2;
      verts.push(
        h.x + Math.cos(a) * h.radius,
        h.y + Math.sin(a) * h.radius,
        z,
        h.x + Math.cos(b) * h.radius,
        h.y + Math.sin(b) * h.radius,
        z,
      );
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  return g;
};

interface Props {
  panel: Panel;
  /** Full board thickness — the A-face is at this z in part space, the B-face at zero. */
  thickness: Mm;
}

export function Boring({ panel, thickness }: Props) {
  const geometries = useMemo(() => {
    const holes = holesOf(panel);
    if (holes.length === 0) return [];
    // Struck a fraction proud of each face so the rings don't z-fight with the panel itself.
    return (
      [
        ['A', holes.filter((h) => h.face === 'A'), thickness + 0.2],
        ['B', holes.filter((h) => h.face === 'B'), -0.2],
      ] as const
    )
      .filter(([, group]) => group.length > 0)
      .map(([face, group, z]) => ({ face, geometry: ringGeometry(group, z) }));
  }, [panel, thickness]);

  return (
    <>
      {geometries.map(({ face, geometry }) => (
        <lineSegments key={face} geometry={geometry}>
          {/*
            The back face reads warmer than the front, so a hinge cup is visibly on the side of the
            door that turns over — which is the thing worth being able to see at a glance.
          */}
          <lineBasicMaterial
            color={face === 'B' ? '#b45309' : '#57534e'}
            transparent
            opacity={0.75}
          />
        </lineSegments>
      ))}
    </>
  );
}
