/**
 * One panel, rendered.
 *
 * All this does is adapt the core geometry engine's output to a Three.js buffer geometry and
 * position it with the model's own transform. There is no geometry logic here — a panel's
 * shape and placement are decided by the rule engine, not by the view.
 */

import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry, type Matrix4 } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Panel } from '../../core/model/panel.ts';
import type { Mm } from '../../core/units.ts';
import { extrudeProfile } from '../../core/geom/extrude.ts';
import { panelMatrix } from './transforms.ts';

/** Panel colours, keyed loosely by what the part is, so a carcass reads at a glance. */
const ROLE_COLOURS: Record<string, string> = {
  side: '#e8e4dc',
  bottom: '#e0dcd4',
  top: '#e0dcd4',
  stretcher: '#d8d4cc',
  'shelf-adjustable': '#dedad2',
  'shelf-fixed': '#dedad2',
  back: '#c9c4ba',
  door: '#f4f2ee',
  'drawer-front': '#f4f2ee',
  kick: '#8f8b84',
};

interface Props {
  panel: Panel;
  thickness: Mm;
  selected: boolean;
  onSelect: () => void;
  /** Pointer-down on the panel — the start of a possible drag of its whole cabinet. */
  onGrab: (event: ThreeEvent<PointerEvent>) => void;
}

export function PanelMesh({ panel, thickness, selected, onSelect, onGrab }: Props) {
  const geometry = useMemo(() => {
    const mesh = extrudeProfile(panel.profile, thickness);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(mesh.positions, 3));
    g.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
    g.setIndex(new BufferAttribute(mesh.indices, 1));
    return g;
  }, [panel.profile, thickness]);

  const matrix: Matrix4 = useMemo(() => panelMatrix(panel.placement), [panel.placement]);

  const colour = selected ? '#ff9640' : ROLE_COLOURS[panel.role] ?? '#dcd8d0';
  // Fronts sit proud of the carcass; making them slightly translucent keeps the interior
  // readable without having to hide them.
  const isFront = panel.role === 'door' || panel.role === 'drawer-front';

  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerDown={onGrab}
      >
        <meshStandardMaterial
          color={colour}
          roughness={0.75}
          metalness={0.02}
          transparent={isFront}
          opacity={isFront ? 0.86 : 1}
        />
      </mesh>
      {/* Edge outline, so panel joints stay legible against same-coloured neighbours. */}
      <lineSegments>
        <edgesGeometry args={[geometry]} />
        <lineBasicMaterial color={selected ? '#c2410c' : '#9a958c'} transparent opacity={0.55} />
      </lineSegments>
    </group>
  );
}
