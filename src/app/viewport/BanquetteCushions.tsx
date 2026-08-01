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
    ? bundledAssetUrl(`materials/upholstery/${upholstery.colour.toLowerCase()}.jpg`)
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
  const colour = selected ? '#ff9640' : upholstery.colourFallback;
  const fabricMaterial = () => <meshStandardMaterial
    color={map && !selected ? '#ffffff' : colour}
    map={!selected ? map : null}
    roughness={0.95}
    wireframe={wireframe}
  />;

  return <>
    <RoundedBox args={[seatWidth, seatT, seatDepth]} radius={Math.min(18, seatT / 4)} smoothness={4}
      position={[cabinet.width / 2, cabinet.height + 16 + seatT / 2, cabinet.depth / 2]} castShadow receiveShadow>
      {fabricMaterial()}
    </RoundedBox>
    {cabinet.options.hasBackCushion !== false && (() => {
      const height = cabinet.options.backCushionHeight ?? 400;
      const thickness = cabinet.options.backCushionThickness ?? 80;
      return <RoundedBox args={[seatWidth, height, thickness]} radius={Math.min(18, thickness / 4)} smoothness={4}
        position={[cabinet.width / 2, cabinet.height + 16 + seatT + height / 2, thickness / 2]} castShadow receiveShadow>
        {fabricMaterial()}
      </RoundedBox>;
    })()}
  </>;
}
