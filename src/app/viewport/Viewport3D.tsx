/**
 * The 3D viewport.
 *
 * Driven entirely off `BuiltCabinet[]` from the rule engine. The scene is rendered in metres
 * (a 0.001 scale on the root group) while the model stays in millimetres throughout — the
 * conversion happens once, here, and nowhere else.
 */

import { Suspense, useMemo } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import type { BuiltCabinet } from '../../core/rules/build.ts';
import type { Project } from '../../core/model/project.ts';
import { findSheet } from '../../core/model/material.ts';
import { AU_BENCHTOP_THICKNESS } from '../../core/library/defaults.au.ts';
import { benchtopRuns } from '../../core/project/benchtop.ts';
import { PanelMesh } from './PanelMesh.tsx';
import { RoomShell } from './RoomShell.tsx';
import { FlyControls } from './FlyControls.tsx';
import { cabinetMatrix } from './transforms.ts';
import { useCabinetDrag } from './useCabinetDrag.ts';
import type { Mm } from '../../core/units.ts';

/** Millimetres → scene units. The model never leaves mm; only the render is scaled. */
const MM_TO_SCENE = 0.001;

interface Props {
  built: readonly BuiltCabinet[];
  project: Project;
  selectedCabinetId: string | null;
  onSelect: (id: string | null) => void;
  showWalls: boolean;
  onMoveCabinet: (cabinetId: string, x: Mm, z: Mm) => void;
}

function CabinetGroup({
  built,
  project,
  selected,
  onSelect,
  onGrab,
}: {
  built: BuiltCabinet;
  project: Project;
  selected: boolean;
  onSelect: () => void;
  onGrab: (cabinet: BuiltCabinet['cabinet'], event: ThreeEvent<PointerEvent>) => void;
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
          onGrab={(e) => onGrab(built.cabinet, e)}
        />
      ))}
    </group>
  );
}

/**
 * Benchtop slabs, one per run of touching bench-height cabinets.
 *
 * The run-finding is in the model (project/benchtop.ts), not here — a tall cabinet carrying
 * no top, and a top not floating over a gap, are facts about the job rather than about how it
 * is drawn.
 */
function Benchtops({ project }: { project: Project }) {
  const runs = useMemo(() => benchtopRuns(project), [project]);
  const overhang = 20;
  const thickness = AU_BENCHTOP_THICKNESS;

  return (
    <>
      {runs.map((run) => (
        <mesh
          key={run.cabinetIds.join('+')}
          position={[
            run.startX + run.length / 2,
            run.carcassTopY + thickness / 2,
            run.backZ + (run.carcassDepth + overhang) / 2,
          ]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[run.length, thickness, run.carcassDepth + overhang]} />
          <meshStandardMaterial color="#3f4248" roughness={0.55} />
        </mesh>
      ))}
    </>
  );
}

function Scene({
  built,
  project,
  selectedCabinetId,
  onSelect,
  showWalls,
  onMoveCabinet,
}: Props) {
  const { begin, dragging } = useCabinetDrag({ onMove: onMoveCabinet, sceneScale: MM_TO_SCENE });

  return (
    <>
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
          <Benchtops project={project} />
          {built.map((b) => (
            <CabinetGroup
              key={b.cabinet.id}
              built={b}
              project={project}
              selected={b.cabinet.id === selectedCabinetId}
              onSelect={() => onSelect(b.cabinet.id)}
              onGrab={(cabinet, e) => {
                onSelect(cabinet.id);
                begin(cabinet, e);
              }}
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
      <OrbitControls
        makeDefault
        target={[1.5, 1.05, 0.2]}
        maxPolarAngle={Math.PI / 2.05}
        enabled={!dragging}
      />
      <FlyControls />
    </>
  );
}

export function Viewport3D(props: Props) {
  const { onSelect } = props;
  return (
    <Canvas
      shadows
      camera={{ position: [3.4, 2.3, 6.2], fov: 42, near: 0.05, far: 100 }}
      onPointerMissed={() => onSelect(null)}
    >
      <Scene {...props} />
    </Canvas>
  );
}
