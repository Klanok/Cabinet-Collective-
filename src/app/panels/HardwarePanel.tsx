/**
 * The hardware order and the drilling, on screen.
 *
 * Both are *derived* from the project on every render, like the cutlist and the cost — there is no
 * stored BOM to go stale when a cabinet changes.
 *
 * The drilling summary is here rather than under the cutlist because it answers a different
 * question: not "what do I cut" but "how many setups is this". Which face a hole goes in is a
 * column; whether a **part** turns over is a sentence, because it is a different question with a
 * different answer — a part is only turned when it is machined on both faces.
 */

import type { Project } from '../../core/model/project.ts';
import { unconfirmedHardwareFigures } from '../../core/model/hardware.ts';
import { buildHardwareBom, drillingSummary, hardwareBomTotals } from '../../core/hardware/bom.ts';
import { drillingTotals, drillingCsv, hardwareCsv } from '../../core/cutlist/export.ts';
import { allPanels } from '../../core/rules/build.ts';
import { formatAud } from '../../core/units.ts';
import { downloadTextFile, fileStem } from '../store/persistence.ts';

interface Props {
  project: Project;
}

export function HardwarePanel({ project }: Props) {
  const bom = buildHardwareBom(project);
  const totals = hardwareBomTotals(bom);
  const holes = drillingTotals(allPanels(project));
  const groups = drillingSummary(project);
  const unchecked = unconfirmedHardwareFigures(project.hardware);

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Hardware</h2>
        <span className="badge">{totals.pieceCount} pieces</span>
      </header>

      <table className="cutlist-table">
        <thead>
          <tr>
            <th className="num">Qty</th>
            <th>Item</th>
            <th className="num">Each</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {bom.map((l) => (
            <tr key={l.key}>
              <td className="num strong">{l.quantity}</td>
              <td title={l.cabinetNames.join(', ')}>{l.name}</td>
              <td className="num muted">{formatAud(l.unitPriceExGst)}</td>
              <td className="num">{formatAud(l.totalExGst)}</td>
            </tr>
          ))}
          {bom.length === 0 && (
            <tr>
              <td colSpan={4} className="empty">
                No hardware yet — add a cabinet with doors or drawers.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="note subtle">
        {formatAud(totals.totalExGst)} ex GST.
        {totals.indicativePricing
          ? ' Prices are placeholders — load your trade pricing before quoting from this.'
          : ''}
      </p>

      {groups.length > 0 && (
        <>
          <div className="subhead">Drilling</div>
          <table className="cutlist-table">
            <thead>
              <tr>
                <th>Bore</th>
                <th className="num">Holes</th>
                <th>What for</th>
                <th>Face</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={`${g.diameter}-${g.depth}-${g.face}`}>
                  <td className="mono">
                    Ø{g.diameter} × {g.depth}
                  </td>
                  <td className="num strong">{g.count}</td>
                  <td className="muted">{g.purposes.join(', ')}</td>
                  <td className="muted">{g.face === 'B' ? 'Back' : 'Front'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note subtle">
            {holes.holes} holes across {holes.boredParts} parts.{' '}
            {holes.turnedParts === 0 ? (
              <>
                <strong>None of them turn over.</strong> Every part is machined on one face only, so
                each is a single setup — a door with its hinge cups in the back goes on the bed
                back-up and gets bored, and the face being machined is the face that goes up.
              </>
            ) : (
              <>
                <strong>{holes.turnedParts}</strong> of those parts are machined on both faces and so
                turn over — a routed front is the usual case, recessed on the show face and bored on
                the back. That is a second setup on each.
              </>
            )}
          </p>
        </>
      )}

      {unchecked.length > 0 && (
        <ul className="warnings">
          {unchecked.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <div className="subhead">Export</div>
      <button
        className="btn full"
        onClick={() =>
          downloadTextFile(`${fileStem(project)}-hardware.csv`, hardwareCsv(project))
        }
      >
        Hardware order as CSV
      </button>
      <button
        className="btn full"
        onClick={() =>
          downloadTextFile(`${fileStem(project)}-drilling.csv`, drillingCsv(project))
        }
      >
        Drilling sheet as CSV
      </button>
      <p className="note subtle">
        The drilling sheet is one row per hole, with the part, the face and whether it turns over.
        Positions are in part space — measured from the bottom-left corner of the part as it lies on
        the machine.
      </p>
    </section>
  );
}
