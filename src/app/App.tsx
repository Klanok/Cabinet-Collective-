/**
 * App shell.
 *
 * Everything shown here is derived from `project` on each render — panels, cutlist and cost
 * are recomputed, never stored. For a job of this size that is comfortably fast, and it means
 * there is exactly one source of truth on screen.
 */

import { useMemo, useState } from 'react';
import { useProjectStore } from './store/projectStore.ts';
import { buildProject } from '../core/rules/build.ts';
import { costProject } from '../core/costing/costing.ts';
import { buildCutlist } from '../core/cutlist/cutlist.ts';
import { checkLayout } from '../core/project/layout.ts';
import { projectOutOfStep } from '../core/project/outOfStep.ts';
import { formatAud } from '../core/units.ts';
import { Viewport3D } from './viewport/Viewport3D.tsx';
import { CabinetList } from './panels/CabinetList.tsx';
import { Inspector } from './panels/Inspector.tsx';
import { CostPanel } from './panels/CostPanel.tsx';
import { CutlistPanel } from './panels/CutlistPanel.tsx';
import { NestPanel } from './panels/NestPanel.tsx';
import { HardwarePanel } from './panels/HardwarePanel.tsx';
import { BenchtopPanel } from './panels/BenchtopPanel.tsx';
import { SettingsModal } from './panels/SettingsModal.tsx';
import { PlanView } from './plan/PlanView.tsx';
import { ExportView } from './export/ExportView.tsx';
import { exportProjectFile, importProjectFile } from './store/persistence.ts';
import { useAsk } from './panels/ask.tsx';

type Tab = 'cutlist' | 'nest' | 'hardware' | 'tops' | 'cost';
type View = '3d' | 'wireframe' | 'plan' | 'drawings';

