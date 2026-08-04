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
import {
  type SeatCushionPlan,
  cornerSeatRadius,
  returnRun,
  seatCushionPlan,
} from '../../core/model/cushion.ts';
import type { UpholsteryMaterial } from '../../core/model/material.ts';
import type { CornerRadius } from '../../core/rules/radius.ts';
import { mm } from '../../core/units.ts';
import { bundledAssetUrl } from './assetUrl.ts';
import { applyFabricScale } from './fabricScale.ts';

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

/** A back cushion with a vertical rear face and the requested lean cut into its front face. */
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
  const shape = useMemo(() => {
    const bottomThickness = thickness + Math.tan(angle) * height;
    const result = new Shape();
    result.moveTo(0, 0);
    result.lineTo(bottomThickness, 0);
    result.lineTo(thickness, height);
    result.lineTo(0, height);
    result.closePath();
    return result;
  }, [angle, height, thickness]);
  const bevel = Math.max(0.5, Math.min(radius, thickness / 4, width / 4));
  return <mesh position={[x + width, y, 0]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow>
    <extrudeGeometry ref={scaleFabric} args={[shape, {
      depth: width,
      bevelEnabled: true,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 3,
      steps: 1,
    }]} />
    {children}
  </mesh>;
}

/**
 * The seat, as a plan shape extruded upward.
 *
 * A plain seat is drawn by drei's `RoundedBox`, and still is — it is an extrude with a bevelled
 * shape, and it gives the soft pillow edge on all six sides that a cushion wants. A seat on a
 * cabinet with a rounded corner cannot be a box at all, so it is extruded from `seatCushionPlan`'s
 * outline instead, bevelled the same way. The corner uses `absarc` rather than a rounded-box
 * bevel because it is a real quarter circle of a stated radius, not a softened edge.
 */
function SeatCushion({ plan, thickness, bevel, y, scaleFabric, children }: {
  plan: SeatCushionPlan;
  thickness: number;
  bevel: number;
  y: number;
  scaleFabric: (geometry: BufferGeometry | null) => void;
  children: ReactNode;
}) {
  const round = plan.round;
  /*
   * Shape space, and it is worth writing out because getting it back to front is invisible in a
   * screenshot until you look for it. The mesh is turned `−π/2` about X, which maps a local
   * point `(x, y, z)` to `(x, z, −y)` in the parent. So:
   *
   *   shape x  →  cabinet x, from the origin the mesh is placed at
   *   shape y  →  cabinet z, **backwards**: y = 0 is the front, y = depth is the back
   *   extrude  →  cabinet y, straight up
   *
   * Which is why the mesh is placed at `z1`, the cushion's **front** edge, and not at `z0`.
   * `BanquetteCornerCushions` already does exactly this for its quarter seat.
   */
  const shape = useMemo(() => {
    const w = plan.width;
    const d = plan.depth;
    const s = new Shape();
    if (!round) {
      s.moveTo(0, 0);
      s.lineTo(w, 0);
      s.lineTo(w, d);
      s.lineTo(0, d);
      s.closePath();
      return s;
    }
    // Wound counter-clockwise in shape space, with the arc at y = 0 — the front.
    const r = round.radius;
    if (round.corner === 'front-right') {
      s.moveTo(0, 0);
      s.lineTo(w - r, 0);
      s.absarc(w - r, r, r, -Math.PI / 2, 0, false);
      s.lineTo(w, d);
      s.lineTo(0, d);
    } else {
      s.moveTo(r, 0);
      s.lineTo(w, 0);
      s.lineTo(w, d);
      s.lineTo(0, d);
      s.lineTo(0, r);
      s.absarc(r, r, r, Math.PI, 1.5 * Math.PI, false);
    }
    s.closePath();
    return s;
  }, [plan.width, plan.depth, round]);

  /*
   * The bevel is the pillow edge, and it grows the extrusion in *both* directions — so the
   * extrusion is shortened by two of them and lifted by one, and the cushion finishes exactly
   * `thickness` tall sitting on the seat. `RoundedBox` is centred and needs no such correction,
   * which is why the two branches read differently.
   */
  const b = Math.max(0.5, Math.min(bevel, thickness / 2 - 1));
  return <mesh position={[plan.x0, y + b, plan.z1]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
    <extrudeGeometry ref={scaleFabric} args={[shape, {
      depth: Math.max(1, thickness - 2 * b),
      bevelEnabled: true,
      bevelSize: b,
      bevelThickness: b,
      bevelSegments: 3,
      steps: 1,
    }]} />
    {children}
  </mesh>;
}

export function BanquetteCushions({ cabinet, radius, upholstery, selected, wireframe }: {
  cabinet: Cabinet;
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

  /*
   * The square seat is drei's `RoundedBox`, which builds its geometry internally — there is no
   * `<…Geometry>` element to hang a ref on, so this is the one cushion that cannot use the same
   * mechanism as the other four.
   *
   * A layout effect with **no dependency array** is the honest answer here. It runs after every
   * render, which is exactly the condition "the geometry may have been swapped underneath us", and
   * `applyFabricScale` early-returns on a geometry already at this repeat — so the cost is one
   * property comparison and the correctness does not depend on guessing which prop drei rebuilds
   * on. Listing deps here would be re-deriving drei's own memo and would go stale with it.
   */
  const seatRef = useRef<Mesh>(null);
  useLayoutEffect(() => {
    if (seatRef.current) applyFabricScale(seatRef.current.geometry, upholstery.textureRepeat);
  });

  const seatT = cabinet.options.seatCushionThickness ?? 80;
  const inset = cabinet.options.seatCushionInset ?? 5;
  const plan = seatCushionPlan({
    W: cabinet.width,
    D: cabinet.depth,
    inset: mm(inset),
    round: radius ? { corner: radius.corner, radius: radius.r } : null,
  });
  const seatWidth = Math.max(50, plan.width);
  const seatDepth = Math.max(50, plan.depth);
  const radiusOpt = Math.max(1, cabinet.options.cushionCornerRadius ?? 18);
  const fabricMaterial = () => <FabricSurface map={map} upholstery={upholstery} selected={selected} wireframe={wireframe} />;
  const softEdge = Math.min(radiusOpt, seatT / 2 - 1, seatDepth / 2 - 1);

  return <>
    {plan.round
      ? <SeatCushion plan={plan} thickness={seatT} bevel={Math.max(0.5, softEdge)} y={cabinet.height} scaleFabric={scaleFabric}>
          {fabricMaterial()}
        </SeatCushion>
      : <RoundedBox ref={seatRef} args={[seatWidth, seatT, seatDepth]} radius={softEdge} smoothness={4}
          position={[cabinet.width / 2, cabinet.height + seatT / 2, cabinet.depth / 2]} castShadow receiveShadow>
          {fabricMaterial()}
        </RoundedBox>}
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
          radius={backRadius} x={inset} y={cabinet.height + seatT}>
          {fabricMaterial()}
        </WedgeBack>
        {cabinet.options.leftEndCushion && <group position={[inset, 0, plan.z0 + Math.min(seatDepth, plan.endRun.left)]} rotation={[0, Math.PI / 2, 0]}>
          <WedgeBack scaleFabric={scaleFabric} width={endDepth('left')} height={height} thickness={thickness} angle={angle}
            radius={backRadius} x={0} y={cabinet.height + seatT}>{fabricMaterial()}</WedgeBack>
        </group>}
        {cabinet.options.rightEndCushion && <group position={[cabinet.width - inset, 0, plan.z0 + thickness]} rotation={[0, -Math.PI / 2, 0]}>
          <WedgeBack scaleFabric={scaleFabric} width={endDepth('right')} height={height} thickness={thickness} angle={angle}
            radius={backRadius} x={0} y={cabinet.height + seatT}>{fabricMaterial()}</WedgeBack>
        </group>}
      </>;
    })()}
  </>;
}

