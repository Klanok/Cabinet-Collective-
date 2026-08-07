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
 * The sheets are laid out in **paper millimetres** end to end — `@page` sets the paper, each
 * SVG's viewBox is the sheet, and nothing scales between the two. So what is on screen is the
 * page, and "Fit to page" in the print dialog has nothing left to do.
 *
 * ## Every sheet is scaled on its own
 *
 * A 4.2m plan and a 3.6m elevation do not want the same scale, and forcing one on both would
 * either waste half of every sheet or push the plan onto bigger paper than it needs. Each sheet
 * fits itself from the same ladder and prints its own figure in its own title block, which is the
 * normal convention on a set of drawings.
 */

import { useMemo, useState } from 'react';
import { buildProject } from '../../core/rules/build.ts';
import type { Project } from '../../core/model/project.ts';
import { planSheetContent } from '../../core/export/planSheet.ts';
import { elevationsFor } from '../../core/export/elevation.ts';
import { sectionsFor } from '../../core/export/section.ts';
import { finishesSchedule } from '../../core/export/finishes.ts';
import {
  A2,
  A3,
  A4,
  type DrawingScale,
  type Orientation,
  type PaperSize,
  fitScale,
  layoutSheet,
} from '../../core/export/sheet.ts';
import { PlanSheet } from './PlanSheet.tsx';
import { ElevationSheet } from './ElevationSheet.tsx';
import { SectionSheet } from './SectionSheet.tsx';
import { OverviewSheet } from './OverviewSheet.tsx';
import { ViewCapture } from './ViewCapture.tsx';
import type { TitleBlockInfo } from './sheetParts.tsx';

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
  const elevations = useMemo(
    () => elevationsFor(project, content.markers),
    [project, content.markers],
  );

  const sections = useMemo(() => sectionsFor(project), [project]);
  const finishes = useMemo(() => finishesSchedule(project), [project]);
  const built = useMemo(() => buildProject(project), [project]);
  const [viewImage, setViewImage] = useState<string | null>(null);

  const planScale = useMemo(
    () => fitScale({ width: content.width, height: content.height }, sheet.frame),
    [content, sheet],
  );

  const base = {
    jobName: project.name,
    client: project.client ?? '',
    roomName: project.room.name,
    entity: project.settings.entityName,
    date: drawingDate(project.updatedAt || project.createdAt),
  };
  const total = 2 + elevations.length + sections.length;
  const info = (title: string, n: number, scale: DrawingScale | null): TitleBlockInfo => ({
    ...base,
    sheetTitle: title,
    sheetNumber: `Sheet ${n} of ${total}`,
    scaleLabel: scale ? `${scale.label} @ ${paper.name}` : '—',
  });

  // Each elevation fits itself — see the note at the top of this file.
  const elevationSheets = elevations.map((elevation) => ({
    elevation,
    scale: fitScale({ width: elevation.width, height: elevation.height }, sheet.frame),
  }));

  const sectionSheets = sections.map((section) => ({
    section,
    scale: fitScale({ width: section.width, height: section.height }, sheet.frame),
  }));

  const hasPlan = project.room.walls.length > 0;
  const tooBig = [
    ...(hasPlan && !planScale ? ['the floor plan'] : []),
    ...elevationSheets.filter((e) => !e.scale).map((e) => `elevation ${e.elevation.key}`),
    ...sectionSheets.filter((e) => !e.scale).map((e) => `section ${e.section.key}`),
  ];

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
          <button className="btn primary" onClick={() => window.print()} disabled={!hasPlan}>
            Print / Save as PDF
          </button>
          <span className="note subtle">
            {hasPlan
              ? `${total} sheet${total > 1 ? 's' : ''} — floor plan${
                  elevations.length
                    ? `, elevation${elevations.length > 1 ? 's' : ''} ${elevations.map((e) => e.key).join(', ')}`
                    : ''
                }${
                  sections.length
                    ? `, section${sections.length > 1 ? 's' : ''} ${sections.map((e) => e.key).join(', ')}`
                    : ''
                }`
              : 'nothing to draw yet'}
          </span>
        </div>
        <p className="note subtle">
          Choose <strong>Save as PDF</strong> as the destination, set paper to{' '}
          <strong>{paper.name}</strong> {orientation}, and turn margins to <strong>None</strong> —
          the sheets carry their own border. Leave scaling at 100%: each sheet is at a stated scale
          and printing "to fit" makes that figure wrong.
        </p>
      </div>

      {!hasPlan && (
        <p className="note no-print">
          There is no room drawn yet, so there is nothing to put on a floor plan. Draw the walls on
          the Plan tab first — a client drawing is a drawing of a room.
        </p>
      )}

      {hasPlan && elevations.length === 0 && (
        <p className="note no-print">
          No cabinet is standing against a wall, so there is no elevation to draw. A cabinet gets
          one by being placed on a wall — drag it against one in the 3D view, or set the wall in
          the Inspector.
        </p>
      )}

      {tooBig.length > 0 && (
        <p className="note no-print">
          {tooBig.join(' and ')} {tooBig.length === 1 ? 'does' : 'do'} not fit on {paper.name} at
          any standard scale. Try a bigger sheet, or landscape. It is deliberately not squeezed
          onto a made-up scale: a rule laid on a drawing marked 1:50 has to read 1:50.
        </p>
      )}

      {/*
        The pack's own 3D canvas, rendering off-sheet so the overview has a picture to carry.
        The viewport is unmounted while the Drawings view is open, so there is nothing else left
        to grab — see `ViewCapture`.
      */}
      {hasPlan && <ViewCapture project={project} built={built} onCapture={setViewImage} />}

      {hasPlan && (
        <div className="sheet-stack">
          <OverviewSheet
            imageUrl={viewImage}
            lines={finishes}
            sheet={sheet}
            info={{ ...info('Overview and finishes', 1, null), scaleLabel: 'Not to scale' }}
          />
          {planScale && (
            <PlanSheet
              content={content}
              sheet={sheet}
              scale={planScale}
              info={info('Floor plan', 2, planScale)}
            />
          )}
          {elevationSheets.map(({ elevation, scale }, i) =>
            scale ? (
              <ElevationSheet
                key={elevation.key}
                elevation={elevation}
                sheet={sheet}
                scale={scale}
                info={info(`Elevation ${elevation.key} — ${elevation.wallName}`, i + 3, scale)}
              />
            ) : null,
          )}
          {sectionSheets.map(({ section, scale }, i) =>
            scale ? (
              <SectionSheet
                key={section.key}
                section={section}
                sheet={sheet}
                scale={scale}
                info={info(
                  `Section ${section.key} — ${section.title}`,
                  i + 3 + elevations.length,
                  scale,
                )}
              />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
