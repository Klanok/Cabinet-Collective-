/**
 * One panel, rendered.
 *
 * All this does is adapt the core geometry engine's output to a Three.js buffer geometry and
 * position it with the model's own transform. There is no geometry logic here — a panel's
 * shape and placement are decided by the rule engine, not by the view.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Matrix4,
  type Texture,
} from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Panel } from '../../core/model/panel.ts';
import type { SheetMaterial } from '../../core/model/material.ts';
import { type Mm, mm } from '../../core/units.ts';
import { extrudeProfile } from '../../core/geom/extrude.ts';
import { formedMesh } from '../../core/model/forming.ts';
import { Boring } from './Boring.tsx';
import { FrontRelief, frontRecessOf } from './FrontRelief.tsx';
import { panelMatrix } from './transforms.ts';
import { pointOnSheet, type SheetTexturePlacement } from './sheetTexture.ts';
import { bundledAssetUrl } from './assetUrl.ts';

/** Panel colours, keyed loosely by what the part is, so a carcass reads at a glance. */
const ROLE_COLOURS: Record<string, string> = {
  side: '#e8e4dc',
  bottom: '#e0dcd4',
  top: '#e0dcd4',
  stretcher: '#d8d4cc',
  'shelf-adjustable': '#dedad2',
  'shelf-fixed': '#dedad2',
  back: '#c9c4ba',
  door: '#f4f2ee',
  'drawer-front': '#f4f2ee',
  // An applied end is cut from the door board, so it reads as a front and not as a carcass
  // part — which is the whole point of putting one on.
  'end-panel': '#f4f2ee',
  kick: '#8f8b84',
  // The skeleton reads darker than the skin over it, so a radiused end is legible as an
  // assembly rather than as one lump.
  former: '#cfc9be',
  skin: '#ece7dd',
  // A drawer box reads as its own object inside the carcass rather than as another shelf.
  'drawer-bottom': '#d5d0c6',
  'drawer-back': '#cdc8be',
};

/** Air left between stacked layers when drawing them. Rendering only — see `bodyThickness`. */
const DRAW_INSET: Mm = mm(0.3);

/**
 * Jobs snapshot their material records. Redirect earlier supplier-hosted records to the bundled
 * files too, so a freshly opened app does not need the user to recreate standards or clear data.
 */
const bundledTextureUrl = (url: string): string => {
  const bundled = ['notaio-walnut', 'sepia-oak', 'boston-oak', 'prime-oak', 'rural-oak', 'classic-oak'];
  const match = bundled.find((name) => url.toLowerCase().includes(name));
  return match ? bundledAssetUrl(`materials/board/${match}.jpg`) : url;
};

interface Props {
  panel: Panel;
  thickness: Mm;
  /**
   * What the board this part is cut from looks like, if its material says.
   *
   * Preferred over the role colour when present, so a kitchen reads as the decors it is actually
   * made from rather than as a uniform off-white. The role colours below are the fallback and stay
   * exactly as they were — a material with no colour draws precisely as it always did.
   */
  colour?: string;
  texture?: SheetMaterial['texture'];
  /** Current cut-plan position, so neighbouring parts show neighbouring regions of the sheet. */
  texturePlacement?: SheetTexturePlacement;
  selected: boolean;
  onSelect: () => void;
  /**
   * Pointer-down on the panel — the start of a possible drag of its whole cabinet.
   *
   * Optional, because not every part belongs to a cabinet any more. A benchtop or a ladder base is
   * placed by the run it was generated from, not by dragging, so its parts have nothing to grab.
   */
  onGrab?: (event: ThreeEvent<PointerEvent>) => void;
  /** Keep the interaction surface but draw only construction edges and machining marks. */
  wireframe?: boolean;
}

