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

/**
 * The room's own colours, in the app and on paper.
 *
 * The app is dark-themed and its room reads well against that. Printed on a client sheet the same
 * colours are a dark grey slab covering most of the page — wrong for a drawing, and a cartridge's
 * worth of toner. So the shell takes its colours as a parameter rather than owning one set.
 */
export const ROOM_COLOURS = {
  screen: { wall: '#6a6f78', floor: '#3a3e45' },
  paper: { wall: '#e9e7e2', floor: '#dbd7cf' },
} as const;

export type RoomPalette = keyof typeof ROOM_COLOURS;

function WallMesh({ wall, palette }: { wall: Wall; palette: RoomPalette }) {
  const placement = useMemo(() => placeWall(wall), [wall]);
  if (!placement) return null;

  return (
    <mesh
      position={placement.position}
      rotation={[0, placement.rotationY, 0]}
      receiveShadow
    >
      <planeGeometry args={[placement.length, wall.height]} />
      <meshStandardMaterial color={ROOM_COLOURS[palette].wall} roughness={0.95} side={FrontSide} />
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
function Floor({ room, palette }: { room: Room; palette: RoomPalette }) {
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
      <meshStandardMaterial color={ROOM_COLOURS[palette].floor} roughness={1} side={DoubleSide} />
    </mesh>
  );
}

export function RoomShell({
  room,
  showWalls,
  palette = 'screen',
}: {
  room: Room;
  showWalls: boolean;
  palette?: RoomPalette;
}) {
  return (
    <group>
      <Floor room={room} palette={palette} />
      {showWalls &&
        room.walls.map((wall) => <WallMesh key={wall.id} wall={wall} palette={palette} />)}
    </group>
  );
}
