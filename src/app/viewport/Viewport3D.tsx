/**
 * The 3D viewport.
 *
 * Driven entirely off `BuiltCabinet[]` from the rule engine. The scene is rendered in metres
 * (a 0.001 scale on the root group) while the model stays in millimetres throughout — the
 * conversion happens once, here, and nowhere else.
 */

import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import type { BuiltCabinet } from '../../core/rules/build.ts';
import type { Project } from '../../core/model/project.ts';
import { findSheet } from '../../core/model/material.ts';
import { AU_BENCHTOP_HEIGHT } from '../../core/library/defaults.au.ts';
import { PanelMesh } from './PanelMesh.tsx';
import { RoomShell } from './RoomShell.tsx';
import { FlyControls } from './FlyControls.tsx';
import { cabinetMatrix } from './transforms.ts';

/** Millimetres → scene units. The model never leaves mm; only the render is scaled. */
const MM_TO_SCENE = 0.001;

interface Props {
  built: readonly BuiltCabinet[];
  project: Project;
  selectedCabinetId: string | null;
  onSelect: (id: string | null) => void;
  showWalls: boolean;
}

function CabinetGroup({
  built,
  project,
  selected,
  onSelect,
}: {
  built: BuiltCabinet;
  project: Project;
  selected: boolean;
  onSelect: () => void;
}) {
  const matrix = useMemo(() => cabinetMatrix(built.cabinet.placement), [built.cabinet.placement]);

  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      {built.panels.map((panel) => (
        <PanelMesh
          key={panel.id}
          panel={panel}
          thickness={findSheet(project.materials, panel.materialId).thickness}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

/** A slab standing in for the benchtop, so the elevation reads correctly. */
function Benchtop({ built }: { built: readonly BuiltCabinet[] }) {
  const bases = built.filter((b) => b.cabinet.typeId !== 'wall');
  if (bases.length === 0) return null;

  const minX = Math.min(...bases.map((b) => b.cabinet.placement.anchor.x));
  const maxX = Math.max(...bases.map((b) => b.cabinet.placement.anchor.x + b.cabinet.width));
  const depth = Math.max(...bases.map((b) => b.cabinet.depth)) + 40; // slight overhang
  const width = maxX - minX;

  return (
    <mesh position={[minX + width / 2, AU_BENCHTOP_HEIGHT - 15, depth / 2]} receiveShadow>
      <boxGeometry args={[width, 30, depth]} />
      <meshStandardMaterial color="#3f4248" roughness={0.55} />
    </mesh>
  );
}

export function Viewport3D({ built, project, selectedCabinetId, onSelect, showWalls }: Props) {
  return (
    <Canvas
      shadows
      camera={{ position: [3.4, 2.3, 6.2], fov: 42, near: 0.05, far: 100 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#1b1d21']} />
      <hemisphereLight intensity={0.75} groundColor="#33373d" />
      <directionalLight
        position={[4, 6, 5]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-4, 3, -2]} intensity={0.35} />

      <Suspense fallback={null}>
        <group scale={MM_TO_SCENE}>
          <RoomShell room={project.room} showWalls={showWalls} />
          <Benchtop built={built} />
          {built.map((b) => (
            <CabinetGroup
              key={b.cabinet.id}
              built={b}
              project={project}
              selected={b.cabinet.id === selectedCabinetId}
              onSelect={() => onSelect(b.cabinet.id)}
            />
          ))}
        </group>
      </Suspense>

      <Grid
        args={[24, 24]}
        cellSize={0.1}
        cellColor="#33373d"
        sectionSize={1}
        sectionColor="#484d55"
        fadeDistance={22}
        infiniteGrid
        position={[0, 0, 0]}
      />
      <OrbitControls makeDefault target={[1.5, 1.05, 0.2]} maxPolarAngle={Math.PI / 2.05} />
      <FlyControls />
    </Canvas>
  );
}
