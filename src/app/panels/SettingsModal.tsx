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
import { type Mm, mm } from '../../core/units.ts';
import { type Room, isRectangularRoom, rectangularRoom, wallLength } from '../../core/model/room.ts';
import type { Cabinet } from '../../core/model/cabinet.ts';
import type { ConstructionMethod } from '../../core/model/construction.ts';
import type { GstMode, Project, ProjectDefaults, ProjectSettings } from '../../core/model/project.ts';
import {
  type MaterialLibrary,
  type SheetMaterial,
  actualThicknessOf,
  isOversize,
} from '../../core/model/material.ts';
import { EdgeBandPicker, SheetPicker } from './MaterialPicker.tsx';
import { DoorStyleEditor } from './DoorStyleEditor.tsx';
import { NumberRow } from './fields.tsx';
import type { DoorStyle } from '../../core/standards/doorStyles.ts';
import {
  type ShopStandards,
  differencesFromStandards,
  labelForConstructionKey,
  matchesStandards,
} from '../../core/standards/standards.ts';

type Scope = 'job' | 'standards';

/**
 * The boards this job actually cuts: the defaults, plus anything a single cabinet overrides to.
 * Listing the whole library would be a couple of dozen decors, nearly all of them irrelevant.
 */
const sheetsInUse = (defaults: ProjectDefaults, cabinets: readonly Cabinet[]): string[] => {
  const ids = new Set<string>([
    defaults.carcassMaterialId,
    defaults.backMaterialId,
    defaults.doorMaterialId,
  ]);
  for (const cabinet of cabinets) {
    for (const id of [cabinet.materials.carcass, cabinet.materials.back, cabinet.materials.door]) {
      if (id) ids.add(id);
    }
  }
  return [...ids];
};

interface Props {
  project: Project;
  standards: ShopStandards;
  onClose: () => void;
  onUpdateConstruction: (id: string, patch: Partial<ConstructionMethod>) => void;
  onUpdateSettings: (patch: Partial<ProjectSettings>) => void;
  onUpdateDefaults: (patch: Partial<ProjectDefaults>) => void;
  onUpdateSheet: (id: string, patch: Partial<SheetMaterial>) => void;
  onUpdateDoorStyles: (styles: readonly DoorStyle[]) => void;
  onUpdateStandards: (patch: Partial<ShopStandards>) => void;
  onSaveAsStandards: (name: string) => void;
  onResetToStandards: () => void;
  onUpdateRoom: (room: Room) => void;
}

/** The joinery numbers, in the order you'd actually think about them. */
const CONSTRUCTION_FIELDS: {
  key: keyof ConstructionMethod;
  hint: string;
  min?: number;
  max?: number;
  step?: number;
}[] = [
  /*
   * No thicknesses here. How thick a board is belongs to the board — picked under Materials,
   * measured there too. A method describes how the parts go together, not what they are cut
   * from.
   */
  { key: 'kickHeight', hint: 'Floor to underside of carcass', min: 0, max: 400, step: 5 },
  { key: 'kickSetback', hint: 'How far the kick sits behind the door face', min: 0, max: 200, step: 5 },
  { key: 'stretcherWidth', hint: 'Front-to-back size of the top rails', min: 30, max: 300, step: 5 },
  { key: 'revealTop', hint: 'Above a front — under the benchtop on a base cabinet', min: 0, max: 20, step: 0.5 },
  { key: 'revealBottom', hint: 'Below a front. Zero means flush with the carcass', min: 0, max: 20, step: 0.5 },
  { key: 'revealSides', hint: 'At the left and right edge of a front', min: 0, max: 20, step: 0.5 },
  { key: 'gapBetweenDoors', hint: 'Between two doors side by side', min: 0, max: 20, step: 0.5 },
  { key: 'gapBetweenDrawers', hint: 'Between stacked drawer fronts', min: 0, max: 20, step: 0.5 },
  { key: 'shelfSetback', hint: 'How much shallower a shelf is than the opening', min: 0, max: 60 },
  { key: 'shelfSideClearance', hint: 'Total side play so a shelf lifts out', min: 0, max: 20, step: 0.5 },
  { key: 'systemPitch', hint: 'System 32 hole spacing', min: 8, max: 64 },
  { key: 'systemFrontSetback', hint: 'First hole line in from the front edge', min: 0, max: 100 },
];

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
      <NumberRow
        label="Tall cabinet height"
        hint="Pantry or oven tower carcass"
        value={defaults.tallCabinetHeight}
        step={10}
        onChange={(n) => onChange({ tallCabinetHeight: mm(n) })}
      />
      <NumberRow
        label="Tall cabinet depth"
        value={defaults.tallCabinetDepth}
        step={10}
        onChange={(n) => onChange({ tallCabinetDepth: mm(n) })}
      />
    </>
  );
}

