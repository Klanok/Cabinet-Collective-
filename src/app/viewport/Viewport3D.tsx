/**
 * The 3D viewport.
 *
 * Driven entirely off `BuiltCabinet[]` from the rule engine. The scene is rendered in metres
 * (a 0.001 scale on the root group) while the model stays in millimetres throughout — the
 * conversion happens once, here, and nowhere else.
 */

import { Suspense, useCallback, useMemo } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import type { BuiltCabinet } from '../../core/rules/build.ts';
import type { Project } from '../../core/model/project.ts';
import { actualThicknessOf, findSheet } from '../../core/model/material.ts';
import { AU_BENCHTOP_THICKNESS } from '../../core/library/defaults.au.ts';
import { benchtopRuns } from '../../core/project/benchtop.ts';
import { yawCosSin } from '../../core/geom/placement.ts';
import { snapToNeighbour, snapToWall } from '../../core/project/wallPlacement.ts';
import { PanelMesh } from './PanelMesh.tsx';
import { RoomShell } from './RoomShell.tsx';
import { FlyControls } from './FlyControls.tsx';
import { cabinetMatrix } from './transforms.ts';
import { useCabinetDrag } from './useCabinetDrag.ts';
import type { Mm } from '../../core/units.ts';

/** Millimetres → scene units. The model never leaves mm; only the render is scaled. */
const MM_TO_SCENE = 0.001;

/**
 * How close a dragged cabinet has to get before it takes to a wall.
 *
 * Generous on purpose: against a wall is where nearly every cabinet goes, and getting it
 * flush and square by eye through a perspective camera is not something anyone should have to
 * do. Dragging it back out into the room is one gesture away.
 */
const WALL_SNAP_GAP: Mm = 200;

/**
 * How close a dragged cabinet has to get to a neighbour before it butts up against it.
 *
 * Much tighter than the wall gap, and deliberately. A wall is somewhere a cabinet nearly always
 * wants to be, so being greedy about it costs nothing. A *neighbour* is one of several nearby, and
 * a greedy snap would keep grabbing the wrong one — 60mm is close enough that you have clearly
 * aimed at it.
 */
const NEIGHBOUR_SNAP_GAP: Mm = 60;

interface Props {
  built: readonly BuiltCabinet[];
  project: Project;
  selectedCabinetId: string | null;
  onSelect: (id: string | null) => void;
  showWalls: boolean;
  onMoveCabinet: (cabinetId: string, x: Mm, z: Mm, yawDeg: number) => void;
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
          thickness={actualThicknessOf(findSheet(project.materials, panel.materialId))}
          // What the board actually looks like, where the material says. A part cut from a decor
          // nobody has given a colour to falls back to the viewport's own colour for its role.
          colour={findSheet(project.materials, panel.materialId).colour}
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
      {runs.map((run) => {
        // A run knows its own direction, so the slab is laid along the run rather than along
        // world X. Turning the box by the run's yaw puts its length on the run's own axis —
        // the same rotation a cabinet in that run gets.
        const { c, s } = yawCosSin(run.yawDeg);
        const half = run.length / 2;
        const forward = (run.carcassDepth + overhang) / 2;
        return (
          <mesh
            key={run.cabinetIds.join('+')}
            position={[
              run.startX + half * c + forward * s,
              run.carcassTopY + thickness / 2,
              run.backZ - half * s + forward * c,
            ]}
            rotation={[0, (run.yawDeg * Math.PI) / 180, 0]}
            receiveShadow
            castShadow
          >
            <boxGeometry args={[run.length, thickness, run.carcassDepth + overhang]} />
            <meshStandardMaterial color="#3f4248" roughness={0.55} />
          </mesh>
        );
      })}
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
  /*
   * Dragging goes through the wall snap on its way to the store.
   *
   * The drag itself stays pure pointer geometry — it works out where on the floor you are
   * pointing and nothing else. Deciding that this position means "against the east wall,
   * turned to face into the room" is a fact about the job, so it comes from the model.
   */
  const handleMove = useCallback(
    (cabinetId: string, x: Mm, z: Mm) => {
      const cabinet = project.cabinets.find((c) => c.id === cabinetId);
      if (!cabinet) return;

      /*
       * A neighbour is tried first, and wins when it is close enough.
       *
       * It is the more specific answer: butting onto a cabinet that is itself against a wall puts
       * you against that wall too, and butting onto one out in the room is a deliberate thing to
       * do that a wall snap would undo. The wall is the fallback, which is also the order you
       * would do it by hand — set one cabinet, then push the rest up to it.
       */
      const neighbour = snapToNeighbour(project.cabinets, cabinet, x, z, NEIGHBOUR_SNAP_GAP);
      const placement =
        neighbour?.placement ?? snapToWall(project.room, cabinet, x, z, WALL_SNAP_GAP)?.placement;

      if (placement) {
        onMoveCabinet(cabinetId, placement.anchor.x, placement.anchor.z, placement.yawDeg);
      } else {
        onMoveCabinet(cabinetId, x, z, cabinet.placement.yawDeg);
      }
    },
    [onMoveCabinet, project.cabinets, project.room],
  );

  const { begin, dragging } = useCabinetDrag({ onMove: handleMove, sceneScale: MM_TO_SCENE });

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
