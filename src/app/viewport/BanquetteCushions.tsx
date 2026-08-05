import { useCallback, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
import {
  type BufferGeometry,
  type Mesh,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
  TextureLoader,
} from 'three';
import type { Cabinet } from '../../core/model/cabinet.ts';
import { returnRun, seatCushionPlan } from '../../core/model/cushion.ts';
import type { InsideCornerPlan } from '../../core/model/insideCorner.ts';
import type { UpholsteryMaterial } from '../../core/model/material.ts';
import type { CornerRadius } from '../../core/rules/radius.ts';
import { mm } from '../../core/units.ts';
import { bundledAssetUrl } from './assetUrl.ts';
import { applyFabricScale } from './fabricScale.ts';
import {
  type CushionMesh,
  insideCornerSeatMesh,
  seatCushionMesh,
  wedgeBackPlacement,
} from './cushionMesh.ts';

/**
 * The fabric image, resolved wherever this build is hosted.
 *
 * Applied to any texture stored as a site-absolute path rather than only to Warwick Caulfield,
 * which is what it used to test. A hardcoded brand-and-collection pair meant the very next
 * fabric anybody added would skip the fix and 404 under a sub-path deploy — the same bug that
 * had already been fixed once for board decors.
 */
const fabricUrl = (upholstery: UpholsteryMaterial): string =>
  upholstery.textureUrl.startsWith('/')
    ? bundledAssetUrl(upholstery.textureUrl)
    : upholstery.textureUrl;

/**
 * Load a fabric once and leave it alone.
 *
 * Nothing here writes `repeat` — see `applyFabricScale`. The wrap mode and colour space are
 * properties of the image rather than of any one cushion, so setting them on the shared texture
 * is safe in a way that setting a per-cabinet scale never was.
 */
const useFabric = (upholstery: UpholsteryMaterial) => {
  const map = useLoader(TextureLoader, fabricUrl(upholstery));
  map.colorSpace = SRGBColorSpace;
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  return map;
};

/**
 * A ref callback that puts whatever geometry it is handed into this fabric's real repeats.
 *
 * **It takes the geometry, not the mesh, and that is the whole of the second cushion bug.**
 *
 * It used to sit on the `<mesh>`. A ref on a mesh fires when the *mesh* is created, and the mesh
 * outlives its geometry: `<extrudeGeometry args={…}>` is a child, and changing any of those args —
 * the back cushion's height, thickness or lean, or the cabinet's width — makes R3F build a **new**
 * geometry and attach it to the same mesh. The ref never fires again, so the replacement kept its
 * raw UVs.
 *
 * Three's extrude UV generator emits **shape coordinates**, which in this model are millimetres, so
 * an unscaled cushion asks for something like 5,800 repeats of the weave across itself. Every screen
 * pixel then averages the whole swatch and the fabric renders as flat colour — indistinguishable
 * from a texture that failed to load, which is exactly how it was reported, twice.
 *
 * It is also why deleting the cabinet and re-adding it "fixed" it: that remounts the mesh, so the
 * ref fires against the geometry that is actually there. Attaching to the geometry makes the two
 * cases the same one.
 *
 * The reported symptom named the **back** cushion because that is the one whose geometry is rebuilt
 * by the controls anybody actually touches. The seat had the identical fault and simply took a
 * different edit to show it.
 */
const useFabricScale = (upholstery: UpholsteryMaterial) =>
  useCallback(
    (geometry: BufferGeometry | null) => {
      if (geometry) applyFabricScale(geometry, upholstery.textureRepeat);
    },
    [upholstery.textureRepeat],
  );

/**
 * The cushion's surface.
 *
 * **Selection does not take the fabric away.** It used to set `map` to `null` and paint the
 * cushion solid orange, which meant the texture was invisible for as long as the cabinet you
 * were editing was the cabinet you were looking at — and a newly added banquette is selected, so
 * the first thing anybody ever saw of a banquette was an untextured orange block. `PanelMesh`
 * had already learned this and says so in its own comment: replacing a selected part with a flat
 * colour "disguised texture-loading failures as selection behaviour". It did exactly that here.
 *
 * Selection now tints the fabric instead, so the weave stays readable and the cabinet still
 * reads as picked.
 */
function FabricSurface({ map, upholstery, selected, wireframe }: {
  map: ReturnType<typeof useFabric>;
  upholstery: UpholsteryMaterial;
  selected: boolean;
  wireframe: boolean;
}) {
  return <meshStandardMaterial
    color={selected ? '#ffb27a' : '#ffffff'}
    map={map ?? null}
    // Only reached when the image genuinely has not loaded, which is what the fallback is for.
    {...(map ? {} : { color: selected ? '#ffb27a' : upholstery.colourFallback })}
    roughness={0.95}
    wireframe={wireframe}
  />;
}

/**
 * A back cushion with a vertical rear face and the requested lean cut into its front face.
 *
 * ## The bevel has to come off the *placement* as well as the size
 *
 * `bevelSize` and `bevelThickness` grow the geometry outward on **all six faces**, so a shape built
 * `b` smaller finishes at exactly the stated size — that much shipped with §5.14's first pass. What
 * did not is that the growth is not symmetrical about the mesh's origin: it starts the geometry at
 * `−b` on each axis and ends it at `length − b`. So a cushion of exactly the right size sat one
 * bevel out of place on every axis — 18mm on the shipped soft edge, into the wall at the back, off
 * the end of the seat at one end, and 18mm below the seat it is meant to rest on.
 *
 * **Found by measuring the running app after the size was fixed, not by reading the diff** — which
 * is the second time in two sessions this cushion has taught that lesson. The size assertion the
 * last pass added passes on the misplaced cushion, because it is the right size. Nothing but
 * occupancy sees it.
 *
 * The arithmetic is `wedgeBackPlacement`, in `cushionMesh.ts`, so it can be asserted rather than
 * looked at — which is the whole reason this fault survived a session that was fixing its twin.
 */
function WedgeBack({ width, height, thickness, angle, radius, x, y, scaleFabric, children }: {
  width: number;
  height: number;
  thickness: number;
  angle: number;
  radius: number;
  x: number;
  y: number;
  scaleFabric: (geometry: BufferGeometry | null) => void;
  children: ReactNode;
}) {
  // One figure, used by the shape, the extrude and the placement. It was written out twice under
  // two names, identically, which is how the placement came to be corrected in neither.
  const { position, depth, bevel: b } = wedgeBackPlacement({ x, y, width, height, thickness, radius });
  const shape = useMemo(() => {
    const t = Math.max(1, thickness - 2 * b);
    const h = Math.max(1, height - 2 * b);
    const bottomThickness = t + Math.tan(angle) * h;
    const result = new Shape();
    result.moveTo(0, 0);
    result.lineTo(bottomThickness, 0);
    result.lineTo(t, h);
    result.lineTo(0, h);
    result.closePath();
    return result;
  }, [angle, height, thickness, b]);
  return <mesh position={[...position]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow>
    <extrudeGeometry ref={scaleFabric} args={[shape, {
      // Shortened by two bevels; the mesh is placed so the growth lands back inside `width`.
      depth,
      bevelEnabled: true,
      bevelSize: b,
      bevelThickness: b,
      bevelSegments: 3,
      steps: 1,
    }]} />
    {children}
  </mesh>;
}

/**
 * The seat, drawn as whichever of the two shapes it is.
 *
 * A square seat is drei's `RoundedBox`, and still is — it is an extrude with a bevelled shape, and
 * it gives the soft pillow edge on all six sides that a cushion wants. A seat on a cabinet with a
 * rounded corner cannot be a box at all, so it is extruded from an outline instead. The corner is a
 * real quarter circle of a stated radius rather than a softened edge, so it is drawn through the
 * model's own arc code like every other curve here.
 *
 * **Which one it is, how big it is and where it goes are all `seatCushionMesh`** — the two branches
 * disagreeing about the size of the same cushion by two bevels is §5.14's first fault, and them
 * agreeing is not something a screenshot can show you.
 */
function SeatCushion({ mesh, scaleFabric, children }: {
  mesh: CushionMesh;
  scaleFabric: (geometry: BufferGeometry | null) => void;
  children: ReactNode;
}) {
  const seatRef = useRef<Mesh>(null);
  /*
   * `RoundedBox` builds its geometry internally — there is no `<…Geometry>` element to hang a ref
   * on, so this is the one cushion that cannot use the same mechanism as the other four.
   *
   * A layout effect with **no dependency array** is the honest answer here. It runs after every
   * render, which is exactly the condition "the geometry may have been swapped underneath us", and
   * `applyFabricScale` early-returns on a geometry already at this repeat — so the cost is one
   * property comparison and the correctness does not depend on guessing which prop drei rebuilds
   * on. Listing deps here would be re-deriving drei's own memo and would go stale with it.
   */
  useLayoutEffect(() => {
    if (seatRef.current) scaleFabric(seatRef.current.geometry);
  });

  const shape = useMemo(() => {
    if (mesh.kind !== 'extrude') return null;
    const s = new Shape();
    mesh.shape.forEach((p, i) => (i === 0 ? s.moveTo(p.x, p.y) : s.lineTo(p.x, p.y)));
    s.closePath();
    return s;
  }, [mesh]);

  if (mesh.kind === 'box') {
    return <RoundedBox ref={seatRef} args={[...mesh.size]} radius={mesh.bevel} smoothness={4}
      position={[...mesh.position]} castShadow receiveShadow>
      {children}
    </RoundedBox>;
  }
  return <mesh position={[...mesh.position]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
    <extrudeGeometry ref={scaleFabric} args={[shape!, {
      depth: mesh.depth,
      bevelEnabled: true,
      bevelSize: mesh.bevel,
      bevelThickness: mesh.bevel,
      bevelSegments: 3,
      steps: 1,
    }]} />
    {children}
  </mesh>;
}

export function BanquetteCushions({ cabinet, radius, finishedFrontZ, upholstery, selected, wireframe }: {
  cabinet: Cabinet;
  /**
   * Cabinet-space z of the finished front face, from the rule engine.
   *
   * The cushion stands a stated 10mm proud of **that**, not of the carcass — see
   * `core/model/cushion.ts`. Passed in for the same reason `radius` is: re-deriving it here from
   * the depth plus a standoff plus a board thickness would be a second opinion about where the
   * front of the kitchen is, and it is the cushion nobody can check against a cutlist.
   */
  finishedFrontZ: number;
  /**
   * The corner the **rule engine** resolved, not the option the cabinet carries.
   *
   * A radius too tight for the bendy ply to turn resolves to null and the carcass is built
   * square; drawing the cushion off `options.carcassRadius` would put a curve on it anyway, and
   * a cushion is the one part of a banquette nobody can check against a cutlist.
   */
  radius: CornerRadius | null;
  upholstery: UpholsteryMaterial;
  selected: boolean;
  wireframe: boolean;
}) {
  const map = useFabric(upholstery);
  const scaleFabric = useFabricScale(upholstery);

  const seatT = cabinet.options.seatCushionThickness ?? 80;
  const plan = seatCushionPlan({
    W: cabinet.width,
    D: cabinet.depth,
    finishedFrontZ: mm(finishedFrontZ),
    overhang: mm(cabinet.options.seatCushionOverhang ?? 10),
    round: radius ? { corner: radius.corner, radius: radius.r } : null,
  });
  const seatWidth = Math.max(50, plan.width);
  const seatDepth = Math.max(50, plan.depth);
  const radiusOpt = Math.max(1, cabinet.options.cushionCornerRadius ?? 18);
  const fabricMaterial = () => <FabricSurface map={map} upholstery={upholstery} selected={selected} wireframe={wireframe} />;

  // Both shapes of seat, sized and placed in one function, so a square cushion and a rounded one
  // cannot come out of the same cabinet at two different sizes. See `cushionMesh.ts`.
  const seat = seatCushionMesh({ plan, seatTop: cabinet.height, thickness: seatT, radius: radiusOpt });

  return <>
    <SeatCushion mesh={seat} scaleFabric={scaleFabric}>{fabricMaterial()}</SeatCushion>
    {cabinet.options.hasBackCushion !== false && (() => {
      const height = cabinet.options.backCushionHeight ?? 400;
      const thickness = cabinet.options.backCushionThickness ?? 80;
      const angle = Math.min(15, Math.max(0, cabinet.options.backCushionAngle ?? 0)) * Math.PI / 180;
      const backRadius = Math.min(radiusOpt, thickness / 2 - 1, height / 2 - 1);
      /*
       * An end bolster starts in front of the back cushion and runs forward until it meets the
       * curve — see `SeatCushionPlan.endRun`, which is the full seat depth on a square end and
       * stops at the tangent on a radiused one. Past the tangent the seat is turning away
       * underneath and a straight bolster would be hanging over the curve in mid-air.
       *
       * The right-hand one also moves: it used to start hard against the back cushion and stop a
       * bolster's thickness short of the front, which is the left-hand one back to front. Both
       * now run the same span, so a banquette with both ends cushioned is symmetrical.
       */
      // `returnRun` rather than the arithmetic inline: this length is now a **price** as well as a
      // drawing, so the mesh and the upholsterer's charge read the one function. See
      // `core/model/cushion.ts`.
      const endDepth = (end: 'left' | 'right') => returnRun(plan, end, mm(thickness));
      return <>
        <WedgeBack scaleFabric={scaleFabric} width={seatWidth} height={height} thickness={thickness} angle={angle}
          radius={backRadius} x={plan.x0} y={cabinet.height + seatT}>
          {fabricMaterial()}
        </WedgeBack>
        {cabinet.options.leftEndCushion && <group position={[plan.x0, 0, plan.z0 + Math.min(seatDepth, plan.endRun.left)]} rotation={[0, Math.PI / 2, 0]}>
          <WedgeBack scaleFabric={scaleFabric} width={endDepth('left')} height={height} thickness={thickness} angle={angle}
            radius={backRadius} x={0} y={cabinet.height + seatT}>{fabricMaterial()}</WedgeBack>
        </group>}
        {cabinet.options.rightEndCushion && <group position={[plan.x1, 0, plan.z0 + thickness]} rotation={[0, -Math.PI / 2, 0]}>
          <WedgeBack scaleFabric={scaleFabric} width={endDepth('right')} height={height} thickness={thickness} angle={angle}
            radius={backRadius} x={0} y={cabinet.height + seatT}>{fabricMaterial()}</WedgeBack>
        </group>}
      </>;
    })()}
  </>;
}

/**
 * Upholstery for the inside corner unit.
 *
 * **The seat follows the L the rule engine settled on**, taken off `built.insideCorner` rather than
 * rebuilt here. That is the whole reason the plan lives in `core`: the unit shipped for months with
 * a quarter disc in the spec and a *second* quarter in this file, and when the shape turned out to
 * be wrong both had to be found. One description, two readers.
 *
 * The seat is drawn from the finished outline with the cushion's overhang applied by moving the two
 * front faces outward — the same rule as a plain banquette, which is proud at the front and flush
 * everywhere it meets something. Here "the front" is both legs' fronts and the fillet between them,
 * and "flush" is the two walls and the two open ends.
 */
export function BanquetteCornerCushions({ cabinet, plan, upholstery, selected, wireframe }: {
  cabinet: Cabinet;
  /** The L the engine built, or null if this cabinet could not produce one. */
  plan: InsideCornerPlan | null;
  upholstery: UpholsteryMaterial;
  selected: boolean;
  wireframe: boolean;
}) {
  const map = useFabric(upholstery);
  const scaleFabric = useFabricScale(upholstery);

  const seatT = cabinet.options.seatCushionThickness ?? 80;
  const overhang = Math.max(0, cabinet.options.seatCushionOverhang ?? 10);

  /*
   * **The arithmetic is `insideCornerSeatMesh`, in `cushionMesh.ts`, and none of it is left here.**
   *
   * The outline, the inset the extrude's bevel grows back, and the origin the mesh sits at are all
   * one derivation and all three have to agree. Two of them shipped correct and the third — the
   * origin — was got wrong twice and could only be caught by measuring the live scene, because a
   * `useMemo` in a component is not something a test in Node can read. §5.13 asked for exactly this
   * before the corner cushion was touched again.
   *
   * What is left in this component is the mesh: three.js objects built from numbers somebody else
   * has already checked.
   */
  const seat = useMemo(
    () =>
      plan
        ? insideCornerSeatMesh({
            plan,
            seatTop: cabinet.height,
            thickness: seatT,
            overhang,
            radius: cabinet.options.cushionCornerRadius ?? 18,
          })
        : null,
    [plan, cabinet.height, seatT, overhang, cabinet.options.cushionCornerRadius],
  );
  const seatShape = useMemo(() => {
    if (!seat) return null;
    const shape = new Shape();
    seat.shape.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
    shape.closePath();
    return shape;
  }, [seat]);

  const material = () => <FabricSurface map={map} upholstery={upholstery} selected={selected} wireframe={wireframe} />;

  const backHeight = cabinet.options.backCushionHeight ?? 400;
  const backThickness = cabinet.options.backCushionThickness ?? 80;
  const angle = Math.min(15, Math.max(0, cabinet.options.backCushionAngle ?? 0)) * Math.PI / 180;
  const backRadius = Math.max(1, Math.min(cabinet.options.cushionCornerRadius ?? 18, backThickness / 4));
  const backY = cabinet.height + seatT;
  if (!plan || !seat || !seatShape) return null;

  return <>
    {/*
      Every number in this mesh comes out of `insideCornerSeatMesh` — the origin included, which is
      the one that had to be measured in the running scene twice. The rotation stays here because it
      is what the numbers were computed against: −π/2 about X maps a local `(x, y, z)` to
      `(x, z, −y)`, so the extrude runs up and shape y runs backwards along cabinet z.
    */}
    <mesh position={[...seat.position]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <extrudeGeometry ref={scaleFabric} args={[seatShape, {
        depth: seat.depth,
        bevelEnabled: true,
        bevelSize: seat.bevel,
        bevelThickness: seat.bevel,
        bevelSegments: 3,
        steps: 1,
      }]} />
      {material()}
    </mesh>
    {/*
      One back per wall, each running its own wall's full span — where the old pair were both one
      radius long, which was the same number twice because the unit was square by construction.
    */}
    {cabinet.options.hasBackCushion !== false && <>
      <WedgeBack scaleFabric={scaleFabric} width={cabinet.width} height={backHeight} thickness={backThickness} angle={angle}
        radius={backRadius} x={0} y={backY}>{material()}</WedgeBack>
      <group position={[0, 0, cabinet.depth]} rotation={[0, Math.PI / 2, 0]}>
        <WedgeBack scaleFabric={scaleFabric} width={cabinet.depth} height={backHeight} thickness={backThickness} angle={angle}
          radius={backRadius} x={0} y={backY}>{material()}</WedgeBack>
      </group>
    </>}
  </>;
}
