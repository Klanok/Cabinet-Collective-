/**
 * The room the cabinets sit in — floor and walls.
 *
 * Walls have been in the model since the start but were never drawn, which made it impossible
 * to see whether a run actually fitted the space.
 *
 * Each wall is a single plane whose front face points *into* the room, drawn front-side only.
 * Standing outside the room you are looking at its back face, which isn't rendered, so the
 * near wall simply isn't there and the view into the room is clear. A box would not do this:
 * hiding its near face still leaves the far inner face between you and the cabinets.
 */

import { useMemo } from 'react';
import { DoubleSide, FrontSide } from 'three';
import type { Room, Wall } from '../../core/model/room.ts';
import { wallLength } from '../../core/model/room.ts';

interface WallPlacement {
  readonly length: number;
  readonly position: [number, number, number];
  readonly rotationY: number;
}

/**
 * Where a wall plane sits, and which way it faces.
 *
 * Walls are stored anticlockwise around the floor, so the inward normal of the edge a→b is
 * its left normal — `(-dz, dx)` in world X/Z.
 */
const placeWall = (wall: Wall): WallPlacement | null => {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.y - wall.start.y;
  const length = wallLength(wall);
  if (length === 0) return null;

  const inwardX = -dz / length;
  const inwardZ = dx / length;

  return {
    length,
    position: [wall.start.x + dx / 2, wall.height / 2, wall.start.y + dz / 2],
    // A plane's own normal is +Z; rotating about Y by θ sends it to (sin θ, 0, cos θ).
    rotationY: Math.atan2(inwardX, inwardZ),
  };
};

function WallMesh({ wall }: { wall: Wall }) {
  const placement = useMemo(() => placeWall(wall), [wall]);
  if (!placement) return null;

  return (
    <mesh
      position={placement.position}
      rotation={[0, placement.rotationY, 0]}
      receiveShadow
    >
      <planeGeometry args={[placement.length, wall.height]} />
      <meshStandardMaterial color="#6a6f78" roughness={0.95} side={FrontSide} />
    </mesh>
  );
}

export function RoomShell({ room, showWalls }: { room: Room; showWalls: boolean }) {
  const floor = useMemo(() => {
    const xs = room.walls.flatMap((w) => [w.start.x, w.end.x]);
    const zs = room.walls.flatMap((w) => [w.start.y, w.end.y]);
    if (xs.length === 0) return null;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    return {
      width: maxX - minX,
      depth: maxZ - minZ,
      centre: [minX + (maxX - minX) / 2, 0, minZ + (maxZ - minZ) / 2] as [number, number, number],
    };
  }, [room.walls]);

  return (
    <group>
      {floor && floor.width > 0 && floor.depth > 0 && (
        <mesh position={floor.centre} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[floor.width, floor.depth]} />
          <meshStandardMaterial color="#3a3e45" roughness={1} side={DoubleSide} />
        </mesh>
      )}
      {showWalls && room.walls.map((wall) => <WallMesh key={wall.id} wall={wall} />)}
    </group>
  );
}
