/**
 * Dragging a cabinet along the floor with the mouse.
 *
 * The pointer is projected onto a horizontal plane at the cabinet's own base height, so the
 * cabinet tracks the cursor rather than drifting as the camera tilts. Orbit is suspended for
 * the duration, otherwise every drag would also spin the view.
 *
 * Height is never changed by dragging — a wall cabinet dragged sideways must not slide down
 * the wall. Vertical position is a typed number, not something to nudge by hand.
 */

import { useCallback, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { type Mm, mm } from '../../core/units.ts';
import type { Cabinet } from '../../core/model/cabinet.ts';

/** Positions land on whole millimetres — nobody sets a cabinet at 412.7. */
const snap = (v: number): Mm => mm(Math.round(v));

/** How far the pointer must travel before it counts as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;

export interface DragHandlers {
  readonly onPointerDown: (event: PointerDownLike) => void;
  readonly dragging: boolean;
}

interface PointerDownLike {
  readonly clientX: number;
  readonly clientY: number;
  readonly nativeEvent: PointerEvent;
  stopPropagation: () => void;
}

export interface UseCabinetDragArgs {
  readonly onMove: (cabinetId: string, x: Mm, z: Mm) => void;
  /** Scene scale — the model is in millimetres, the scene in metres. */
  readonly sceneScale: number;
}

export function useCabinetDrag({ onMove, sceneScale }: UseCabinetDragArgs) {
  const { camera, gl, controls } = useThree();
  const [dragging, setDragging] = useState(false);

  const raycaster = useRef(new Raycaster());
  const plane = useRef(new Plane());
  const hit = useRef(new Vector3());
  const pointer = useRef(new Vector2());

  const begin = useCallback(
    (cabinet: Cabinet, event: PointerDownLike) => {
      // Only the primary button drags; the others belong to orbit and pan.
      if (event.nativeEvent.button !== 0) return;
      event.stopPropagation();

      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();
      const startClientX = event.clientX;
      const startClientY = event.clientY;

      // Drag on a horizontal plane through the cabinet's own base, in scene units.
      const planeY = (cabinet.placement.anchor.y * sceneScale);
      plane.current.set(new Vector3(0, 1, 0), -planeY);

      const toPlane = (clientX: number, clientY: number): Vector3 | null => {
        pointer.current.set(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.current.setFromCamera(pointer.current, camera);
        return raycaster.current.ray.intersectPlane(plane.current, hit.current) ? hit.current : null;
      };

      const grabbedAt = toPlane(startClientX, startClientY);
      if (!grabbedAt) return;
      // Offset from the cabinet's anchor to where it was actually grabbed, so it doesn't jump.
      const grabOffsetX = grabbedAt.x / sceneScale - cabinet.placement.anchor.x;
      const grabOffsetZ = grabbedAt.z / sceneScale - cabinet.placement.anchor.z;

      const orbit = controls as OrbitControlsImpl | null;
      const orbitWasEnabled = orbit?.enabled ?? false;
      let moved = false;

      const onPointerMove = (e: PointerEvent) => {
        if (
          !moved &&
          Math.hypot(e.clientX - startClientX, e.clientY - startClientY) < DRAG_THRESHOLD_PX
        ) {
          return; // still a click, not a drag
        }
        if (!moved) {
          moved = true;
          setDragging(true);
          if (orbit) orbit.enabled = false;
        }

        const point = toPlane(e.clientX, e.clientY);
        if (!point) return;
        onMove(
          cabinet.id,
          snap(point.x / sceneScale - grabOffsetX),
          snap(point.z / sceneScale - grabOffsetZ),
        );
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        if (orbit) orbit.enabled = orbitWasEnabled;
        setDragging(false);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [camera, controls, gl, onMove, sceneScale],
  );

  return { begin, dragging };
}