/** Upholstery for the quarter-circle unit joining two perpendicular banquettes. */
export function BanquetteCornerCushions({ cabinet, upholstery, selected, wireframe }: {
  cabinet: Cabinet;
  upholstery: UpholsteryMaterial;
  selected: boolean;
  wireframe: boolean;
}) {
  const map = useFabric(upholstery);
  const scaleFabric = useFabricScale(upholstery);

  const seatT = cabinet.options.seatCushionThickness ?? 80;
  const inset = Math.max(0, cabinet.options.seatCushionInset ?? 5);
  // Shared with costing, for the same reason `returnRun` is — see `core/model/cushion.ts`.
  const r = cornerSeatRadius(cabinet.width, cabinet.depth, mm(inset));
  const seatShape = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(0, 0);
    shape.lineTo(r, 0);
    shape.absarc(0, 0, r, 0, Math.PI / 2, false);
    shape.closePath();
    return shape;
  }, [r]);
  const material = () => <FabricSurface map={map} upholstery={upholstery} selected={selected} wireframe={wireframe} />;

  const backHeight = cabinet.options.backCushionHeight ?? 400;
  const backThickness = cabinet.options.backCushionThickness ?? 80;
  const angle = Math.min(15, Math.max(0, cabinet.options.backCushionAngle ?? 0)) * Math.PI / 180;
  const backRadius = Math.max(1, Math.min(cabinet.options.cushionCornerRadius ?? 18, backThickness / 4));
  const backY = cabinet.height + seatT;

  return <>
    <mesh position={[0, cabinet.height, r]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <extrudeGeometry ref={scaleFabric} args={[seatShape, { depth: seatT, bevelEnabled: true, bevelSize: 3, bevelThickness: 3, bevelSegments: 3 }]} />
      {material()}
    </mesh>
    {cabinet.options.hasBackCushion !== false && <>
      <WedgeBack scaleFabric={scaleFabric} width={r} height={backHeight} thickness={backThickness} angle={angle}
        radius={backRadius} x={0} y={backY}>{material()}</WedgeBack>
      <group position={[0, 0, r]} rotation={[0, Math.PI / 2, 0]}>
        <WedgeBack scaleFabric={scaleFabric} width={r} height={backHeight} thickness={backThickness} angle={angle}
          radius={backRadius} x={0} y={backY}>{material()}</WedgeBack>
      </group>
    </>}
  </>;
}
