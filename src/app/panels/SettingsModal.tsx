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
import {
  type ConstructionMethod,
  unconfirmedAppliedEndFigures,
  unconfirmedLadderFigures,
} from '../../core/model/construction.ts';
import type { GstMode, Project, ProjectDefaults, ProjectSettings } from '../../core/model/project.ts';
import {
  type MaterialLibrary,
  type SheetMaterial,
  actualThicknessOf,
  isOversize,
} from '../../core/model/material.ts';
import {
  type DrawerRunnerSystem,
  type HardwareLibrary,
  type HingeSystem,
  cupSetbackForSystemGrid,
  plateHolePositions,
  platesOnSystemGrid,
  unconfirmedHardwareFigures,
} from '../../core/model/hardware.ts';
import { EdgeBandPicker, SheetPicker } from './MaterialPicker.tsx';
import { useAsk } from './ask.tsx';
import { exportStandardsFile, importStandardsFile } from '../store/persistence.ts';
import { DoorStyleEditor } from './DoorStyleEditor.tsx';
import { NumberRow, SelectRow } from './fields.tsx';
import { Section, useOpenSections } from './Section.tsx';
import { JOINERY_GROUPS, groupSummary } from './joineryGroups.ts';
import { oversizeSummary, readOpenSettingsSections } from './settingsSections.ts';
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
  /** Replace this job's hardware library — the whole thing, as the door styles are. */
  onUpdateHardware: (hardware: HardwareLibrary) => void;
  onUpdateStandards: (patch: Partial<ShopStandards>) => void;
  onSaveAsStandards: (name: string) => void;
  onResetToStandards: () => void;
  /** Take a whole set of standards in from a file, replacing the shop's current one. */
  onReplaceStandards: (standards: ShopStandards) => void;
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
  {
    key: 'frontStandoff',
    hint: 'Gap behind a front — 2mm is the hinge’s natural position and leaves room for a bump stop. Push-to-open generally wants 4mm',
    min: 0,
    max: 20,
    step: 0.5,
  },
  { key: 'gapBetweenDoors', hint: 'Between two doors side by side', min: 0, max: 20, step: 0.5 },
  { key: 'gapBetweenDrawers', hint: 'Between stacked drawer fronts', min: 0, max: 20, step: 0.5 },
  { key: 'shelfSetback', hint: 'How much shallower a shelf is than the opening', min: 0, max: 60 },
  { key: 'shelfSideClearance', hint: 'Total side play so a shelf lifts out', min: 0, max: 20, step: 0.5 },
  {
    key: 'fixingStripWidth',
    hint: 'Flat front left beside a rounded corner, to fix the curved piece to',
    min: 0,
    max: 200,
    step: 5,
  },
  /*
   * The laminate over a curve — a setting the model has demanded be editable since §4.23 and
   * that nothing on screen offered.
   *
   * Its own doc comment reads *"adopting it is a deliberate edit per method"*, and the v36
   * migration deliberately left every existing method at zero so a job already quoted keeps
   * cutting the way it was quoted. Both are right, and together they described an action the
   * shop had no way to perform: there was no control, on any screen, to make the deliberate
   * edit with. The hint says which way is which, because zero and 1mm are both correct answers
   * to different questions.
   */
  {
    key: 'finishLaminate',
    hint: 'Thickness of the laminate laid over a bendy-ply curve by hand, so the finished face lands on the radius you asked for. Zero cuts the way jobs were quoted before this allowance existed; 1mm is the shop’s laminate',
    min: 0,
    max: 3,
    step: 0.5,
  },
  { key: 'systemPitch', hint: 'System 32 hole spacing', min: 8, max: 64 },
  { key: 'systemFrontSetback', hint: 'First hole line in from the front edge', min: 0, max: 100 },
  { key: 'systemBackSetback', hint: 'Second hole line in from the back edge', min: 0, max: 100 },
  { key: 'systemHoleDiameter', hint: 'Shelf pin and system hole diameter', min: 3, max: 10 },
  { key: 'systemHoleDepth', hint: 'How deep a system hole is bored', min: 5, max: 30 },
  {
    key: 'systemHoleEndClearance',
    hint: 'How far the first and last shelf-pin hole keep off the ends of a panel, and off a fixed shelf. The run is centred in what is left, so a panel turned end-for-end still lines up',
    min: 0,
    max: 300,
    step: 8,
  },
  {
    key: 'ladderRailFloorGap',
    hint: 'How far short of the floor a plinth’s rails are cut, so it beds on the ribs',
    min: 0,
    max: 40,
  },
  {
    key: 'ladderFaceScribeAllowance',
    hint: 'How much over-height the kick face is cut, to be planed in on site',
    min: 0,
    max: 40,
  },
  { key: 'ladderMaxRibGap', hint: 'Greatest clear gap between plinth ribs', min: 100, max: 1200, step: 10 },
  {
    key: 'appliedEndBackScribe',
    hint: 'How far past the back of the carcass an applied end is cut, to plane into the wall. Not yet checked against a real run',
    min: 0,
    max: 60,
    step: 5,
  },
  {
    key: 'appliedEndFrontOverhang',
    hint: 'How far an applied end stands proud of the door face. Zero is flush, which is the usual detail',
    min: -20,
    max: 40,
    step: 0.5,
  },
];

