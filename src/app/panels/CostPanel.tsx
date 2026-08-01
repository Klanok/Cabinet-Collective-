import { formatAud } from '../../core/units.ts';
import type { CostBreakdown } from '../../core/costing/costing.ts';
import { gstModeLabel } from '../../core/costing/gst.ts';
import type { GstMode, ProjectSettings } from '../../core/model/project.ts';

interface Props {
  cost: CostBreakdown;
  settings: ProjectSettings;
  onUpdateSettings: (patch: Partial<ProjectSettings>) => void;
}

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`cost-row${strong ? ' is-strong' : ''}`}>
    <span>{label}</span>
    <span className="num">{value}</span>
  </div>
);

export function CostPanel({ cost, settings, onUpdateSettings }: Props) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Cost</h2>
        <span className="badge">{gstModeLabel(cost.gstMode)}</span>
      </header>

      <div className="fields">
        <label className="field">
          <span>Entity</span>
          <div className="field-input">
            <select
              value={settings.gstMode}
              onChange={(e) => onUpdateSettings({ gstMode: e.target.value as GstMode })}
            >
              <option value="registered">GST registered</option>
              <option value="not-registered">Not GST registered</option>
            </select>
          </div>
        </label>
        <label className="field">
          <span>Margin</span>
          <div className="field-input">
            <input
              type="number"
              value={settings.marginPercent}
              min={0}
              max={200}
              step={5}
              onChange={(e) => onUpdateSettings({ marginPercent: Number(e.target.value) })}
            />
            <em>%</em>
          </div>
        </label>
      </div>

      {settings.labour.installHoursMode === 'mirror-manufacturing' && (
        <p className="note subtle">
          Install hours currently mirror manufacturing hours. Set your own figure under
          Settings → Costing when you know it.
        </p>
      )}

      {settings.gstMode === 'not-registered' && (
        <p className="note">
          GST on materials can't be claimed back, so it's costed in. Nothing is charged on the
          invoice.
        </p>
      )}

      <div className="subhead">Materials</div>
      <table className="mat-table">
        <thead>
          <tr>
            <th>Material</th>
            <th className="num">Parts</th>
            <th className="num">m²</th>
            <th className="num">Sheets</th>
            <th className="num">Cost</th>
          </tr>
        </thead>
        <tbody>
          {cost.byMaterial.map((m) => (
            <tr key={m.materialId}>
              <td>{m.label}</td>
              <td className="num">{m.panelCount}</td>
              <td className="num">{m.footprintM2.toFixed(2)}</td>
              <td className="num">{m.sheets}</td>
              <td className="num">{formatAud(m.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note subtle">
        Sheets are counted off the nest and charged whole, because that is how board is bought.
        What is left over is on the Nest tab as offcut, not deducted here.
      </p>

      <div className="subhead">Breakdown</div>
      <div className="cost-rows">
        <Row label="Sheet goods" value={formatAud(cost.sheetCost)} />
        <Row label="Edge banding" value={formatAud(cost.edgeBandCost)} />
        <Row label="Material" value={formatAud(cost.materialCost)} />
        <Row
          label={`Manufacturing (${(cost.labourMinutes / 60).toFixed(1)} h)`}
          value={formatAud(cost.labourCost)}
        />
        {cost.machiningMinutes > 0 && (
          <Row
            label={`Routing ${cost.machinedFrontCount} fronts (${(cost.machiningMinutes / 60).toFixed(1)} h)`}
            value={formatAud(cost.machiningCost)}
          />
        )}
        <Row
          label={`Install (${cost.installHours.toFixed(1)} h)`}
          value={formatAud(cost.installCost)}
        />
        <Row label="Total cost" value={formatAud(cost.totalCost)} strong />
        <Row label={`Margin @ ${settings.marginPercent}%`} value={formatAud(cost.marginAmount)} />
        <Row label="Subtotal (ex GST)" value={formatAud(cost.subtotalExGst)} />
        {cost.deliveryFee > 0 && <Row label="Delivery" value={formatAud(cost.deliveryFee)} />}
        <Row label="Sell (ex GST)" value={formatAud(cost.sellExGst)} />
        <Row label="GST" value={formatAud(cost.gst)} />
        <Row label="Total" value={formatAud(cost.totalIncGst)} strong />
      </div>

      {cost.usesIndicativePricing && (
        <p className="note warning">
          Costed on indicative material rates. Load your real trade pricing into
          <code>src/core/library/materials.au.ts</code> before quoting from this.
        </p>
      )}

      {cost.warnings.length > 0 && (
        <ul className="warnings">
          {[...new Set(cost.warnings)].map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