export default function App() {
  const project = useProjectStore((s) => s.project);
  const selectedCabinetId = useProjectStore((s) => s.selectedCabinetId);
  const select = useProjectStore((s) => s.select);
  const addCabinet = useProjectStore((s) => s.addCabinet);
  const updateCabinet = useProjectStore((s) => s.updateCabinet);
  const updateOptions = useProjectStore((s) => s.updateOptions);
  const removeCabinet = useProjectStore((s) => s.removeCabinet);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  /*
   * Naming a sheet size, or handing the choice back to the search.
   *
   * Stored per material rather than globally: a job often has one board it must cut from what the
   * supplier has and another it does not care about. Choosing "automatic" deletes the entry rather
   * than storing a sentinel, so an unset material is genuinely unset and stays that way if the
   * material's sizes change under it.
   */
  const chooseSheetSize = (materialId: string, key: string | undefined) => {
    const current = project.settings.nesting.sheetSizes ?? {};
    const next = { ...current };
    if (key === undefined) delete next[materialId];
    else next[materialId] = key;
    updateSettings({ nesting: { ...project.settings.nesting, sheetSizes: next } });
  };
  const loadSampleKitchen = useProjectStore((s) => s.loadSampleKitchen);
  const generateBenchtops = useProjectStore((s) => s.generateBenchtops);
  const regenerateBenchtop = useProjectStore((s) => s.regenerateBenchtop);
  const updateBenchtop = useProjectStore((s) => s.updateBenchtop);
  const deleteBenchtop = useProjectStore((s) => s.deleteBenchtop);
  const generateKickBases = useProjectStore((s) => s.generateKickBases);
  const regenerateKickBase = useProjectStore((s) => s.regenerateKickBase);
  const updateKickBase = useProjectStore((s) => s.updateKickBase);
  const deleteKickBase = useProjectStore((s) => s.deleteKickBase);

  const standards = useProjectStore((s) => s.standards);
  const storageError = useProjectStore((s) => s.storageError);
  const updateConstruction = useProjectStore((s) => s.updateConstruction);
  const updateDefaults = useProjectStore((s) => s.updateDefaults);
  const updateSheet = useProjectStore((s) => s.updateSheet);
  const updateDoorStyles = useProjectStore((s) => s.updateDoorStyles);
  const updateHardware = useProjectStore((s) => s.updateHardware);
  const updateStandards = useProjectStore((s) => s.updateStandards);
  const saveAsStandards = useProjectStore((s) => s.saveAsStandards);
  const resetToStandards = useProjectStore((s) => s.resetToStandards);
  const replaceStandards = useProjectStore((s) => s.replaceStandards);
  const replaceProject = useProjectStore((s) => s.replaceProject);
  const updateRoom = useProjectStore((s) => s.updateRoom);
  const moveCabinet = useProjectStore((s) => s.moveCabinet);
  const saveCabinetAsType = useProjectStore((s) => s.saveCabinetAsType);
  const addFromSavedType = useProjectStore((s) => s.addFromSavedType);
  const deleteSavedType = useProjectStore((s) => s.deleteSavedType);
  const newProject = useProjectStore((s) => s.newProject);
  const savedToFileAt = useProjectStore((s) => s.savedToFileAt);
  const markSavedToFile = useProjectStore((s) => s.markSavedToFile);

  const placeCabinetOnWall = useProjectStore((s) => s.placeCabinetOnWall);
  const ask = useAsk();

  /*
   * Work that exists only in this browser.
   *
   * A job is saved to local storage on every keystroke, so it survives a reload — and that is
   * exactly what makes it feel safer than it is. Local storage is one browser on one machine, it
   * does not travel, and clearing browsing data takes it with no warning. This is the difference
   * between "saved" and "saved somewhere you could lose the laptop and still have it".
   */
  const onlyInThisBrowser = project.updatedAt !== savedToFileAt;

  const saveToFile = () => {
    exportProjectFile(project);
    markSavedToFile();
  };

  /**
   * Ask before replacing what is on screen.
   *
   * Every one of the three ways into a different job — new, sample, open — throws away the current
   * one, and local storage is overwritten the same instant, so there is nothing behind it. That is
   * a fine thing to do on purpose and a terrible one to do by clicking the wrong menu item, which
   * is the whole distinction a question draws.
   *
   * The question names what is at stake rather than asking "are you sure": how many cabinets, and
   * whether the job has ever been out of this browser. A job that has just been saved to a file
   * still asks — the file is a copy, and the copy is not on screen — but it can say so, and that
   * turns the answer from a guess into a decision.
   */
  const discardCurrentJob = async (what: string, confirmLabel: string): Promise<boolean> =>
    ask.confirm(
      `${what} closes "${project.name}" — ${project.cabinets.length} ${
        project.cabinets.length === 1 ? 'cabinet' : 'cabinets'
      }.\n\n${
        onlyInThisBrowser
          ? 'It has not been saved to a file, so it exists only in this browser and there is no copy to go back to.'
          : 'It was saved to a file, so that copy is safe — anything changed since is not.'
      }`,
      // The button says what it does, per `ConfirmOptions` — never "OK".
      { confirmLabel, danger: onlyInThisBrowser },
    );

  const openFromFile = async (file: File) => {
    let opened;
    try {
      opened = await importProjectFile(file);
    } catch (err) {
      // Never `alert` — silently ignored in a sandboxed frame, which is how this failed before.
      await ask.tell(err instanceof Error ? err.message : String(err));
      return;
    }
    if (!(await discardCurrentJob('Opening a file', 'Open it'))) return;
    replaceProject(opened);
  };

  const [tab, setTab] = useState<Tab>('cutlist');
  const [view, setView] = useState<View>('3d');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showWalls, setShowWalls] = useState(true);

  const built = useMemo(() => buildProject(project), [project]);
  const cost = useMemo(() => costProject(project), [project]);
  const cutlist = useMemo(() => buildCutlist(project), [project]);
  const layoutIssues = useMemo(() => checkLayout(project), [project]);
  /*
   * Benchtops and plinths that no longer match the cabinets under them.
   *
   * Up here rather than only on the Tops tab because the Tops tab is exactly where somebody is
   * *not* looking when it happens: you move a cabinet in the 3D view, and the top that no longer
   * fits it is two tabs away. This is the cost of a run unit being owned rather than derived, and
   * it went unpaid until the shop reported the symptom — see `core/project/outOfStep.ts`.
   */
  const outOfStep = useMemo(() => projectOutOfStep(project), [project]);

  const selected = built.find((b) => b.cabinet.id === selectedCabinetId) ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>Cabinet Collective</strong>
          <span className="muted">Phase 2 — carcasses, drawer boxes, Blum hardware and drilling</span>
        </div>
        <div className="topbar-stats">
          <div className="stat">
            <span className="muted">Cabinets</span>
            <strong>{built.length}</strong>
          </div>
          <div className="stat">
            <span className="muted">Parts</span>
            <strong>{cost.panelCount}</strong>
          </div>
          <div className="stat">
            <span className="muted">Total</span>
            <strong>{formatAud(cost.totalIncGst)}</strong>
          </div>
          <button className="btn" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <div className="menu">
            <button className="btn">
              Job ▾{onlyInThisBrowser && <span className="warn-dot"> !</span>}
            </button>
            <div className="menu-items">
              <button
                onClick={async () => {
                  if (await discardCurrentJob('Starting a new job', 'Start a new job')) newProject('New job');
                }}
              >
                New empty job
              </button>
              <button
                onClick={async () => {
                  if (await discardCurrentJob('Loading the sample kitchen', 'Load the sample')) loadSampleKitchen();
                }}
              >
                Load sample kitchen
              </button>
              <button onClick={saveToFile}>Save to file…</button>
              <label>
                Open from file…
                <input
                  type="file"
                  accept="application/json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    // Cleared before the await, so picking the same file twice fires again — which
                    // is what somebody does after being told the first one was the wrong file.
                    e.target.value = '';
                    if (file) await openFromFile(file);
                  }}
                />
              </label>
              <p className="note subtle menu-note">
                {onlyInThisBrowser
                  ? 'This job has not been saved to a file. It lives only in this browser — clearing your browsing data would take it.'
                  : 'Saved to a file. Anything you change from here is only in this browser until you save again.'}
              </p>
            </div>
          </div>
        </div>
      </header>

      {storageError && (
        <div className="issue-bar">
          <span className="issue">Couldn't save to this browser: {storageError}</span>
        </div>
      )}

      {(layoutIssues.length > 0 || outOfStep.length > 0) && (
        <div className="issue-bar">
          {layoutIssues.map((issue) => (
            <button
              key={issue.message}
              className="issue"
              onClick={() => select(issue.cabinetIds[0] ?? null)}
            >
              {issue.message}
            </button>
          ))}
          {/* Clicking one opens the tab with the Regenerate button on it, which is the answer. */}
          {outOfStep.map((row) => (
            // Keyed on the message, not on kind: one top can have both its corners out of step,
            // which is two `corners` rows for the same unit.
            <button key={row.unitId + row.message} className="issue" onClick={() => setTab('tops')}>
              {row.message}
            </button>
          ))}
        </div>
      )}

      <div className="layout">
        <aside className="sidebar left">
          <CabinetList
            built={built}
            selectedId={selectedCabinetId}
            onSelect={select}
            onAdd={addCabinet}
            onRemove={removeCabinet}
            savedTypes={standards.savedTypes}
            onAddSaved={addFromSavedType}
            onDeleteSaved={deleteSavedType}
          />
          <Inspector
            built={selected}
            project={project}
            onUpdate={updateCabinet}
            onUpdateOptions={updateOptions}
            onSaveAsType={saveCabinetAsType}
            onPlaceOnWall={placeCabinetOnWall}
          />
        </aside>

        <main className="viewport">
          {view === 'drawings' ? (
            <ExportView project={project} />
          ) : view !== 'plan' ? (
            <Viewport3D
              built={built}
              project={project}
              selectedCabinetId={selectedCabinetId}
              onSelect={select}
              showWalls={showWalls}
              wireframe={view === 'wireframe'}
              onMoveCabinet={moveCabinet}
            />
          ) : (
            <PlanView
              project={project}
              selectedCabinetId={selectedCabinetId}
              onSelectCabinet={select}
              onUpdateRoom={updateRoom}
            />
          )}

          <div className="viewport-controls no-print">
            <div className="seg view-seg">
              <button
                className={`seg-btn${view === '3d' ? ' is-active' : ''}`}
                onClick={() => setView('3d')}
              >
                3D
              </button>
              <button
                className={`seg-btn${view === 'wireframe' ? ' is-active' : ''}`}
                onClick={() => setView('wireframe')}
              >
                Wireframe
              </button>
              <button
                className={`seg-btn${view === 'plan' ? ' is-active' : ''}`}
                onClick={() => setView('plan')}
              >
                Plan
              </button>
              <button
                className={`seg-btn${view === 'drawings' ? ' is-active' : ''}`}
                onClick={() => setView('drawings')}
              >
                Drawings
              </button>
            </div>
            {view !== 'plan' && (
              <label className="viewport-toggle">
                <input
                  type="checkbox"
                  checked={showWalls}
                  onChange={(e) => setShowWalls(e.target.checked)}
                />
                Walls
              </label>
            )}
          </div>

          <div className="viewport-hint muted">
            {view !== 'plan' ? (
              <>
                Drag to orbit · scroll to zoom · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>{' '}
                move, <kbd>Q</kbd><kbd>E</kbd> down/up, <kbd>Shift</kbd> faster · click to select,
                drag to move — a cabinet dragged near a wall goes flush against it
              </>
            ) : (
              <>Click a wall to select it, then type what it measures</>
            )}
          </div>
        </main>

        <aside className="sidebar right">
          <nav className="tabs">
            <button
              className={`tab${tab === 'cutlist' ? ' is-active' : ''}`}
              onClick={() => setTab('cutlist')}
            >
              Cutlist
            </button>
            <button
              className={`tab${tab === 'nest' ? ' is-active' : ''}`}
              onClick={() => setTab('nest')}
            >
              Nest
            </button>
            <button
              className={`tab${tab === 'hardware' ? ' is-active' : ''}`}
              onClick={() => setTab('hardware')}
            >
              Hardware
            </button>
            <button
              className={`tab${tab === 'tops' ? ' is-active' : ''}`}
              onClick={() => setTab('tops')}
            >
              Tops
            </button>
            <button
              className={`tab${tab === 'cost' ? ' is-active' : ''}`}
              onClick={() => setTab('cost')}
            >
              Cost
            </button>
          </nav>
          {tab === 'cutlist' && <CutlistPanel lines={cutlist} project={project} />}
          {/* The nest the quote was costed from, not a second one — see `CostBreakdown.nest`. */}
          {tab === 'nest' && (
            <NestPanel
              project={project}
              nest={cost.nest}
              onChooseSheetSize={chooseSheetSize}
            />
          )}
          {tab === 'hardware' && <HardwarePanel project={project} />}
          {tab === 'tops' && (
            <BenchtopPanel
              project={project}
              onGenerateBenchtops={generateBenchtops}
              onRegenerateBenchtop={regenerateBenchtop}
              onUpdateBenchtop={updateBenchtop}
              onDeleteBenchtop={deleteBenchtop}
              onGenerateKickBases={generateKickBases}
              onRegenerateKickBase={regenerateKickBase}
              onUpdateKickBase={updateKickBase}
              onDeleteKickBase={deleteKickBase}
            />
          )}
          {tab === 'cost' && (
            <CostPanel cost={cost} settings={project.settings} onUpdateSettings={updateSettings} />
          )}
        </aside>
      </div>

      {settingsOpen && (
        <SettingsModal
          project={project}
          standards={standards}
          onClose={() => setSettingsOpen(false)}
          onUpdateHardware={updateHardware}
          onUpdateConstruction={updateConstruction}
          onUpdateSettings={updateSettings}
          onUpdateDefaults={updateDefaults}
          onUpdateSheet={updateSheet}
          onUpdateDoorStyles={updateDoorStyles}
          onUpdateStandards={updateStandards}
          onSaveAsStandards={saveAsStandards}
          onResetToStandards={resetToStandards}
          onReplaceStandards={replaceStandards}
          onUpdateRoom={updateRoom}
        />
      )}
    </div>
  );
}
