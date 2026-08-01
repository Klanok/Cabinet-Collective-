import { RoundedBox } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
import { RepeatWrapping, SRGBColorSpace, TextureLoader } from 'three';
import type { Cabinet } from '../../core/model/cabinet.ts';
import type { UpholsteryMaterial } from '../../core/model/material.ts';
import { bundledAssetUrl } from './assetUrl.ts';

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
      position={[cabinet.width / 2, cabinet.height + 16 + seatT / 2, cabinet.depth / 2]} castShadow receiveShadow>
      {fabricMaterial()}
    </RoundedBox>
    {cabinet.options.hasBackCushion !== false && (() => {
      const height = cabinet.options.backCushionHeight ?? 400;
      const thickness = cabinet.options.backCushionThickness ?? 80;
      const angle = Math.min(15, Math.max(0, cabinet.options.backCushionAngle ?? 0)) * Math.PI / 180;
      const y = cabinet.height + 16 + seatT + height / 2;
      const backZ = thickness / 2 - Math.sin(angle) * height / 2;
      const endDepth = Math.max(50, seatDepth - thickness);
      const backRadius = Math.min(radius, thickness / 2 - 1, height / 2 - 1);
      return <>
        <RoundedBox args={[seatWidth, height, thickness]} radius={backRadius} smoothness={4}
          position={[cabinet.width / 2, y, backZ]} rotation={[-angle, 0, 0]} castShadow receiveShadow>
          {fabricMaterial()}
        </RoundedBox>
        {cabinet.options.leftEndCushion && <RoundedBox args={[thickness, height, endDepth]} radius={backRadius} smoothness={4}
          position={[inset + thickness / 2, y, cabinet.depth / 2]} rotation={[0, 0, angle]} castShadow receiveShadow>
          {fabricMaterial()}
        </RoundedBox>}
        {cabinet.options.rightEndCushion && <RoundedBox args={[thickness, height, endDepth]} radius={backRadius} smoothness={4}
          position={[cabinet.width - inset - thickness / 2, y, cabinet.depth / 2]} rotation={[0, 0, -angle]} castShadow receiveShadow>
          {fabricMaterial()}
        </RoundedBox>}
      </>;
    })()}
  </>;
}
