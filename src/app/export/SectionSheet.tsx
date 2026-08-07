/**
 * A section, drawn on a sheet of paper.
 *
 * Same shape as `ElevationSheet` — v runs up and SVG's y runs down, so `P` is the one place the
 * vertical is inverted. The horizontal is **s**, out from the wall face, with the wall at the
 * left.
 *
 * ## Boards in section are filled, and that is not decoration
 *
 * The convention every set of joinery drawings uses: a board the cut plane passes **through** is
 * drawn solid, so the eye reads the thickness of what is being made rather than a wireframe of
 * lines that could be anything. It is the whole reason a section is a different drawing from an
 * elevation.
 */

import type { Dimension } from '../../core/export/dimension.ts';
import type { Section, SectionItem } from '../../core/export/section.ts';
import { type DrawingScale, type Sheet } from '../../core/export/sheet.ts';
import { type TitleBlockInfo, SheetFurniture } from './sheetParts.tsx';

const WEIGHT = { cut: 0.4, bench: 0.5, wall: 0.5, dim: 0.18, floor: 0.6 };
const TEXT = { dim: 2.4 };
const TICK = 1.4;

interface Ctx {
  readonly origin: { s: number; v: number };
  readonly scale: DrawingScale;
  readonly frame: { x: number; y: number };
  readonly bottom: number;
}

/** Section millimetres → paper millimetres. The only place v is turned upside down. */
const P = (ctx: Ctx, p: { s: number; v: number }) => ({
  x: ctx.frame.x + (p.s - ctx.origin.s) * ctx.scale.paperPerMm,
  y: ctx.bottom - (p.v - ctx.origin.v) * ctx.scale.paperPerMm,
});

const STYLE: Record<SectionItem['kind'], { fill: string; stroke: string; weight: number }> = {
  cut: { fill: '#8f8a80', stroke: '#111', weight: WEIGHT.cut },
  benchtop: { fill: '#5f5a52', stroke: '#111', weight: WEIGHT.bench },
  wallBody: { fill: '#d8d4cc', stroke: '#111', weight: WEIGHT.wall },
};

function Item({ item, ctx }: { item: SectionItem; ctx: Ctx }) {
  const a = P(ctx, { s: item.s0, v: item.v1 });
  const b = P(ctx, { s: item.s1, v: item.v0 });
  const w = b.x - a.x;
  const h = b.y - a.y;
  if (w <= 0 || h <= 0) return null;
  const s = STYLE[item.kind];
  return <rect x={a.x} y={a.y} width={w} height={h} fill={s.fill} stroke={s.stroke} strokeWidth={s.weight} />;
}

function DimensionLine({ dim, ctx }: { dim: Dimension; ctx: Ctx }) {
  const off = { s: dim.offset.x * dim.distance, v: dim.offset.y * dim.distance };
  const a = P(ctx, { s: dim.a.x, v: dim.a.y });
  const b = P(ctx, { s: dim.b.x, v: dim.b.y });
  const ao = P(ctx, { s: dim.a.x + off.s, v: dim.a.y + off.v });
  const bo = P(ctx, { s: dim.b.x + off.s, v: dim.b.y + off.v });

  const dx = bo.x - ao.x;
  const dy = bo.y - ao.y;
  const len = Math.hypot(dx, dy);
  if (len < 3) return null;
  const ux = dx / len;
  const uy = dy / len;

  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  const mid = { x: (ao.x + bo.x) / 2, y: (ao.y + bo.y) / 2 };
  const heavy = dim.kind === 'overall';

  return (
    <g stroke="#111" strokeWidth={WEIGHT.dim} fill="none">
      <line x1={a.x + (ao.x - a.x) * 0.12} y1={a.y + (ao.y - a.y) * 0.12} x2={ao.x} y2={ao.y} />
      <line x1={b.x + (bo.x - b.x) * 0.12} y1={b.y + (bo.y - b.y) * 0.12} x2={bo.x} y2={bo.y} />
      <line x1={ao.x} y1={ao.y} x2={bo.x} y2={bo.y} />
      <line
        x1={ao.x - ux * TICK + uy * TICK} y1={ao.y - uy * TICK - ux * TICK}
        x2={ao.x + ux * TICK - uy * TICK} y2={ao.y + uy * TICK + ux * TICK}
      />
      <line
        x1={bo.x - ux * TICK + uy * TICK} y1={bo.y - uy * TICK - ux * TICK}
        x2={bo.x + ux * TICK - uy * TICK} y2={bo.y + uy * TICK + ux * TICK}
      />
      <text
        x={mid.x} y={mid.y}
        fontSize={heavy ? TEXT.dim * 1.15 : TEXT.dim}
        fontWeight={heavy ? 600 : 400}
        textAnchor="middle" stroke="none" fill="#111"
        transform={`rotate(${angle} ${mid.x} ${mid.y}) translate(0 -1.1)`}
      >
        {Math.round(dim.value)}
      </text>
    </g>
  );
}

export function SectionSheet({
  section,
  sheet,
  scale,
  info,
}: {
  section: Section;
  sheet: Sheet;
  scale: DrawingScale;
  info: TitleBlockInfo;
}) {
  const drawnW = section.width * scale.paperPerMm;
  const drawnH = section.height * scale.paperPerMm;
  const frameX = sheet.frame.x + (sheet.frame.width - drawnW) / 2;
  const frameY = sheet.frame.y + (sheet.frame.height - drawnH) / 2;
  const ctx: Ctx = {
    origin: { s: section.extents.minS, v: section.extents.minV },
    scale,
    frame: { x: frameX, y: frameY },
    bottom: frameY + drawnH,
  };

  // Wall behind everything, then the cut boards, then the top over them.
  const order: SectionItem['kind'][] = ['wallBody', 'cut', 'benchtop'];
  const floorLeft = P(ctx, { s: section.extents.minS, v: 0 });
  const floorRight = P(ctx, { s: section.extents.maxS, v: 0 });

  return (
    <svg
      className="sheet"
      viewBox={`0 0 ${sheet.width} ${sheet.height}`}
      width={`${sheet.width}mm`}
      height={`${sheet.height}mm`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x={0} y={0} width={sheet.width} height={sheet.height} fill="#fff" />
      <g fontFamily="'Helvetica Neue', Arial, sans-serif">
        <line
          x1={floorLeft.x} y1={floorLeft.y} x2={floorRight.x} y2={floorRight.y}
          stroke="#111" strokeWidth={WEIGHT.floor}
        />
        {order.map((kind) =>
          section.items
            .filter((i) => i.kind === kind)
            .map((item, i) => <Item key={`${kind}-${i}`} item={item} ctx={ctx} />),
        )}
        {section.dimensions.map((dim, i) => (
          <DimensionLine key={i} dim={dim} ctx={ctx} />
        ))}
        <SheetFurniture sheet={sheet} scale={scale} info={info} />
      </g>
    </svg>
  );
}
