/**
 * The nest, drawn.
 *
 * A sheet diagram is the one part of this job that is genuinely easier to check by eye than by
 * number — "that part is on the wrong sheet" is instant here and invisible in a table. But per §7 it
 * is not what the nest is *verified* by: a nest can look entirely plausible and be 8mm out, so the
 * suite asserts overlap, containment and the cut sequence numerically and this exists so somebody
 * can see what they are about to cut.
 *
 * Everything drawn comes off the same `ProjectNest` the quote was costed from — it is handed in
 * rather than computed here, so the picture and the price cannot come from two different nests.
 */

import type { MaterialNest, NestPart, NestedSheet, ProjectNest } from '../../core/nest/nest.ts';
import { usableOffcuts } from '../../core/nest/nest.ts';
import type { Project } from '../../core/model/project.ts';
import { cutSequenceCsv, nestCsv } from '../../core/cutlist/export.ts';
import { postProject, postedTotals } from '../../core/post/post.ts';
import { findMachine, MACHINE_PROFILES } from '../../core/library/machines.ts';
import { kerfForMachine } from '../../core/post/check.ts';
import { downloadTextFile, fileStem } from '../store/persistence.ts';
import { SettingRow } from './fields.tsx';
import { useState } from 'react';

interface Props {
  project: Project;
  nest: ProjectNest;
}

/** Colour a part by what it is for, so a cabinet's parts read as a group on the sheet. */
const hueFor = (ownerName: string): number => {
  let hash = 0;
  for (const ch of ownerName) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
};

