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
import { type Benchtop, benchtopDepth, benchtopLength } from '../../core/model/benchtop.ts';
import { findBenchtopMaterial } from '../../core/model/material.ts';
import { uncoveredRuns } from '../../core/project/generate.ts';
import { buildRunUnits } from '../../core/rules/runUnits.ts';
import { type CabinetPlacement, yawCosSin } from '../../core/geom/placement.ts';
import { snapToNeighbour, snapToWall } from '../../core/project/wallPlacement.ts';
import { PanelMesh } from './PanelMesh.tsx';
import { RoomShell } from './RoomShell.tsx';
import { FlyControls } from './FlyControls.tsx';
import { cabinetMatrix } from './transforms.ts';
import { useCabinetDrag } from './useCabinetDrag.ts';
import type { Mm } from '../../core/units.ts';
import { nestProject } from '../../core/nest/nest.ts';
import { sheetTexturePlacements, type SheetTexturePlacement } from './sheetTexture.ts';
import { AU_UPHOLSTERY_MATERIALS } from '../../core/library/upholstery.au.ts';
import { BanquetteCornerCushions, BanquetteCushions } from './BanquetteCushions.tsx';

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
const NEIGHBOUR_SNAP_GAP: Mm = 120;

interface Props {
  built: readonly BuiltCabinet[];
  project: Project;
  selectedCabinetId: string | null;
  onSelect: (id: string | null) => void;
  showWalls: boolean;
  /** Draw part edges without opaque faces, so internal construction stays visible. */
  wireframe: boolean;
  onMoveCabinet: (cabinetId: string, x: Mm, z: Mm, yawDeg: number) => void;
}

function CabinetGroup({
  built,
  project,
  selected,
  onSelect,
  onGrab,
  wireframe,
  texturePlacements,
}: {
  built: BuiltCabinet;
  project: Project;
  selected: boolean;
  onSelect: () => void;
  onGrab: (cabinet: BuiltCabinet['cabinet'], event: ThreeEvent<PointerEvent>) => void;
  wireframe: boolean;
  texturePlacements: ReadonlyMap<string, SheetTexturePlacement>;
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
          texture={findSheet(project.materials, panel.materialId).texture}
          texturePlacement={texturePlacements.get(panel.id)}
          selected={selected}
          onSelect={onSelect}
          onGrab={(e) => onGrab(built.cabinet, e)}
          wireframe={wireframe}
        />
      ))}
      {built.cabinet.typeId === 'banquette' && (() => {
        const upholstery = (project.materials.upholstery ?? AU_UPHOLSTERY_MATERIALS).find(
          (item) => item.id === built.cabinet.materials.upholstery,
        ) ?? (project.materials.upholstery ?? AU_UPHOLSTERY_MATERIALS)[0];
        return upholstery ? <BanquetteCushions cabinet={built.cabinet} radius={built.radius} upholstery={upholstery} selected={selected} wireframe={wireframe} /> : null;
      })()}
      {built.cabinet.typeId === 'banquette-corner' && (() => {
        const upholstery = (project.materials.upholstery ?? AU_UPHOLSTERY_MATERIALS).find(
          (item) => item.id === built.cabinet.materials.upholstery,
        ) ?? (project.materials.upholstery ?? AU_UPHOLSTERY_MATERIALS)[0];
        return upholstery ? <BanquetteCornerCushions cabinet={built.cabinet} upholstery={upholstery} selected={selected} wireframe={wireframe} /> : null;
      })()}
    </group>
  );
}

/**
 * Benchtops and ladder bases, drawn from **their own parts**.
 *
 * This used to be a slab the viewport worked out for itself from the run finder. It isn't any more,
 * and the difference is the whole of §5.5: a top is now an object the job owns, so what you see is
 * what is on the cutlist and on the quote.
 *
 * A **bought-in** top is the one exception, and it is not an exception to the principle: it
 * produces no parts because nobody in this shop cuts it, so it is drawn as the one slab that
 * arrives on the truck, at the size the fabricator is being asked to make.
 */
function RunUnits({ project, wireframe, texturePlacements }: { project: Project; wireframe: boolean; texturePlacements: ReadonlyMap<string, SheetTexturePlacement> }) {
  const units = useMemo(() => buildRunUnits(project), [project]);
  const placements = useMemo(() => {
    const map = new Map<string, CabinetPlacement>();
    for (const t of project.benchtops) map.set(t.id, t.placement);
    for (const k of project.kickBases) map.set(k.id, k.placement);
    return map;
  }, [project.benchtops, project.kickBases]);

  return (
    <>
      {units.map((unit) => {
        const placement = placements.get(unit.id);
        if (!placement || unit.panels.length === 0) return null;
        return (
          <group key={unit.id} matrixAutoUpdate={false} matrix={cabinetMatrix(placement)}>
            {unit.panels.map((panel) => (
              <PanelMesh
                key={panel.id}
                panel={panel}
                thickness={actualThicknessOf(findSheet(project.materials, panel.materialId))}
                colour={findSheet(project.materials, panel.materialId).colour}
                texture={findSheet(project.materials, panel.materialId).texture}
                texturePlacement={texturePlacements.get(panel.id)}
                selected={false}
                onSelect={() => {}}
                wireframe={wireframe}
              />
            ))}
          </group>
        );
      })}
      {project.benchtops.map((top) => {
        const material = findBenchtopMaterial(project.materials, top.materialId);
        if (material.supply !== 'bought-in') return null;
        return <BoughtInSlab key={top.id} top={top} colour={material.colour ?? '#dedbd4'} wireframe={wireframe} />;
      })}
    </>
  );
}