/**
 * What the boards in this job really measure.
 *
 * Nominal 16mm melamine runs about 16.3, and every part that fits *between* two boards is cut
 * to the real figure — a bottom panel at 900 − 2×16 is 0.6mm too wide to go in. The board is
 * still ordered, invoiced and grouped on the cutlist as 16mm, because that is its name.
 *
 * Only the boards this job actually uses are listed. The full library runs to a couple of
 * dozen decors, and measuring one you aren't cutting is wasted keystrokes.
 *
 * Nothing is measured for you. Entering a real figure moves every part in every cabinet made
 * from that board, so it is a deliberate edit — which also means a job already quoted or cut
 * keeps the sizes it was quoted and cut to.
 */
function BoardThicknessEditor({
  library,
  sheetIds,
  onChange,
}: {
  library: MaterialLibrary;
  sheetIds: readonly string[];
  onChange: (id: string, patch: Partial<SheetMaterial>) => void;
}) {
  const inUse = library.sheets.filter((s) => sheetIds.includes(s.id));
  if (inUse.length === 0) return null;

  return (
    <>
      <div className="subhead">What the boards really measure</div>
      {inUse.map((sheet) => (
        <NumberRow
          key={sheet.id}
          label={`${sheet.decor} — ${sheet.thickness}mm`}
          hint={
            isOversize(sheet)
              ? `Cut to ${actualThicknessOf(sheet)}mm. Still ordered as ${sheet.thickness}mm board.`
              : 'Measures what it says'
          }
          value={actualThicknessOf(sheet)}
          min={1}
          max={100}
          step={0.1}
          onChange={(n) => onChange(sheet.id, { actualThickness: mm(n) })}
        />
      ))}
      <p className="note subtle">
        Nominal 16mm melamine usually measures about <strong>16.3</strong>. Parts that fit
        between two boards are cut to whatever you put here, so a bottom panel goes in instead
        of being half a millimetre too wide. What you order doesn't change.
      </p>
      <p className="note warning">
        Changing these resizes every part made from that board. A job you have already quoted or
        cut keeps the sizes it was quoted and cut to until you change it here.
      </p>
    </>
  );
}

function MaterialsEditor({
  library,
  defaults,
  sheetIds,
  onChange,
  onChangeSheet,
}: {
  library: MaterialLibrary;
  defaults: ProjectDefaults;
  sheetIds: readonly string[];
  onChange: (patch: Partial<ProjectDefaults>) => void;
  onChangeSheet: (id: string, patch: Partial<SheetMaterial>) => void;
}) {
  return (
    <>
      <SheetPicker
        label="Carcass"
        hint="Sides, bottoms, tops, shelves, rails"
        library={library}
        value={defaults.carcassMaterialId}
        onChange={(carcassMaterialId) => onChange({ carcassMaterialId })}
      />
      <SheetPicker
        label="Back"
        library={library}
        value={defaults.backMaterialId}
        onChange={(backMaterialId) => onChange({ backMaterialId })}
      />
      <SheetPicker
        label="Doors and drawer fronts"
        library={library}
        value={defaults.doorMaterialId}
        onChange={(doorMaterialId) => onChange({ doorMaterialId })}
      />
      <SheetPicker
        label="Bendy ply"
        hint="Skins over formers on a radiused end — only curved work uses it"
        library={library}
        value={defaults.skinMaterialId}
        onChange={(skinMaterialId) => onChange({ skinMaterialId })}
      />
      <EdgeBandPicker
        label="Edge banding"
        hint="Must be at least as wide as the panel is thick"
        library={library}
        value={defaults.edgeBandId}
        onChange={(edgeBandId) => onChange({ edgeBandId })}
      />
      <p className="note subtle">
        These are the defaults for new cabinets. Any single cabinet can override them in the
        Inspector.
      </p>

      <BoardThicknessEditor library={library} sheetIds={sheetIds} onChange={onChangeSheet} />
    </>
  );
}

/**
 * Room size.
 *
 * A plain rectangle is still worth two boxes — it is most jobs, and typing 4200 by 3600 beats
 * drawing four walls to say the same thing. But those two numbers can only describe a
 * rectangle, and rebuilding the room from them would quietly throw away any plan that has been
 * drawn. So once the room stops being a rectangle, this stands aside and points at the plan
 * view, which can edit it without destroying it.
 */
