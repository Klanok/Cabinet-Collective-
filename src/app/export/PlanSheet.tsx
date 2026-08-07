/**
 * The floor plan, drawn on a sheet of paper.
 *
 * This file knows how to draw and nothing else. **Every figure it prints comes in already
 * decided** — `core/export/planSheet.ts` reads them off the model — so there is nowhere here for
 * a dimension to be measured off the geometry and quietly agree with a fault in it.
 *
 * ## The one thing to keep straight: two kinds of millimetre
 *
 * The SVG's user units are **paper millimetres**, and the `viewBox` is the sheet itself. So a
 * `strokeWidth` of 0.25 is a quarter of a millimetre on the finished page at any scale, and text
 * at 2.5 is 2.5mm tall — which is how a drawing is specified, and why this is worth the
 * conversion. Model millimetres only ever reach the page through `toPaper`.
 */

import type { Cabinet } from '../../core/model/cabinet.ts';
import type { Wall } from '../../core/model/room.ts';
import { wallInwardNormal } from '../../core/model/room.ts';
import { cabinetFootprint } from '../../core/project/wallPlacement.ts';
import type { Dimension, ElevationMarker, PlanSheetContent } from '../../core/export/planSheet.ts';
import { type DrawingScale, type Sheet, toPaper } from '../../core/export/sheet.ts';

/** Line weights and text heights, in paper millimetres — a drawing's real specification. */
const WEIGHT = { wall: 0.5, cabinet: 0.35, overhead: 0.25, dim: 0.18, frame: 0.7 };
const TEXT = { dim: 2.4, label: 2.6, marker: 3.4, title: 3.2, titleBig: 5 };
/** Arrow half-length on a dimension line. */
const TICK = 1.4;

interface Ctx {
  readonly origin: { x: number; z: number };
  readonly scale: DrawingScale;
  readonly frame: { x: number; y: number };
}

const P = (ctx: Ctx, p: { x: number; z: number }) => toPaper(p, ctx.origin, ctx.scale, ctx.frame);

function WallShape({ wall, ctx }: { wall: Wall; ctx: Ctx }) {
  const n = wallInwardNormal(wall);
  const t = wall.thickness;
  // The stored line is the inside face, so the body of the wall lies away from the room.
  const ring = [
    { x: wall.start.x, z: wall.start.y },
    { x: wall.end.x, z: wall.end.y },
    { x: wall.end.x - n.x * t, z: wall.end.y - n.y * t },
    { x: wall.start.x - n.x * t, z: wall.start.y - n.y * t },
  ].map((p) => P(ctx, p));

  return (
    <polygon
      points={ring.map((p) => `${p.x},${p.y}`).join(' ')}
      fill="#d8d4cc"
      stroke="#111"
      strokeWidth={WEIGHT.wall}
      strokeLinejoin="miter"
    />
  );
}

/**
 * A cabinet from above, with its door face marked.
 *
 * Wall units are dashed — the convention every set of joinery drawings uses for something above
 * the bench, and structurally necessary here rather than decorative: an overhead sits directly
 * over the base run, so undashed it is just a second rectangle in the same place.
 */
function CabinetShape({ cabinet, ctx }: { cabinet: Cabinet; ctx: Ctx }) {
  const overhead = cabinet.typeId === 'wall';
  const corners = cabinetFootprint(cabinet).map((p) => P(ctx, p));
  // Corners come back front-left, front-right, back-right, back-left.
  const [fl, fr] = [corners[0]!, corners[1]!];
  const [br, bl] = [corners[2]!, corners[3]!];
  const code = cabinet.name.split(' ')[0] ?? cabinet.name;

  // Label between the back and the front, pulled back for an overhead so the two rows of
  // labels do not land on each other where a wall unit sits over a base one.
  const t = overhead ? 0.36 : 0.74;
  const label = {
    x: (bl.x + br.x) / 2 + ((fl.x + fr.x) / 2 - (bl.x + br.x) / 2) * t,
    y: (bl.y + br.y) / 2 + ((fl.y + fr.y) / 2 - (bl.y + br.y) / 2) * t,
  };

  return (
    <g>
      <polygon
        points={corners.map((p) => `${p.x},${p.y}`).join(' ')}
        fill={overhead ? 'none' : '#fff'}
        stroke="#111"
        strokeWidth={overhead ? WEIGHT.overhead : WEIGHT.cabinet}
        strokeDasharray={overhead ? '2.5 1.5' : undefined}
      />
      {/* The door face, drawn heavier — on a plan this is what tells you which way it opens. */}
      {!overhead && (
        <line x1={fl.x} y1={fl.y} x2={fr.x} y2={fr.y} stroke="#111" strokeWidth={WEIGHT.cabinet * 2} />
      )}
      <text
        x={label.x}
        y={label.y}
        fontSize={TEXT.label}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#111"
      >
        {code}
      </text>
    </g>
  );
}

/**
 * A dimension: witness lines out to an offset line, ticks at each end, the figure over the middle.
 *
 * The figure is always drawn the right way up. A dimension along a wall running down the page
 * would otherwise read sideways or upside down, and a client turning the sheet round to read a
 * number is a client who has been handed a drawing that does not work.
 */
