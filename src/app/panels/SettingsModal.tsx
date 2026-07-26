/**
 * The settings screen.
 *
 * Two scopes, deliberately kept visually distinct:
 *
 *   This job    — the numbers this kitchen is being built to. Editing here affects nothing else.
 *   Standards   — what new jobs start from. Editing here affects nothing already created.
 *
 * That separation is the whole point: a job is a record of what was agreed, so changing your
 * shop standard next year must not re-price a kitchen you quoted this year.
 */

import { useState } from 'react';
import { mm } from '../../core/units.ts';
import type { ConstructionMethod } from '../../core/model/construction.ts';
import type { GstMode, Project, ProjectDefaults, ProjectSettings } from '../../core/model/project.ts';
import {
  type ShopStandards,
  differencesFromStandards,
  labelForConstructionKey,
  matchesStandards,
} from '../../core/standards/standards.ts';

type Scope = 'job' | 'standards';

interface Props {
  project: Project;
  standards: ShopStandards;
  onClose: () => void;
  onUpdateConstruction: (id: string, patch: Partial<ConstructionMethod>) => void;
  onUpdateSettings: (patch: Partial<ProjectSettings>) => void;
  onUpdateDefaults: (patch: Partial<ProjectDefaults>) => void;
  onUpdateStandards: (patch: Partial<ShopStandards>) => void;
  onSaveAsStandards: (name: string) => void;
  onResetToStandards: () => void;
}

/** The joinery numbers, in the order you'd actually think about them. */
const CONSTRUCTION_FIELDS: {
  key: keyof ConstructionMethod;
  hint: string;
  min?: number;
  max?: number;
  step?: number;
}[] = [
  { key: 'carcassThickness', hint: 'Sides, bottoms, shelves, rails', min: 6, max: 50 },
  { key: 'backThickness', hint: 'Back panel', min: 3, max: 50 },
  { key: 'doorThickness', hint: 'Doors and drawer fronts', min: 6, max: 50 },
  { key: 'kickHeight', hint: 'Floor to underside of carcass', min: 0, max: 400, step: 5 },
  { key: 'kickSetback', hint: 'How far the kick sits behind the door face', min: 0, max: 200, step: 5 },
  { key: 'stretcherWidth', hint: 'Front-to-back size of the top rails', min: 30, max: 300, step: 5 },
  { key: 'frontGap', hint: 'Between two doors or drawer fronts', min: 0, max: 20, step: 0.5 },
  { key: 'frontReveal', hint: 'Between a front and the cabinet edge', min: 0, max: 20, step: 0.5 },
  { key: 'shelfSetback', hint: 'How much shallower a shelf is than the opening', min: 0, max: 60 },
  { key: 'shelfSideClearance', hint: 'Total side play so a shelf lifts out', min: 0, max: 20, step: 0.5 },
  { key: 'systemPitch', hint: 'System 32 hole spacing', min: 8, max: 64 },
  { key: 'systemFrontSetback', hint: 'First hole line in from the front edge', min: 0, max: 100 },
];

function NumberRow({
  label,
  hint,
  value,
  suffix = 'mm',
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="setting-row">
      <div className="setting-label">
        <span>{label}</span>
        {hint && <em>{hint}</em>}
      </div>
      <div className="setting-input">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
        />
        <span className="suffix">{suffix}</span>
      </div>
    </div>
  );
}

