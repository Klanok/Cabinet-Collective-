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
import { DoubleSide, FrontSide, Shape, ShapeGeometry } from 'three';
import type { Room, Wall } from '../../core/model/room.ts';
import { roomOutline, wallLength } from '../../core/model/room.ts';

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

/**
 * The floor, as the shape the walls actually enclose.
 *
 * It used to be the bounding rectangle of the walls, which is the same thing only while the
 * room *is* a rectangle. On an L-shaped plan that draws floor across the bite — so a cabinet
 * standing in a part of the room that doesn't exist looks like it is standing on something.
 *
 * The outline is a plan-space ring of (X, Z) points. Rotating the shape by +90° about X sends
 * its own (x, y) to world (x, z), so the ring goes straight in with no flipping.
 */
function Floor({ room }: { room: Room }) {
  const geometry = useMemo(() => {
    const ring = roomOutline(room);
    if (ring.length < 3) return null;
    const shape = new Shape();
    shape.moveTo(ring[0]!.x, ring[0]!.y);
    for (const point of ring.slice(1)) shape.lineTo(point.x, point.y);
    shape.closePath();
    return new ShapeGeometry(shape);
  }, [room]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
      <meshStandardMaterial color="#3a3e45" roughness={1} side={DoubleSide} />
    </mesh>
  );
}

export function RoomShell({ room, showWalls }: { room: Room; showWalls: boolean }) {
  return (
    <group>
      <Floor room={room} />
      {showWalls && room.walls.map((wall) => <WallMesh key={wall.id} wall={wall} />)}
    </group>
  );
}
