import type { CutlistLine } from '../../core/cutlist/cutlist.ts';
import { cutlistTotals } from '../../core/cutlist/cutlist.ts';
import { cutlistCsv } from '../../core/cutlist/export.ts';
import type { Project } from '../../core/model/project.ts';
import { downloadTextFile, fileStem } from '../store/persistence.ts';

interface Props {
  lines: readonly CutlistLine[];
  project: Project;
}

export function CutlistPanel({ lines, project }: Props) {
  const totals = cutlistTotals(lines);

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Cutlist</h2>
        <span className="badge">{totals.partCount} parts</span>
      </header>

      <table className="cutlist-table">
        <thead>
          <tr>
            <th className="num">Qty</th>
            <th className="num">Length</th>
            <th className="num">Width</th>
            <th>Banding</th>
            <th>Part</th>
            <th>Material</th>
            <th>Grain</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key}>
              <td className="num strong">{l.quantity}</td>
              <td className="num">{l.length}</td>
              <td className="num">{l.width}</td>
              <td className="mono">{l.banding}</td>
              <td title={l.cabinetNames.join(', ')}>{l.name}</td>
              <td className="muted">{l.materialLabel}</td>
              <td className="muted">{l.grain}</td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={7} className="empty">
                No parts yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="note subtle">
        {totals.partCount} parts on {totals.lineCount} lines · {totals.bandedMetres.toFixed(1)}m of
        edge banding. Banding is named by cutlist edge: L1/L2 run along the length, W1/W2 across
        the width.
      </p>

      <button
        className="btn full"
        onClick={() => downloadTextFile(`${fileStem(project)}-cutlist.csv`, cutlistCsv(project))}
      >
        Cutlist as CSV
      </button>
    </section>
  );
}