function ConstructionEditor({
  constructions,
  onChange,
}: {
  constructions: readonly ConstructionMethod[];
  onChange: (id: string, patch: Partial<ConstructionMethod>) => void;
}) {
  const [activeId, setActiveId] = useState(constructions[0]?.id ?? '');
  const active = constructions.find((c) => c.id === activeId) ?? constructions[0];
  if (!active) return <p className="empty">No construction methods.</p>;

  return (
    <>
      {constructions.length > 1 && (
        <div className="seg">
          {constructions.map((c) => (
            <button
              key={c.id}
              className={`seg-btn${c.id === active.id ? ' is-active' : ''}`}
              onClick={() => setActiveId(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="setting-row">
        <div className="setting-label">
          <span>Back panel</span>
          <em>How the back is housed in the carcass</em>
        </div>
        <div className="setting-input">
          <select
            value={active.backStyle}
            onChange={(e) =>
              onChange(active.id, { backStyle: e.target.value as ConstructionMethod['backStyle'] })
            }
          >
            <option value="applied">Applied — covers the whole rear face</option>
            <option value="inset">Inset — fits between the sides</option>
          </select>
        </div>
      </div>

      {CONSTRUCTION_FIELDS.map((f) => (
        <NumberRow
          key={String(f.key)}
          label={labelForConstructionKey(f.key)}
          hint={f.hint}
          value={active[f.key] as number}
          min={f.min}
          max={f.max}
          step={f.step}
          onChange={(n) => onChange(active.id, { [f.key]: mm(n) } as Partial<ConstructionMethod>)}
        />
      ))}
    </>
  );
}

function DefaultsEditor({
  defaults,
  onChange,
}: {
  defaults: ProjectDefaults;
  onChange: (patch: Partial<ProjectDefaults>) => void;
}) {
  return (
    <>
      <NumberRow
        label="Base cabinet height"
        hint="Carcass only, not counting the kick"
        value={defaults.baseCabinetHeight}
        step={10}
        onChange={(n) => onChange({ baseCabinetHeight: mm(n) })}
      />
      <NumberRow
        label="Base cabinet depth"
        hint="Carcass only, not counting doors"
        value={defaults.baseCabinetDepth}
        step={10}
        onChange={(n) => onChange({ baseCabinetDepth: mm(n) })}
      />
      <NumberRow
        label="Wall cabinet height"
        value={defaults.wallCabinetHeight}
        step={10}
        onChange={(n) => onChange({ wallCabinetHeight: mm(n) })}
      />
      <NumberRow
        label="Wall cabinet depth"
        value={defaults.wallCabinetDepth}
        step={10}
        onChange={(n) => onChange({ wallCabinetDepth: mm(n) })}
      />
      <NumberRow
        label="Wall cabinet mount height"
        hint="Floor to underside — sets the splashback gap"
        value={defaults.wallCabinetMountHeight}
        step={10}
        onChange={(n) => onChange({ wallCabinetMountHeight: mm(n) })}
      />
    </>
  );
}

function CostingEditor({
  settings,
  onChange,
}: {
  settings: ProjectSettings;
  onChange: (patch: Partial<ProjectSettings>) => void;
}) {
  return (
    <>
      <div className="setting-row">
        <div className="setting-label">
          <span>Entity</span>
          <em>Which business is invoicing — this changes the cost base, not just the total</em>
        </div>
        <div className="setting-input">
          <select
            value={settings.gstMode}
            onChange={(e) => onChange({ gstMode: e.target.value as GstMode })}
          >
            <option value="registered">GST registered</option>
            <option value="not-registered">Not GST registered</option>
          </select>
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-label">
          <span>Entity name</span>
          <em>Shown on the report</em>
        </div>
        <div className="setting-input">
          <input
            type="text"
            value={settings.entityName}
            onChange={(e) => onChange({ entityName: e.target.value })}
          />
        </div>
      </div>

      <NumberRow
        label="Margin"
        hint="Added to cost to reach the sell price"
        value={settings.marginPercent}
        suffix="%"
        min={0}
        max={200}
        step={5}
        onChange={(n) => onChange({ marginPercent: n })}
      />
      <NumberRow
        label="Sheet wastage"
        hint="Offcut allowance until Phase 3 nesting gives a real count"
        value={Math.round(settings.sheetWastageFactor * 100)}
        suffix="%"
        min={0}
        max={60}
        onChange={(n) => onChange({ sheetWastageFactor: n / 100 })}
      />
      <NumberRow
        label="Labour rate"
        value={settings.labour.ratePerHourExGst}
        suffix="$/h"
        min={0}
        step={5}
        onChange={(n) => onChange({ labour: { ...settings.labour, ratePerHourExGst: n } })}
      />
      <NumberRow
        label="Time per panel"
        hint="Cutting and handling"
        value={settings.labour.minutesPerPanel}
        suffix="min"
        min={0}
        step={0.5}
        onChange={(n) => onChange({ labour: { ...settings.labour, minutesPerPanel: n } })}
      />
      <NumberRow
        label="Time per banded edge"
        value={settings.labour.minutesPerBandedEdge}
        suffix="min"
        min={0}
        step={0.5}
        onChange={(n) => onChange({ labour: { ...settings.labour, minutesPerBandedEdge: n } })}
      />
      <NumberRow
        label="Time per cabinet"
        hint="Assembly"
        value={settings.labour.minutesPerCabinet}
        suffix="min"
        min={0}
        step={5}
        onChange={(n) => onChange({ labour: { ...settings.labour, minutesPerCabinet: n } })}
      />
    </>
  );
}

export function SettingsModal({
  project,
  standards,
  onClose,
  onUpdateConstruction,
  onUpdateSettings,
  onUpdateDefaults,
  onUpdateStandards,
  onSaveAsStandards,
  onResetToStandards,
}: Props) {
  const [scope, setScope] = useState<Scope>('job');
  const [section, setSection] = useState<'construction' | 'sizes' | 'costing'>('construction');
  const [standardsName, setStandardsName] = useState(standards.name);

  const inSync = matchesStandards(project, standards);
  const differences = differencesFromStandards(project, standards);

  const editingStandards = scope === 'standards';
  const source = editingStandards ? standards : project;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} title="Close">
            ×
          </button>
        </header>

        <div className="seg scope-seg">
          <button
            className={`seg-btn${scope === 'job' ? ' is-active' : ''}`}
            onClick={() => setScope('job')}
          >
            This job — {project.name}
          </button>
          <button
            className={`seg-btn${scope === 'standards' ? ' is-active' : ''}`}
            onClick={() => setScope('standards')}
          >
            Shop standards
          </button>
        </div>

        <p className="scope-note">
          {editingStandards ? (
            <>
              What <strong>new jobs</strong> start from. Changing these leaves every existing job
              exactly as it is.
            </>
          ) : (
            <>
              What <strong>this job</strong> is built to. Changing these affects nothing else.
            </>
          )}
        </p>

        <nav className="seg section-seg">
          <button
            className={`seg-btn${section === 'construction' ? ' is-active' : ''}`}
            onClick={() => setSection('construction')}
          >
            Joinery
          </button>
          <button
            className={`seg-btn${section === 'sizes' ? ' is-active' : ''}`}
            onClick={() => setSection('sizes')}
          >
            Standard sizes
          </button>
          <button
            className={`seg-btn${section === 'costing' ? ' is-active' : ''}`}
            onClick={() => setSection('costing')}
          >
            Costing
          </button>
        </nav>

        <div className="modal-body">
          {section === 'construction' && (
            <ConstructionEditor
              constructions={source.constructions}
              onChange={(id, patch) =>
                editingStandards
                  ? onUpdateStandards({
                      constructions: standards.constructions.map((c) =>
                        c.id === id ? { ...c, ...patch } : c,
                      ),
                    })
                  : onUpdateConstruction(id, patch)
              }
            />
          )}

          {section === 'sizes' && (
            <DefaultsEditor
              defaults={source.defaults}
              onChange={(patch) =>
                editingStandards
                  ? onUpdateStandards({ defaults: { ...standards.defaults, ...patch } })
                  : onUpdateDefaults(patch)
              }
            />
          )}

          {section === 'costing' && (
            <CostingEditor
              settings={source.settings}
              onChange={(patch) =>
                editingStandards
                  ? onUpdateStandards({ settings: { ...standards.settings, ...patch } })
                  : onUpdateSettings(patch)
              }
            />
          )}
        </div>

        <footer className="modal-foot">
          {!editingStandards && (
            <>
              <div className="sync-state">
                {inSync ? (
                  <span className="muted">Matches your shop standards.</span>
                ) : (
                  <details>
                    <summary className="drifted">
                      {differences.length} difference{differences.length === 1 ? '' : 's'} from your
                      standards
                    </summary>
                    <ul>
                      {differences.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={onResetToStandards} disabled={inSync}>
                  Reset to standards
                </button>
                <button className="btn primary" onClick={() => onSaveAsStandards(standardsName)}>
                  Save as my standards
                </button>
              </div>
            </>
          )}

          {editingStandards && (
            <>
              <div className="sync-state">
                <label className="inline-field">
                  <span className="muted">Name</span>
                  <input
                    type="text"
                    value={standardsName}
                    onChange={(e) => setStandardsName(e.target.value)}
                    onBlur={() => onUpdateStandards({ name: standardsName })}
                  />
                </label>
              </div>
              <div className="modal-actions">
                <span className="muted">Saved automatically.</span>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