export function PanelMesh({ panel, thickness, colour: boardColour, texture, texturePlacement, selected, onSelect, onGrab, wireframe = false }: Props) {
  const displayTexture = useMemo(() => texture ? {
    ...texture,
    url: bundledTextureUrl(texture.url),
    // All currently bundled woodgrains are supplier full-sheet designs. Override old material
    // snapshots that still describe the former 1200mm square swatches.
    ...(bundledTextureUrl(texture.url).includes('materials/board/')
      ? { repeatLength: mm(3600), repeatWidth: mm(1800) }
      : {}),
  } : undefined, [texture]);
  /*
   * A routed front is drawn as the board that is actually left: a slab of the reduced
   * thickness, with the border standing back up to full thickness around it. So the recess is
   * real geometry, not shading — and it comes from the panel's own features, meaning the
   * viewport never has to be told what a door style is.
   */
  const recess = frontRecessOf(panel, thickness);
  /*
   * Drawn a third of a millimetre thin, and only drawn — the part is still cut to `thickness`.
   *
   * Laminated layers touch exactly: a skin's outer face *is* the next layer's inner face, which
   * is what laminating means. Two surfaces at one depth give the depth buffer nothing to order
   * them by, so they interleave and the curve picks up a fine woven hatch. A third of a
   * millimetre is an order of magnitude below anything a cabinetmaker measures and is plenty
   * for the renderer to make up its mind.
   */
  const bodyThickness = mm((recess ? thickness - recess.depth : thickness) - DRAW_INSET);

  const geometry = useMemo(() => {
    // A formed part is stored flat, because flat is what gets cut. Bending it is the one
    // thing the viewport is allowed to do with `forming`, and it happens here rather than in
    // the model so that the shape being drawn can never become the shape being cut.
    const mesh = panel.forming
      ? formedMesh(panel.profile, bodyThickness, panel.forming)
      : extrudeProfile(panel.profile, bodyThickness);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(mesh.positions, 3));
    g.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
    if (displayTexture) {
      const uv = new Float32Array(mesh.uvs.length);
      for (let i = 0; i < mesh.uvs.length; i += 2) {
        const localX = mesh.uvs[i]!;
        const localY = mesh.uvs[i + 1]!;
        const grainAlongX = panel.grain !== 'width-along-grain';
        const [sheetX, sheetY] = texturePlacement
          ? pointOnSheet(localX, localY, texturePlacement)
          : [grainAlongX ? localX : localY, grainAlongX ? localY : localX];
        // Separate purchased sheets should not all begin on the identical pixel of a swatch.
        // The deterministic offset keeps the view stable while representing another sheet.
        const sheetOffset = texturePlacement ? (texturePlacement.sheetIndex - 1) * 0.371 : 0;
        const u = displayTexture.grainAxis === 'u'
          ? sheetX / displayTexture.repeatLength + sheetOffset
          : sheetY / displayTexture.repeatWidth + sheetOffset;
        const v = displayTexture.grainAxis === 'v'
          ? sheetX / displayTexture.repeatLength + sheetOffset
          : sheetY / displayTexture.repeatWidth + sheetOffset;
        uv[i] = u;
        uv[i + 1] = v;
      }
      g.setAttribute('uv', new BufferAttribute(uv, 2));
    }
    g.setIndex(new BufferAttribute(mesh.indices, 1));
    return g;
  }, [panel.profile, panel.grain, bodyThickness, panel.forming, displayTexture, texturePlacement]);

  const matrix: Matrix4 = useMemo(() => panelMatrix(panel.placement), [panel.placement]);

  // Selection is shown by the orange construction edges below. Keep the real finish visible:
  // replacing every selected panel with orange made it impossible to inspect a texture while
  // editing the cabinet and disguised texture-loading failures as selection behaviour.
  const colour = boardColour ?? ROLE_COLOURS[panel.role] ?? '#dcd8d0';
  // Fronts sit proud of the carcass; making them slightly translucent keeps the interior
  // readable without having to hide them. A routed front stays solid — the whole point of it
  // is the shadow the recess throws, and that doesn't read through a translucent panel.
  const isFront =
    !recess && (panel.role === 'door' || panel.role === 'drawer-front');

  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerDown={onGrab}
      >
        <BoardSurface
          colour={colour}
          textureUrl={displayTexture?.url}
          transparent={wireframe || isFront}
          opacity={wireframe ? 0 : isFront ? 0.86 : 1}
          depthWrite={!wireframe}
        />
      </mesh>
      {/*
        Edge outline, so panel joints stay legible against same-coloured neighbours.

        The 20° threshold matters now that parts can curve. A curve is drawn as a run of
        facets a degree or two apart, and the default 1° threshold treats every one of them as
        an edge — so a radiused shelf comes out looking like a fan rather than a shelf. Twenty
        degrees is well below the square corners that are real and well above the tessellation
        that isn't.
      */}
      <lineSegments>
        <edgesGeometry args={[geometry, 20]} />
        <lineBasicMaterial
          color={selected ? '#ff9640' : wireframe ? '#d7dde5' : '#9a958c'}
          transparent
          opacity={wireframe ? 0.95 : 0.55}
        />
      </lineSegments>

      <FrontRelief panel={panel} thickness={thickness} colour={colour} wireframe={wireframe} />
      <Boring panel={panel} thickness={thickness} />
    </group>
  );
}

/** Load a supplier swatch without making the whole scene fail when the network is unavailable. */
function BoardSurface({
  colour,
  textureUrl,
  transparent,
  opacity,
  depthWrite,
}: {
  colour: string;
  textureUrl?: string;
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
}) {
  const [map, setMap] = useState<Texture | null>(null);

  useEffect(() => {
    if (!textureUrl) {
      setMap(null);
      return;
    }
    let active = true;
    const loaded = new TextureLoader().load(
      textureUrl,
      (image) => {
        image.colorSpace = SRGBColorSpace;
        image.wrapS = RepeatWrapping;
        image.wrapT = RepeatWrapping;
        image.needsUpdate = true;
        if (active) setMap(image);
      },
      undefined,
      () => {
        if (active) setMap(null);
      },
    );
    return () => {
      active = false;
      loaded.dispose();
    };
  }, [textureUrl]);

  return (
    <meshStandardMaterial
      color={map ? '#ffffff' : colour}
      map={map}
      roughness={0.75}
      metalness={0.02}
      transparent={transparent}
      opacity={opacity}
      depthWrite={depthWrite}
    />
  );
}
