/**
 * The furniture every sheet in the pack carries: the border, the scale bar and the title block.
 *
 * One module because there is now more than one kind of sheet, and this codebase has a standing
 * warning about what happens to a thing copied twice — it gets fixed once. A title block that
 * said 1:20 on the plan and 1:25 on the elevation because somebody edited one copy would be the
 * exact failure the scale ladder exists to prevent, arriving by the back door.
 */

import { type DrawingScale, type Sheet } from '../../core/export/sheet.ts';

const WEIGHT = { frame: 0.7, hair: 0.18 };
const TEXT = { title: 3.2, titleBig: 5, small: 2, tiny: 2.2 };

export interface TitleBlockInfo {
  readonly jobName: string;
  readonly client: string;
  readonly roomName: string;
  readonly entity: string;
  readonly date: string;
  /** What this sheet is — "Floor plan", "Elevation A". */
  readonly sheetTitle: string;
  readonly sheetNumber: string;
  readonly scaleLabel: string;
}

function TitleBlock({ sheet, info }: { sheet: Sheet; info: TitleBlockInfo }) {
  const top = sheet.height - sheet.margin - sheet.titleBlockHeight;
  const left = sheet.margin;
  const width = sheet.width - sheet.margin * 2;
  const h = sheet.titleBlockHeight;
  // Three columns: who it is for, what the sheet is, and how to read it.
  const c1 = left + width * 0.42;
  const c2 = left + width * 0.76;

  const field = (x: number, y: number, label: string, value: string, big = false) => (
    <g key={label + x + y}>
      <text x={x + 2.5} y={y + 4.2} fontSize={TEXT.small} fill="#666" letterSpacing={0.3}>
        {label.toUpperCase()}
      </text>
      <text
        x={x + 2.5}
        y={y + (big ? 10.6 : 9.6)}
        fontSize={big ? TEXT.titleBig : TEXT.title}
        fill="#111"
        fontWeight={big ? 600 : 400}
      >
        {value || '—'}
      </text>
    </g>
  );

  return (
    <g>
      <rect x={left} y={top} width={width} height={h} fill="none" stroke="#111" strokeWidth={WEIGHT.frame} />
      <line x1={c1} y1={top} x2={c1} y2={top + h} stroke="#111" strokeWidth={WEIGHT.hair} />
      <line x1={c2} y1={top} x2={c2} y2={top + h} stroke="#111" strokeWidth={WEIGHT.hair} />
      <line x1={left} y1={top + h / 2} x2={width + left} y2={top + h / 2} stroke="#111" strokeWidth={WEIGHT.hair} />

      {field(left, top, 'Client', info.client, true)}
      {field(left, top + h / 2, 'Job', info.jobName)}
      {field(c1, top, 'Drawing', info.sheetTitle, true)}
      {field(c1, top + h / 2, 'Room', info.roomName)}
      {field(c2, top, 'Scale', info.scaleLabel, true)}
      {field(c2, top + h / 2, 'Date', info.date)}

      <text x={left + width - 2.5} y={top + h - 2.5} fontSize={TEXT.title} textAnchor="end" fill="#111">
        {info.sheetNumber}
      </text>
      <text x={c1 - 2.5} y={top + h - 2.5} fontSize={TEXT.tiny} textAnchor="end" fill="#666">
        {info.entity}
      </text>
    </g>
  );
}

/**
 * A scale bar — the one check a client can actually perform on the sheet.
 *
 * Drawn from the same `DrawingScale` the geometry is, so it cannot disagree with the drawing. Its
 * real job is the case the printed number cannot cover: if a printer scales the page to fit, the
 * bar shrinks with the drawing and stays true while the printed "1:20" silently stops being.
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
      <text x={x} y={y - 1} fontSize={TEXT.small} fill="#111">
        0
      </text>
      <text x={x + paperLength} y={y - 1} fontSize={TEXT.small} textAnchor="middle" fill="#111">
        {metres}m
      </text>
    </g>
  );
}

/**
 * Border, scale bar and title block — everything on a sheet that is not the drawing.
 *
 * `scale` is **optional**, and the case it is omitted for is the overview sheet: a perspective
 * view has no single scale, so it gets no bar. Drawing one would be the pack's own lie — a
 * measuring aid over a drawing that cannot honour a measurement. Its title block says *Not to
 * scale* instead, which is what a set of drawings puts on a perspective.
 */
export function SheetFurniture({
  sheet,
  scale,
  info,
}: {
  sheet: Sheet;
  scale?: DrawingScale;
  info: TitleBlockInfo;
}) {
  return (
    <>
      <rect
        x={sheet.margin}
        y={sheet.margin}
        width={sheet.width - sheet.margin * 2}
        height={sheet.height - sheet.margin * 2}
        fill="none"
        stroke="#111"
        strokeWidth={WEIGHT.frame}
      />
      {scale && <ScaleBar sheet={sheet} scale={scale} />}
      <TitleBlock sheet={sheet} info={info} />
    </>
  );
}
