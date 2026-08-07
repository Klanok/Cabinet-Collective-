/**
 * An elevation, drawn on a sheet of paper.
 *
 * Like `PlanSheet`, this knows how to draw and nothing else — every figure arrives already
 * decided by `core/export/elevation.ts`.
 *
 * ## The one axis that flips
 *
 * Elevation space has **v running up** — height above the floor — and SVG has y running **down**
 * the page. So this is the one drawing in the pack that inverts a coordinate, and it does it in
 * exactly one function, `P`. `sheet.ts`'s `toPaper` deliberately does not, because the plan does
 * not need it: the plan's Z genuinely runs down the page.
 */

import type { Dimension } from '../../core/export/dimension.ts';
import type { Elevation, ElevationItem } from '../../core/export/elevation.ts';
import { type DrawingScale, type Sheet } from '../../core/export/sheet.ts';
import { type TitleBlockInfo, SheetFurniture } from './sheetParts.tsx';

const WEIGHT = { outline: 0.45, front: 0.25, bench: 0.5, kick: 0.25, dim: 0.18, floor: 0.6 };
const TEXT = { dim: 2.4, label: 2.6 };
const TICK = 1.4;

interface Ctx {
  readonly origin: { u: number; v: number };
  readonly scale: DrawingScale;
  readonly frame: { x: number; y: number };
  /** Paper y of the drawing's own top edge — v is measured up from the bottom, so this anchors it. */
  readonly bottom: number;
}

/** Elevation millimetres → paper millimetres. The only place v is turned upside down. */
const P = (ctx: Ctx, p: { u: number; v: number }) => ({
  x: ctx.frame.x + (p.u - ctx.origin.u) * ctx.scale.paperPerMm,
  y: ctx.bottom - (p.v - ctx.origin.v) * ctx.scale.paperPerMm,
});

const STYLE: Record<ElevationItem['kind'], { fill: string; stroke: string; weight: number }> = {
  carcass: { fill: 'none', stroke: '#111', weight: WEIGHT.outline },
  front: { fill: '#fbfaf8', stroke: '#111', weight: WEIGHT.front },
  kick: { fill: '#e6e2da', stroke: '#111', weight: WEIGHT.kick },
  benchtop: { fill: '#c9c4ba', stroke: '#111', weight: WEIGHT.bench },
  // An opening rather than a thing — dashed, the same convention the plan uses for what is
  // drawn but not built by this shop.
  appliance: { fill: 'none', stroke: '#111', weight: WEIGHT.front },
};

function Item({ item, ctx }: { item: ElevationItem; ctx: Ctx }) {
  const a = P(ctx, { u: item.u0, v: item.v1 }); // top-left on paper
  const b = P(ctx, { u: item.u1, v: item.v0 }); // bottom-right
  const w = b.x - a.x;
  const h = b.y - a.y;
  if (w <= 0 || h <= 0) return null;
  const s = STYLE[item.kind];

  return (
    <g>
      <rect
        x={a.x}
        y={a.y}
        width={w}
        height={h}
        fill={s.fill}
        stroke={s.stroke}
        strokeWidth={s.weight}
        strokeDasharray={item.kind === 'appliance' ? '2.5 1.5' : undefined}
      />
      {item.label && h > 6 && w > 7 && (
        <text
          x={a.x + w / 2}
          y={a.y + h / 2}
          fontSize={TEXT.label}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#111"
        >
          {item.label}
        </text>
      )}
    </g>
  );
}

function DimensionLine({ dim, ctx }: { dim: Dimension; ctx: Ctx }) {
  const off = { u: dim.offset.x * dim.distance, v: dim.offset.y * dim.distance };
  const a = P(ctx, { u: dim.a.x, v: dim.a.y });
  const b = P(ctx, { u: dim.b.x, v: dim.b.y });
  const ao = P(ctx, { u: dim.a.x + off.u, v: dim.a.y + off.v });
  const bo = P(ctx, { u: dim.b.x + off.u, v: dim.b.y + off.v });

  const dx = bo.x - ao.x;
  const dy = bo.y - ao.y;
  const len = Math.hypot(dx, dy);
  if (len < 3) return null;
  const ux = dx / len;
  const uy = dy / len;

  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  // A height dimension runs up the page; read it from the left rather than upside down.
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

export function ElevationSheet({
  elevation,
  sheet,
  scale,
  info,
}: {
  elevation: Elevation;
  sheet: Sheet;
  scale: DrawingScale;
  info: TitleBlockInfo;
}) {
  const drawnW = elevation.width * scale.paperPerMm;
  const drawnH = elevation.height * scale.paperPerMm;
  const frameX = sheet.frame.x + (sheet.frame.width - drawnW) / 2;
  const frameY = sheet.frame.y + (sheet.frame.height - drawnH) / 2;
  const ctx: Ctx = {
    origin: { u: elevation.extents.minU, v: elevation.extents.minV },
    scale,
    frame: { x: frameX, y: frameY },
    bottom: frameY + drawnH,
  };

  /*
   * Drawn back to front: benchtops and kicks first, then the unit outlines, then the fronts over
   * them. A front is what you see, so it wins — the outline behind it reads as the line between
   * one unit and the next rather than as a box drawn on top of the doors.
   */
  const order: ElevationItem['kind'][] = ['benchtop', 'kick', 'carcass', 'front', 'appliance'];
  const floorLeft = P(ctx, { u: elevation.extents.minU, v: 0 });
  const floorRight = P(ctx, { u: elevation.extents.maxU, v: 0 });

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
        {/* The floor. Everything on an elevation is measured off it, so it is drawn. */}
        <line
          x1={floorLeft.x} y1={floorLeft.y} x2={floorRight.x} y2={floorRight.y}
          stroke="#111" strokeWidth={WEIGHT.floor}
        />
        {order.map((kind) =>
          elevation.items
            .filter((i) => i.kind === kind)
            .map((item, i) => <Item key={`${kind}-${i}`} item={item} ctx={ctx} />),
        )}
        {elevation.dimensions.map((dim, i) => (
          <DimensionLine key={i} dim={dim} ctx={ctx} />
        ))}
        <SheetFurniture sheet={sheet} scale={scale} info={info} />
      </g>
    </svg>
  );
}
