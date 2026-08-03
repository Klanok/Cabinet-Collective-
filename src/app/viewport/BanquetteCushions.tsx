import { useMemo, type ReactNode } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
import { RepeatWrapping, Shape, SRGBColorSpace, TextureLoader } from 'three';
import type { Cabinet } from '../../core/model/cabinet.ts';
import type { UpholsteryMaterial } from '../../core/model/material.ts';
import { bundledAssetUrl } from './assetUrl.ts';

/** A back cushion with a vertical rear face and the requested lean cut into its front face. */
function WedgeBack({ width, height, thickness, angle, radius, x, y, children }: {
  width: number;
  height: number;
  thickness: number;
  angle: number;
  radius: number;
  x: number;
  y: number;
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
    <extrudeGeometry args={[shape, {
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

export function BanquetteCushions({ cabinet, upholstery, selected, wireframe }: {
  cabinet: Cabinet;
  upholstery: UpholsteryMaterial;
  selected: boolean;
  wireframe: boolean;
}) {
  const textureUrl = upholstery.brand === 'Warwick' && upholstery.collection === 'Caulfield'
    ? bundledAssetUrl(upholstery.textureUrl.replace(/^\//, ''))
    : upholstery.textureUrl;
  const map = useLoader(TextureLoader, textureUrl);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.repeat.set(Math.max(1, cabinet.width / 250), Math.max(1, cabinet.depth / 250));
  map.needsUpdate = true;

  const seatT = cabinet.options.seatCushionThickness ?? 80;
  const inset = cabinet.options.seatCushionInset ?? 5;
  const seatWidth = Math.max(50, cabinet.width - inset * 2);
  const seatDepth = Math.max(50, cabinet.depth - inset * 2);
  const radius = Math.max(1, cabinet.options.cushionCornerRadius ?? 18);
  const colour = selected ? '#ff9640' : upholstery.colourFallback;
  const fabricMaterial = () => <meshStandardMaterial
    color={map && !selected ? '#ffffff' : colour}
    map={!selected ? map : null}
    roughness={0.95}
    wireframe={wireframe}
  />;

  return <>
    <RoundedBox args={[seatWidth, seatT, seatDepth]} radius={Math.min(radius, seatT / 2 - 1, seatDepth / 2 - 1)} smoothness={4}
      position={[cabinet.width / 2, cabinet.height + seatT / 2, cabinet.depth / 2]} castShadow receiveShadow>
      {fabricMaterial()}
    </RoundedBox>
    {cabinet.options.hasBackCushion !== false && (() => {
      const height = cabinet.options.backCushionHeight ?? 400;
      const thickness = cabinet.options.backCushionThickness ?? 80;
      const angle = Math.min(15, Math.max(0, cabinet.options.backCushionAngle ?? 0)) * Math.PI / 180;
      const endDepth = Math.max(50, seatDepth - thickness);
      const backRadius = Math.min(radius, thickness / 2 - 1, height / 2 - 1);
      return <>
        <WedgeBack width={seatWidth} height={height} thickness={thickness} angle={angle}
          radius={backRadius} x={inset} y={cabinet.height + seatT}>
          {fabricMaterial()}
        </WedgeBack>
        {cabinet.options.leftEndCushion && <group position={[inset, 0, cabinet.depth - inset]} rotation={[0, Math.PI / 2, 0]}>
          <WedgeBack width={endDepth} height={height} thickness={thickness} angle={angle}
            radius={backRadius} x={0} y={cabinet.height + seatT}>{fabricMaterial()}</WedgeBack>
        </group>}
        {cabinet.options.rightEndCushion && <group position={[cabinet.width - inset, 0, inset]} rotation={[0, -Math.PI / 2, 0]}>
          <WedgeBack width={endDepth} height={height} thickness={thickness} angle={angle}
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
  const textureUrl = upholstery.brand === 'Warwick' && upholstery.collection === 'Caulfield'
    ? bundledAssetUrl(upholstery.textureUrl.replace(/^\//, ''))
    : upholstery.textureUrl;
  const map = useLoader(TextureLoader, textureUrl);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.repeat.set(Math.max(1, cabinet.width / 250), Math.max(1, cabinet.depth / 250));
  map.needsUpdate = true;

  const seatT = cabinet.options.seatCushionThickness ?? 80;
  const inset = Math.max(0, cabinet.options.seatCushionInset ?? 5);
  const r = Math.max(50, Math.min(cabinet.width, cabinet.depth) - inset);
  const seatShape = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(0, 0);
    shape.lineTo(r, 0);
    shape.absarc(0, 0, r, 0, Math.PI / 2, false);
    shape.closePath();
    return shape;
  }, [r]);
  const colour = selected ? '#ff9640' : upholstery.colourFallback;
  const material = () => <meshStandardMaterial
    color={map && !selected ? '#ffffff' : colour}
    map={!selected ? map : null}
    roughness={0.95}
    wireframe={wireframe}
  />;

  const backHeight = cabinet.options.backCushionHeight ?? 400;
  const backThickness = cabinet.options.backCushionThickness ?? 80;
  const angle = Math.min(15, Math.max(0, cabinet.options.backCushionAngle ?? 0)) * Math.PI / 180;
  const backRadius = Math.max(1, Math.min(cabinet.options.cushionCornerRadius ?? 18, backThickness / 4));
  const backY = cabinet.height + seatT;

  return <>
    <mesh position={[0, cabinet.height, r]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <extrudeGeometry args={[seatShape, { depth: seatT, bevelEnabled: true, bevelSize: 3, bevelThickness: 3, bevelSegments: 3 }]} />
      {material()}
    </mesh>
    {cabinet.options.hasBackCushion !== false && <>
      <WedgeBack width={r} height={backHeight} thickness={backThickness} angle={angle}
        radius={backRadius} x={0} y={backY}>{material()}</WedgeBack>
      <group position={[0, 0, r]} rotation={[0, Math.PI / 2, 0]}>
        <WedgeBack width={r} height={backHeight} thickness={backThickness} angle={angle}
          radius={backRadius} x={0} y={backY}>{material()}</WedgeBack>
      </group>
    </>}
  </>;
}