/** A bought-in top: one slab, at the size the fabricator is being asked to make. */
function BoughtInSlab({ top, colour, wireframe }: { top: Benchtop; colour: string; wireframe: boolean }) {
  const { c, s } = yawCosSin(top.placement.yawDeg);
  const length = benchtopLength(top);
  const depth = benchtopDepth(top);
  const thickness = AU_BENCHTOP_THICKNESS;
  // Centre of the slab in the unit's own frame, then turned out into the room by the run's yaw.
  const alongCentre = length / 2 - top.overhangs.left;
  const frontCentre = (top.carcassDepth + top.overhangs.front - top.overhangs.back) / 2;
  return (
    <mesh
      position={[
        top.placement.anchor.x + alongCentre * c + frontCentre * s,
        top.placement.anchor.y + thickness / 2,
        top.placement.anchor.z - alongCentre * s + frontCentre * c,
      ]}
      rotation={[0, (top.placement.yawDeg * Math.PI) / 180, 0]}
      receiveShadow
      castShadow
    >
      <boxGeometry args={[length, thickness, depth]} />
      <meshStandardMaterial color={wireframe ? '#d7dde5' : colour} roughness={0.4} wireframe={wireframe} />
    </mesh>
  );
}

/**
 * A run with no benchtop on it yet, drawn as a **ghost**.
 *
 * The point of this is honesty, and it is worth being explicit about why it looks the way it does.
 * Before §5.5 the viewport drew a solid slab over every run, worked out on the fly — and that slab
 * was never on the cutlist, never on the quote and never in the job file. It looked exactly like a
 * benchtop the job had. It was not one.
 *
 * So it is still drawn, because seeing the space is genuinely useful, and it is drawn transparent
 * so nobody can mistake it for something that has been specified. Generating a real one is one
 * button in the Benchtops tab.
 */
function GhostTops({ project, wireframe }: { project: Project; wireframe: boolean }) {
  const runs = useMemo(() => uncoveredRuns(project, 'benchtop'), [project]);
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
            key={run.memberIds.join('+')}
            position={[
              run.startX + half * c + forward * s,
              run.datumY + thickness / 2,
              run.backZ - half * s + forward * c,
            ]}
            rotation={[0, (run.yawDeg * Math.PI) / 180, 0]}
          >
            <boxGeometry args={[run.length, thickness, run.carcassDepth + overhang]} />
            <meshStandardMaterial
              color="#6d7681"
              roughness={0.9}
              transparent
              opacity={0.2}
              depthWrite={false}
              wireframe={wireframe}
            />
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
  wireframe,
  onMoveCabinet,
}: Props) {
  const texturePlacements = useMemo(
    () => sheetTexturePlacements(nestProject(project)),
    [project],
  );
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
      /*
       * A standalone panel needs no special case here any more, and its absence is the sign the
       * model is right. There used to be an `effectiveDepth` that substituted the board's real
       * thickness for `cabinet.depth` when snapping a panel, because a panel was built lying flat
       * along the run and its stored depth was a nominal 16 that had nothing to do with the board.
       * Now that a panel stands edge out, its depth *is* how far it reaches into the room — so the
       * general path is the correct one. See `createCabinet` and `specs/standalonePanel.ts`.
       */
      const appliedEndThickness = (candidate: typeof cabinet): Mm => {
        const materialId = candidate.materials.door ?? project.defaults.doorMaterialId;
        return actualThicknessOf(findSheet(project.materials, materialId));
      };
      const neighbour = snapToNeighbour(
        project.cabinets,
        cabinet,
        x,
        z,
        NEIGHBOUR_SNAP_GAP,
        appliedEndThickness,
      );
      const placement =
        neighbour?.placement ??
        snapToWall(project.room, cabinet, x, z, WALL_SNAP_GAP)?.placement;

      if (placement) {
        onMoveCabinet(cabinetId, placement.anchor.x, placement.anchor.z, placement.yawDeg);
      } else {
        onMoveCabinet(cabinetId, x, z, cabinet.placement.yawDeg);
      }
    },
    [
      onMoveCabinet,
      project.cabinets,
      project.defaults.doorMaterialId,
      project.defaults.carcassMaterialId,
      project.materials,
      project.room,
    ],
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
          <RunUnits project={project} wireframe={wireframe} texturePlacements={texturePlacements} />
          <GhostTops project={project} wireframe={wireframe} />
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
              wireframe={wireframe}
              texturePlacements={texturePlacements}
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