function RoomEditor({ room, onChange }: { room: Room; onChange: (room: Room) => void }) {
  const rectangular = isRectangularRoom(room);
  const width = room.walls[0] ? wallLength(room.walls[0]) : mm(0);
  const depth = room.walls[1] ? wallLength(room.walls[1]) : mm(0);
  const thickness = room.walls[0]?.thickness ?? mm(90);

  const resize = (w: Mm, d: Mm, h: Mm, t: Mm) =>
    onChange({ ...rectangularRoom(room.id, room.name, w, d, h, t), name: room.name });

  /** Ceiling height applies whatever shape the room is, so it is edited on every wall. */
  const setCeiling = (h: Mm) =>
    onChange({ ...room, ceilingHeight: h, walls: room.walls.map((w) => ({ ...w, height: h })) });

  return (
    <>
      {rectangular ? (
        <>
          <NumberRow
            label="Room width"
            hint="Along the wall the run sits against"
            value={width}
            min={500}
            step={50}
            onChange={(n) => resize(mm(n), depth, room.ceilingHeight, thickness)}
          />
          <NumberRow
            label="Room depth"
            value={depth}
            min={500}
            step={50}
            onChange={(n) => resize(width, mm(n), room.ceilingHeight, thickness)}
          />
          <NumberRow
            label="Wall thickness"
            value={thickness}
            min={10}
            step={10}
            onChange={(n) => resize(width, depth, room.ceilingHeight, mm(n))}
          />
        </>
      ) : (
        <p className="note">
          This room has {room.walls.length} walls, so it can't be described by a width and a
          depth. Edit it in the <strong>Plan</strong> view, next to the 3D button above the
          viewport — that can change one wall without redrawing the others.
        </p>
      )}

      <NumberRow
        label="Ceiling height"
        value={room.ceilingHeight}
        min={2000}
        step={50}
        onChange={(n) => setCeiling(mm(n))}
      />

      <p className="note subtle">
        Drawing the plan — an L-shaped kitchen, a return, a wall at an angle — is done in the
        Plan view. Lengths are typed there rather than dragged, so a wall measures what the tape
        said.
      </p>
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

      <div className="subhead">Install</div>

      <div className="setting-row">
        <div className="setting-label">
          <span>Install hours</span>
          <em>Mirroring the shop hours is a rough first pass — set your own when you know it</em>
        </div>
        <div className="setting-input">
          <select
            value={settings.labour.installHoursMode}
            onChange={(e) =>
              onChange({
                labour: {
                  ...settings.labour,
                  installHoursMode: e.target.value as 'mirror-manufacturing' | 'fixed',
                },
              })
            }
          >
            <option value="mirror-manufacturing">Same as manufacturing</option>
            <option value="fixed">A set number of hours</option>
          </select>
        </div>
      </div>

      {settings.labour.installHoursMode === 'fixed' && (
        <NumberRow
          label="Install hours"
          value={settings.labour.installFixedHours}
          suffix="h"
          min={0}
          step={0.5}
          onChange={(n) => onChange({ labour: { ...settings.labour, installFixedHours: n } })}
        />
      )}

      <NumberRow
        label="Install rate"
        hint="On site — usually differs from the shop rate"
        value={settings.labour.installRatePerHourExGst}
        suffix="$/h"
        min={0}
        step={5}
        onChange={(n) => onChange({ labour: { ...settings.labour, installRatePerHourExGst: n } })}
      />

      <div className="subhead">Delivery</div>
      <NumberRow
        label="Delivery fee"
        hint="Flat charge, added after margin rather than marked up"
        value={settings.deliveryFeeExGst}
        suffix="$"
        min={0}
        step={25}
        onChange={(n) => onChange({ deliveryFeeExGst: n })}
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
  onUpdateSheet,
  onUpdateDoorStyles,
  onUpdateStandards,
  onSaveAsStandards,
  onResetToStandards,
  onUpdateRoom,
}: Props) {
  const [scope, setScope] = useState<Scope>('job');
  const [section, setSection] = useState<
    'construction' | 'materials' | 'doors' | 'sizes' | 'room' | 'costing'
  >('construction');
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
            className={`seg-btn${section === 'materials' ? ' is-active' : ''}`}
            onClick={() => setSection('materials')}
          >
            Materials
          </button>
          <button
            className={`seg-btn${section === 'doors' ? ' is-active' : ''}`}
            onClick={() => setSection('doors')}
          >
            Door styles
          </button>
          <button
            className={`seg-btn${section === 'sizes' ? ' is-active' : ''}`}
            onClick={() => setSection('sizes')}
          >
            Standard sizes
          </button>
          {!editingStandards && (
            <button
              className={`seg-btn${section === 'room' ? ' is-active' : ''}`}
              onClick={() => setSection('room')}
            >
              Room
            </button>
          )}
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

          {section === 'materials' && (
            <MaterialsEditor
              library={source.materials}
              defaults={source.defaults}
              sheetIds={sheetsInUse(source.defaults, editingStandards ? [] : project.cabinets)}
              onChange={(patch) =>
                editingStandards
                  ? onUpdateStandards({ defaults: { ...standards.defaults, ...patch } })
                  : onUpdateDefaults(patch)
              }
              onChangeSheet={(id, patch) =>
                editingStandards
                  ? onUpdateStandards({
                      materials: {
                        ...standards.materials,
                        sheets: standards.materials.sheets.map((s) =>
                          s.id === id ? { ...s, ...patch } : s,
                        ),
                      },
                    })
                  : onUpdateSheet(id, patch)
              }
            />
          )}

          {section === 'doors' && (
            <DoorStyleEditor
              scope={scope}
              styles={source.doorStyles}
              defaultStyleId={source.defaults.doorStyleId}
              onChangeStyles={(doorStyles) =>
                editingStandards ? onUpdateStandards({ doorStyles }) : onUpdateDoorStyles(doorStyles)
              }
              onChangeDefault={(doorStyleId) =>
                editingStandards
                  ? onUpdateStandards({ defaults: { ...standards.defaults, doorStyleId } })
                  : onUpdateDefaults({ doorStyleId })
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

          {section === 'room' && !editingStandards && (
            <RoomEditor room={project.room} onChange={onUpdateRoom} />
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