/**
 * The hardware screen.
 *
 * Split into what a shop **chooses** and what a manufacturer **decides**, because they are not the
 * same kind of number and mixing them invites somebody to "correct" a catalogue figure to taste.
 *
 * Editable here: the drilling distance and the cup setback on a hinge, and the two figures in the
 * runner's vertical chain that Blum's sheet does not state outright. Those are settings or
 * unconfirmed readings — the kind of number a shop picks or corrects.
 *
 * Read-only here: nominal lengths, the 51mm and 26mm box deductions, the profile heights. Those are
 * what MERIVOBOX *is*. Correcting one is editing `library/blum.ts`, which is deliberately a code
 * edit rather than a field, because getting it wrong re-cuts every drawer in every job.
 */
function HardwareEditor({
  hardware,
  defaults,
  construction,
  onChange,
  onChangeDefaults,
}: {
  hardware: HardwareLibrary;
  defaults: ProjectDefaults;
  construction: ConstructionMethod | undefined;
  onChange: (hardware: HardwareLibrary) => void;
  onChangeDefaults: (patch: Partial<ProjectDefaults>) => void;
}) {
  const [openGroups, setGroupOpen] = useOpenSections(readOpenSettingsSections);
  const runner =
    hardware.runnerSystems.find((s) => s.id === defaults.runnerSystemId) ??
    hardware.runnerSystems[0];
  const hinge =
    hardware.hingeSystems.find((s) => s.id === defaults.hingeSystemId) ?? hardware.hingeSystems[0];

  const patchRunner = (patch: Partial<DrawerRunnerSystem>) => {
    if (!runner) return;
    onChange({
      ...hardware,
      runnerSystems: hardware.runnerSystems.map((s) => (s.id === runner.id ? { ...s, ...patch } : s)),
    });
  };
  const patchHinge = (patch: Partial<HingeSystem>) => {
    if (!hinge) return;
    onChange({
      ...hardware,
      hingeSystems: hardware.hingeSystems.map((s) => (s.id === hinge.id ? { ...s, ...patch } : s)),
    });
  };

  const pitch = construction?.systemPitch ?? mm(32);
  const datum = construction?.revealBottom ?? mm(0);
  const onGrid = hinge ? platesOnSystemGrid(hinge, pitch, datum) : false;
  const gridSetback = hinge ? cupSetbackForSystemGrid(hinge, pitch, datum) : mm(0);
  const platePositions = hinge ? plateHolePositions(hinge, datum) : null;

  return (
    <>
      <Section
        id="hardware:runners"
        title="Drawer runners"
        summary={runner ? `${runner.brand} ${runner.name}` : null}
        open={openGroups['hardware:runners']}
        onToggle={setGroupOpen}
      >
      {runner ? (
        <>
          <div className="setting-row">
            <div className="setting-label">
              <span>System</span>
              <em>What every drawer bank is built on unless a cabinet says otherwise</em>
            </div>
            <div className="setting-input">
              <select
                value={defaults.runnerSystemId}
                onChange={(e) => onChangeDefaults({ runnerSystemId: e.target.value })}
              >
                {hardware.runnerSystems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.brand} {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span>Box height</span>
              <em>Blum's letter. The wooden back is cut to suit it</em>
            </div>
            <div className="setting-input">
              <select
                value={defaults.drawerSideHeightCode}
                onChange={(e) => onChangeDefaults({ drawerSideHeightCode: e.target.value })}
              >
                {runner.sideHeights.map((h) => (
                  <option key={h.code} value={h.code}>
                    {h.name} — back cut at {h.woodenBackHeight}mm
                  </option>
                ))}
              </select>
            </div>
          </div>

          <NumberRow
            label="Runner install height above the cabinet floor"
            hint="Zero for a screw-fixed runner resting on the base. A push-to-open runner needs clearance under it"
            value={runner.runnerAboveCabinetFloor}
            min={0}
            max={80}
            step={0.5}
            onChange={(n) => patchRunner({ runnerAboveCabinetFloor: mm(n) })}
          />
          <NumberRow
            label="Runner screws above the rail's bottom"
            hint="How far up the runner its own fixing screws sit — Blum's min. 54"
            value={runner.runnerFixingAboveRunnerBottom}
            min={0}
            max={120}
            step={0.5}
            onChange={(n) => patchRunner({ runnerFixingAboveRunnerBottom: mm(n) })}
          />

          <p className="note subtle">
            <strong>
              {runner.brand} {runner.name}
            </strong>{' '}
            comes in {runner.nominalLengths.join(', ')}mm and needs{' '}
            {runner.innerDepthAllowance}mm of clear depth beyond the length. A bottom is cut{' '}
            {runner.bottomWidthDeduction}mm narrower than the opening and{' '}
            {runner.bottomLengthDeduction}mm shorter than the nominal length, from{' '}
            {runner.bottomNominalThickness}mm board. Rated {runner.loadRatingKg}kg. Those are the
            product's numbers, not settings — correcting one means editing the hardware library.
          </p>
          <p className="note subtle">
            Measured up from <strong>the bottom of the runner</strong>, which is Blum's own datum:
            the underside of the drawer bottom sits {runner.bottomPanelAboveRunner}mm above it, and
            the runner's own fixing screws {runner.runnerFixingAboveRunnerBottom}mm, and the front
            fixing screws {runner.frontFixingAboveRunner}mm and{' '}
            {runner.frontFixingAboveRunner + runner.frontFixingRowSpacing}mm — plus{' '}
            {runner.preAssembledProfileAllowance}mm if the cabinet profile goes on before the
            carcass is assembled, which the model does not know and does not apply. Sideways, the
            screws sit {runner.frontFixingFromCabinetSide}mm in from the outside of each cabinet
            side, which is Blum's <em>20.5 + FA</em> said without needing to know the reveal.
          </p>
        </>
      ) : (
        <p className="empty">No runner systems in this library.</p>
      )}
      </Section>

      <Section
        id="hardware:hinges"
        title="Hinges"
        summary={hinge ? hinge.name : null}
        open={openGroups['hardware:hinges']}
        onToggle={setGroupOpen}
      >
      {hinge ? (
        <>
          <div className="setting-row">
            <div className="setting-label">
              <span>System</span>
              <em>What every door is bored for unless a cabinet says otherwise</em>
            </div>
            <div className="setting-input">
              <select
                value={defaults.hingeSystemId}
                onChange={(e) => onChangeDefaults({ hingeSystemId: e.target.value })}
              >
                {hardware.hingeSystems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.brand} {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <NumberRow
            label="Cup in from the door edge"
            hint="To the near edge of the bore, the way a Blum jig is set. Blum allows 3–7mm"
            value={hinge.cupDistance}
            min={0}
            max={12}
            step={0.5}
            onChange={(n) => patchHinge({ cupDistance: mm(n) })}
          />
          <NumberRow
            label="Cup from the end of the door"
            hint="To the centre of the end hinges. Others spread evenly between them"
            value={hinge.cupEndSetback}
            min={40}
            max={200}
            step={1}
            onChange={(n) => patchHinge({ cupEndSetback: mm(n) })}
          />

          <p className="note subtle">
            Cup Ø{hinge.cupDiameter} × {hinge.cupDepth} deep, centred{' '}
            {hinge.cupDistance + hinge.cupDiameter / 2}mm in from the edge, with two Ø
            {hinge.dowelDiameter} dowels at {hinge.dowelSpacing}mm centres. Hinges per door:{' '}
            {hinge.countBands.map((b) => `${b.hinges} to ${b.maxDoorHeight}mm`).join(', ')}, and one
            more for every 400mm above that.
          </p>

          {platePositions && (
            <p className="note subtle">
              The plate screws land {Math.round(platePositions[0])}mm and{' '}
              {Math.round(platePositions[1])}mm up the side panel.{' '}
              {onGrid ? (
                <>
                  Both are on the {pitch}mm system grid, so <strong>one line-boring pass</strong>{' '}
                  covers the shelf pins and the hinge plates together.
                </>
              ) : (
                <>
                  Neither is on the {pitch}mm system grid, so the plates need their own two holes. A{' '}
                  {Math.round(gridSetback)}mm cup setback would put both on it and save an operation
                  on every side panel — a shop decision, not a fault.
                </>
              )}
            </p>
          )}
        </>
      ) : (
        <p className="empty">No hinge systems in this library.</p>
      )}
      </Section>

      {/*
        Outside both folds, deliberately. A figure that is a reading rather than a measurement is
        the one thing on this screen that must not be a click away — the same placement, and the
        same reason, as the Joinery tab's bench list.
      */}
      {unconfirmedHardwareFigures(hardware).length > 0 && (
        <>
          <div className="subhead">Not yet checked against the catalogue</div>
          <ul className="warnings">
            {unconfirmedHardwareFigures(hardware).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/**
 * One construction method's settings, grouped and folded.
 *
 * The rows are unchanged — same controls, same hints, same order within a group. What changed is
 * that they are dealt into the six groups `joineryGroups.ts` declares, and each group folds. The
 * three hand-written selects are handled by key like every other setting, so the grouping is one
 * list rather than "the numbers, plus three specials somebody has to remember".
 */
function ConstructionEditor({
  constructions,
  standardFor,
  onChange,
}: {
  constructions: readonly ConstructionMethod[];
  /** The shop's version of a method, for the drift a folded group reports. */
  standardFor: (id: string) => ConstructionMethod | undefined;
  onChange: (id: string, patch: Partial<ConstructionMethod>) => void;
}) {
  const [activeId, setActiveId] = useState(constructions[0]?.id ?? '');
  const [openGroups, setGroupOpen] = useOpenSections(readOpenSettingsSections);
  const active = constructions.find((c) => c.id === activeId) ?? constructions[0];
  if (!active) return <p className="empty">No construction methods.</p>;

  const standard = standardFor(active.id);
  const numberFields = new Map(CONSTRUCTION_FIELDS.map((f) => [f.key, f]));

  /** One setting, whichever of the four kinds it is. Keyed, so nothing is offered by memory. */
  const rowFor = (key: keyof ConstructionMethod) => {
    const field = numberFields.get(key);
    if (field) {
      return (
        <NumberRow
          key={String(key)}
          label={labelForConstructionKey(key)}
          hint={field.hint}
          value={active[key] as number}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(n) => onChange(active.id, { [key]: mm(n) } as Partial<ConstructionMethod>)}
        />
      );
    }
    switch (key) {
      case 'backStyle':
        return (
          <SelectRow
            key={String(key)}
            label="Back panel"
            hint="How the back is housed in the carcass"
            value={active.backStyle}
            options={[
              { id: 'applied', label: 'Applied — covers the whole rear face' },
              { id: 'inset', label: 'Inset — fits between the sides' },
            ]}
            onChange={(v) => onChange(active.id, { backStyle: v as ConstructionMethod['backStyle'] })}
          />
        );
      case 'ladderFaceScribeEnd':
        return (
          <SelectRow
            key={String(key)}
            label={labelForConstructionKey(key)}
            hint="Which end of the kick face the extra sits at. Not yet confirmed against a real run"
            value={active.ladderFaceScribeEnd ?? 'floor'}
            options={[
              { id: 'floor', label: 'At the floor — a scribe allowance' },
              { id: 'top', label: 'At the top — under the carcass' },
            ]}
            onChange={(v) =>
              onChange(active.id, {
                ladderFaceScribeEnd: v as ConstructionMethod['ladderFaceScribeEnd'],
              })
            }
          />
        );
      case 'appliedEndToFloor':
        return (
          <SelectRow
            key={String(key)}
            label={labelForConstructionKey(key)}
            hint="An applied end that stops at the carcass bottom leaves the kick returning across the end of the run in carcass board"
            value={(active.appliedEndToFloor ?? true) ? 'floor' : 'kick'}
            options={[
              { id: 'floor', label: 'Down to the floor, past the kick' },
              { id: 'kick', label: 'Stops at the carcass bottom, on the plinth' },
            ]}
            onChange={(v) => onChange(active.id, { appliedEndToFloor: v === 'floor' })}
          />
        );
      default:
        /*
         * Unreachable while `tests/joineryGroups.test.ts` passes — it asserts every settings key
         * is in a group, and every key in a group is rendered by one of the branches above. Left
         * visible rather than silent, because the failure this guards is a setting that exists,
         * drifts from the shop standards and has nowhere on screen to be.
         */
        return (
          <p className="note warning" key={String(key)}>
            {labelForConstructionKey(key)} has no control on this screen.
          </p>
        );
    }
  };

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

      {JOINERY_GROUPS.map((group) => (
        <Section
          key={group.id}
          id={group.id}
          title={group.title}
          summary={groupSummary(group, active, standard)}
          open={openGroups[group.id]}
          onToggle={setGroupOpen}
        >
          {group.keys.map(rowFor)}
        </Section>
      ))}

      {/*
        The same treatment the hardware figures get, and for the same reason: a number that is a
        reading rather than a measurement costs ten seconds with a tape if it says so, and a run
        of parts if it stays quiet. Both of these were written to be shown and never were.

        **Outside every fold**, and that is the point of where it sits: the one list on this screen
        saying a figure has not been checked at the bench must not be a click away.
      */}
      <div className="subhead">Not yet checked at the bench</div>
      <ul className="warnings">
        {[...unconfirmedLadderFigures(active), ...unconfirmedAppliedEndFigures(active)].map(
          (note) => (
            <li key={note}>{note}</li>
          ),
        )}
      </ul>
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

      <div className="subhead">Roughly what they look like</div>
      {inUse.map((sheet) => (
        <div className="setting-row" key={`${sheet.id}-colour`}>
          <div className="setting-label">
            <span>
              {sheet.decor} — {sheet.thickness}mm
            </span>
            <em>{sheet.brand}</em>
          </div>
          <div className="setting-input">
            <input
              type="color"
              value={sheet.colour ?? '#dcd8d0'}
              onChange={(e) => onChange(sheet.id, { colour: e.target.value })}
            />
          </div>
        </div>
      ))}
      <p className="note subtle">
        Screen only. Nothing is cut, priced or ordered from a colour — the decor <em>name</em> is
        the fact, and it is what goes on the supplier order. This is so a walnut door doesn't
        render the same off-white as a white melamine carcass when you're showing somebody the 3D
        view. Don't sign a decor off against a monitor.
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
  const [openGroups, setGroupOpen] = useOpenSections(readOpenSettingsSections);
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
      {defaults.skinMaterialId === 'bendy-ply-3' &&
        library.sheets.some((sheet) => sheet.id === 'bendy-ply-8') && (
          <div>
            <p className="note warning">
              This default still points to the legacy 3mm bendy ply. New radiused cabinets will
              inherit it until the default is changed.
            </p>
            <button
              className="btn full"
              onClick={() => onChange({ skinMaterialId: 'bendy-ply-8' })}
            >
              Use 8mm bendy ply for new cabinets
            </button>
          </div>
        )}
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

      {/*
        The fold appears only when there is a board to measure — `BoardThicknessEditor` returns
        null on a job that uses none, and a heading with nothing under it is worse than no
        heading. Asked here rather than inside it for the same reason the Inspector asks about
        hardware at the call site: the fold is the caller's to draw or leave out.
      */}
      {library.sheets.some((sheet) => sheetIds.includes(sheet.id)) && (
        <Section
          id="materials:thickness"
          title="What the boards really measure"
          summary={oversizeSummary(library, sheetIds)}
          open={openGroups['materials:thickness']}
          onToggle={setGroupOpen}
        >
          <BoardThicknessEditor library={library} sheetIds={sheetIds} onChange={onChangeSheet} />
        </Section>
      )}
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
  const [openGroups, setGroupOpen] = useOpenSections(readOpenSettingsSections);
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
      <Section
        id="costing:sheet"
        title="Cutting and offcuts"
        open={openGroups['costing:sheet']}
        onToggle={setGroupOpen}
      >
      <NumberRow
        label="Saw kerf"
        hint="What the blade takes out on every cut. A router nest uses the cutter diameter."
        value={settings.nesting.kerf}
        suffix="mm"
        min={0}
        max={20}
        step={0.1}
        onChange={(n) => onChange({ nesting: { ...settings.nesting, kerf: mm(n) } })}
      />
      <NumberRow
        label="Sheet edge trim"
        hint="Taken off each edge before anything is cut. Leave at 0 if you don't trim."
        value={settings.nesting.sheetEdgeTrim}
        suffix="mm"
        min={0}
        max={100}
        onChange={(n) => onChange({ nesting: { ...settings.nesting, sheetEdgeTrim: mm(n) } })}
      />
      <NumberRow
        label="Smallest useful offcut"
        hint="Reporting only — nothing is cut from an offcut. Measured on its shorter side."
        value={settings.nesting.usableOffcutMin}
        suffix="mm"
        min={0}
        max={1200}
        step={50}
        onChange={(n) => onChange({ nesting: { ...settings.nesting, usableOffcutMin: mm(n) } })}
      />
      </Section>

      <Section
        id="costing:labour"
        title="Labour"
        summary={`$${settings.labour.ratePerHourExGst}/h`}
        open={openGroups['costing:labour']}
        onToggle={setGroupOpen}
      >
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

      </Section>

      <Section
        id="costing:install"
        title="Install and delivery"
        open={openGroups['costing:install']}
        onToggle={setGroupOpen}
      >

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
      </Section>
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
  onUpdateHardware,
  onUpdateStandards,
  onSaveAsStandards,
  onResetToStandards,
  onReplaceStandards,
  onUpdateRoom,
}: Props) {
  const [scope, setScope] = useState<Scope>('job');
  const [section, setSection] = useState<
    'construction' | 'materials' | 'doors' | 'hardware' | 'sizes' | 'room' | 'costing'
  >('construction');
  const [standardsName, setStandardsName] = useState(standards.name);
  const ask = useAsk();

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
            className={`seg-btn${section === 'hardware' ? ' is-active' : ''}`}
            onClick={() => setSection('hardware')}
          >
            Hardware
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
              /*
               * Editing the standards themselves has nothing to drift *from*, so no group reports
               * a difference — which is right: on that tab the standard is what is on screen.
               */
              standardFor={(id) =>
                editingStandards ? undefined : standards.constructions.find((c) => c.id === id)
              }
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

          {section === 'hardware' && (
            <HardwareEditor
              hardware={source.hardware}
              defaults={source.defaults}
              construction={source.constructions.find(
                (c) => c.id === source.defaults.constructionId,
              )}
              onChange={(hardware) =>
                editingStandards ? onUpdateStandards({ hardware }) : onUpdateHardware(hardware)
              }
              onChangeDefaults={(patch) =>
                editingStandards
                  ? onUpdateStandards({ defaults: { ...standards.defaults, ...patch } })
                  : onUpdateDefaults(patch)
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
              {/*
                "Saved automatically" used to be the whole of what this said, and it was true and
                misleading in the same breath: saved to *this browser*, which is the one place that
                cannot survive somebody clearing their browsing data. Kick heights, reveals, door
                styles and saved cabinet types are not re-measurable the way a room is — they are
                years of a shop's own answers — and until now there was no way to get them out at
                all. Same shape as the Job menu, deliberately.
              */}
              <div className="modal-actions">
                <span className="muted">Saved to this browser.</span>
                <button className="btn" onClick={() => exportStandardsFile(standards)}>
                  Save to file…
                </button>
                <label className="btn file-btn">
                  Open from file…
                  <input
                    type="file"
                    accept="application/json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      let opened;
                      try {
                        opened = await importStandardsFile(file);
                      } catch (err) {
                        await ask.tell(err instanceof Error ? err.message : String(err));
                        return;
                      }
                      const yes = await ask.confirm(
                        `Replace "${standards.name}" with "${opened.name}"?\n\nThis changes the standards new jobs start from. Jobs already saved keep their own copy and are not touched.`,
                        { confirmLabel: 'Replace my standards', danger: true },
                      );
                      if (yes) onReplaceStandards(opened);
                    }}
                  />
                </label>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
