/**
 * The drawing pack — what a client gets sent.
 *
 * ## Why this prints rather than downloading a file
 *
 * The app has no backend and runs from a ZIP, so a PDF has to be made in the browser. Going
 * through the browser's own **Save as PDF** keeps the drawing **vector**: a client can zoom in on
 * a dimension and it stays sharp, and the sheet is real A3 rather than a picture of one. A
 * bundled PDF library would give a one-click download and cost about a megabyte, and its SVG
 * text handling would need checking sheet by sheet. Print was the shop's call and this is the
 * reason it is the right one.
 *
 * The sheet is laid out in **paper millimetres** end to end — `@page` sets the paper, the SVG's
 * viewBox is the sheet, and nothing scales between the two. So what is on screen is the page,
 * and "Fit to page" in the print dialog has nothing left to do.
 */

import { useMemo, useState } from 'react';
import type { Project } from '../../core/model/project.ts';
import { planSheetContent } from '../../core/export/planSheet.ts';
import {
  A2,
  A3,
  A4,
  type Orientation,
  type PaperSize,
  fitScale,
  layoutSheet,
} from '../../core/export/sheet.ts';
import { PlanSheet, type TitleBlockInfo } from './PlanSheet.tsx';

const PAPERS: { id: string; paper: PaperSize }[] = [
  { id: 'A4', paper: A4 },
  { id: 'A3', paper: A3 },
  { id: 'A2', paper: A2 },
];

/** Written the way a drawing dates itself, not the way a computer does. */
const drawingDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

export function ExportView({ project }: { project: Project }) {
  const [paperId, setPaperId] = useState('A3');
  const [orientation, setOrientation] = useState<Orientation>('landscape');

  const paper = PAPERS.find((p) => p.id === paperId)?.paper ?? A3;
  const sheet = useMemo(() => layoutSheet(paper, orientation), [paper, orientation]);
  const content = useMemo(() => planSheetContent(project), [project]);
  const scale = useMemo(
    () => fitScale({ width: content.width, height: content.height }, sheet.frame),
    [content, sheet],
  );

  const info: TitleBlockInfo = {
    jobName: project.name,
    client: project.client ?? '',
    roomName: project.room.name,
    entity: project.settings.entityName,
    date: drawingDate(project.updatedAt || project.createdAt),
    sheetTitle: 'Floor plan',
    sheetNumber: 'Sheet 1',
    scaleLabel: scale ? `${scale.label} @ ${paper.name}` : '—',
  };

  const hasPlan = project.room.walls.length > 0;

  return (
    <div className="export">
      <div className="export-bar no-print">
        <div className="export-controls">
          <label className="field inline">
            <span>Paper</span>
            <div className="field-input">
              <select value={paperId} onChange={(e) => setPaperId(e.target.value)}>
                {PAPERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.paper.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label className="field inline">
            <span>Orientation</span>
            <div className="field-input">
              <select
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as Orientation)}
              >
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </div>
          </label>
          <button className="btn primary" onClick={() => window.print()} disabled={!scale || !hasPlan}>
            Print / Save as PDF
          </button>
        </div>
        <p className="note subtle">
          Choose <strong>Save as PDF</strong> as the destination, set paper to{' '}
          <strong>{paper.name}</strong> {orientation}, and turn margins to <strong>None</strong> —
          the sheet already carries its own border. Leave scaling at 100%: the drawing is at{' '}
          {scale ? scale.label : 'no fitting scale'} and printing it "to fit" makes that number
          wrong.
        </p>
      </div>

      {!hasPlan && (
        <p className="note no-print">
          There is no room drawn yet, so there is nothing to put on a floor plan. Draw the walls on
          the Plan tab first — a client drawing is a drawing of a room.
        </p>
      )}

      {hasPlan && !scale && (
        <p className="note no-print">
          This kitchen does not fit on {paper.name} at any standard scale — it needs{' '}
          {Math.round(content.width)} × {Math.round(content.height)}mm of room. Try a bigger sheet
          or landscape. It is deliberately not squeezed onto a made-up scale: a rule laid on a
          drawing marked 1:50 has to read 1:50.
        </p>
      )}

      {hasPlan && scale && (
        <div className="sheet-stack">
          <PlanSheet content={content} sheet={sheet} scale={scale} info={info} />
        </div>
      )}
    </div>
  );
}