function DimensionLine({ dim, ctx }: { dim: Dimension; ctx: Ctx }) {
  const off = { x: dim.offset.x * dim.distance, z: dim.offset.y * dim.distance };
  const a = P(ctx, { x: dim.a.x, z: dim.a.y });
  const b = P(ctx, { x: dim.b.x, z: dim.b.y });
  const ao = P(ctx, { x: dim.a.x + off.x, z: dim.a.y + off.z });
  const bo = P(ctx, { x: dim.b.x + off.x, z: dim.b.y + off.z });

  const dx = bo.x - ao.x;
  const dy = bo.y - ao.y;
  const len = Math.hypot(dx, dy);
  if (len < 3) return null; // too short on paper to letter — the figure would be unreadable
  const ux = dx / len;
  const uy = dy / len;

  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  // Keep the text upright: past vertical, read it from the other side instead.
  if (angle > 90 || angle < -90) angle += 180;

  const mid = { x: (ao.x + bo.x) / 2, y: (ao.y + bo.y) / 2 };
  const heavy = dim.kind === 'overall';

  return (
    <g stroke="#111" strokeWidth={WEIGHT.dim} fill="none">
      {/* Witness lines, held slightly off what they measure. */}
      <line x1={a.x + (ao.x - a.x) * 0.12} y1={a.y + (ao.y - a.y) * 0.12} x2={ao.x} y2={ao.y} />
      <line x1={b.x + (bo.x - b.x) * 0.12} y1={b.y + (bo.y - b.y) * 0.12} x2={bo.x} y2={bo.y} />
      <line x1={ao.x} y1={ao.y} x2={bo.x} y2={bo.y} />
      {/* Architect's ticks rather than arrowheads — they stay legible at 1:100. */}
      <line
        x1={ao.x - ux * TICK + uy * TICK}
        y1={ao.y - uy * TICK - ux * TICK}
        x2={ao.x + ux * TICK - uy * TICK}
        y2={ao.y + uy * TICK + ux * TICK}
      />
      <line
        x1={bo.x - ux * TICK + uy * TICK}
        y1={bo.y - uy * TICK - ux * TICK}
        x2={bo.x + ux * TICK - uy * TICK}
        y2={bo.y + uy * TICK + ux * TICK}
      />
      <text
        x={mid.x}
        y={mid.y}
        fontSize={heavy ? TEXT.dim * 1.15 : TEXT.dim}
        fontWeight={heavy ? 600 : 400}
        textAnchor="middle"
        stroke="none"
        fill="#111"
        transform={`rotate(${angle} ${mid.x} ${mid.y}) translate(0 -1.1)`}
      >
        {Math.round(dim.value)}
      </text>
    </g>
  );
}

/** The lettered circle keying this wall to its elevation sheet. */
function Marker({ marker, ctx }: { marker: ElevationMarker; ctx: Ctx }) {
  const at = P(ctx, { x: marker.at.x, z: marker.at.y });
  const r = 3.6;
  // The tail points at the wall the elevation is taken of.
  const tail = { x: at.x + marker.look.x * r * 2.1, y: at.y + marker.look.y * r * 2.1 };
  return (
    <g>
      <line
        x1={at.x + marker.look.x * r}
        y1={at.y + marker.look.y * r}
        x2={tail.x}
        y2={tail.y}
        stroke="#111"
        strokeWidth={WEIGHT.cabinet}
      />
      <circle cx={at.x} cy={at.y} r={r} fill="#fff" stroke="#111" strokeWidth={WEIGHT.cabinet} />
      <text
        x={at.x}
        y={at.y}
        fontSize={TEXT.marker}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#111"
      >
        {marker.key}
      </text>
    </g>
  );
}

export interface TitleBlockInfo {
  readonly jobName: string;
  readonly client: string;
  readonly roomName: string;
  readonly entity: string;
  readonly date: string;
  readonly sheetTitle: string;
  readonly sheetNumber: string;
  readonly scaleLabel: string;
}