function SheetDiagram({
  sheet,
  material,
  offcutMin,
}: {
  sheet: NestedSheet;
  material: MaterialNest;
  offcutMin: number;
}) {
  const byId = new Map<string, NestPart>(material.parts.map((p) => [p.panelId, p]));
  const { length, width } = material.sheet;
  const keepers = usableOffcuts(sheet, offcutMin);

  return (
    <div className="nest-sheet">
      <div className="nest-sheet-head">
        <strong>Sheet {sheet.index}</strong>
        <span className="muted">
          {sheet.placements.length} parts · {(sheet.yield * 100).toFixed(0)}% used ·{' '}
          {sheet.cuts.length} cuts
        </span>
      </div>
      <svg
        className="nest-svg"
        viewBox={`0 0 ${length} ${width}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Sheet ${sheet.index} of ${material.label}`}
      >
        <rect x={0} y={0} width={length} height={width} className="nest-board" />
        {/* The usable area, when an edge trim has been set — the frame the first cut lands in. */}
        {(sheet.usable.x > 0 || sheet.usable.y > 0) && (
          <rect
            x={sheet.usable.x}
            y={sheet.usable.y}
            width={sheet.usable.length}
            height={sheet.usable.width}
            className="nest-usable"
          />
        )}
        {keepers.map((o, i) => (
          <rect
            key={`o${i}`}
            x={o.x}
            y={o.y}
            width={o.length}
            height={o.width}
            className="nest-offcut"
          />
        ))}
        {sheet.placements.map((p) => {
          const part = byId.get(p.partId);
          const hue = hueFor(part?.ownerName ?? '');
          return (
            <g key={p.partId}>
              <rect
                x={p.at.x}
                y={p.at.y}
                width={p.at.length}
                height={p.at.width}
                fill={`hsl(${hue} 42% 34%)`}
                stroke="#16181c"
                strokeWidth={3}
              />
              {/* Only label a part with room for the text — a smeared label is worse than none. */}
              {p.at.length > 260 && p.at.width > 90 && (
                <text
                  x={p.at.x + p.at.length / 2}
                  y={p.at.y + p.at.width / 2}
                  className="nest-label"
                  textAnchor="middle"
                >
                  <tspan x={p.at.x + p.at.length / 2} dy="-6">
                    {part?.name}
                  </tspan>
                  <tspan x={p.at.x + p.at.length / 2} dy="34">
                    {Math.round(p.at.length)} × {Math.round(p.at.width)}
                  </tspan>
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {keepers.length > 0 && (
        <p className="note subtle">
          Offcut worth keeping:{' '}
          {keepers.map((o) => `${Math.round(o.length)}×${Math.round(o.width)}`).join(', ')}
        </p>
      )}
    </div>
  );
}

export function NestPanel({ project, nest }: Props) {
  const offcutMin = project.settings.nesting.usableOffcutMin;

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Nest</h2>
        <span className="badge">{nest.sheetCount} sheets</span>
      </header>

      <p className="note subtle">
        Guillotine cutting — every cut runs edge to edge, because that is what a panel saw does.
        Kerf {nest.kerf}mm
        {nest.edgeTrim > 0 ? `, ${nest.edgeTrim}mm trimmed off each sheet edge` : ', no edge trim'}.
        A curved part is nested as the rectangular blank it is cut from; the curve is cut from the
        blank afterwards.
      </p>

      {nest.byMaterial.map((m) => (
        <div key={m.materialId} className="nest-material">
          <div className="subhead">
            {m.label} — {m.sheetCount} × {m.sheet.length}×{m.sheet.width}, {(m.yield * 100).toFixed(0)}%
            yield
          </div>
          {m.oversize.length > 0 && (
            <p className="note warning">
              Not nested, because no sheet of this material will hold them:{' '}
              {m.oversize.map((p) => `${p.name} ${Math.round(p.length)}×${Math.round(p.width)}`).join(', ')}
              . A whole sheet each is allowed on the quote as a floor, not as a real figure.
            </p>
          )}
          {m.sheets.map((s) => (
            <SheetDiagram key={s.index} sheet={s} material={m} offcutMin={offcutMin} />
          ))}
        </div>
      ))}

      {nest.byMaterial.length === 0 && <p className="note">Nothing to nest yet.</p>}

      <button
        className="btn full"
        onClick={() => downloadTextFile(`${fileStem(project)}-nest.csv`, nestCsv(project, nest))}
      >
        Nest as CSV
      </button>
      <button
        className="btn full"
        onClick={() =>
          downloadTextFile(`${fileStem(project)}-cuts.csv`, cutSequenceCsv(project, nest))
        }
      >
        Cut sequence as CSV
      </button>

      <GcodePanel project={project} nest={nest} />
    </section>
  );
}

/**
 * G-code, and the reasons it might not come out.
 *
 * The refusals are shown **instead of** a download button rather than beside one. A page that
 * warns you and still offers the file is a page where somebody clicks the file.
 */
function GcodePanel({ project, nest }: Props) {
  const [machineId, setMachineId] = useState(MACHINE_PROFILES[0]!.id);
  const machine = findMachine(machineId);
  const job = postProject(project, machine, nest);
  const totals = postedTotals(job);
  const refusals = [...new Set(job.refused.map((r) => r.message))];

  return (
    <>
      <div className="subhead">G-code</div>

      <SettingRow label="Machine" hint="Decides the dialect, the tool table and the Z datum">
        <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
          {MACHINE_PROFILES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </SettingRow>

      {machine.unconfirmed.length > 0 && (
        <p className="note warning">
          <strong>{machine.name} has not been checked against this machine.</strong> Simulate or
          air-cut before running anything. What is a guess:
          <br />
          {machine.unconfirmed.map((u) => (
            <span key={u}>
              · {u}
              <br />
            </span>
          ))}
        </p>
      )}

      {refusals.length > 0 ? (
        <p className="note warning">
          No program written.
          <br />
          {refusals.map((r) => (
            <span key={r}>
              · {r}
              <br />
            </span>
          ))}
        </p>
      ) : (
        <>
          <p className="note subtle">
            {totals.written} programs · {totals.operationCount} operations ·{' '}
            {totals.boreCount} holes. Parts are cut with a {kerfForMachine(machine)}mm bit, boring
            first and perimeters last so nothing is machined after it has been cut loose.
            {totals.needsSecondSetup.length > 0 &&
              ` Machined on both faces and not finished in one program: ${totals.needsSecondSetup.join(', ')}.`}
          </p>
          {job.sheets.map(
            (sheet) =>
              sheet.output && (
                <button
                  key={sheet.output.filename}
                  className="btn full"
                  onClick={() =>
                    downloadTextFile(sheet.output!.filename, sheet.output!.text, 'text/plain')
                  }
                >
                  {sheet.output.filename}
                </button>
              ),
          )}
        </>
      )}
    </>
  );
}
