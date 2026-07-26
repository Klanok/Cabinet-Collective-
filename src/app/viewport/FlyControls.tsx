/**
 * WASD/QE navigation, alongside the orbit controls.
 *
 *   W / S    forward and back, along the way the camera is looking
 *   A / D    strafe left and right
 *   Q / E    down and up, always world-vertical so the view stays level
 *   Shift    move faster
 *
 * Movement drives both the camera and the orbit target together, so letting go of the keys
 * and going back to dragging picks up from where you flew to rather than snapping back.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

/** Metres per second at the scene's scale. A kitchen run is about 3m, so this crosses it in 1s. */
const BASE_SPEED = 3;
const SPRINT_MULTIPLIER = 3;

const KEY_MAP: Record<string, string> = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  KeyQ: 'down',
  KeyE: 'up',
};

export function FlyControls() {
  const { camera, controls } = useThree();
  const held = useRef<Set<string>>(new Set());
  const sprinting = useRef(false);

  useEffect(() => {
    const isTyping = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const down = (e: KeyboardEvent) => {
      // Never steal keystrokes from a dimension field — typing "900" must not fly the camera.
      if (isTyping(e.target)) return;
      const action = KEY_MAP[e.code];
      if (action) {
        held.current.add(action);
        e.preventDefault();
      }
      if (e.shiftKey) sprinting.current = true;
    };
    const up = (e: KeyboardEvent) => {
      const action = KEY_MAP[e.code];
      if (action) held.current.delete(action);
      if (!e.shiftKey) sprinting.current = false;
    };
    // Releasing the keys when the window loses focus stops the camera drifting away while
    // the user is in another window.
    const blur = () => {
      held.current.clear();
      sprinting.current = false;
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const forward = useRef(new Vector3());
  const right = useRef(new Vector3());
  const step = useRef(new Vector3());

  useFrame((_, delta) => {
    if (held.current.size === 0) return;

    const speed = BASE_SPEED * (sprinting.current ? SPRINT_MULTIPLIER : 1) * delta;

    camera.getWorldDirection(forward.current);
    right.current.crossVectors(forward.current, camera.up).normalize();
    step.current.set(0, 0, 0);

    if (held.current.has('forward')) step.current.addScaledVector(forward.current, speed);
    if (held.current.has('back')) step.current.addScaledVector(forward.current, -speed);
    if (held.current.has('right')) step.current.addScaledVector(right.current, speed);
    if (held.current.has('left')) step.current.addScaledVector(right.current, -speed);
    // Up and down stay world-vertical rather than following the camera's pitch, so Q and E
    // raise and lower the eye without tilting the view.
    if (held.current.has('up')) step.current.y += speed;
    if (held.current.has('down')) step.current.y -= speed;

    camera.position.add(step.current);

    // Carry the orbit target along, so switching back to dragging orbits around where you are.
    const orbit = controls as OrbitControlsImpl | null;
    if (orbit?.target) {
      orbit.target.add(step.current);
      orbit.update();
    }
  });

  return null;
}
