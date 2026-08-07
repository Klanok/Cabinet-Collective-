/**
 * A rendered view of the kitchen, captured as an image for the drawing pack.
 *
 * ## Why this is its own canvas rather than the viewport's
 *
 * The Drawings view replaces the 3D viewport, so by the time somebody presses Print the viewport's
 * canvas has been unmounted and there is nothing left to grab. Reaching for it at print time would
 * work exactly as long as the user happened to visit 3D first, which is the kind of thing that
 * passes every test and fails on the bench.
 *
 * So the pack renders its **own** canvas, framed on the job, and captures it. It draws the same
 * `Scene` the viewport does — not a second, simplified rendering of the kitchen, which would be a
 * second place deciding what the job looks like.
 *
 * ## The one raster in a vector pack, and why that is right here
 *
 * Every other sheet stays vector so a client can zoom in on a dimension. This one is a picture on
 * purpose: it carries decors, textures and shadows, and it is the sheet nobody measures. Printed
 * at a sensible pixel density it holds up on A3.
 *
 * `preserveDrawingBuffer` is required — without it the buffer is cleared after each frame and
 * `toDataURL` comes back blank. It costs a little performance, which is why the viewport itself
 * does not ask for it.
 */

import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { Project } from '../../core/model/project.ts';
import type { BuiltCabinet } from '../../core/rules/build.ts';
import { PAPER_BACKGROUND, Scene } from '../viewport/Viewport3D.tsx';

/**
 * How many frames to let pass before grabbing.
 *
 * Textures load asynchronously, so the first frame of a job with decors on it is a grey kitchen.
 * Waiting a few frames is not a guess dressed as a constant: `isCaptureBlank` below is the real
 * guard, and this is only what keeps it from firing on the common case.
 */
const CAPTURE_AFTER_FRAMES = 12;

/**
 * Is this capture empty?
 *
 * A blank or single-colour image on a client sheet is worse than no image: it prints as a grey
 * rectangle that looks like a rendering fault in whatever opened the PDF. So the capture is
 * checked before it is used, by sampling the decoded pixels and asking whether anything varies.
 */
export const isCaptureBlank = (data: Uint8ClampedArray): boolean => {
  if (data.length < 4) return true;
  const first = [data[0], data[1], data[2]];
  for (let i = 4; i < data.length; i += 4 * 97) {
    if (
      Math.abs((data[i] ?? 0) - (first[0] ?? 0)) > 6 ||
      Math.abs((data[i + 1] ?? 0) - (first[1] ?? 0)) > 6 ||
      Math.abs((data[i + 2] ?? 0) - (first[2] ?? 0)) > 6
    ) {
      return false;
    }
  }
  return true;
};

function Grabber({ onCapture }: { onCapture: (url: string | null) => void }) {
  const { gl, scene, camera } = useThree();
  const frames = useRef(0);
  const done = useRef(false);

  useFrame(() => {
    if (done.current) return;
    frames.current += 1;
    if (frames.current < CAPTURE_AFTER_FRAMES) return;
    done.current = true;
    gl.render(scene, camera);
    const canvas = gl.domElement;

    // Check what was actually drawn before handing it on — see `isCaptureBlank`.
    const probe = document.createElement('canvas');
    probe.width = Math.min(canvas.width, 160);
    probe.height = Math.min(canvas.height, 120);
    const ctx = probe.getContext('2d');
    if (!ctx) {
      onCapture(canvas.toDataURL('image/png'));
      return;
    }
    ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
    const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data;
    onCapture(isCaptureBlank(pixels) ? null : canvas.toDataURL('image/png'));
  });

  return null;
}

/**
 * Where to stand to see the whole kitchen.
 *
 * Off one corner and above head height, looking at the middle of the room — the view somebody
 * would take a photograph from. Derived from the room rather than fixed, so a big kitchen is not
 * cropped and a small one does not sit in the distance.
 */
const cameraFor = (project: Project): [number, number, number] => {
  const xs = project.room.walls.flatMap((w) => [w.start.x, w.end.x]);
  const zs = project.room.walls.flatMap((w) => [w.start.y, w.end.y]);
  if (xs.length === 0) return [3.4, 2.3, 6.2];
  const width = (Math.max(...xs) - Math.min(...xs)) / 1000;
  const depth = (Math.max(...zs) - Math.min(...zs)) / 1000;
  const reach = Math.max(width, depth, 2) * 1.15;
  return [reach * 0.95, Math.max(1.9, reach * 0.55), reach * 1.25];
};

export function ViewCapture({
  project,
  built,
  onCapture,
}: {
  project: Project;
  built: readonly BuiltCabinet[];
  onCapture: (url: string | null) => void;
}) {
  const [key, setKey] = useState(0);
  // A new job is a new picture. Remounting is what restarts the frame count.
  useEffect(() => setKey((k) => k + 1), [project]);

  return (
    <div className="view-capture" aria-hidden>
      <Canvas
        key={key}
        shadows
        gl={{ preserveDrawingBuffer: true }}
        camera={{ position: cameraFor(project), fov: 42, near: 0.05, far: 100 }}
      >
        <Scene
          built={built}
          project={project}
          selectedCabinetId={null}
          onSelect={() => {}}
          showWalls
          wireframe={false}
          onMoveCabinet={() => {}}
          background={PAPER_BACKGROUND}
        />
        <Grabber onCapture={onCapture} />
      </Canvas>
    </div>
  );
}
