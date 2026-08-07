/**
 * The overview sheet — a rendered view of the kitchen, and what it is made of.
 *
 * The sheet a client looks at first and measures nothing on, which is why it is the one sheet in
 * the pack with a raster image on it and the one with no scale in its title block. Putting a
 * scale there would invite a measurement the drawing cannot honour: a perspective view has no
 * single scale, and saying "1:20" over one would be exactly the lie the rest of the pack is
 * built to avoid. It says **"Not to scale"** instead, which is the truth and is what a set of
 * drawings puts on a perspective.
 */

import type { FinishLine } from '../../core/export/finishes.ts';
import type { Sheet } from '../../core/export/sheet.ts';
import { type TitleBlockInfo, SheetFurniture } from './sheetParts.tsx';

const WEIGHT = { rule: 0.18, frame: 0.35 };
const TEXT = { head: 2.2, row: 2.7, note: 2.2 };

/** The schedule's four columns, as fractions of its width. */
const COLUMNS = [0.26, 0.36, 0.19, 0.19];

function Schedule({
  lines,
  x,
  y,
  width,
  height,
}: {
  lines: readonly FinishLine[];
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const rowHeight = 6.2;
  const headHeight = 5.4;
  // Only as many rows as fit — a table running off the sheet is worse than a short one.
  const fits = Math.max(0, Math.floor((height - headHeight) / rowHeight));
  const shown = lines.slice(0, fits);
  const dropped = lines.length - shown.length;

  const cols = COLUMNS.reduce<number[]>((acc, f) => {
    acc.push((acc[acc.length - 1] ?? 0) + f * width);
    return acc;
  }, [0]);

  const cell = (i: number) => x + (cols[i] ?? 0) + 1.6;

  return (
    <g>
      <text x={x} y={y - 2.4} fontSize={TEXT.head} fill="#666" letterSpacing={0.3}>
        FINISHES SCHEDULE
      </text>
      <line x1={x} y1={y} x2={x + width} y2={y} stroke="#111" strokeWidth={WEIGHT.frame} />
      {['Item', 'Specification', 'Detail', 'Used for'].map((h, i) => (
        <text key={h} x={cell(i)} y={y + 3.8} fontSize={TEXT.head} fill="#666" letterSpacing={0.3}>
          {h.toUpperCase()}
        </text>
      ))}
      <line
        x1={x}
        y1={y + headHeight}
        x2={x + width}
        y2={y + headHeight}
        stroke="#111"
        strokeWidth={WEIGHT.rule}
      />
      {shown.map((line, r) => {
        const top = y + headHeight + r * rowHeight;
        const values = [line.what, line.specification, line.detail, line.usedFor];
        return (
          <g key={`${line.what}-${line.specification}-${r}`}>
            {values.map((v, i) => (
              <text key={i} x={cell(i)} y={top + 4.3} fontSize={TEXT.row} fill="#111">
                {v}
              </text>
            ))}
            <line
              x1={x}
              y1={top + rowHeight}
              x2={x + width}
              y2={top + rowHeight}
              stroke="#ccc"
              strokeWidth={WEIGHT.rule}
            />
          </g>
        );
      })}
      {dropped > 0 && (
        <text
          x={x}
          y={y + headHeight + shown.length * rowHeight + 4.4}
          fontSize={TEXT.note}
          fill="#666"
        >
          + {dropped} more — see the Cutlist and Hardware tabs for the full specification.
        </text>
      )}
    </g>
  );
}

export function OverviewSheet({
  imageUrl,
  lines,
  sheet,
  info,
}: {
  /** Null while the view is still rendering, or when nothing came back. */
  imageUrl: string | null;
  lines: readonly FinishLine[];
  sheet: Sheet;
  info: TitleBlockInfo;
}) {
  const { frame } = sheet;
  // The view takes the upper two thirds, the schedule the rest — a client looks, then reads.
  const viewHeight = frame.height * 0.6;
  const gap = 8;

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
        {imageUrl ? (
          <image
            href={imageUrl}
            x={frame.x}
            y={frame.y}
            width={frame.width}
            height={viewHeight}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
          <g>
            <rect
              x={frame.x}
              y={frame.y}
              width={frame.width}
              height={viewHeight}
              fill="none"
              stroke="#bbb"
              strokeWidth={WEIGHT.frame}
              strokeDasharray="3 2"
            />
            <text
              x={frame.x + frame.width / 2}
              y={frame.y + viewHeight / 2}
              fontSize={TEXT.row}
              textAnchor="middle"
              fill="#888"
            >
              The view is still rendering — wait a moment, then print.
            </text>
          </g>
        )}

        <Schedule
          lines={lines}
          x={frame.x}
          y={frame.y + viewHeight + gap + 4}
          width={frame.width}
          height={frame.height - viewHeight - gap - 4}
        />

        {/* No scale, deliberately — see the note at the top of this file. */}
        <SheetFurniture sheet={sheet} info={info} />
      </g>
    </svg>
  );
}