function TitleBlock({ sheet, info }: { sheet: Sheet; info: TitleBlockInfo }) {
  const top = sheet.height - sheet.margin - sheet.titleBlockHeight;
  const left = sheet.margin;
  const width = sheet.width - sheet.margin * 2;
  const h = sheet.titleBlockHeight;
  // Three columns: who it's for, what the sheet is, and how to read it.
  const c1 = left + width * 0.42;
  const c2 = left + width * 0.76;

  const field = (x: number, y: number, label: string, value: string, big = false) => (
    <g key={label + x + y}>
      <text x={x + 2.5} y={y + 4.2} fontSize={2} fill="#666" letterSpacing={0.3}>
        {label.toUpperCase()}
      </text>
      <text x={x + 2.5} y={y + (big ? 10.6 : 9.6)} fontSize={big ? TEXT.titleBig : TEXT.title} fill="#111" fontWeight={big ? 600 : 400}>
        {value || '—'}
      </text>
    </g>
  );

  return (
    <g>
      <rect x={left} y={top} width={width} height={h} fill="none" stroke="#111" strokeWidth={WEIGHT.frame} />
      <line x1={c1} y1={top} x2={c1} y2={top + h} stroke="#111" strokeWidth={WEIGHT.dim} />
      <line x1={c2} y1={top} x2={c2} y2={top + h} stroke="#111" strokeWidth={WEIGHT.dim} />
      <line x1={left} y1={top + h / 2} x2={width + left} y2={top + h / 2} stroke="#111" strokeWidth={WEIGHT.dim} />

      {field(left, top, 'Client', info.client, true)}
      {field(left, top + h / 2, 'Job', info.jobName)}
      {field(c1, top, 'Drawing', info.sheetTitle, true)}
      {field(c1, top + h / 2, 'Room', info.roomName)}
      {field(c2, top, 'Scale', info.scaleLabel, true)}
      {field(c2, top + h / 2, 'Date', info.date)}

      <text x={left + width - 2.5} y={top + h - 2.5} fontSize={TEXT.title} textAnchor="end" fill="#111">
        {info.sheetNumber}
      </text>
      <text x={c1 - 2.5} y={top + h - 2.5} fontSize={2.2} textAnchor="end" fill="#666">
        {info.entity}
      </text>
    </g>
  );
}

/**
 * A scale bar — the check a client can actually perform on the sheet.
 *
 * It is drawn from the same `DrawingScale` the geometry is, so it cannot disagree with the
 * drawing; and if a printer scales the page to fit, the bar shrinks with it and stays true while
 * the printed "1:50" silently stops being. That is the whole reason a drawing carries one.
 */
function ScaleBar({ sheet, scale }: { sheet: Sheet; scale: DrawingScale }) {
  // A round number of model metres that comes out a sensible length on paper.
  const metres = scale.denominator >= 100 ? 5 : scale.denominator >= 40 ? 2 : 1;
  const paperLength = (metres * 1000) / scale.denominator;
  const x = sheet.margin + 2;
  const y = sheet.height - sheet.margin - sheet.titleBlockHeight - 6;
  const segments = 4;
  const seg = paperLength / segments;

  return (
    <g>
      {Array.from({ length: segments }, (_, i) => (
        <rect
          key={i}
          x={x + i * seg}
          y={y}
          width={seg}
          height={1.6}
          fill={i % 2 === 0 ? '#111' : '#fff'}
          stroke="#111"
          strokeWidth={0.15}
        />
      ))}
      <text x={x} y={y - 1} fontSize={2} fill="#111">
        0
      </text>
      <text x={x + paperLength} y={y - 1} fontSize={2} textAnchor="middle" fill="#111">
        {metres}m
      </text>
    </g>
  );
}

export function PlanSheet({
  content,
  sheet,
  scale,
  info,
}: {
  content: PlanSheetContent;
  sheet: Sheet;
  scale: DrawingScale;
  info: TitleBlockInfo;
}) {
  // Centre the drawing in its frame rather than jamming it into the top-left corner.
  const drawnW = content.width * scale.paperPerMm;
  const drawnH = content.height * scale.paperPerMm;
  const frame = {
    x: sheet.frame.x + (sheet.frame.width - drawnW) / 2,
    y: sheet.frame.y + (sheet.frame.height - drawnH) / 2,
  };
  const ctx: Ctx = {
    origin: { x: content.extents.minX, z: content.extents.minZ },
    scale,
    frame,
  };

  return (
    <svg
      className="sheet"
      viewBox={`0 0 ${sheet.width} ${sheet.height}`}
      width={`${sheet.width}mm`}
      height={`${sheet.height}mm`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x={0} y={0} width={sheet.width} height={sheet.height} fill="#fff" />
      <rect
        x={sheet.margin}
        y={sheet.margin}
        width={sheet.width - sheet.margin * 2}
        height={sheet.height - sheet.margin * 2}
        fill="none"
        stroke="#111"
        strokeWidth={WEIGHT.frame}
      />

      <g fontFamily="'Helvetica Neue', Arial, sans-serif">
        {content.room.walls.map((wall) => (
          <WallShape key={wall.id} wall={wall} ctx={ctx} />
        ))}
        {/* Bases under overheads, so a dashed wall unit reads over a solid base. */}
        {content.cabinets
          .filter((c) => c.typeId !== 'wall')
          .map((cabinet) => (
            <CabinetShape key={cabinet.id} cabinet={cabinet} ctx={ctx} />
          ))}
        {content.cabinets
          .filter((c) => c.typeId === 'wall')
          .map((cabinet) => (
            <CabinetShape key={cabinet.id} cabinet={cabinet} ctx={ctx} />
          ))}
        {content.dimensions.map((dim, i) => (
          <DimensionLine key={i} dim={dim} ctx={ctx} />
        ))}
        {content.markers.map((marker) => (
          <Marker key={marker.key} marker={marker} ctx={ctx} />
        ))}

        <ScaleBar sheet={sheet} scale={scale} />
        <TitleBlock sheet={sheet} info={info} />
      </g>
    </svg>
  );
}
